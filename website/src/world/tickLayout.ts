/** One number under a legend's ramp, at `t` (0 to 1) along it. */
export interface Tick {
  key: string | number;
  t: number;
  label: string;
}

/** The space kept between two numbers, in px. */
const GAP = 10;

/**
 * Where each number goes and whether it shows, from its width and the ramp's: centred on its place, moved inside the
 * ramp's ends where it would hang past them; a number that would come within 10 px of the one before is left out,
 * except the last, which stays (it says how far the ramp reaches) and takes the place of the one before it.
 */
export function layoutTicks(ticks: Tick[], widths: number[], width: number): Array<{ x: number; shown: boolean }> {
  const left = ticks.map((k, i) => Math.min(Math.max(k.t * width - widths[i] / 2, 0), Math.max(0, width - widths[i])));
  const right = (i: number) => left[i] + widths[i];
  const kept: number[] = [];
  ticks.forEach((_, i) => {
    const last = i === ticks.length - 1;
    while (kept.length && left[i] < right(kept[kept.length - 1]) + GAP) {
      if (!last || kept.length === 1) return;
      kept.pop();
    }
    kept.push(i);
  });
  return ticks.map((_, i) => ({ x: left[i], shown: kept.includes(i) }));
}
