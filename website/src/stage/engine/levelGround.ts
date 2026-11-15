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

/** A patch of posts under this height whose border is mostly sea may be sea (see lowPatchesAtSea). */
const LOW_PATCH_M = 5.0;
/** At most this share of such a patch's border may be land. */
const LOW_PATCH_LAND_SHARE = 0.25;

/**
 * Patches that may be sea: connected posts (eight neighbours) less than LOW_PATCH_M above the sea,
 * not sea themselves, whose border is mostly sea (under LOW_PATCH_LAND_SHARE of it land). Elevation
 * smoothed over a coast leaves such strips and blobs offshore; a low plain or a delta borders the land
 * along much of its edge and is not one. A barrier island or a sand bar is one too, so the elevation
 * alone does not decide: the shader takes a patch for sea only where its picture looks like water or
 * has no data.
 */
export function lowPatchesAtSea(dem: Float32Array, n: number, sea: Uint8Array): Uint8Array {
  const out = new Uint8Array(n * n);
  const seen = new Uint8Array(n * n);
  // border posts are counted once per patch: marked with the patch's number
  const borderMark = new Int32Array(n * n);
  const stack: number[] = [];
  const patch: number[] = [];
  let patchNo = 0;
  const isLow = (i: number) => sea[i] === 0 && dem[i] < LOW_PATCH_M;
  for (let start = 0; start < n * n; start++) {
    if (seen[start] || !isLow(start)) continue;
    patchNo++;
    let seaBorder = 0;
    let landBorder = 0;
    patch.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop()!;
      patch.push(i);
      const r = Math.floor(i / n);
      const c = i - r * n;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= n) continue;
        for (let dc = -1; dc <= 1; dc++) {
          const cc = c + dc;
          if (cc < 0 || cc >= n || (dr === 0 && dc === 0)) continue;
          const j = rr * n + cc;
          if (isLow(j)) {
            if (!seen[j]) {
              seen[j] = 1;
              stack.push(j);
            }
          } else if (borderMark[j] !== patchNo) {
            borderMark[j] = patchNo;
            if (sea[j]) seaBorder++;
            else landBorder++;
          }
        }
      }
    }
    if (seaBorder > 0 && landBorder < LOW_PATCH_LAND_SHARE * (seaBorder + landBorder)) {
      for (const i of patch) out[i] = 1;
    }
  }
  return out;
}

/** Radius of the terrace smoothing, in posts, and the difference from its blur beyond which a post is relief. */
const TERRACE_RADIUS = 4;
const TERRACE_KEEP_FROM_M = 1.5;
const TERRACE_KEEP_FULL_M = 4.0;

/**
 * Display smoothing for elevation in whole metres, in place: flat ground there is a staircase of
 * terraces one metre high and several posts wide, which a low sun draws as contour bands. Each post
 * takes the mean of the posts around it (a box of TERRACE_RADIUS posts, twice, about a Gaussian)
 * where it differs from that mean by little, that is on nearly flat ground; where it differs by
 * metres it is relief and keeps its own height. The sea (posts at exactly 0 m) neither moves nor
 * counts in a mean, so the coast is not pulled down and the sea is not raised. A rendering treatment;
 * the test for whole metres and the sea are read on the elevation before it.
 */
export function smoothTerraces(dem: Float32Array, n: number): void {
  if (n < 2 * TERRACE_RADIUS + 1 || dem.length !== n * n) return;
  const r = TERRACE_RADIUS;
  let value = new Float32Array(n * n);
  let weight = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const land = dem[i] !== 0 ? 1 : 0;
    value[i] = dem[i] * land;
    weight[i] = land;
  }
  const sumV = new Float32Array(n * n);
  const sumW = new Float32Array(n * n);
  const pass = (src: Float32Array, out: Float32Array, alongRows: boolean) => {
    for (let line = 0; line < n; line++) {
      let acc = 0;
      const at = (k: number) => (alongRows ? line * n + k : k * n + line);
      for (let k = 0; k <= r && k < n; k++) acc += src[at(k)];
      for (let k = 0; k < n; k++) {
        out[at(k)] = acc;
        const add = k + r + 1;
        const drop = k - r;
        if (add < n) acc += src[at(add)];
        if (drop >= 0) acc -= src[at(drop)];
      }
    }
  };
  for (let round = 0; round < 2; round++) {
    pass(value, sumV, true);
    pass(weight, sumW, true);
    pass(sumV, value, false);
    pass(sumW, weight, false);
    // (normalise between the rounds, so the second round blurs means and not sums)
    for (let i = 0; i < n * n; i++) {
      const w = weight[i];
      value[i] = w > 0 ? value[i] / w : 0;
      weight[i] = w > 0 ? 1 : 0;
    }
  }
  for (let i = 0; i < n * n; i++) {
    const raw = dem[i];
    if (raw === 0 || weight[i] === 0) continue;
    const t = Math.min(1, Math.max(0, (Math.abs(raw - value[i]) - TERRACE_KEEP_FROM_M) / (TERRACE_KEEP_FULL_M - TERRACE_KEEP_FROM_M)));
    const keep = t * t * (3 - 2 * t);
    dem[i] = raw + (value[i] - raw) * (1 - keep);
  }
}
