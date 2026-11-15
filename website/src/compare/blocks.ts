import { countWord as guideCountWord, localDayTime, midLon, points as guidePoints } from '../guide/formats.ts';
import type { Box, CompareBlock, CompareGround, CompareMark, ComparePin, DetectionRow, EstimateGrid } from './types';

/**
 * Turns answers the page already has into blocks for the compare plane. Nothing here asks for anything, and no
 * place, fire or figure is typed: every number comes out of the answer it is given. The few words the blocks
 * carry are in `WORDS`, so a change of wording is one edit.
 */

export const WORDS = {
  coarseSaw: 'What the coarse satellite saw',
  estimate: "The model's estimate",
  sharpSaw: 'What the sharp satellite saw',
  coarseSize: 'about 1 km across (MODIS)',
  sharpSize: '375 m across (VIIRS)',
  estimateSize: '375 m across, from the coarse satellite alone',
  hidden: 'Hidden',
} as const;

/**
 * The players a picture shows: the five the page names, in the page's order, whatever else the backend can play.
 * The last reads the hidden detections; it is named for what it does and is no measure of the others, because a
 * player that also chooses when to look can stand above it.
 */
export const PLAYERS: readonly { key: string; name: string }[] = [
  { key: 'random', name: 'Chance' },
  { key: 'latest_modis', name: 'Follow the Coarse Satellite' },
  { key: 'least_sure', name: 'Look Where Unsure' },
  { key: 'learned', name: 'Learned Player' },
  { key: 'oracle', name: 'Sees the Answer' },
];

/** The visitor's own play of a round, the player of random looks, and the player that reads the hidden detections. */
export const YOU = 'you';
export const YOU_NAME = 'You';
export const CHANCE = 'random';
export const SEES_THE_ANSWER = 'oracle';
export const SEES_THE_ANSWER_LINE = 'Not a fair player: it reads the hidden detections, and looks at evenly spaced passes';

/** What a player's block says when its looks equal an earlier player's. */
export const twinLine = (twin: string): string => `The same looks as ${twin}`;

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Obj) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const str = (x: unknown): string | null => (typeof x === 'string' && x.length > 0 ? x : null);
const boxOf = (x: unknown): Box | null => {
  const a = arr(x);
  return a.length === 4 && a.every((v) => num(v) !== null) ? (a as Box) : null;
};

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * A gain or a score move as points of agreement, and a small count as a word: the guide's own formats, so that a
 * figure reads the same on a block as in the guide's line.
 */
export const points = (g: number): string => guidePoints(g) ?? '';
export const countWord = (n: number): string => guideCountWord(n) ?? String(n);

/** What random looks add over the rounds played: their mean and the least and the most, or null with none. */
export function chanceOf(draws: readonly number[] | undefined): { mean: number; least: number; most: number; rounds: number } | null {
  if (!draws || draws.length === 0) return null;
  return { mean: draws.reduce((a, b) => a + b, 0) / draws.length, least: Math.min(...draws), most: Math.max(...draws), rounds: draws.length };
}

/**
 * The ground of a run: its 512 elevation, its image, its box and its size on the ground. The image is the run's
 * terrain pack image when the run names one (its smaller copy first), and `satellite.jpg` only when it does not:
 * a recorded page holds the pack image where its source is free and never `satellite.jpg`.
 */
export function groundOfRun(run: unknown): CompareGround | null {
  const assets = obj(obj(run).assets);
  const region = obj(obj(run).region);
  const elevationUrl = str(assets.dem_hires_f32_url) ?? str(assets.dem_f32_url);
  const box = boxOf(region.bbox);
  const widthKm = num(region.width_km);
  const depthKm = num(region.depth_km);
  if (!elevationUrl || !box || !widthKm || !depthKm) return null;
  const pack = obj(assets.terrain_pack);
  const packImage = str(obj(pack.ortho_fallback).url) ?? str(obj(pack.ortho).url);
  return {
    elevationUrl,
    imageUrl: packImage ?? str(assets.satellite_url),
    imageCredit: packImage ? str(obj(pack.ortho).attribution) : null,
    box,
    widthKm,
    depthKm,
  };
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
  isDay: boolean | null;
  /** The frame's detections of the coarse instrument only, whatever else the run shows. */
  rows: DetectionRow[];
}

const isCoarse = (sensor: string): boolean => sensor.startsWith('MODIS');

