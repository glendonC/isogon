/**
 * NASA's burned-area map of a run's box (MCD64A1, `GET /api/burned`), read for the terrain: each cell's class
 * from its day of burn against the run's window, by the backend's own rule (a burn day is in the window
 * when its UTC calendar day overlaps [start, end)), and where the picture lies on the run's slab.
 */

/** A cell's class in the texture's red channel. */
export const BURNED_NONE = 0;
export const BURNED_BEFORE = 1;
export const BURNED_IN = 2;
export const BURNED_AFTER = 3;

const DAY_MS = 24 * 3600 * 1000;

/**
 * The classes of the cells from their days of burn (0 not burned, 1 the span's first day), against the
 * window [startMs, endMs). `spanStartMs` is the span's first day at 00:00 UTC.
 */
export function burnedClasses(days: ArrayLike<number>, spanStartMs: number, startMs: number, endMs: number): Uint8Array {
  const out = new Uint8Array(days.length);
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (!(d >= 1)) continue;
    const dayStart = spanStartMs + (d - 1) * DAY_MS;
    const dayEnd = dayStart + DAY_MS;
    out[i] = dayEnd <= startMs ? BURNED_BEFORE : dayStart >= endMs ? BURNED_AFTER : BURNED_IN;
  }
  return out;
}

/**
 * The picture's bounds on the ground: the answer's own when it gives them, else whole cells of `cellKm`
 * from the box's south-west corner (longitude at the box's middle latitude, latitude at 111.132 km a
 * degree), as the backend lays them.
 */
export function burnedBounds(
  box: readonly [number, number, number, number],
  nx: number,
  ny: number,
  cellKm = 0.375,
  given?: readonly [number, number, number, number] | null,
): [number, number, number, number] {
  if (given && given.length === 4 && given.every((x) => Number.isFinite(x)) && given[2] > given[0] && given[3] > given[1]) {
    return [given[0], given[1], given[2], given[3]];
  }
  const [w, s, , n] = box;
  const mid = ((s + n) / 2) * (Math.PI / 180);
  const dLat = cellKm / 111.132;
  const dLon = cellKm / (111.132 * Math.cos(mid));
  return [w, s, w + nx * dLon, s + ny * dLat];
}

/**
 * The map from the slab's texture coordinates (u east, v north over the slab's own box) to the picture's:
 * picture = slab * scale + offset, as (scaleU, scaleV, offsetU, offsetV).
 */
export function slabToPicture(
  slab: readonly [number, number, number, number],
  picture: readonly [number, number, number, number],
): [number, number, number, number] {
  const pw = Math.max(1e-9, picture[2] - picture[0]);
  const ph = Math.max(1e-9, picture[3] - picture[1]);
  return [(slab[2] - slab[0]) / pw, (slab[3] - slab[1]) / ph, (slab[0] - picture[0]) / pw, (slab[1] - picture[1]) / ph];
}
