/**
 * What one cell of a world layer holds, read back from the cube's image: not loaded (no loaded country file has a
 * row there), loaded with none of the layer's rows, or a value read from its colour on the layer's log scale. Kept
 * apart from the drawing so a test can hold it to the rule that a cell not loaded never reads as no fire.
 */

/** A cell no loaded file holds a row in. Never drawn or said as zero. */
export const NOT_LOADED = -1;

/** The value a position on the log scale stands for: log10(1 + v) / log10(1 + max) = t. */
export const valueOfT = (t: number, max: number) => Math.pow(1 + max, t) - 1;
export const tOfValue = (v: number, max: number) => (max > 0 ? Math.log10(1 + v) / Math.log10(1 + max) : 0);

/** Position on the cube's ramp (0 to 1) of a colour the ramp drew, by the nearest point on its segments. */
export function inverter(ramp: number[][]) {
  const cache = new Map<number, number>();
  const n = ramp.length - 1;
  return (r: number, g: number, b: number) => {
    const key = (r << 16) | (g << 8) | b;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i += 1) {
      const a = ramp[i];
      const c = ramp[i + 1];
      const d = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const len = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
      const f = Math.min(Math.max(((r - a[0]) * d[0] + (g - a[1]) * d[1] + (b - a[2]) * d[2]) / len, 0), 1);
      const e0 = r - (a[0] + d[0] * f);
      const e1 = g - (a[1] + d[1] * f);
      const e2 = b - (a[2] + d[2] * f);
      const dist = e0 * e0 + e1 * e1 + e2 * e2;
      if (dist < bestD) {
        bestD = dist;
        best = (i + f) / n;
      }
    }
    cache.set(key, best);
    return best;
  };
}


/**
 * One pixel of the layer's image: alpha 0 is a cell not loaded; any other alpha below 255 is the grey of a loaded
 * cell with none of the layer's rows; a full colour is a value on the ramp.
 */
export function cellValue(
  r: number,
  g: number,
  b: number,
  a: number,
  invert: (r: number, g: number, b: number) => number,
  max: number,
): { value: number; t: number | null } {
  if (a === 0) return { value: NOT_LOADED, t: null };
  if (a < 255) return { value: 0, t: null };
  const t = invert(r, g, b);
  return { value: valueOfT(t, max), t };
}