function framesOf(run: unknown): Frame[] {
  const passes = obj(obj(run).observer_passes);
  const codes = obj(passes.sensor_codes);
  const out: Frame[] = [];
  for (const f of arr(passes.frames)) {
    const o = obj(f);
    const frame = num(o.frame);
    const time = str(o.timestamp_utc);
    if (frame === null || !time) continue;
    const sensor = str(o.sensor) ?? '';
    // A row names its sensor by a code; without one the frame's own sensor decides
    const coarse = arr(o.footprints).filter((row) => {
      const named = str(codes[String(arr(row)[7])]);
      return isCoarse(named ?? sensor);
    });
    // A frame the page has laid a revealed pass on is still a pass that was hidden
    out.push({
      frame,
      time,
      sensor,
      heldOut: o.held_out === true || o.revealed === true,
      isDay: typeof o.is_day === 'boolean' ? o.is_day : null,
      rows: detectionRows(coarse),
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
    // Every pass's MODIS footprints as a wash, in MODIS's colour
    marks: [{ kind: 'detections', instrument: 'modis', ink: 'instrument', draw: 'wash', rows }],
    label: { title: str(obj(fire).label) ?? id, lines },
    night: true,
  };
}

// ---------------------------------------------------------------------------------------------
// One fire, three ways

export interface ThreeWaysOptions {
  /** The held-out frame to compare at. Default the last one of the run. */
  frame?: number;
  /** The pass on show: the hidden pass at it, or the last hidden pass before it, is compared at. */
  at?: number;
  /** Cut all three blocks to the fire. Default true. */
  cut?: boolean;
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
  return `Ahead of both simple methods on ${ahead} of ${judged} scores, by plain comparison`;
}

/**
 * One fire at one hidden pass, three ways: what the coarse satellite saw on its last pass before it, the estimate
 * made from the coarse satellite alone at that time, and what the sharp satellite saw. `revealed` is the same run
 * after the reveal, or null before it; without it the third block is withheld and holds no row.
 *
 * The cut is taken from the coarse satellite's detections of the whole window and from nothing else, before and
 * after the reveal: the hidden satellite never shapes the block. A revealed detection outside the cut is not
 * drawn, and the block's label counts them, so nothing the estimate missed goes unsaid.
 */
export function threeWays(run: unknown, revealed: unknown, opts: ThreeWaysOptions = {}): ThreeWays | null {
  const ground = groundOfRun(run);
  const frames = framesOf(run);
  if (!ground || frames.length === 0) return null;
  const hiddenFrames = frames.filter((f) => f.heldOut);
  const at = opts.at;
  const hidden =
    (opts.frame !== undefined ? frames.find((f) => f.frame === opts.frame && f.heldOut) : undefined) ??
    (at !== undefined ? [...hiddenFrames].reverse().find((f) => f.frame <= at) : undefined) ??
    hiddenFrames[hiddenFrames.length - 1];
  if (!hidden) return null;

  // The last pass of the coarse satellite with a detection, before the hidden pass
  let coarse: Frame | null = null;
  for (const f of frames) if (f.frame < hidden.frame && !f.heldOut && f.rows.length > 0) coarse = f;

  // What the sharp satellite saw, only once revealed
  let sharp: { rows: DetectionRow[] } | null = null;
  if (revealed) {
    for (const o of arr(obj(obj(obj(revealed).blind_test).reveal).overpasses)) {
      const pass = obj(o);
      if (num(pass.frame) !== hidden.frame) continue;
      sharp = { rows: detectionRows(pass.footprints) };
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
  let estimate: { mark: CompareMark; declared: number | null; cells: number | null } | null = null;
  if (gridBox && nx && ny && steps && stepMinutes && firstTime && beliefUrl) {
    const t0 = Date.parse(firstTime);
    const step = Math.min(steps - 1, Math.max(0, Math.floor((Date.parse(hidden.time) - t0) / (stepMinutes * 60000))));
    const grid: EstimateGrid = { nx, ny, box: gridBox };
    // The cells the model declared for this hidden pass, fixed before the pass was opened: what the test sets
    // against the hidden detections. Framed only when the list is on the estimate's own grid.
    const declaredCells = obj(obj(run).declared_cells);
    const sameGrid = num(obj(declaredCells.grid).nx) === nx && num(obj(declaredCells.grid).ny) === ny;
    const look = sameGrid ? arr(declaredCells.looks).map(obj).find((l) => num(l.frame) === hidden.frame) : undefined;
    const frames = look
      ? arr(look.cells)
          .map(num)
          .filter((c): c is number => c !== null)
      : null;
    estimate = {
      mark: { kind: 'estimate', grid, source: { url: beliefUrl, step, steps }, ...(frames ? { frames } : {}) },
      declared: frames ? frames.length : null,
      cells: num(obj(arr(bf.per_step)[step]).expected_burning_cells),
    };
  }

  let cut: Box | null = null;
  if (opts.cut !== false) {
    const seen = frames.filter((f) => !f.heldOut).flatMap((f) => f.rows);
    cut = cutAround(seen, ground, CUT_MARGIN_KM);
  }
  const outside = cut && sharp ? sharp.rows.filter((r) => !inside(r, cut as Box)).length : 0;
  const cutGround: CompareGround = cut ? { ...ground, cut } : ground;
  // The image is darkened by day as by night: on this plane the marks lead
  const night = true;

  // Every time is the guide's: the day and the clock by the sun at the fire. No craft is named and nothing is in UTC.
  const lon = midLon(ground.box);
  const when = (iso: string): string[] => {
    const said = localDayTime(iso, lon);
    return said ? [said] : [];
  };
  const blocks: CompareBlock[] = [
    {
      id: 'coarse',
      ground: cutGround,
      night,
      marks: coarse ? [{ kind: 'detections', instrument: 'modis', rows: coarse.rows }] : [],
      label: {
        title: WORDS.coarseSaw,
        lines: coarse ? [`${count(coarse.rows.length, 'detection', 'detections')}, ${WORDS.coarseSize}`, ...when(coarse.time)] : [],
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
              estimate.declared !== null
                ? `${count(estimate.declared, 'white frame', 'white frames')}, ${WORDS.estimateSize}`
                : estimate.cells !== null
                  ? `${count(Math.round(estimate.cells), 'square', 'squares')} expected to burn, ${WORDS.estimateSize}`
                  : WORDS.estimateSize,
              ...when(hidden.time).map((t) => `For the pass of ${t}`),
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
          sharp ? `${count(sharp.rows.length, 'detection', 'detections')}, ${WORDS.sharpSize}` : WORDS.hidden,
          ...when(hidden.time),
          ...(outside > 0 ? [`${outside} of them outside this cut`] : []),
        ],
      },
    },
  ];
  return { blocks, timeUtc: hidden.time, scoreLine: revealed ? scoreLine(obj(obj(revealed).blind_test).verdict) : null };
}

// ---------------------------------------------------------------------------------------------
// The players of a round

/** One look a player took. */
export interface PlayLook {
  /** The index of the scheduled look. */
  decision: number;
  tile: number;
  timeUtc: string | null;
  platform: string | null;
  isDay: boolean | null;
  /** Why the player chose the tile, in the play's own words, where a play gives them. */
  why: string | null;
  /** Hidden detections the look handed over inside its tile. */
  found: DetectionRow[];
  /** How far the look moved the score, where the answer gives it look by look. */
  reward: number | null;
}

/** One player's play of a round, read down to what is drawn. */
export interface PlaySummary {
  id: string;
  name: string;
  looks: PlayLook[];
  gain: number | null;
  scoreStart: number | null;
  box: Box | null;
  tiles: [number, number] | null;
  /** Chance only: the gain of every round of random looks that was played, this one among them. */
  draws?: number[];
  /** The round's first and last pass, where the answer gives them. */
  window?: { from: string | null; to: string | null };
}

const isSummary = (x: unknown): x is PlaySummary => typeof obj(x).id === 'string' && Array.isArray(obj(x).looks);

function detectionOf(table: ReturnType<typeof rowsByColumns>, r: unknown[]): DetectionRow | null {
  const lon = num(r[table.at('lon')]);
  const lat = num(r[table.at('lat')]);
  const scanKm = num(r[table.at('scan_km')]);
  const trackKm = num(r[table.at('track_km')]);
  return lon !== null && lat !== null && scanKm !== null && trackKm !== null ? { lon, lat, scanKm, trackKm } : null;
}

/** A play as `POST /api/env/next_look/play` answers it (the answer, or its `play`). */
export function readPlay(answer: unknown): PlaySummary | null {
  const a = obj(answer);
  const p = Object.keys(obj(a.play)).length > 0 ? obj(a.play) : a;
  const id = str(obj(p.player).id);
  if (!id) return null;
  const episode = Object.keys(obj(p.episode)).length > 0 ? obj(p.episode) : obj(a.episode);
  const tiles = arr(episode.tiles);
  const looks: PlayLook[] = [];
  for (const raw of arr(p.steps)) {
    const step = obj(raw);
    const tile = num(step.chosen_tile);
    const decision = num(step.decision);
    if (step.spent !== true || tile === null || tile < 0 || decision === null) continue;
    const table = rowsByColumns(step.revealed);
    const look = obj(step.look);
    looks.push({
      decision,
      tile,
      timeUtc: str(look.time_utc),
      platform: str(look.platform),
      isDay: typeof look.is_day === 'boolean' ? look.is_day : null,
      why: str(step.why),
      found: table.rows.map((r) => detectionOf(table, r)).filter((d): d is DetectionRow => d !== null),
      reward: num(step.reward),
    });
  }
  const rowsN = num(tiles[0]);
  const colsN = num(tiles[1]);
  const whole = obj(a.episode);
  return {
    window: { from: str(episode.first_overpass_utc) ?? str(whole.first_overpass_utc), to: str(episode.last_overpass_utc) ?? str(whole.last_overpass_utc) },
    id,
    name: PLAYERS.find((x) => x.key === id)?.name ?? str(obj(p.player).label) ?? id,
    looks,
    gain: num(p.gain),
    scoreStart: num(p.score_start),
    box: boxOf(episode.box),
    tiles: rowsN && colsN ? [rowsN, colsN] : null,
  };
}

export interface RoundPlaysOptions {
  /** Leave the visitor's own looks out. Default: they come first. */
  you?: boolean;
  /** Which of Chance's rounds is the one drawn. Default the first. */
  draw?: number;
  /** Leave out the player that reads the hidden detections. Default: it is there. */
  seesTheAnswer?: boolean;
}

/**
 * Every play of a finished round, from the round's start and its end: the visitor's own looks first, then the
 * page's players in the page's order. A look holds only the hidden detections the round's end lists for that look
 * and that tile. Chance carries the gain of every random round played; the looks drawn are one of them.
 */
export function roundPlays(start: unknown, end: unknown, opts: RoundPlaysOptions = {}): PlaySummary[] {
  const episode = obj(obj(start).episode);
  const box = boxOf(episode.box);
  const rowsN = num(arr(episode.tiles)[0]);
  const colsN = num(arr(episode.tiles)[1]);
  const e = obj(end);
  const reference = obj(e.reference);
  if (!box || !rowsN || !colsN) return [];
  const passes = arr(obj(start).looks).map(obj);
  // The reveal comes in one of two shapes: the route's own table (a row per detection, with its look and its square),
  // or the page's round, which groups the detections by pass, each pass with its look, and keeps no square per
  // detection (`reveal.overpasses[].look` and `footprints`). In the second a detection's square is where it lies.
  const reveal = rowsByColumns(e.reveal);
  const byPass = arr(obj(e.reveal).overpasses).map(obj);
  const squareOf = (lon: number, lat: number): number => {
    const c = Math.min(colsN - 1, Math.max(0, Math.floor(((lon - box[0]) / (box[2] - box[0])) * colsN)));
    const r = Math.min(rowsN - 1, Math.max(0, Math.floor(((box[3] - lat) / (box[3] - box[1])) * rowsN)));
    return r * colsN + c;
  };
  const lookOf = (decision: number, tile: number): PlayLook => {
    const pass = passes[decision] ?? {};
    const found: DetectionRow[] = [];
    for (const r of reveal.rows) {
      if (num(r[reveal.at('tile')]) !== tile || num(r[reveal.at('look')]) !== decision) continue;
      const d = detectionOf(reveal, r);
      if (d) found.push(d);
    }
    for (const o of byPass) {
      if (num(o.look) !== decision) continue;
      for (const fp of arr(o.footprints)) {
        const [lon, lat, scanKm, trackKm] = arr(fp).map(num);
        if (lon === null || lat === null || scanKm === null || trackKm === null || squareOf(lon, lat) !== tile) continue;
        found.push({ lon, lat, scanKm, trackKm });
      }
    }
    return { decision, tile, timeUtc: str(pass.time_utc), platform: str(pass.platform), isDay: typeof pass.is_day === 'boolean' ? pass.is_day : null, why: null, found, reward: null };
  };
  const fromActions = (actions: unknown[]): PlayLook[] =>
    actions.flatMap((a, decision) => {
      const tile = num(a);
      return tile !== null && tile >= 0 ? [lookOf(decision, tile)] : [];
    });
  const window = { from: str(episode.first_overpass_utc), to: str(episode.last_overpass_utc) };
  const base = { scoreStart: num(e.score_start) ?? num(reference.score_start) ?? num(obj(start).score_start), box, tiles: [rowsN, colsN] as [number, number], window };
  const out: PlaySummary[] = [];
  // The visitor's looks: the route's pairs of pass and square, or the page's round's `player.taken`
  const player = obj(e.player);
  const pairs: Array<[number | null, number | null]> = Array.isArray(e.looks_taken)
    ? arr(e.looks_taken).map((pair) => [num(arr(pair)[0]), num(arr(pair)[1])])
    : Array.isArray(player.taken)
      ? arr(player.taken).map((t) => [num(obj(t).decision), num(obj(t).tile)])
      : [];
  if (opts.you !== false && (Array.isArray(e.looks_taken) || Array.isArray(player.taken))) {
    const mine = pairs.flatMap(([decision, tile]) => (decision !== null && tile !== null && tile >= 0 ? [lookOf(decision, tile)] : []));
    out.push({ id: YOU, name: YOU_NAME, looks: mine, gain: num(e.gain) ?? num(player.gain), ...base });
  }
  for (const player of PLAYERS) {
    if (player.key === SEES_THE_ANSWER && opts.seesTheAnswer === false) continue;
    const ref = obj(reference[player.key]);
    if (player.key === CHANCE) {
      const draws = arr(ref.gains)
        .map(num)
        .filter((g): g is number => g !== null);
      const draw = opts.draw ?? 0;
      const actions = arr(arr(ref.actions)[draw]);
      if (actions.length > 0) out.push({ id: player.key, name: player.name, looks: fromActions(actions), gain: draws[draw] ?? null, draws, ...base });
    } else {
      const actions = arr(ref.actions);
      if (actions.length > 0) out.push({ id: player.key, name: player.name, looks: fromActions(actions), gain: num(ref.gain), ...base });
    }
  }
  return out;
}

/** The coarse satellite's detections a round's start shows: what every player of the round could see. */
export function roundSeen(start: unknown): DetectionRow[] {
  const modis = rowsByColumns(obj(obj(start).observation).modis);
  return modis.rows.map((r) => detectionOf(modis, r)).filter((d): d is DetectionRow => d !== null);
}

/**
 * The coarse satellite's detections of a run's passes inside a round's window: what every player of that round could
 * see, from the run on the land when the round's own start keeps no rows of its own.
 */
export function seenInWindow(run: unknown, window: { from: string | null; to: string | null } | undefined): DetectionRow[] {
  const from = window?.from ? Date.parse(window.from) : -Infinity;
  const to = window?.to ? Date.parse(window.to) : Infinity;
  return framesOf(run)
    .filter((f) => !f.heldOut && Date.parse(f.time) >= from - 60000 && Date.parse(f.time) <= to + 60000)
    .flatMap((f) => f.rows);
}

export interface PlayBlocksOptions {
  /** The coarse satellite's detections every player could see, drawn as quiet outlines. */
  seen?: DetectionRow[];
  /** Show only the first looks each player took, for a replay. Default all of them. */
  looks?: number;
  /** Draw what the looks found. Default true; false draws where each player looked and nothing of the hidden satellite. */
  found?: boolean;
}

/**
 * One block per play, in the order given: a play as the play route answers it, or one read from a round's end.
 * Every block carries the tile lines with the looked tiles lit, a pin per tile with the order of the looks that
 * went there, quiet outlines for what every player could see, and, unless `found` is false, filled marks only for
 * what that player's own looks handed over. With `looks` the blocks stop after that many looks, so a play can be
 * watched look by look.
 */
export function playBlocks(ground: CompareGround | null, plays: readonly unknown[], opts: PlayBlocksOptions = {}): CompareBlock[] {
  if (!ground) return [];
  const blocks: CompareBlock[] = [];
  const first = new Map<string, string>();
  for (const answer of plays) {
    const play = isSummary(answer) ? answer : readPlay(answer);
    if (!play || !play.box || !play.tiles) continue;
    const box = play.box;
    // The round's box must be the ground's: a round on another box needs that box's terrain
    if (box.some((v, i) => Math.abs(v - ground.box[i]) > 1e-6)) continue;
    const [rowsN, colsN] = play.tiles;
    const all = opts.looks === undefined || opts.looks >= play.looks.length;
    const shown = all ? play.looks : play.looks.slice(0, Math.max(0, opts.looks ?? 0));
    const found = opts.found === false ? [] : shown.flatMap((l) => l.found);
    const order = new Map<number, number[]>();
    shown.forEach((l, i) => order.set(l.tile, [...(order.get(l.tile) ?? []), i + 1]));
    const pins: ComparePin[] = [...order.entries()].map(([tile, looks]) => ({
      id: `tile-${tile}`,
      // The north-west corner of the tile, a little inside it, so the mark does not cover what was found
      lon: box[0] + (((tile % colsN) + 0.16) / colsN) * (box[2] - box[0]),
      lat: box[3] - ((Math.floor(tile / colsN) + 0.16) / rowsN) * (box[3] - box[1]),
      text: looks.join(' '),
    }));
    const lines = [opts.found === false ? count(shown.length, 'look', 'looks') : `${count(found.length, 'detection', 'detections')} found in ${count(shown.length, 'look', 'looks')}`];
    const chance = chanceOf(play.draws);
    if (all && chance && chance.rounds > 1) {
      lines.push(`${points(chance.mean)} points, the mean of ${countWord(chance.rounds)} rounds of random looks, from ${points(chance.least)} to ${points(chance.most)}`);
      if (play.gain !== null) lines.push(`Drawn here: one of the ${countWord(chance.rounds)}, ${points(play.gain)} points`);
    } else if (all && play.gain !== null) lines.push(`${points(play.gain)} points`);
    const looksKey = play.looks.map((l) => `${l.decision}:${l.tile}`).join(',');
    const twin = all ? first.get(looksKey) : undefined;
    if (play.id === SEES_THE_ANSWER) lines.push(SEES_THE_ANSWER_LINE);
    else if (twin) lines.push(twinLine(twin));
    if (!first.has(looksKey)) first.set(looksKey, play.name);
    const marks: CompareMark[] = [{ kind: 'tiles', rows: rowsN, cols: colsN, looked: shown.map((l) => l.tile), veil: true }];
    if (opts.seen && opts.seen.length > 0) marks.push({ kind: 'detections', instrument: 'modis', rows: opts.seen, weight: 'quiet' });
    if (opts.found !== false) marks.push({ kind: 'detections', instrument: 'viirs', rows: found });
    blocks.push({ id: play.id, ground, night: true, marks, pins, label: { title: play.name, lines } });
  }
  return blocks;
}

/** One block per player of a finished round, the visitor's own looks first, from the round's start and its end. */
export function roundBlocks(ground: CompareGround | null, start: unknown, end: unknown, opts: RoundPlaysOptions & Pick<PlayBlocksOptions, 'looks' | 'found'> = {}): CompareBlock[] {
  return playBlocks(ground, roundPlays(start, end, opts), { seen: roundSeen(start), looks: opts.looks, found: opts.found });
}

/** The MODIS detections of a run's passes that were not held out: what every player of its round could see. */
export function seenRows(run: unknown): DetectionRow[] {
  return framesOf(run)
    .filter((f) => !f.heldOut)
    .flatMap((f) => f.rows);
}

/** For each play whose looks equal an earlier play's, the name of that earlier player. */
export function sameLooks(plays: readonly PlaySummary[]): Map<string, string> {
  const first = new Map<string, string>();
  const out = new Map<string, string>();
  for (const play of plays) {
    const key = play.looks.map((l) => `${l.decision}:${l.tile}`).join(',');
    const twin = first.get(key);
    if (twin) out.set(play.id, twin);
    else first.set(key, play.name);
  }
  return out;
}

/** The scale of a row of gain bars: the largest gain among them, or null when none is above nothing. */
export function gainScale(gains: readonly (number | null)[]): number | null {
  const top = Math.max(0, ...gains.filter((g): g is number => g !== null));
  return top > 0 ? top : null;
}
