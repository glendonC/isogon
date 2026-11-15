/**
 * The public fire cube: one file of monthly fire rows per quarter degree cell of the Earth (the fire-cube lane's
 * `backend/firms/cube_public.py`, its shape in `isogon-notes/fire-cube/PUBLIC-cube.md`), from which a page with no
 * backend sums the rows of any box. Typed arrays over the unpacked file, no library; the reader follows the
 * fire-cube lane's reference reader (`PUBLIC-reader.md`).
 *
 * Counted: fire rows (FIRMS type 0), day and night together, per month and platform: each platform's `total` in a
 * Record. A cell no country file has a row in is not loaded, never zero; a cell the closed rule closes has no row of
 * its closed months in the file, and a box holding one answers those months as closed.
 */

type Dtype = 'uint8' | 'uint16' | 'uint32';

export interface PublicManifest {
  format?: string;
  source: { cube_build: string; countries?: number; world_complete?: boolean };
  grid: { step_deg: number; n_cols: number; n_rows: number; earth_radius_km: number };
  months: { first: string; count: number; last: string };
  platforms: string[];
  file: { name: string; sha256: string; bytes: number; gzip?: boolean };
  sections: Array<{ name: string; dtype: Dtype; offset: number; length: number }>;
  delivering: Record<string, number[]>;
  outage_days: Record<string, number[]>;
  closed: Array<{ region_id: string; years: number[]; context_box: [number, number, number, number]; months: [number, number] | null; cells: number[] }>;
  fitted?: { name: string; sha256: string; serve?: { rows?: string; frp?: string }; provenance?: string };
}

/** What the file says of a box: fire rows per platform and month, whether any cell is loaded, its closed months. */
export interface PublicBox {
  /** The box on the grid: every cell the asked box touches. */
  box: [number, number, number, number];
  /** rows[p][m]: fire rows of platform p (manifest order) in month m (0 is the manifest's first month). */
  rows: Float64Array[];
  loaded: boolean;
  closedMonths: number[];
  cells: number;
}

export interface PublicCube {
  manifest: PublicManifest;
  /** Month m's label, "2000-11". */
  monthLabel: (m: number) => string;
  box: (west: number, south: number, east: number, north: number) => PublicBox;
}

const ESC = 255;
const MAGIC = 'IFCELL01';

/** The manifest and the file, from the folder the recorder copies beside the page. */
export async function loadPublicCube(base: string, fetcher: typeof fetch = fetch): Promise<PublicCube> {
  const root = base.replace(/\/?$/, '/');
  const mresp = await fetcher(`${root}manifest.json`);
  if (!mresp.ok) throw new Error(`the public cube's manifest is not served at ${root}manifest.json (${mresp.status})`);
  const manifest = (await mresp.json()) as PublicManifest;
  const fresp = await fetcher(`${root}${manifest.file.name}`);
  if (!fresp.ok) throw new Error(`the public cube's file is not served at ${root}${manifest.file.name} (${fresp.status})`);
  let raw = new Uint8Array(await fresp.arrayBuffer());
  if (raw[0] === 0x1f && raw[1] === 0x8b) {
    // Still gzipped: the host did not undo it.
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));
    raw = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return openPublicCube(manifest, raw);
}

function monthLabelOf(first: string): (m: number) => string {
  const y0 = Number(first.slice(0, 4));
  const m0 = Number(first.slice(5, 7)) - 1;
  return (m: number) => {
    const k = m0 + m;
    const y = y0 + Math.floor(k / 12);
    const mo = (k % 12) + 1;
    return `${y}-${mo < 10 ? '0' : ''}${mo}`;
  };
}

