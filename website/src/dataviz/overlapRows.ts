/**
 * Overlap with VIIRS fire pixels on a fresh test, from `GET /api/evidence`: for MODIS alone, the model in use and
 * the new model, the share of pixels both mark as fire out of pixels either marks as fire, exact and within one
 * pixel. Pure.
 */

export interface OverlapRow {
  key: 'modis' | 'in_use' | 'new';
  label: string;
  exact: number;
  within: number;
}

export interface Overlap {
  rows: OverlapRow[];
  fires: number | null;
  looks: number | null;
}

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj | null => (x && typeof x === 'object' ? (x as Obj) : null);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export const OVERLAP_LABELS = { modis: 'MODIS alone', in_use: 'First model', new: 'New model' };

/**
 * The three rows, in the order the figure draws them, or null when the route does not hold every value. A model's
 * value is `value` (the route); `reconstruction` is read too, the key the record file uses.
 */
export function overlapFromEvidence(
  evidence: unknown,
  test: 'test_a' | 'test_b' = 'test_b',
  newModel = 'challenger_blend',
  labels = OVERLAP_LABELS,
): Overlap | null {
  const t = obj(obj(obj(evidence)?.fresh_test)?.[test]);
  const all = obj(t?.all);
  const inUse = obj(all?.scores);
  const fresh = obj(obj(obj(obj(t?.beside_the_headline)?.[newModel])?.against_the_baselines)?.scores);
  const get = (scores: Obj | null, id: string, key: string) => {
    const s = obj(scores?.[id]);
    return key === 'model' ? num(s?.value) ?? num(s?.reconstruction) : num(s?.[key]);
  };
  const exactId = 'csi_strict_375m';
  const withinId = 'csi_one_cell_tolerance';
  const values = [
    ['modis', get(inUse, exactId, 'painted_modis'), get(inUse, withinId, 'painted_modis')],
    ['in_use', get(inUse, exactId, 'model'), get(inUse, withinId, 'model')],
    ['new', get(fresh, exactId, 'model'), get(fresh, withinId, 'model')],
  ] as const;
  if (values.some(([, a, b]) => a === null || b === null)) return null;
  return {
    rows: values.map(([key, exact, within]) => ({ key, label: labels[key], exact: exact as number, within: within as number })),
    fires: num(t?.episodes_scored),
    looks: num(all?.scored_looks),
  };
}

/** The axis: 0 to 40 percent, or the next ten above the largest value if one goes past 40. */
export function overlapAxisMax(rows: readonly OverlapRow[]): number {
  const top = Math.max(0, ...rows.flatMap((r) => [r.exact, r.within])) * 100;
  return Math.max(40, Math.ceil(top / 10) * 10);
}

export interface OverlapLayout {
  labelW: number;
  numW: number;
  axisW: number;
  /** Room for the pointer's readout beside the chart; 0 when narrow, and the readout goes above. */
  readoutW: number;
  narrow: boolean;
  /** The width the chart takes: the width given, unless that is below the smallest that reads. */
  width: number;
}

/** The chart's columns at a given width: the plot never narrower than 160 px, the readout above under 600 px. */
export function overlapLayout(width: number): OverlapLayout {
  const w = Math.max(320, Math.round(Number.isFinite(width) ? width : 560));
  const narrow = w < 600;
  const labelW = Math.min(150, Math.max(96, Math.round(w * 0.26)));
  const numW = 60;
  const readoutW = narrow ? 0 : Math.round(Math.min(290, w * 0.3));
  const axisW = Math.max(160, w - labelW - numW - readoutW);
  return { labelW, numW, axisW, readoutW, narrow, width: Math.max(w, labelW + axisW + numW + readoutW) };
}
