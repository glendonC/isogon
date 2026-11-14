import type { Box, CompareBlock, CompareGround, CompareMark, ComparePin, DetectionRow, EstimateGrid } from './types';

/**
 * Turns answers the page already has into blocks for the compare plane. Nothing here asks for anything, and no
 * place, fire or figure is typed: every number comes out of the answer it is given. The few words the blocks
 * carry are in `WORDS`, so a change of wording is one edit.
 */

export const WORDS = {
  coarseSaw: 'What MODIS saw',
  estimate: 'The estimate from MODIS alone',
  sharpSaw: 'What VIIRS saw',
  coarseSize: '1 km',
  sharpSize: '375 m',
  hidden: 'hidden',
} as const;

/** The players of a round, by the product's names, in the order they are shown. */
export const PLAYERS: readonly { key: string; name: string }[] = [
  { key: 'random', name: 'Chance' },
  { key: 'latest_modis', name: 'Latest MODIS' },
  { key: 'least_sure', name: 'Least sure' },
  { key: 'learned', name: 'Learned agent' },
  { key: 'oracle', name: 'Ceiling' },
];

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Obj) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const str = (x: unknown): string | null => (typeof x === 'string' && x.length > 0 ? x : null);
const boxOf = (x: unknown): Box | null => {
  const a = arr(x);
  return a.length === 4 && a.every((v) => num(v) !== null) ? (a as Box) : null;
};

const clock = (iso: string): string => `${iso.slice(11, 16)} UTC`;
const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
/** A gain with its sign, to three places. */
export const signed = (g: number): string => `${g >= 0 ? '+' : '-'}${Math.abs(g).toFixed(3)}`;

/** The ground of a run: its 512 elevation, its 2K image, its box and its size on the ground. */
export function groundOfRun(run: unknown): CompareGround | null {
  const assets = obj(obj(run).assets);
  const region = obj(obj(run).region);
  const elevationUrl = str(assets.dem_hires_f32_url) ?? str(assets.dem_f32_url);
  const box = boxOf(region.bbox);
  const widthKm = num(region.width_km);
  const depthKm = num(region.depth_km);
  if (!elevationUrl || !box || !widthKm || !depthKm) return null;
  return { elevationUrl, imageUrl: str(assets.satellite_url), box, widthKm, depthKm };
}

/** A run's footprint rows, in the order of its `footprint_schema` (lon, lat, scan km, track km, bearing). */
export function detectionRows(footprints: unknown): DetectionRow[] {
  const rows: DetectionRow[] = [];
  for (const f of arr(footprints)) {
    const a = arr(f);
    const lon = num(a[0]);
    const lat = num(a[1]);
    const scanKm = num(a[2]);
    const trackKm = num(a[3]);
    if (lon === null || lat === null || scanKm === null || trackKm === null) continue;
    rows.push({ lon, lat, scanKm, trackKm, bearingDeg: num(a[4]) });
  }
  return rows;
}

/** Rows given with their column names, as the round's routes give them. */
function rowsByColumns(table: unknown): { rows: unknown[][]; at: (name: string) => number } {
  const t = obj(table);
  const columns = arr(t.columns).map(String);
  return { rows: arr(t.rows).map(arr), at: (name) => columns.indexOf(name) };
}

interface Frame {
  frame: number;
  time: string;
  sensor: string;
  heldOut: boolean;
  isDay: boolean;
  rows: DetectionRow[];
}

function framesOf(run: unknown): Frame[] {
  const out: Frame[] = [];
  for (const f of arr(obj(obj(run).observer_passes).frames)) {
    const o = obj(f);
    const frame = num(o.frame);
    const time = str(o.timestamp_utc);
    if (frame === null || !time) continue;
    out.push({
      frame,
      time,
      sensor: str(o.sensor) ?? '',
      heldOut: o.held_out === true,
      isDay: o.is_day === true,
      rows: detectionRows(o.footprints),
    });
  }
  return out;
}

/**
 * A square cut around detections, with a margin, kept inside the ground's box. Null when there is nothing to cut
 * around or the cut would be the whole box.
 */
