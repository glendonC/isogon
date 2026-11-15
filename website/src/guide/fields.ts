import type { WorkspaceBase } from '../app/store';
import type { Conditions, Fields } from './script';
import { count, countNo, countNone, countWord, lengthDigits, listAnd, localDayRange, localDayTime, midLon, ordinal, percent, times, year } from './formats';
import { SCRIPT } from './script';

/**
 * The values the guide's lines name, read from the backend's answers the workspace already holds, written in the
 * script's formats (`formats.ts`). A value the answers do not hold is null, and a line that names it is not said.
 * Only the fields of the steps built so far are here.
 */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

function frames(run: unknown): Obj[] {
  const f = obj(obj(run)?.observer_passes)?.frames;
  return Array.isArray(f) ? f.map((x) => obj(x) ?? {}) : [];
}

export function guideFields(ws: WorkspaceBase): { fields: Fields; conds: Conditions } {
  const run = ws.run.active as unknown;
  const r = obj(run);
  const win = obj(r?.window);
  const lon = midLon(ws.run.active?.region.bbox);
  const fs = frames(run);
  const pass = Math.min(ws.time.pass, Math.max(0, fs.length - 1));
  const f = fs[pass] ?? null;
  const sensor = typeof f?.sensor === 'string' ? f.sensor : '';
  const cellKm = num(obj(obj(r?.belief_frames)?.grid)?.cell_km);
  const score = ws.test.score;
  const verdict = score?.verdict ?? [];
  // Which estimate answered a held-out run's hidden passes (`held_out_passes_answered_by`): the estimate in use, or a
  // challenger in its place when the backend's switch says so; its words are the run's own.
  const answered = obj(r?.held_out_passes_answered_by);
  const byChallenger = answered ? typeof answered.method === 'string' && answered.method !== 'reconstruction' : null;
  const headline = byChallenger && typeof answered?.method === 'string' ? answered.method : 'reconstruction';
  // The simple methods: never the answering estimate, the estimate that was in use, a challenger, or the sharp satellite.
  const simpleIds = score
    ? score.methods.map((m) => m.id).filter((id) => id !== headline && id !== 'reconstruction' && !id.startsWith('challenger') && !id.includes('viirs'))
    : [];
  // With a challenger answering, a score is won when it beats both simple methods (the estimate that was in use is
  // scored beside them and is not one of them); otherwise the verdict's own count.
  const beatsSimple = (v: (typeof verdict)[number]) => {
    const mine = v.values[headline];
    if (typeof mine !== 'number') return false;
    return simpleIds.every((id) => typeof v.values[id] !== 'number' || (v.better === 'lower' ? mine < v.values[id] : mine > v.values[id]));
  };
  const ahead = score ? (byChallenger ? verdict.filter(beatsSimple).length : verdict.filter((v) => v.ahead).length) : null;
  const baselines = score ? simpleIds.length : null;
  const ev = ws.model.evidence;
  const testFires = ev?.test_fires.fires ?? [];
  const testScoresN = ev ? ev.test_fires.scores.length : null;
  const thisTest = testFires.find((t) => t.region_id === ws.run.active?.region.id) ?? null;
  const hiddenFromFrames = fs.filter((x) => x.held_out === true).length;
  const allSharp = num(obj(r?.blind_test)?.hidden_rows_in_test_box) ?? ws.model.revealedTotal?.detections ?? null;
  // Within one square (the reveal's csi_one_cell_tolerance): the estimate's agreement and the coarse detections' as they are.
  const oneSquare = obj(obj(obj(obj(r?.blind_test)?.verdict)?.scores)?.csi_one_cell_tolerance);
  const cal = ws.calendar.state.regionId === ws.place.regionId ? ws.calendar.state.cal : null;
  // The coarse satellite's last pass with a detection before the pass on show.
  let before: Obj | null = null;
  for (let k = pass - 1; k >= 0 && !before; k -= 1) {
    const x = fs[k];
    if (typeof x?.sensor === 'string' && !x.sensor.startsWith('VIIRS') && (num(x.detections_in_box) ?? 0) > 0) before = x;
  }
  // The fresh test A (GET /api/evidence, fresh_test.test_a): null until its look is taken.
  const fresh = obj(obj(ev as unknown)?.fresh_test);
  const testA = fresh ? obj(fresh.test_a) : null;
  const aAll = obj(testA?.all);
  const aClasses = obj(aAll?.classes);
  const aByContinent = obj(testA?.by_continent);
  const aInterval = obj(aAll?.interval);
  const aHeld = num(aInterval?.held);
  const aStated = num(aInterval?.stated_level);
  const scoreNames = (which: string) =>
    aClasses ? listAnd(Object.entries(aClasses).filter(([, v]) => v === which).map(([k]) => SCRIPT.score_names?.[k] ?? k)) : null;
  // Test B, the one look on fires nothing had touched (fresh_test.test_b), once it is on record.
  const testB = fresh ? obj(fresh.test_b) : null;
  const bAll = obj(testB?.all);
  const bClasses = obj(bAll?.classes);
  const bByContinent = obj(testB?.by_continent);
  // The answering challenger's own figures on test B, beside the headline estimate's (`beside_the_headline`).
  const bChal = byChallenger ? obj(obj(obj(testB?.beside_the_headline)?.[headline])?.against_the_baselines) : null;
  const bChalClasses = obj(bChal?.classes);
  const continentFires = (name: string) => num(obj(aByContinent?.[name])?.episodes) ?? (aByContinent ? 0 : null);
  // The squares the model says are burning at the pass on show (the frames on the terrain).
  const looks = obj(r?.declared_cells)?.looks;
  const declared = Array.isArray(looks) ? looks.map((x) => obj(x)).find((x) => x && num(x.frame) === (num(f?.frame) ?? pass)) ?? null : null;

  const fields: Fields = {
    place: ws.place.title || null,
    // The days only of a run of the place on show: while another place's run is on its way, no days are said.
    run_days: ws.run.active?.region.id === ws.place.regionId ? localDayRange(str(win?.first_overpass_utc), str(win?.last_overpass_utc), lon) : null,
    sharp_square_m: cellKm === null ? null : String(Math.round(cellKm * 1000)),
    coarse_passes: count(num(win?.modis_overpasses)),
    hidden_passes: count(num(win?.hidden_passes) ?? (hiddenFromFrames || null)),
    coarse_detections: count(num(win?.modis_pixels_in_box)),
    pass_number: f ? ordinal(num(f.frame) ?? pass) : null,
    passes_total: count(num(win?.overpasses) ?? (fs.length || null)),
    pass_when: localDayTime(str(f?.timestamp_utc), lon),
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
    sharp_since: year(cal?.sharpSince),
    record_first_year: cal ? String(cal.firstYear) : null,
    sharp_to_coarse: times(cal?.overlap?.ratio ?? null),
    coarse_before_when: localDayTime(str(before?.timestamp_utc), lon),
    coarse_before_detections: before ? count(num(before.detections_in_box)) : null,
    estimate_squares: Array.isArray(declared?.cells) ? lengthDigits(declared!.cells as unknown[]) : null,
    test_a_fires_n: count(num(testA?.episodes_scored)),
    test_a_continents_n: aByContinent ? countWord(Object.values(aByContinent).filter((v) => (num(obj(v)?.episodes) ?? 0) > 0).length) : null,
    test_a_ahead: count(num(aAll?.ahead)),
    test_a_behind: countNone(num(aAll?.behind)),
    test_a_level: count(num(aAll?.tied)),
    one_square_estimate: percent(num(oneSquare?.reconstruction)),
    one_square_coarse: percent(num(oneSquare?.painted_modis)),
    test_b_fires_n: count(num(testB?.episodes_scored)),
    test_b_continents_n: bByContinent ? countWord(Object.values(bByContinent).filter((v) => (num(obj(v)?.episodes) ?? 0) > 0).length) : null,
    test_b_ahead: count(num(bAll?.ahead)),
    test_b_behind: countNone(num(bAll?.behind)),
    test_b_level: count(num(bAll?.tied)),
    test_b_challenger_ahead: count(num(bChal?.ahead)),
    test_b_challenger_level: count(num(bChal?.tied)),
    test_b_challenger_behind: countNone(num(bChal?.behind)),
    test_a_ahead_names: scoreNames('ahead') || null,
    test_a_behind_names: scoreNames('behind') || null,
    test_a_interval_held: percent(aHeld),
    test_a_interval_stated: percent(aStated),
    test_a_europe_n: countNo(continentFires('Europe')),
    test_a_oceania_n: countWord(continentFires('Oceania')),
  };
  fields.answered_by = byChallenger && typeof answered?.words === 'string' ? answered.words : null;
  const conds: Conditions = {
    answered_by_challenger: byChallenger,
    model_is_experimental: ws.run.model ? ws.run.model.status === 'experimental' : null,
    pass_is_sharp: f ? sensor.startsWith('VIIRS') : null,
    not_always_ahead: ev && testScoresN !== null && testFires.length > 0 ? Math.min(...testFires.map((t) => t.new.ahead_of_both_on)) < testScoresN : null,
    // Test A taken or not, and how it came out; all false where the route answered without it.
    test_a_taken: ev ? testA !== null : null,
    test_b_taken: ev ? testB !== null && bAll !== null : null,
    test_b_strict_behind: ev ? testB !== null && bClasses?.csi_strict_375m === 'behind' : null,
    test_b_challenger_strict_behind: bChal ? bChalClasses?.csi_strict_375m === 'behind' : null,
    test_a_not_taken: ev ? testA === null : null,
    test_a_strict_behind: ev ? testA !== null && aClasses?.csi_strict_375m === 'behind' : null,
    test_a_strict_not_behind: ev ? testA !== null && aClasses !== null && aClasses.csi_strict_375m !== 'behind' : null,
    test_a_interval_short: ev ? testA !== null && aHeld !== null && aStated !== null && aHeld < aStated : null,
  };
  return { fields, conds };
}