/** The reader over the unpacked file. */
export function openPublicCube(manifest: PublicManifest, raw: Uint8Array): PublicCube {
  for (let i = 0; i < MAGIC.length; i++) {
    if (raw[i] !== MAGIC.charCodeAt(i)) throw new Error('not a public cube file');
  }
  const N_COLS = manifest.grid.n_cols;
  const N_ROWS = manifest.grid.n_rows;
  const STEP = manifest.grid.step_deg;
  const N_CELLS = N_COLS * N_ROWS;
  const s: Record<string, Uint8Array | Uint16Array | Uint32Array> = {};
  // Each view needs its offset on a multiple of its size: a copy puts the bytes at the start of a buffer of their own.
  const bytes = raw.byteOffset % 4 === 0 ? raw : raw.slice();
  for (const x of manifest.sections) {
    const T = x.dtype === 'uint8' ? Uint8Array : x.dtype === 'uint16' ? Uint16Array : Uint32Array;
    s[x.name] = new T(bytes.buffer as ArrayBuffer, bytes.byteOffset + x.offset, x.length);
  }
  const nP = manifest.platforms.length;
  const nM = manifest.months.count;
  const start = new Uint32Array(N_CELLS + 1);
  const cellDelta = s.cell_delta;
  const cellEntries = s.cell_entries;
  for (let i = 0, c = 0; i < cellDelta.length; i++) {
    c += cellDelta[i];
    start[c + 1] = cellEntries[i];
  }
  for (let c = 0; c < N_CELLS; c++) start[c + 1] += start[c];
  const rowsP = manifest.platforms.map((_, p) => s[`rows_${p}`]);
  const bigRows = manifest.platforms.map((_, p) => s[`big_rows_${p}`]);
  const big = manifest.platforms.map((_, p) => {
    const st = s[`big_step_${p}`];
    const out = new Uint32Array(st.length);
    for (let i = 0, k = 0; i < st.length; i++) {
      k += st[i];
      out[i] = k;
    }
    return out;
  });
  const rowsOf = (p: number, i: number): number => {
    const v = rowsP[p][i];
    if (v !== ESC) return v;
    const b = big[p];
    let lo = 0;
    let hi = b.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (b[mid] < i) lo = mid + 1;
      else hi = mid;
    }
    return bigRows[p][lo];
  };
  const monthStep = s.month_step;
  const loadedBits = s.loaded;
  const closed = manifest.closed.filter((k) => k.months).map((k) => ({ cells: new Set(k.cells), months: k.months as [number, number] }));

  function box(west: number, south: number, east: number, north: number): PublicBox {
    // The cube's outer snap: every cell the box touches, with 1e-9 of slack (backend/firms/cube.py, snap).
    const eps = 1e-9;
    const c0 = Math.max(0, Math.floor((west + 180) / STEP + eps));
    const c1 = Math.min(N_COLS, Math.ceil((east + 180) / STEP - eps));
    const j0 = Math.max(0, Math.floor((south + 90) / STEP + eps));
    const j1 = Math.min(N_ROWS, Math.ceil((north + 90) / STEP - eps));
    if (c1 <= c0 || j1 <= j0) throw new Error('the box holds no cell of the grid');
    const r0 = N_ROWS - j1;
    const r1 = N_ROWS - j0;
    const rows = manifest.platforms.map(() => new Float64Array(nM));
    const closedMonths = new Set<number>();
    let loaded = false;
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        const cell = r * N_COLS + c;
        if (loadedBits[cell >> 3] & (1 << (cell & 7))) loaded = true;
        for (const k of closed) {
          if (k.cells.has(cell)) for (let m = k.months[0]; m <= k.months[1]; m++) closedMonths.add(m);
        }
        for (let i = start[cell], m = 0; i < start[cell + 1]; i++) {
          m += monthStep[i];
          for (let p = 0; p < nP; p++) rows[p][m] += rowsOf(p, i);
        }
      }
    }
    return {
      box: [-180 + c0 * STEP, 90 - r1 * STEP, -180 + c1 * STEP, 90 - r0 * STEP],
      rows,
      loaded,
      closedMonths: [...closedMonths].sort((a, b) => a - b),
      cells: (c1 - c0) * (r1 - r0),
    };
  }

  return { manifest, monthLabel: monthLabelOf(manifest.months.first), box };
}