export function cutAround(rows: readonly DetectionRow[], ground: CompareGround, marginKm: number): Box | null {
  if (rows.length === 0) return null;
  const [W, S, E, N] = ground.box;
  const kmPerLon = ground.widthKm / (E - W);
  const kmPerLat = ground.depthKm / (N - S);
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const r of rows) {
    const half = Math.max(r.scanKm, r.trackKm) / 2;
    w = Math.min(w, r.lon - half / kmPerLon);
    e = Math.max(e, r.lon + half / kmPerLon);
    s = Math.min(s, r.lat - half / kmPerLat);
    n = Math.max(n, r.lat + half / kmPerLat);
  }
  const side = Math.max((e - w) * kmPerLon, (n - s) * kmPerLat) + 2 * marginKm;
  if (side >= Math.min(ground.widthKm, ground.depthKm)) return null;
  const halfLon = side / 2 / kmPerLon;
  const halfLat = side / 2 / kmPerLat;
  let cx = (w + e) / 2;
  let cy = (s + n) / 2;
  cx = Math.min(E - halfLon, Math.max(W + halfLon, cx));
  cy = Math.min(N - halfLat, Math.max(S + halfLat, cy));
  return [cx - halfLon, cy - halfLat, cx + halfLon, cy + halfLat];
}

/** Ground kept around a fire when blocks are cut to it, km. Drawing. */
const CUT_MARGIN_KM = 3;

const inside = (r: DetectionRow, b: Box): boolean => r.lon >= b[0] && r.lon <= b[2] && r.lat >= b[1] && r.lat <= b[3];

// ---------------------------------------------------------------------------------------------
// A featured fire

export interface FireBlockOptions {
  /** What the fire is to the model, in the page's own words. */
  standing?: string | null;
}

/**
 * A featured fire of the places registry as one block, from the held-out run of its start: the ground, and the
 * MODIS detections of the run's passes. The label says what is drawn: the run's own window.
 */
export function fireBlock(place: unknown, fire: unknown, run: unknown, opts: FireBlockOptions = {}): CompareBlock | null {
  const ground = groundOfRun(run);
  const id = str(obj(fire).id);
  if (!ground || !id) return null;
  const rows = framesOf(run)
    .filter((f) => !f.heldOut)
    .flatMap((f) => f.rows);
  const hours = num(obj(obj(run).window).span_hours);
  const lines: string[] = [];
  const placeName = str(obj(place).name);
  if (placeName) lines.push(placeName);
  lines.push(`${count(rows.length, 'MODIS detection', 'MODIS detections')}${hours !== null ? ` in ${Math.round(hours)} hours` : ''}`);
  if (opts.standing) lines.push(opts.standing);
  return {
    id,
    ground,
    // The fire is the subject here, not the instrument: every pass's footprints as a wash in the detection's colour
    marks: [{ kind: 'detections', instrument: 'modis', ink: 'detection', draw: 'wash', rows }],
    label: { title: str(obj(fire).label) ?? id, lines },
    night: true,
  };
}

// ---------------------------------------------------------------------------------------------
// One fire, three ways

export interface ThreeWaysOptions {
  /** The held-out frame to compare at. Default the last one of the run. */
  frame?: number;
  /** Cut all three blocks to the fire. Default true. */
  cut?: boolean;
  /** A platform's name as the page shows it. Default: the code as the run gives it. */
  platformName?: (code: string) => string;
}

export interface ThreeWays {
  blocks: CompareBlock[];
  /** The hidden pass's time. */
  timeUtc: string;
  /** Once revealed: the window's count of scores, with its kind. */
  scoreLine: string | null;
}

/** A window's count of scores, said with its kind. */
export function scoreLine(verdict: unknown): string | null {
  const v = obj(verdict);
  const ahead = num(v.beats_every_baseline_on);
  const judged = num(v.scores_judged);
  if (ahead === null || judged === null) return null;
  return `Ahead of both simple methods on ${ahead} of ${judged}, by plain comparison`;
}

/**
 * One fire at one hidden pass, three ways: what the coarse satellite saw on its last pass before it, the estimate
 * made from the coarse satellite alone at that time, and what the sharp satellite saw. `revealed` is the same run
 * after the reveal, or null before it; without it the third block is withheld and holds no row.
 *
 * The cut is chosen from the MODIS detections of the whole window, so it does not move at the reveal. It grows
 * only if a revealed detection lies outside it, so that nothing the estimate missed is cut away.
 */
