import type { WorkspaceBase } from '../app/store';
import type { Conditions, Fields } from './script';

/**
 * The values the guide's lines name, read from the backend's answers the workspace already holds, written in the
 * script's formats (`script.json`, "formats"). A value the answers do not hold is null, and a line that names it is not
 * said. Only the fields of the steps built so far are here (Estimate and Test).
 */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** count: a whole number with a comma for thousands. */
export const count = (n: number | null) => (n === null ? null : Math.round(n).toLocaleString('en-US'));
/** count_word: zero to twelve as a word, larger numbers as digits. */
export const countWord = (n: number | null) => (n === null ? null : n >= 0 && n <= 12 ? WORDS[Math.round(n)] : count(n));
/** list_and: the items with commas and a final and. */
export const listAnd = (xs: Array<string | number>) =>
  xs.length === 0 ? null : xs.length === 1 ? String(xs[0]) : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
/** local_clock: hours and minutes from a decimal hour of local time, such as 1:10. */
export const localClock = (h: number | null) => {
  if (h === null) return null;
  const m = Math.round((((h % 24) + 24) % 24) * 60);
  return `${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, '0')}`;
};
/** day_or_night: true is written by day, false at night. */
export const dayOrNight = (d: unknown) => (d === true ? 'by day' : d === false ? 'at night' : null);

function frames(run: unknown): Obj[] {
  const f = obj(obj(run)?.observer_passes)?.frames;
  return Array.isArray(f) ? f.map((x) => obj(x) ?? {}) : [];
}

export function guideFields(ws: WorkspaceBase): { fields: Fields; conds: Conditions } {
  const run = ws.run.active as unknown;
  const r = obj(run);
  const win = obj(r?.window);
  const fs = frames(run);
  const pass = Math.min(ws.time.pass, Math.max(0, fs.length - 1));
  const f = fs[pass] ?? null;
  const sensor = typeof f?.sensor === 'string' ? f.sensor : '';
  const cellKm = num(obj(obj(r?.belief_frames)?.grid)?.cell_km);
  const score = ws.test.score;
  const verdict = score?.verdict ?? [];
  const ahead = score ? verdict.filter((v) => v.ahead).length : null;
  const baselines = score ? score.methods.filter((m) => m.id !== 'reconstruction' && !m.id.includes('viirs')).length : null;
  const ev = ws.model.evidence;
  const testFires = ev?.test_fires.fires ?? [];
  const testScoresN = ev ? ev.test_fires.scores.length : null;
  const thisTest = testFires.find((t) => t.region_id === ws.run.active?.region.id) ?? null;
  const hiddenFromFrames = fs.filter((x) => x.held_out === true).length;
  const allSharp = num(obj(r?.blind_test)?.hidden_rows_in_test_box) ?? ws.model.revealedTotal?.detections ?? null;

  const fields: Fields = {
    place: ws.place.title || null,
    run_days: ws.run.span,
    sharp_square_m: cellKm === null ? null : String(Math.round(cellKm * 1000)),
    coarse_passes: count(num(win?.modis_overpasses)),
    hidden_passes: count(num(win?.hidden_passes) ?? (hiddenFromFrames || null)),
    coarse_detections: count(num(win?.modis_pixels_in_box)),
    pass_number: f ? String(pass + 1) : null,
    passes_total: count(num(win?.overpasses) ?? (fs.length || null)),
    pass_local_time: localClock(num(f?.local_solar_time_hr)),
    pass_day_night: dayOrNight(f?.is_day),
    pass_detections: f && f.held_out !== true ? count(num(f.detections_in_box)) : null,
    ahead_on: count(ahead),
    scores_n: score ? count(verdict.length) : null,
    simple_methods_n: countWord(baselines),
    sharp_detections_pass: ws.model.revealedHere === null ? null : count(ws.model.revealedHere),
    sharp_detections_all: count(allSharp),
    test_fires_n: ev ? countWord(testFires.length) : null,
    test_fire_scores: ev ? listAnd(testFires.map((t) => t.new.ahead_of_both_on)) : null,
    test_scores_n: count(testScoresN),
    this_test_fire_ahead: thisTest ? count(thisTest.new.ahead_of_both_on) : null,
    sharp_since: null,
  };
  const conds: Conditions = {
    model_is_experimental: ws.run.model ? ws.run.model.status === 'experimental' : null,
    pass_is_sharp: f ? sensor.startsWith('VIIRS') : null,
    not_always_ahead: ev && testScoresN !== null && testFires.length > 0 ? Math.min(...testFires.map((t) => t.new.ahead_of_both_on)) < testScoresN : null,
  };
  return { fields, conds };
}
