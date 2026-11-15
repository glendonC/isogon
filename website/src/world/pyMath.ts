/**
 * The arithmetic of the backend's Record, done as Python and numpy do it, so a Record summed in the browser gives the
 * figures the backend gives to the last digit it prints: Python's `round` (half to even on the exact value), numpy's
 * pairwise sum (its mean), its median and its linear percentile.
 */

/** Python's `round(x, n)`: the decimal of n places nearest the exact value of x, a tie to the even digit. */
export function pyRound(x: number, n: number): number {
  if (!Number.isFinite(x)) return x;
  const scale = 10 ** n;
  const y = Math.abs(x) * scale;
  const frac = y - Math.floor(y);
  // Far from a half, the scaled value's own rounding cannot move the result; k / 10^n is then the double nearest the
  // decimal, as Python's float of the rounded decimal is.
  if (Math.abs(frac - 0.5) > 1e-6 && y < 1e9) {
    const k = Math.round(y);
    const v = k / scale;
    return x < 0 ? -v : v;
  }
  return exactRound(x, n);
}

function exactRound(x: number, n: number): number {
  // The exact decimal expansion of a double fits in 100 places for every magnitude a Record holds.
  const s = Math.abs(x).toFixed(100);
  const dot = s.indexOf('.');
  const int = s.slice(0, dot);
  const frac = s.slice(dot + 1);
  const keep = frac.slice(0, n);
  const rest = frac.slice(n);
  let up: boolean;
  if (rest[0] > '5') up = true;
  else if (rest[0] < '5') up = false;
  else if (/[1-9]/.test(rest.slice(1))) up = true;
  else {
    const last = n > 0 ? Number(keep[n - 1]) : Number(int[int.length - 1]);
    up = last % 2 === 1;
  }
  let digits = (int + keep).split('').map(Number);
  if (up) {
    let i = digits.length - 1;
    while (i >= 0) {
      if (digits[i] === 9) {
        digits[i] = 0;
        i -= 1;
      } else {
        digits[i] += 1;
        break;
      }
    }
    if (i < 0) digits = [1, ...digits];
  }
  const all = digits.join('');
  const head = all.slice(0, all.length - n) || '0';
  const tail = all.slice(all.length - n);
  const v = Number(n > 0 ? `${head}.${tail}` : head);
  return x < 0 ? -v : v;
}

/** `round(x, n) if x is not None else None`. */
export function roundOrNull(x: number | null | undefined, n: number): number | null {
  return x === null || x === undefined ? null : pyRound(x, n);
}

/** numpy's pairwise summation of float64 (`np.add.reduce`, and so `np.sum` and `np.mean`). */
export function pairwiseSum(a: ArrayLike<number>, start = 0, n = a.length - start): number {
  if (n < 8) {
    let res = -0;
    for (let i = 0; i < n; i++) res += a[start + i];
    return res;
  }
  if (n <= 128) {
    const r = [a[start], a[start + 1], a[start + 2], a[start + 3], a[start + 4], a[start + 5], a[start + 6], a[start + 7]];
    let i = 8;
    for (; i < n - (n % 8); i += 8) {
      for (let j = 0; j < 8; j++) r[j] += a[start + i + j];
    }
    let res = ((r[0] + r[1]) + (r[2] + r[3])) + ((r[4] + r[5]) + (r[6] + r[7]));
    for (; i < n; i++) res += a[start + i];
    return res;
  }
  let n2 = Math.floor(n / 2);
  n2 -= n2 % 8;
  return pairwiseSum(a, start, n2) + pairwiseSum(a, start + n2, n - n2);
}

/** `np.mean` of a non-empty list. */
export function npMean(a: ArrayLike<number>): number {
  return (-0 + pairwiseSum(a)) / a.length;
}

/** numpy's interpolation between two order statistics (`_lerp`). */
function lerp(a: number, b: number, t: number): number {
  const d = b - a;
  return t >= 0.5 ? b - d * (1 - t) : a + d * t;
}

/** `np.percentile(a, q)` with the default linear method, of a non-empty list. */
export function npPercentile(a: ArrayLike<number>, q: number): number {
  const v = Float64Array.from(a).sort();
  const n = v.length;
  const virtual = (n - 1) * (q / 100);
  if (virtual >= n - 1) return v[n - 1];
  if (virtual < 0) return v[0];
  const prev = Math.floor(virtual);
  return lerp(v[prev], v[prev + 1], virtual - prev);
}

/** `np.median` of a non-empty list. */
export function npMedian(a: ArrayLike<number>): number {
  const v = Float64Array.from(a).sort();
  const n = v.length;
  if (n % 2 === 1) return v[(n - 1) / 2];
  return (-0 + v[n / 2 - 1] + v[n / 2]) / 2;
}
