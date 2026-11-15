/** A post and a neighbour are level with each other within this many metres. */
const LEVEL_M = 0.05;

/**
 * Level ground in an elevation grid: a post whose eight neighbours are all level with it, and the
 * posts beside such a post that are level with it (the shore posts). The elevation sources in use
 * level their lakes and nothing else, so this is where the lakes are. Sea posts (exactly 0 m) are
 * left out: they are marked as sea.
 */
export function levelGround(dem: Float32Array, n: number): Uint8Array {
  const inner = new Uint8Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const h = dem[r * n + c];
      if (h === 0) continue;
      let level = 1;
      for (let dr = -1; dr <= 1 && level; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = Math.min(n - 1, Math.max(0, r + dr));
          const cc = Math.min(n - 1, Math.max(0, c + dc));
          if (Math.abs(dem[rr * n + cc] - h) > LEVEL_M) {
            level = 0;
            break;
          }
        }
      }
      inner[r * n + c] = level;
    }
  }
  const out = new Uint8Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const h = dem[r * n + c];
      if (h === 0) continue;
      let level = inner[r * n + c];
      for (let dr = -1; dr <= 1 && !level; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
          if (inner[rr * n + cc] && Math.abs(dem[rr * n + cc] - h) <= LEVEL_M) {
            level = 1;
            break;
          }
        }
      }
      out[r * n + c] = level;
    }
  }
  return out;
}
