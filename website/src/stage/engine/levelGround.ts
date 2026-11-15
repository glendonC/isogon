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

/**
 * Elevation from a source given in whole metres (some are, and resampling keeps it so wherever the
 * ground is flat): flat ground is then a series of exactly level terraces, each at a whole metre, and
 * level ground no longer means a lake. True when most level posts (as levelGround finds them, sea left
 * out) lie at a whole metre; a lake in elevation of finer grain lies at any height. Every second row
 * and column is read.
 */
export function levelIsWholeMetres(dem: Float32Array, n: number): boolean {
  let level = 0;
  let whole = 0;
  for (let r = 1; r < n - 1; r += 2) {
    for (let c = 1; c < n - 1; c += 2) {
      const h = dem[r * n + c];
      if (h === 0 || !Number.isFinite(h)) continue;
      let flat = true;
      for (let dr = -1; dr <= 1 && flat; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (Math.abs(dem[(r + dr) * n + c + dc] - h) > LEVEL_M) {
            flat = false;
            break;
          }
        }
      }
      if (!flat) continue;
      level++;
      if (Math.abs(h - Math.round(h)) < 0.02) whole++;
    }
  }
  return level >= 20 && whole / level > 0.5;
}

/** A post this little above the sea, mostly ringed by sea, is taken for sea (elevation noise at the shore). */
const SEA_NOISE_M = 1.5;

/**
 * The sea in an elevation grid: posts at exactly 0 m (the terrain packs put the sea there), and posts
 * less than SEA_NOISE_M above it with at least five of their eight neighbours sea, twice over, so
 * specks of noise just off a coast and small notches in it are sea too. A straight beach is not moved.
 */
export function seaPosts(dem: Float32Array, n: number): Uint8Array {
  let sea = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) sea[i] = dem[i] === 0 ? 1 : 0;
  for (let pass = 0; pass < 2; pass++) {
    const next = sea.slice();
    for (let r = 1; r < n - 1; r++) {
      for (let c = 1; c < n - 1; c++) {
        const i = r * n + c;
        if (sea[i] || !(dem[i] < SEA_NOISE_M)) continue;
        let around = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) around += sea[(r + dr) * n + c + dc];
        if (around >= 5) next[i] = 1;
      }
    }
    sea = next;
  }
  return sea;
}