export function threeWays(run: unknown, revealed: unknown, opts: ThreeWaysOptions = {}): ThreeWays | null {
  const ground = groundOfRun(run);
  const frames = framesOf(run);
  if (!ground || frames.length === 0) return null;
  const hiddenFrames = frames.filter((f) => f.heldOut);
  const hidden = (opts.frame !== undefined ? frames.find((f) => f.frame === opts.frame && f.heldOut) : undefined) ?? hiddenFrames[hiddenFrames.length - 1];
  if (!hidden) return null;
  const name = opts.platformName ?? ((code: string) => code);

  // The last pass of the coarse satellite with a detection, before the hidden pass
  let coarse: Frame | null = null;
  for (const f of frames) if (f.frame < hidden.frame && !f.heldOut && f.rows.length > 0) coarse = f;

  // What the sharp satellite saw, only once revealed
  let sharp: { rows: DetectionRow[]; platform: string; time: string } | null = null;
  if (revealed) {
    for (const o of arr(obj(obj(obj(revealed).blind_test).reveal).overpasses)) {
      const pass = obj(o);
      if (num(pass.frame) !== hidden.frame) continue;
      sharp = { rows: detectionRows(pass.footprints), platform: str(pass.platform) ?? hidden.sensor, time: str(pass.time_utc) ?? hidden.time };
    }
  }

  // The estimate at the hidden pass's time: the step at or before it, which knows only earlier passes
  const bf = obj(obj(run).belief_frames);
  const bfGrid = obj(bf.grid);
  const gridBox = boxOf(bfGrid.bbox);
  const nx = num(bfGrid.nx);
  const ny = num(bfGrid.ny);
  const steps = num(bf.steps);
  const stepMinutes = num(bf.step_minutes);
  const firstTime = str(bf.first_time_utc);
  const beliefUrl = str(bf.url);
  let estimate: { mark: CompareMark; time: string; cells: number | null } | null = null;
  if (gridBox && nx && ny && steps && stepMinutes && firstTime && beliefUrl) {
    const t0 = Date.parse(firstTime);
    const step = Math.min(steps - 1, Math.max(0, Math.floor((Date.parse(hidden.time) - t0) / (stepMinutes * 60000))));
    const grid: EstimateGrid = { nx, ny, box: gridBox };
    estimate = {
      mark: { kind: 'estimate', grid, source: { url: beliefUrl, step, steps } },
      time: new Date(t0 + step * stepMinutes * 60000).toISOString(),
      cells: num(obj(arr(bf.per_step)[step]).expected_burning_cells),
    };
  }

  let cut: Box | null = null;
  if (opts.cut !== false) {
    const seen = frames.filter((f) => !f.heldOut).flatMap((f) => f.rows);
    cut = cutAround(seen, ground, CUT_MARGIN_KM);
    if (cut && sharp && sharp.rows.some((r) => !inside(r, cut as Box))) cut = cutAround([...seen, ...sharp.rows], ground, CUT_MARGIN_KM);
  }
  const cutGround: CompareGround = cut ? { ...ground, cut } : ground;
  // The image is darkened by day as by night: on this plane the marks lead
  const night = true;

  const blocks: CompareBlock[] = [
    {
      id: 'coarse',
      ground: cutGround,
      night,
      marks: coarse ? [{ kind: 'detections', instrument: 'modis', rows: coarse.rows }] : [],
      label: {
        title: WORDS.coarseSaw,
        lines: coarse
          ? [`${count(coarse.rows.length, 'detection', 'detections')} at ${WORDS.coarseSize}`, `${name(coarse.sensor)} pass, ${clock(coarse.time)}`]
          : [],
      },
    },
    {
      id: 'estimate',
      ground: cutGround,
      night,
      marks: estimate ? [estimate.mark] : [],
      label: {
        title: WORDS.estimate,
        lines: estimate
          ? [
              estimate.cells !== null ? `${Math.round(estimate.cells)} cells expected to burn, ${WORDS.sharpSize} grid` : `${WORDS.sharpSize} grid`,
              clock(estimate.time),
            ]
          : [],
      },
    },
    {
      id: 'sharp',
      ground: cutGround,
      night,
      state: sharp ? 'idle' : 'withheld',
      marks: sharp ? [{ kind: 'detections', instrument: 'viirs', rows: sharp.rows }] : [],
      label: {
        title: WORDS.sharpSaw,
        lines: [
          sharp ? `${count(sharp.rows.length, 'detection', 'detections')} at ${WORDS.sharpSize}` : WORDS.hidden,
          `${name(sharp ? sharp.platform : hidden.sensor)} pass, ${clock(sharp ? sharp.time : hidden.time)}`,
        ],
      },
    },
  ];
  return { blocks, timeUtc: hidden.time, scoreLine: revealed ? scoreLine(obj(obj(revealed).blind_test).verdict) : null };
}

// ---------------------------------------------------------------------------------------------
// The players of a round

export interface PlayerBlocksOptions {
  /** Show the Ceiling, which sees the answer. Default false. */
  ceiling?: boolean;
  /** Which of Chance's draws to show. Default the first. */
  draw?: number;
}

