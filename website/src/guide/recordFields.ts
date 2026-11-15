import type { WorkspaceBase } from '../app/store';
import type { RecordView } from '../beats/calendar/recordView';
import type { Conditions, Fields } from './script';
import { count, countWord, listAnd, monthName, rate, ratioWhole, times } from './formats';

/**
 * The values the Record's lines name, from what the Record publishes (`beats/calendar/recordView.ts`, every figure one
 * the record's answer served) and the registry, in the script's formats. A value not served is null, and a line that
 * names it is not said.
 */
export function recordFields(ws: WorkspaceBase, rv: RecordView): { fields: Fields; conds: Conditions } {
  const m = rv.marked;
  const p = rv.picked;
  const ev = ws.model.evidence;
  const fields: Fields = {
    place: rv.place || ws.place.title || null,
    record_first_year: rv.firstYear === null ? null : String(rv.firstYear),
    record_last_year: rv.lastYear === null ? null : String(rv.lastYear),
    sharp_to_coarse: times(rv.correction.ratio),
    sharp_since: rv.correction.sharpFromYear === null ? null : String(rv.correction.sharpFromYear),
    default_fire_month: m?.words ?? null,
    fire_times_usual: m && m.usual !== null && m.usual > 0 ? ratioWhole(m.timesUsual) : null,
    fire_month_name: monthName(m?.ym),
    fire_month_rate: rate(m?.rate ?? null),
    fire_month_usual: rate(m?.usual ?? null),
    picked_month: p?.words ?? null,
    month_rank: count(p?.rank ?? null),
    month_years: count(p?.rankOf ?? null),
    month_rate: rate(p?.rate ?? null),
    month_median: rate(p?.usual ?? null),
    test_fires_n: ev ? countWord(ev.test_fires.fires.length) : null,
    places_with_fires: listAnd(ws.places.places.map((x) => x.name)),
  };
  const conds: Conditions = {
    fire_month_stands_out: m && m.usual !== null && m.timesUsual !== null ? m.usual > 0 && m.timesUsual >= 2 : null,
    // The Record's method (harmonization_method.id): replaced when it is no longer the first ratio of the overlap.
    method_replaced: ws.calendar.state.cal ? (ws.calendar.state.cal.method ?? 'overlap_ratio_v1') !== 'overlap_ratio_v1' : null,
    this_month_is_counted: rv.now.state === 'ready' ? rv.now.rate !== null && rv.now.why === null : rv.now.state === 'unavailable' ? false : null,
  };
  return { fields, conds };
}

/** Which of the script's Record states is on show; null while the Record is closed (Choose a Place over it). */
export function recordStateId(ws: WorkspaceBase, rv: RecordView): string | null {
  if (rv.state === 'closed') return null;
  if (rv.state === 'loading') return 'loading';
  if (rv.state === 'failed' || rv.state === 'not recorded') return 'failed';
  if (ws.calendar.place.kind !== 'region') return 'own_area';
  if (rv.correction.asCounted) return 'as_counted';
  if (rv.now.state !== 'idle') return 'this_month';
  const p = rv.picked;
  if (!p) return 'ready';
  const regionId = ws.calendar.place.regionId;
  const test = ws.places.places.find((x) => x.id === regionId)?.featured_fires.some((f) => f.blind_test_fire && f.months.includes(p.ym));
  if (test) return 'recorded_test_fire';
  const sharp = rv.correction.sharpFromYear;
  if (sharp !== null && Number(p.ym.slice(0, 4)) < sharp) return 'no_sharp_satellite';
  if (!p.opens) return 'no_fire_to_rebuild';
  return 'month_picked';
}
