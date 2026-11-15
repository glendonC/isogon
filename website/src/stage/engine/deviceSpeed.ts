/**
 * How fast the page's own thread is, measured once: a fixed piece of arithmetic timed twice (the lesser
 * of the two). A machine that takes several times longer than a recent laptop is treated as slow: the
 * stage then takes the smaller ground pictures, whose upload does not stall it.
 */

/** The fixed work: about five million multiply-adds over a small array, as the stage's own loops do. */
function work(out: Float64Array): number {
  let acc = 0;
  for (let k = 0; k < 2400; k++) {
    for (let i = 0; i < out.length; i++) {
      const v = out[i] * 1.000001 + (i & 7) * 0.5;
      out[i] = v > 1e6 ? v - 1e6 : v;
      acc += Math.sqrt(out[i]);
    }
  }
  return acc;
}

/** The lesser of two timings of the fixed work, ms; the clock is given so the measure can be tested. */
export function mainThreadBenchMs(now: () => number = () => performance.now()): number {
  const arr = new Float64Array(2048);
  for (let i = 0; i < arr.length; i++) arr[i] = i;
  let best = Infinity;
  let sink = 0;
  for (let r = 0; r < 2; r++) {
    const t0 = now();
    sink += work(arr);
    best = Math.min(best, now() - t0);
  }
  // (kept, so the work is not optimised away)
  if (sink === -1) return -1;
  return best;
}

/**
 * The fixed work takes about 3.1 ms on a recent laptop's page thread in Chrome, and grows in step with
 * the thread's slowness (6.3 ms slowed twice by DevTools, 9.4 three times, 12.9 four times, 19 six times).
 * A machine taking more than this, about two and a half times that laptop, is slow for the full-size
 * ground pictures.
 */
export const SLOW_MAIN_THREAD_MS = 8.0;

export function isSlowMainThread(benchMs: number): boolean {
  return Number.isFinite(benchMs) && benchMs > SLOW_MAIN_THREAD_MS;
}
