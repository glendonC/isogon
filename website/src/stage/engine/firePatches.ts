/**
 * The patches a fire on show is made of: its cells grouped by touch, on a grid, largest first.
 *
 * A cell is a point in the box (u east, v north, both 0 to 1) with a weight. It covers the grid
 * square under it, or, given half sizes, the rectangle of the grid its footprint lies on (a
 * detection covers its instrument's pixel). Two cells are in one patch when grid squares they cover
 * are the same or touch by one of the eight neighbours.
 */
export interface FirePatches {
  /** For each point, the index of its patch. Patches are numbered largest first. */
  patchOf: Uint16Array;
  /** How many points each patch holds, largest first (ties: the heavier patch first). */
  sizes: number[];
}

/**
 * @param points triples (u, v, weight), one per cell
 * @param nx grid columns across the box
 * @param ny grid rows down the box
 * @param half optional pairs (half width in u, half height in v), one per cell
 */
export function firePatches(points: Float32Array, nx: number, ny: number, half?: Float32Array): FirePatches {
  const n = Math.floor(points.length / 3);
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  const owner = new Int32Array(nx * ny).fill(-1);
  const covered: number[] = [];
  const clampCol = (c: number) => Math.min(nx - 1, Math.max(0, c));
  const clampRow = (r: number) => Math.min(ny - 1, Math.max(0, r));
  for (let i = 0; i < n; i++) {
    const u = points[i * 3];
    const v = points[i * 3 + 1];
    const hu = half ? half[i * 2] : 0;
    const hv = half ? half[i * 2 + 1] : 0;
    // The squares a footprint lies on: its west and south edges inclusive, its east and north exclusive
    const c0 = clampCol(Math.floor((u - hu) * nx));
    const c1 = clampCol(Math.max(Math.floor(u * nx), Math.ceil((u + hu) * nx) - 1));
    const r0 = clampRow(Math.floor((v - hv) * ny));
    const r1 = clampRow(Math.max(Math.floor(v * ny), Math.ceil((v + hv) * ny) - 1));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const at = r * nx + c;
        if (owner[at] < 0) {
          owner[at] = i;
          covered.push(at);
        } else {
          union(i, owner[at]);
        }
      }
    }
  }
  // Touching squares: east, and the three squares of the next row, cover every pair of neighbours once
  for (const at of covered) {
    const r = Math.floor(at / nx);
    const c = at - r * nx;
    const mine = owner[at];
    if (c + 1 < nx && owner[at + 1] >= 0) union(mine, owner[at + 1]);
    if (r + 1 < ny) {
      const below = at + nx;
      if (owner[below] >= 0) union(mine, owner[below]);
      if (c > 0 && owner[below - 1] >= 0) union(mine, owner[below - 1]);
      if (c + 1 < nx && owner[below + 1] >= 0) union(mine, owner[below + 1]);
    }
  }

  const count = new Map<number, number>();
  const weight = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    count.set(root, (count.get(root) ?? 0) + 1);
    weight.set(root, (weight.get(root) ?? 0) + points[i * 3 + 2]);
  }
  const roots = [...count.keys()].sort(
    (a, b) => count.get(b)! - count.get(a)! || weight.get(b)! - weight.get(a)! || a - b,
  );
  const indexOf = new Map<number, number>();
  roots.forEach((root, k) => indexOf.set(root, k));
  const patchOf = new Uint16Array(n);
  for (let i = 0; i < n; i++) patchOf[i] = Math.min(65535, indexOf.get(find(i))!);
  return { patchOf, sizes: roots.map((root) => count.get(root)!) };
}