/**
 * One block per player of a finished round, from the round's start and its end. Every block carries the tile
 * lines, outlines for the MODIS detections every player could see, and filled marks only for the VIIRS detections
 * that player's own looks revealed. A pin per tile gives the order of the looks that went there.
 */
export function playerBlocks(ground: CompareGround | null, start: unknown, end: unknown, opts: PlayerBlocksOptions = {}): CompareBlock[] {
  const episode = obj(obj(start).episode);
  const box = boxOf(episode.box);
  const tiles = arr(episode.tiles);
  const rowsN = num(tiles[0]);
  const colsN = num(tiles[1]);
  const reference = obj(obj(end).reference);
  if (!ground || !box || !rowsN || !colsN || Object.keys(reference).length === 0) return [];
  // The round's box must be the ground's: a round on another box needs that box's terrain
  if (box.some((v, i) => Math.abs(v - ground.box[i]) > 1e-6)) return [];

  const modis = rowsByColumns(obj(obj(start).observation).modis);
  const seen: DetectionRow[] = [];
  for (const r of modis.rows) {
    const lon = num(r[modis.at('lon')]);
    const lat = num(r[modis.at('lat')]);
    const scanKm = num(r[modis.at('scan_km')]);
    const trackKm = num(r[modis.at('track_km')]);
    if (lon !== null && lat !== null && scanKm !== null && trackKm !== null) seen.push({ lon, lat, scanKm, trackKm });
  }
  const reveal = rowsByColumns(obj(end).reveal);

  const blocks: CompareBlock[] = [];
  for (const player of PLAYERS) {
    if (player.key === 'oracle' && !opts.ceiling) continue;
    const ref = obj(reference[player.key]);
    let actions: unknown[];
    let gain: number | null;
    const lines: string[] = [];
    let note: string | null = null;
    if (player.key === 'random') {
      const draw = opts.draw ?? 0;
      const gains = arr(ref.gains).map(num).filter((g): g is number => g !== null);
      actions = arr(arr(ref.actions)[draw]);
      gain = gains[draw] ?? null;
      if (gains.length > 0) note = `one of ${gains.length} draws, mean ${signed(gains.reduce((a, b) => a + b, 0) / gains.length)}`;
    } else {
      actions = arr(ref.actions);
      gain = num(ref.gain);
      if (player.key === 'oracle') note = 'sees the answer';
    }
    if (actions.length === 0) continue;
    const taken: { tile: number; look: number }[] = [];
    actions.forEach((a, look) => {
      const tile = num(a);
      if (tile !== null && tile >= 0) taken.push({ tile, look });
    });
    const found: DetectionRow[] = [];
    for (const r of reveal.rows) {
      const tile = num(r[reveal.at('tile')]);
      const look = num(r[reveal.at('look')]);
      if (!taken.some((t) => t.tile === tile && t.look === look)) continue;
      const lon = num(r[reveal.at('lon')]);
      const lat = num(r[reveal.at('lat')]);
      const scanKm = num(r[reveal.at('scan_km')]);
      const trackKm = num(r[reveal.at('track_km')]);
      if (lon !== null && lat !== null && scanKm !== null && trackKm !== null) found.push({ lon, lat, scanKm, trackKm });
    }
    const order = new Map<number, number[]>();
    taken.forEach((t, i) => order.set(t.tile, [...(order.get(t.tile) ?? []), i + 1]));
    const pins: ComparePin[] = [...order.entries()].map(([tile, looks]) => ({
      id: `tile-${tile}`,
      // The north-west corner of the tile, a little inside it, so the mark does not cover what was found
      lon: box[0] + (((tile % colsN) + 0.16) / colsN) * (box[2] - box[0]),
      lat: box[3] - ((Math.floor(tile / colsN) + 0.16) / rowsN) * (box[3] - box[1]),
      text: looks.join(' '),
    }));
    lines.push(`${count(found.length, 'detection', 'detections')} found in ${count(taken.length, 'look', 'looks')}`);
    if (gain !== null) lines.push(`score gain ${signed(gain)}`);
    if (note) lines.push(note);
    blocks.push({
      id: player.key,
      ground,
      night: true,
      marks: [
        { kind: 'tiles', rows: rowsN, cols: colsN, looked: taken.map((t) => t.tile) },
        { kind: 'detections', instrument: 'modis', rows: seen, weight: 'quiet' },
        { kind: 'detections', instrument: 'viirs', rows: found },
      ],
      pins,
      label: { title: player.name, lines },
    });
  }
  return blocks;
}
