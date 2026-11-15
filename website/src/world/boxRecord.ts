/**
 * A drawn box's Record, computed in the browser from the public fire cube, in the shape and with the figures of the
 * cube route (`GET /api/cube/record?box=`): the backend's `_calendar_payload` (`backend/firms/real_calendar.py`) from
 * the box's monthly fire rows, and, where the Record serves it, the harmonization's call (`backend/model/harmonize.py`,
 * `record_series`) with its fitted tables. Every step follows the Python line by line, with its arithmetic
 * (`pyMath.ts`), so the page shows what the backend would answer for the same box.
 *
 * What the public file does not hold is not made up: a platform's day and night split, the static, offshore and
 * volcano rows, fire radiative power and the countries of the box are left out of the answer (null or absent), and
 * the months the closed rule closes for the box read as no data.
 */

import { npMean, npMedian, npPercentile, pairwiseSum, pyRound, roundOrNull } from './pyMath.ts';
import type { PublicCube, PublicManifest } from './publicCube.ts';

type Box4 = [number, number, number, number];
type Json = Record<string, unknown>;

const PLATFORMS = ['Terra', 'Aqua', 'Suomi NPP', 'NOAA-20', 'NOAA-21'] as const;
const OUTAGE_MIN_OTHER_ROWS = 100;
const BUSY_MONTH_MODIS_ROWS = 10;
const BOX_MAX_SPAN_DEG = 20;
const BOX_MIN_SPAN_DEG = 0.05;
const METHOD_ID = 'overlap_ratio_v1';
const DRIFT_MARKERS = [
  { year_month: '2020-02', label: 'Terra begins drifting to earlier overpass times', source: 'https://terra.nasa.gov/about' },
  {
    year_month: '2021-12',
    label: "Aqua's last drag makeup maneuver; free drift to later overpass times",
    source: 'https://science.nasa.gov/mission/aqua/',
  },
];

/** One platform's month in a Record: null when the platform delivers no data that month. */
export interface RawCount {
  day: number | null;
  night: number | null;
  total: number;
  outage_days: number | null;
}

export interface RecordRow {
  index: number;
  year: number;
  month: number;
  year_month: string;
  modis_raw_rate: number | null;
  viirs_raw_rate: number | null;
  harmonized_mean: number | null;
  harmonized_p10: number | null;
  harmonized_p90: number | null;
  coverage_fraction: null;
  state_label: string;
  sensor_regime: string;
  modis_orbital_drift_factor: null;
  ratio_used: string | null;
  raw_counts: Record<string, RawCount | null>;
  month_median?: number | null;
  anomaly?: number | null;
  anomaly_ratio?: number | null;
  month_rank?: number | null;
  month_years?: number;
}

// ----- The box and its area

/** The route's check of a box text: 'w,s,e,n', each way 0.05 to 20 degrees, rounded to four places. */
export function parseBox(text: string): Box4 {
  const parts = String(text).split(',').map((v) => (v.trim() === '' ? NaN : Number(v)));
  if (parts.length !== 4 || !parts.every(Number.isFinite)) throw new RangeError('box must be four finite numbers: west,south,east,north in degrees');
  const [w, s, e, n] = parts;
  if (!(-180 <= w && w < e && e <= 180 && -90 <= s && s < n && n <= 90)) {
    throw new RangeError('box must have west < east inside -180 to 180 and south < north inside -90 to 90');
  }
  if (e - w > BOX_MAX_SPAN_DEG || n - s > BOX_MAX_SPAN_DEG) throw new RangeError(`box spans at most ${BOX_MAX_SPAN_DEG} degrees each way`);
  if (e - w < BOX_MIN_SPAN_DEG || n - s < BOX_MIN_SPAN_DEG) throw new RangeError(`box spans at least ${BOX_MIN_SPAN_DEG} degrees each way`);
  return [pyRound(w, 4), pyRound(s, 4), pyRound(e, 4), pyRound(n, 4)];
}

const rad = (d: number) => (d * Math.PI) / 180;

/** `box_area_km2`: the area of a longitude and latitude box on the sphere. */
export function boxAreaKm2(box: Box4, radiusKm: number): number {
  const [w, s, e, n] = box;
  return radiusKm ** 2 * rad(e - w) * (Math.sin(rad(n)) - Math.sin(rad(s)));
}

function boxLabel(box: Box4): string {
  const [w, s, e, n] = box;
  const lat = (v: number) => `${Math.abs(v).toFixed(2)} ${v >= 0 ? 'N' : 'S'}`;
  const lon = (v: number) => `${Math.abs(v).toFixed(2)} ${v >= 0 ? 'E' : 'W'}`;
  return `${lat(s)} to ${lat(n)}, ${lon(w)} to ${lon(e)}`;
}

function boxText(box: Box4): string {
  return box.map((v) => v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')).join(',');
}

function daysIn(ym: string): number {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function monthsFrom(first: string, last: string): string[] {
  let y = Number(first.slice(0, 4));
  let m = Number(first.slice(5, 7));
  const out: string[] = [];
  for (;;) {
    const ym = `${String(y).padStart(4, '0')}-${m < 10 ? '0' : ''}${m}`;
    if (ym > last) break;
    out.push(ym);
    m += 1;
    if (m === 13) {
      y += 1;
      m = 1;
    }
  }
  return out;
}

// ----- The overlap ratio and its held-out check, as the calendar fits them

interface RatioFit {
  ratio: number | null;
  per_year: Record<string, number>;
  p10: number | null;
  p90: number | null;
  years: number[];
  viirs_rows: number;
  modis_rows: number;
}

type Pair = [number, number, number];

/** `fit_ratio`: the ratio of sums over (year, VIIRS count, MODIS count) months, and the per-year ratios' spread. */
function fitRatio(pairs: Pair[]): RatioFit {
  const byYear = new Map<number, [number, number]>();
  for (const [y, v, m] of pairs) {
    const a = byYear.get(y) ?? [0, 0];
    a[0] += v;
    a[1] += m;
    byYear.set(y, a);
  }
  // Insertion order of a Python dict is the pairs' year order, which is ascending: sums of whole numbers are exact.
  let sv = 0;
  let sm = 0;
  for (const [a, b] of byYear.values()) {
    sv += a;
    sm += b;
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const perYear: Array<[number, number]> = [];
  for (const y of years) {
    const [a, b] = byYear.get(y)!;
    if (b > 0) perYear.push([y, a / b]);
  }
  const vals = perYear.map(([, r]) => r);
  const per_year: Record<string, number> = {};
  for (const [y, r] of perYear) per_year[String(y)] = pyRound(r, 4);
  return {
    ratio: sm > 0 ? sv / sm : null,
    per_year,
    p10: vals.length ? npPercentile(vals, 10) : null,
    p90: vals.length ? npPercentile(vals, 90) : null,
    years,
    viirs_rows: Math.trunc(sv),
    modis_rows: Math.trunc(sm),
  };
}

/** `leave_one_year_out`: fit on every overlap year but one, predict the held-out year's VIIRS counts from MODIS. */
function leaveOneYearOut(pairs: Pair[]): Json {
  const years = [...new Set(pairs.map((p) => p[0]))].sort((a, b) => a - b);
  const rows: Json[] = [];
  let covered = 0;
  let totalMonths = 0;
  let busyCov = 0;
  let busy = 0;
  let yearsCov = 0;
  const inside = (v: number, m: number, f: RatioFit) => m * f.p10! - 1e-9 <= v && v <= m * f.p90! + 1e-9;
  for (const y of years) {
    const train = pairs.filter((p) => p[0] !== y);
    const test = pairs.filter((p) => p[0] === y);
    const f = fitRatio(train);
    if (f.ratio === null) continue;
    let vObs = 0;
    let mObs = 0;
    for (const [, v, m] of test) {
      vObs += v;
      mObs += m;
    }
    const vHat = mObs * f.ratio;
    for (const [, v, m] of test) {
      const ok = inside(v, m, f);
      covered += ok ? 1 : 0;
      totalMonths += 1;
      if (m >= BUSY_MONTH_MODIS_ROWS) {
        busyCov += ok ? 1 : 0;
        busy += 1;
      }
    }
    yearsCov += inside(vObs, mObs, f) ? 1 : 0;
    rows.push({
      year: y,
      months: test.length,
      viirs_observed: vObs,
      modis_observed: mObs,
      ratio_fitted_without_this_year: pyRound(f.ratio, 4),
      viirs_predicted: pyRound(vHat, 1),
      relative_error: vObs > 0 ? pyRound((vHat - vObs) / vObs, 4) : null,
      relative_error_without_harmonization: vObs > 0 ? pyRound((mObs - vObs) / vObs, 4) : null,
      inside_interval: inside(vObs, mObs, f),
    });
  }
  const errs = rows.filter((r) => r.relative_error !== null).map((r) => Math.abs(r.relative_error as number));
  const naive = rows
    .filter((r) => r.relative_error_without_harmonization !== null)
    .map((r) => Math.abs(r.relative_error_without_harmonization as number));
  return {
    held_out_years: rows.map((r) => r.year),
    per_year: rows,
    median_abs_relative_error_annual: errs.length ? pyRound(npMedian(errs), 4) : null,
    mean_abs_relative_error_annual: errs.length ? pyRound(npMean(errs), 4) : null,
    median_abs_relative_error_without_harmonization: naive.length ? pyRound(npMedian(naive), 4) : null,
    annual_interval_coverage: rows.length ? pyRound(yearsCov / rows.length, 4) : null,
    monthly_interval_coverage: totalMonths ? pyRound(covered / totalMonths, 4) : null,
    months_tested: totalMonths,
    [`monthly_interval_coverage_modis_rows_ge_${BUSY_MONTH_MODIS_ROWS}`]: busy ? pyRound(busyCov / busy, 4) : null,
    [`months_tested_modis_rows_ge_${BUSY_MONTH_MODIS_ROWS}`]: busy,
    nominal_interval: '10th to 90th percentile of per-year ratios (80 percent if the yearly ratio spread held)',
    definition:
      'for each overlap year: fit the ratio of sums and the 10th to 90th percentile of per-year ratios on the other overlap years; predicted VIIRS = MODIS x ratio; relative error = (predicted - observed) / observed over the year; coverage = share of held-out years (annual) or months (monthly) whose observed VIIRS count lies within MODIS x [p10, p90]',
  };
}

function roundFit(f: RatioFit): Json {
  return {
    ratio: roundOrNull(f.ratio, 4),
    per_year: f.per_year,
    p10: roundOrNull(f.p10, 4),
    p90: roundOrNull(f.p90, 4),
    years: f.years,
    viirs_rows: f.viirs_rows,
    modis_rows: f.modis_rows,
  };
}

// ----- The harmonization's call (backend/model/harmonize.py), for the method the Record serves

/** The served method's fitted tables (`backend/model/harmonize_fitted.py`, `FITTED`, as `harmonize-fitted.json`). */
export interface Fitted {
  level: number;
  serve: { rows: string; frp: string };
  provenance: unknown;
  methods: Record<string, {
    month: Record<string, { world: IntervalTable; bands: Record<string, IntervalTable> }>;
    year: Record<string, { world: IntervalTable; bands: Record<string, IntervalTable> }>;
    params?: Record<string, ServedParams>;
  }>;
}

interface IntervalTable {
  unit: number;
  log_lo: number[];
  log_hi: number[];
}

interface ServedParams {
  world_ratio: number;
  unit: number;
  pseudo_rows: number;
  empty_pseudo_months: number;
  band_ratio: Record<string, number>;
  size_factor: number[];
  empty_band_mean: Record<string, number>;
  empty_world_mean: number;
}

/** The box grown by 2 degrees, per month: Terra, Aqua and Suomi NPP rows (NaN in a month the closed rule closes). */
export interface Surround {
  year_month: string[];
  Terra: Float64Array;
  Aqua: Float64Array;
  'Suomi NPP': Float64Array;
  box: Box4;
  build: string;
}

const INTERVAL_BINS = 16;
const SIZE_BINS = 14;
const INTERVAL_ID = 'heldout_log_error_quantiles_v1';
const FIRST_FIT_MONTH = '2012-02';
const SERVED_WHAT: Record<string, string> = {
  overlap_ratio_v1:
    "Suomi NPP equivalent rows = MODIS rows (Terra plus Aqua) x the place's ratio of Suomi NPP rows to MODIS rows over its clean overlap months; Terra alone x its own ratio before Aqua",
  pooled_month_size_v1:
    "Suomi NPP equivalent rows = MODIS rows (Terra plus Aqua) x the place's ratio for that month of the year x a factor for the size of the month's MODIS count. The month's ratio leans on the place's ratio over the year, which leans on its surroundings and its latitude band; a month in which MODIS saw nothing gets the place's mean Suomi NPP count in such months. Terra alone, fitted the same way, before Aqua",
};

const shrink = (num: number, den: number, prior: number, k: number) => (num + k * prior) / (den + k);

function bandKey(lat: number | null): string | null {
  if (lat === null) return null;
  const v = Math.floor(lat / 10) * 10;
  return Object.is(v, -0) ? '-0' : String(v);
}

function tablesFor(lat: number | null, tables: Fitted['methods'][string], scale: 'month' | 'year', regime: string): [IntervalTable, string] {
  const t = tables[scale][regime];
  const key = bandKey(lat);
  if (key !== null && key in t.bands) return [t.bands[key], `band ${key}`];
  return [t.world, 'world'];
}

function intervalBin(pred: number, unit: number): number {
  const x = pred / unit;
  const b = x >= 1 ? Math.floor(Math.log2(Math.max(x, 1))) + 1 : 0;
  return Math.min(Math.max(b, 0), INTERVAL_BINS - 1);
}

function sizeBin(m: number, unit: number): number {
  const b = m > 0 ? Math.floor(Math.log2(Math.max(m / unit, 1e-12))) + 2 : 0;
  return Math.min(Math.max(b, 0), SIZE_BINS - 1);
}

function applyInterval(pred: number, table: IntervalTable): [number, number] {
  const unit = Number(table.unit);
  const p = Math.max(pred, 0);
  const b = intervalBin(p, unit);
  const base = p + unit;
  return [Math.max(base * Math.exp(table.log_lo[b]) - unit, 0), Math.max(base * Math.exp(table.log_hi[b]) - unit, 0)];
}

const fin = Number.isFinite;

/** `served_predict`: one place by the pooled, month of the year, count factor method. */
function servedPredict(V: Float64Array, M: Float64Array, moy: Int32Array, fit: boolean[], params: ServedParams, lat: number | null,
  priorV: number, priorM: number): Float64Array {
  const k = params.pseudo_rows * params.unit;
  const key = bandKey(lat);
  const rBand = key ? (params.band_ratio[key] ?? params.world_ratio) : params.world_ratio;
  const rNb = shrink(priorV, priorM, rBand, k);
  const n = M.length;
  let sv = 0;
  let sm = 0;
  const cv = new Float64Array(12);
  const cm = new Float64Array(12);
  let ev = 0;
  let en = 0;
  const ok: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    ok[i] = fit[i] && fin(V[i]) && fin(M[i]);
    if (!ok[i]) continue;
    sv += V[i];
    sm += M[i];
    cv[moy[i]] += V[i];
    cm[moy[i]] += M[i];
  }
  const rP = shrink(sv, sm, rNb, k);
  const rC = Array.from({ length: 12 }, (_, c) => shrink(cv[c], cm[c], rP, k));
  const bandMean = key ? (params.empty_band_mean[key] ?? params.empty_world_mean) : params.empty_world_mean;
  for (let i = 0; i < n; i++) {
    const mz = fin(M[i]) ? M[i] : 0;
    if (ok[i] && mz === 0) {
      ev += V[i];
      en += 1;
    }
  }
  const alpha = shrink(ev, en, bandMean, params.empty_pseudo_months);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (!fin(M[i])) {
      out[i] = NaN;
      continue;
    }
    const mz = M[i];
    const b = sizeBin(mz, params.unit);
    out[i] = b === 0 ? alpha : rC[moy[i]] * mz * params.size_factor[b];
  }
  return out;
}

function clean(rc: Record<string, RawCount | null>, plats: string[]): boolean {
  return plats.every((p) => rc[p] !== null && rc[p] !== undefined && !rc[p]!.outage_days);
}

/** `record_series`: the records' monthly tables in, the served method's harmonized series and its interval out. */
export function recordSeries(records: RecordRow[], fitted: Fitted, opts: {
  areaKm2: number | null; centerLat: number | null; closedYears: number[]; surround: Surround | null;
}): Json {
  const method = fitted.serve.rows;
  const tables = fitted.methods[method];
  const n = records.length;
  const ym = records.map((r) => r.year_month);
  const rc = records.map((r) => r.raw_counts ?? {});
  const series = (plat: string) => Float64Array.from(rc, (c) => (c[plat] ? Number(c[plat]!.total) : NaN));
  const T = series('Terra');
  const A = series('Aqua');
  const S = series('Suomi NPP');
  const year = Int32Array.from(ym, (m) => Number(m.slice(0, 4)));
  const moy = Int32Array.from(ym, (m) => Number(m.slice(5, 7)) - 1);
  const fitTA = ym.map((m, i) => m >= FIRST_FIT_MONTH && clean(rc[i], ['Suomi NPP', 'Terra', 'Aqua']));
  const fitT = ym.map((m, i) => m >= FIRST_FIT_MONTH && clean(rc[i], ['Suomi NPP', 'Terra']));
  const MA = Float64Array.from(T, (t, i) => t + A[i]);
  let priorNote: string | null = null;
  let surT: Float64Array | null = null;
  let surA: Float64Array | null = null;
  let surS: Float64Array | null = null;
  const sur = opts.surround;
  if (method !== 'overlap_ratio_v1' && sur) {
    const idx = new Map(sur.year_month.map((m, i) => [m, i]));
    const pick = (a: Float64Array) => Float64Array.from(ym, (m) => (idx.has(m) ? Number(a[idx.get(m)!]) : NaN));
    surT = pick(sur.Terra);
    surA = pick(sur.Aqua);
    surS = pick(sur['Suomi NPP']);
    priorNote = `surroundings: the box grown to [${sur.box.map(pyFloatText).join(', ')}], from the fire cube, less the place's rows`;
  } else if (method !== 'overlap_ratio_v1') {
    priorNote = 'no surroundings given: the place leans on its latitude band';
  }
  const surTA = surT && surA ? Float64Array.from(surT, (t, i) => t + surA![i]) : null;

  const prior = (fit: boolean[], ownM: Float64Array, sM: Float64Array | null): [number, number] => {
    if (!sM || !surS) return [0, 0];
    let a = 0;
    let b = 0;
    let c = 0;
    let d = 0;
    for (let i = 0; i < n; i++) {
      if (fit[i] && fin(sM[i]) && fin(surS[i]) && fin(ownM[i]) && fin(S[i])) {
        a += surS[i];
        b += S[i];
        c += sM[i];
        d += ownM[i];
      }
    }
    return [Math.max(0, a - b), Math.max(0, c - d)];
  };

  const predict = (M: Float64Array, fit: boolean[], regime: string, sM: Float64Array | null): [Float64Array, unknown] => {
    if (method === 'overlap_ratio_v1') {
      let d = 0;
      let num = 0;
      for (let i = 0; i < n; i++) {
        if (!fit[i]) continue;
        if (fin(M[i])) d += M[i];
        if (fin(S[i])) num += S[i];
      }
      const r = d > 0 ? num / d : null;
      return [r !== null ? Float64Array.from(M, (m) => r * m) : new Float64Array(n).fill(NaN), r];
    }
    const [pv, pm] = prior(fit, M, sM);
    return [servedPredict(S, M, moy, fit, tables.params![regime], opts.centerLat, pv, pm), { prior_suomi_npp: pv, prior_modis: pm }];
  };

  const [pTA, infoTA] = predict(MA, fitTA, 'terra_aqua', surTA);
  const [pT, infoT] = predict(T, fitT, 'terra_only', surT);
  const [tabTA, whereTA] = tablesFor(opts.centerLat, tables, 'month', 'terra_aqua');
  const [tabT, whereT] = tablesFor(opts.centerLat, tables, 'month', 'terra_only');
  const pred = new Float64Array(n).fill(NaN);
  const loM = new Float64Array(n).fill(NaN);
  const hiM = new Float64Array(n).fill(NaN);
  const used: Array<string | null> = [];
  for (let i = 0; i < n; i++) {
    let p: number;
    let tab: IntervalTable;
    let u: string;
    if (fin(MA[i]) && fin(pTA[i])) {
      p = pTA[i];
      tab = tabTA;
      u = 'terra_aqua';
    } else if (fin(T[i]) && fin(pT[i])) {
      p = pT[i];
      tab = tabT;
      u = 'terra_only';
    } else {
      used.push(null);
      continue;
    }
    const [lo, hi] = applyInterval(p, tab);
    pred[i] = p;
    loM[i] = lo;
    hiM[i] = hi;
    used.push(u);
  }
  const outMonths = ym.map((m, i) => {
    const row: Json = {
      year_month: m,
      ratio_used: used[i],
      harmonized_count: Number.isNaN(pred[i]) ? null : pyRound(pred[i], 2),
      p10_count: Number.isNaN(loM[i]) ? null : pyRound(loM[i], 2),
      p90_count: Number.isNaN(hiM[i]) ? null : pyRound(hiM[i], 2),
    };
    if (opts.areaKm2) {
      const k = 1.0 / (opts.areaKm2 / 1000.0) / daysIn(m);
      for (const [a, b] of [['harmonized_count', 'harmonized_rate'], ['p10_count', 'p10_rate'], ['p90_count', 'p90_rate']]) {
        row[b] = row[a] === null ? null : pyRound((row[a] as number) * k, 4);
      }
    }
    return row;
  });
  const [tabY, whereY] = tablesFor(opts.centerLat, tables, 'year', 'terra_aqua');
  const outYears: Json[] = [];
  for (const y of [...new Set(year)].sort((a, b) => a - b)) {
    const sel: number[] = [];
    for (let i = 0; i < n; i++) if (year[i] === y && fin(pred[i])) sel.push(pred[i]);
    if (!sel.length) continue;
    const s = pairwiseSum(sel);
    const [lo, hi] = applyInterval(s, tabY);
    outYears.push({ year: y, months: sel.length, harmonized_count: pyRound(s, 1), p10_count: pyRound(lo, 1), p90_count: pyRound(hi, 1) });
  }
  const checkPredict = (fit: boolean[]) => predict(MA, fit, 'terra_aqua', surTA)[0];
  let sS = 0;
  let sMA = 0;
  for (let i = 0; i < n; i++) {
    if (!fitTA[i]) continue;
    if (fin(S[i])) sS += S[i];
    if (fin(MA[i])) sMA += MA[i];
  }
  const fittedOn: Json = { months: ym.filter((_, i) => fitTA[i]), suomi_npp_rows: sS, modis_rows: sMA };
  if (method === 'overlap_ratio_v1') {
    Object.assign(fittedOn, { ratio_terra_aqua: infoTA, ratio_terra_only: infoT });
  } else {
    Object.assign(fittedOn, { prior: priorNote, ...(infoTA as Json), ratio_over_the_overlap: sMA > 0 ? sS / sMA : null });
  }
  return {
    method: {
      id: method,
      quantity: 'rows',
      unit: 'rows',
      what: SERVED_WHAT[method],
      fitted_on: fittedOn,
      fit_months_rule: `from ${FIRST_FIT_MONTH}, months in which Suomi NPP, Terra and Aqua each deliver with no outage day`,
      interval: {
        id: INTERVAL_ID,
        level: fitted.level,
        tables: 'terra_aqua',
        table_month: whereTA,
        table_month_terra_only: whereT,
        table_year: whereY,
        what: 'the 10th to 90th percentile of held-out errors of predictions of about the same size, from every overlap year left out in turn over every place of the fit',
        fitted_on: fitted.provenance,
      },
    },
    months: outMonths,
    years: outYears,
    check: recordCheck(S, MA, year, fitTA, tabTA, tabY, opts.closedYears, checkPredict),
  };
}

/** `record_check`: the place's own held-out check, each overlap year but a closed one left out in turn. */
function recordCheck(S: Float64Array, M: Float64Array, year: Int32Array, fit: boolean[], tabM: IntervalTable, tabY: IntervalTable,
  closedYears: number[], predict: (fit: boolean[]) => Float64Array): Json {
  const rows: Json[] = [];
  const insideM: number[] = [];
  const insideBusy: number[] = [];
  const n = S.length;
  const fitYears = [...new Set(year.filter((_, i) => fit[i]))].sort((a, b) => a - b);
  for (const y of fitYears) {
    if (closedYears.includes(y)) continue;
    const tr = fit.map((f, i) => f && year[i] !== y);
    const te: number[] = [];
    for (let i = 0; i < n; i++) if (fit[i] && year[i] === y) te.push(i);
    const all = predict(tr);
    const p = te.map((i) => all[i]);
    if (!p.every(fin)) continue;
    let vo = 0;
    let mo = 0;
    te.forEach((i, j) => {
      const [lo, hi] = applyInterval(p[j], tabM);
      const ins = S[i] >= lo - 1e-9 && S[i] <= hi + 1e-9;
      insideM.push(ins ? 1 : 0);
      if (M[i] >= BUSY_MONTH_MODIS_ROWS) insideBusy.push(ins ? 1 : 0);
      vo += S[i];
      mo += M[i];
    });
    const vp = pairwiseSum(p);
    const [ylo, yhi] = applyInterval(vp, tabY);
    rows.push({
      year: y,
      months: te.length,
      suomi_npp_observed: vo,
      predicted: pyRound(vp, 1),
      relative_error: vo > 0 ? pyRound((vp - vo) / vo, 4) : null,
      relative_error_without_harmonization: vo > 0 ? pyRound((mo - vo) / vo, 4) : null,
      inside_interval: ylo - 1e-9 <= vo && vo <= yhi + 1e-9,
    });
  }
  const errs = rows.filter((r) => r.relative_error !== null).map((r) => Math.abs(r.relative_error as number));
  const naive = rows
    .filter((r) => r.relative_error_without_harmonization !== null)
    .map((r) => Math.abs(r.relative_error_without_harmonization as number));
  const fitSet = new Set(fitYears);
  return {
    held_out_years: rows.map((r) => r.year),
    per_year: rows,
    years_not_held_out: closedYears.filter((y) => fitSet.has(y)).sort((a, b) => a - b),
    mean_abs_relative_error_annual: errs.length ? pyRound(npMean(errs), 4) : null,
    median_abs_relative_error_annual: errs.length ? pyRound(npMedian(errs), 4) : null,
    median_abs_relative_error_without_harmonization: naive.length ? pyRound(npMedian(naive), 4) : null,
    annual_interval_coverage: rows.length ? pyRound(npMean(rows.map((r) => (r.inside_interval ? 1 : 0))), 4) : null,
    monthly_interval_coverage: insideM.length ? pyRound(npMean(insideM), 4) : null,
    months_tested: insideM.length,
    [`monthly_interval_coverage_modis_rows_ge_${BUSY_MONTH_MODIS_ROWS}`]: insideBusy.length ? pyRound(npMean(insideBusy), 4) : null,
    [`months_tested_modis_rows_ge_${BUSY_MONTH_MODIS_ROWS}`]: insideBusy.length,
    nominal_interval: '80 percent: the 10th to 90th percentile of held-out errors of predictions of about the same size, per latitude band',
    definition:
      "for each overlap year but a closed one: the method is fitted on the other overlap years and predicts that year's Suomi NPP count of every clean month from its MODIS count; relative error = (predicted - observed) / observed over the year; coverage = share of held-out years (annual) or months (monthly) whose observed Suomi NPP count lies inside the interval",
    interval_note:
      'the interval checked here is the one in use, whose table holds held-out errors of every year in other places, and the world factors of the pooled method are fitted on every year; the coverage measured on years that did not set the table is in docs/harmonization.md',
  };
}

/** A float as Python's repr writes it in a list: 39.0, -120.5. */
function pyFloatText(v: number): string {
  return Number.isInteger(v) ? `${v}.0` : String(v);
}

// ----- The calendar payload

export interface PayloadInput {
  /** Month label to platform to fire rows (day and night together); a missing month or platform is zero. */
  totals: Map<string, Record<string, number>>;
  rowsRead: number;
  /** The box on the grid. */
  box: Box4;
  radiusKm: number;
  /** The months each platform delivers. */
  deliver: Record<string, Set<string>>;
  /** Outage days per platform and month, and their count per platform. */
  gapMonths: Record<string, Map<string, number>>;
  gapTotals: Record<string, number>;
  head: Json;
  provenanceWhere: string;
  countedRows: string;
  noaa21Note: string;
  notInCalendar: string;
  /** The harmonization's call, as the Record makes it once its route calls `record_series`; null for the route on main. */
  harmonize: null | { fitted: Fitted; closedYears: number[]; surround: Surround | null };
}

/** `_calendar_payload`: the Record from monthly counts. */
export function calendarPayload(inp: PayloadInput): Json {
  const area = boxAreaKm2(inp.box, inp.radiusKm);
  const deliverOf = (p: string) => inp.deliver[p] ?? new Set<string>();
  const allMonths = [...new Set(Object.entries(inp.deliver).filter(([k]) => k !== 'NOAA-21').flatMap(([, v]) => [...v]))].sort();
  const months = monthsFrom(allMonths[0], allMonths[allMonths.length - 1]);
  const on = (p: string, mo: string) => deliverOf(p).has(mo);
  const gapOf = (p: string, mo: string) => inp.gapMonths[p]?.get(mo) ?? 0;
  const cleanM = (mo: string, ...plats: string[]) => plats.every((p) => on(p, mo) && gapOf(p, mo) === 0);
  const fire = (mo: string, p: string) => inp.totals.get(mo)?.[p] ?? 0;

  const both: Pair[] = months
    .filter((mo) => cleanM(mo, 'Suomi NPP', 'Terra', 'Aqua'))
    .map((mo) => [Number(mo.slice(0, 4)), fire(mo, 'Suomi NPP'), fire(mo, 'Terra') + fire(mo, 'Aqua')]);
  const terra: Pair[] = months
    .filter((mo) => cleanM(mo, 'Suomi NPP', 'Terra'))
    .map((mo) => [Number(mo.slice(0, 4)), fire(mo, 'Suomi NPP'), fire(mo, 'Terra')]);
  const excludedMonths = months.filter((mo) => on('Suomi NPP', mo) && on('Terra', mo) && on('Aqua', mo) && !cleanM(mo, 'Suomi NPP', 'Terra', 'Aqua'));
  const fitBoth = fitRatio(both);
  const fitTerra = fitRatio(terra);
  let validation = leaveOneYearOut(both);
  const rate = (n: number, mo: string) => n / (area / 1000.0) / daysIn(mo);

  const records: RecordRow[] = months.map((mo, i) => {
    const tOn = on('Terra', mo);
    const aOn = on('Aqua', mo);
    const sOn = on('Suomi NPP', mo);
    const nOn = on('NOAA-20', mo);
    const raw: Record<string, RawCount | null> = {};
    for (const plat of PLATFORMS) {
      const ok = plat === 'NOAA-21' ? on('NOAA-21', mo) : on(plat, mo);
      raw[plat] = ok ? { day: null, night: null, total: fire(mo, plat), outage_days: plat === 'NOAA-21' ? null : gapOf(plat, mo) } : null;
    }
    let modisN = (tOn ? fire(mo, 'Terra') : 0) + (aOn ? fire(mo, 'Aqua') : 0);
    let fit: RatioFit | null;
    let used: string | null;
    if (tOn && aOn) {
      fit = fitBoth;
      used = 'terra_aqua';
    } else if (tOn) {
      fit = fitTerra;
      used = 'terra_only';
      modisN = fire(mo, 'Terra');
    } else {
      fit = null;
      used = null;
    }
    let mr: number | null;
    let h: number | null = null;
    let lo: number | null = null;
    let hi: number | null = null;
    let state: string;
    if (fit !== null && fit.ratio !== null) {
      mr = rate(modisN, mo);
      h = mr * fit.ratio;
      lo = mr * fit.p10!;
      hi = mr * fit.p90!;
      state = 'Harmonized';
    } else {
      mr = tOn || aOn ? rate(modisN, mo) : null;
      state = 'No MODIS data';
    }
    const regime = !(tOn || aOn) ? 'NO_MODIS' : !aOn ? 'TERRA_ONLY' : !sOn ? 'TERRA_AQUA_STABLE' : !nOn ? 'MODIS_SNPP' : 'MODIS_SNPP_NOAA20';
    return {
      index: i,
      year: Number(mo.slice(0, 4)),
      month: Number(mo.slice(5, 7)),
      year_month: mo,
      modis_raw_rate: roundOrNull(mr, 4),
      viirs_raw_rate: sOn ? pyRound(rate(fire(mo, 'Suomi NPP'), mo), 4) : null,
      harmonized_mean: roundOrNull(h, 4),
      harmonized_p10: roundOrNull(lo, 4),
      harmonized_p90: roundOrNull(hi, 4),
      coverage_fraction: null,
      state_label: state,
      sensor_regime: regime,
      modis_orbital_drift_factor: null,
      ratio_used: used,
      raw_counts: raw,
    };
  });

  let harm: Json | null = null;
  if (inp.harmonize) {
    // The Record route's call (isogon-notes/harmonize/RECORD-CALL.md): the served method's value and interval.
    harm = recordSeries(records, inp.harmonize.fitted, {
      areaKm2: area,
      centerLat: (inp.box[1] + inp.box[3]) / 2.0,
      closedYears: inp.harmonize.closedYears,
      surround: inp.harmonize.surround,
    });
    const hm = harm.months as Json[];
    records.forEach((rec, i) => {
      rec.harmonized_mean = hm[i].harmonized_rate as number | null;
      rec.harmonized_p10 = hm[i].p10_rate as number | null;
      rec.harmonized_p90 = hm[i].p90_rate as number | null;
    });
    validation = harm.check as Json;
  }

  const years = [...new Set(records.map((r) => r.year))].sort((a, b) => a - b);
  const annual = years.map((y) => {
    const rs = records.filter((r) => r.year === y);
    const hm = rs.map((r) => r.harmonized_mean).filter((v): v is number => v !== null);
    const mm = rs.map((r) => r.modis_raw_rate).filter((v): v is number => v !== null);
    const vm = rs.map((r) => r.viirs_raw_rate).filter((v): v is number => v !== null);
    const totals: Record<string, number> = {};
    for (const r of rs) {
      for (const [plat, c] of Object.entries(r.raw_counts)) if (c !== null) totals[plat] = (totals[plat] ?? 0) + c.total;
    }
    return {
      year: y,
      months: rs.length,
      modis_raw_mean: mm.length ? pyRound(npMean(mm), 4) : null,
      viirs_raw_mean: vm.length ? pyRound(npMean(vm), 4) : null,
      harmonized_mean: hm.length ? pyRound(npMean(hm), 4) : null,
      harmonized_peak_month: hm.length ? pyRound(Math.max(...hm), 4) : null,
      mean_coverage_fraction: null,
      raw_counts: totals,
    };
  });

  const markers: Json[] = [];
  for (const [plat, label] of [['Terra', 'MODIS Terra rows begin'], ['Aqua', 'MODIS Aqua joins'], ['Suomi NPP', 'VIIRS Suomi NPP 375 m begins'], ['NOAA-20', 'VIIRS NOAA-20 joins']]) {
    const d = deliverOf(plat);
    if (d.size) markers.push({ year_month: [...d].sort()[0], label, source: 'first month with rows in the FIRMS country file' });
  }
  for (const m of DRIFT_MARKERS) if (months[0] <= m.year_month && m.year_month <= months[months.length - 1]) markers.push({ ...m });
  markers.sort((a, b) => ((a.year_month as string) < (b.year_month as string) ? -1 : (a.year_month as string) > (b.year_month as string) ? 1 : 0));

  const full = annual.filter((a) => a.months === 12 && a.harmonized_mean !== null);
  const top = [...full].sort((a, b) => (b.harmonized_mean as number) - (a.harmonized_mean as number)).slice(0, 4);
  const climatology = monthClimatology(records);
  const sameMonth = new Map<number, number[]>();
  for (const r of records) {
    if (r.harmonized_mean !== null) sameMonth.set(r.month, [...(sameMonth.get(r.month) ?? []), r.harmonized_mean]);
  }
  for (const r of records) {
    const med = climatology[r.month - 1].median as number | null;
    const h = r.harmonized_mean;
    const same = sameMonth.get(r.month) ?? [];
    r.month_median = med;
    r.anomaly = h !== null && med !== null ? pyRound(h - med, 4) : null;
    r.anomaly_ratio = h !== null && med ? pyRound(h / med, 4) : null;
    r.month_rank = h !== null ? 1 + same.filter((v) => v > h).length : null;
    r.month_years = same.length;
  }
  const hmethod: Json = {
    id: harm ? (harm.method as Json).id : METHOD_ID,
    in_use: true,
    description: harm
      ? (harm.method as Json).what
      : 'harmonized = MODIS rate x (Suomi NPP rows / MODIS rows over the overlap months); p10 and p90 from the 10th and 90th percentile of the per-year ratios; months before Aqua use a Terra-only ratio fitted the same way; overlap months in which Suomi NPP, Terra or Aqua has an outage day are left out of the fit and the validation',
  };
  if (harm) {
    hmethod.interval = (harm.method as Json).interval;
    hmethod.fitted_on = (harm.method as Json).fitted_on;
  }
  Object.assign(hmethod, {
    counted_rows: inp.countedRows,
    outage_rule: `a day inside a platform's operating span on which it has no row in any cached country file while the other platforms together have at least ${OUTAGE_MIN_OTHER_ROWS}`,
    overlap_months_excluded_for_outages: excludedMonths,
    platforms_in_fit: ['Suomi NPP', 'Terra', 'Aqua'],
    platforms_counted_not_fitted: {
      'NOAA-20': 'counted from 2018-04 in raw_counts; the fit stays Suomi NPP over MODIS, one platform pair through the whole 2012 to 2025 overlap',
      'NOAA-21': inp.noaa21Note,
    },
    not_in_calendar: inp.notInCalendar,
    fit_rows: { modis: fitBoth.modis_rows, viirs: fitBoth.viirs_rows },
    ratio_terra_aqua: roundFit(fitBoth),
    ratio_terra_only: roundFit(fitTerra),
    validation,
    replaced_only_by: 'a method that beats it on held-out overlap years',
  });
  const outage: Record<string, number> = {};
  for (const p of Object.keys(inp.gapTotals).sort()) outage[p] = inp.gapTotals[p];
  return {
    schema_version: '1.0.0',
    source: 'firms',
    model_version: hmethod.id,
    provenance:
      'Real NASA FIRMS standard processing rows (Country Yearly Summary files; MODIS version labels 6.2 for 2000 to 2017, 6.03 for 2018 to 2022 and 61.03 for 2023 to 2025; VIIRS version 2), counted ' +
      `${inp.provenanceWhere}. Not simulated.`,
    downloaded_firms_rows: inp.rowsRead,
    ...inp.head,
    bbox: [...inp.box],
    box_area_km2: pyRound(area, 1),
    reference_frame: 'VIIRS_SNPP_375M_EQUIV',
    units: {
      modis_raw_rate: 'hotspots_per_1000km2_day (Terra + Aqua)',
      viirs_raw_rate: 'hotspots_per_1000km2_day (Suomi NPP)',
      harmonized_mean: 'suomi_npp_equivalent_hotspots_per_1000km2_day',
    },
    harmonization_method: hmethod,
    summary_metrics: {
      total_months: records.length,
      years_span: [records[0].year, records[records.length - 1].year],
      first_month: months[0],
      last_month: months[months.length - 1],
      viirs_to_modis_overlap_ratio: fitBoth.ratio ? pyRound(fitBoth.ratio, 4) : null,
      viirs_to_modis_ratio_p10_p90: fitBoth.p10 !== null ? [pyRound(fitBoth.p10, 4), pyRound(fitBoth.p90!, 4)] : null,
      held_out_median_abs_relative_error: validation.median_abs_relative_error_annual,
      held_out_median_abs_relative_error_without_harmonization: validation.median_abs_relative_error_without_harmonization,
      held_out_annual_interval_coverage: validation.annual_interval_coverage,
      held_out_monthly_interval_coverage: validation.monthly_interval_coverage,
      ignored_extracts: [],
      outage_days: outage,
      extreme_fire_years_highlighted: top.map((a) => a.year),
      coverage_note: 'coverage_fraction is null: FIRMS rows are positive-only and no coverage product is fetched yet',
    },
    month_climatology: climatology,
    regime_markers: markers,
    annual_summary: annual,
    records,
  };
}

/** `month_climatology`: per calendar month, the median and 10th and 90th percentile of the harmonized value. */
function monthClimatology(records: RecordRow[]): Json[] {
  const out: Json[] = [];
  for (let m = 1; m <= 12; m++) {
    const vals = records.filter((r) => r.month === m && r.harmonized_mean !== null).map((r) => [r.year, r.harmonized_mean as number]);
    if (!vals.length) {
      out.push({ month: m, median: null, p10: null, p90: null, years: 0, first_year: null, last_year: null });
      continue;
    }
    const v = vals.map(([, x]) => x);
    out.push({
      month: m,
      median: pyRound(npMedian(v), 4),
      p10: pyRound(npPercentile(v, 10), 4),
      p90: pyRound(npPercentile(v, 90), 4),
      years: vals.length,
      first_year: Math.min(...vals.map(([y]) => y)),
      last_year: Math.max(...vals.map(([y]) => y)),
    });
  }
  return out;
}

// ----- A box's Record from the public file

/** `closed_years_for_box`: the overlap years in which the box meets a test fire's region (touching counts). */
export function closedYearsForBox(box: Box4, manifest: PublicManifest): number[] {
  const [w, s, e, n] = box;
  const out = new Set<number>();
  for (let y = 2012; y <= 2025; y++) {
    for (const k of manifest.closed) {
      if (!k.years.includes(y)) continue;
      const [cw, cs, ce, cn] = k.context_box;
      if (w <= ce && cw <= e && s <= cn && cs <= n) out.add(y);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** `public_surround`: the box grown by 2 degrees on every side, Terra, Aqua and Suomi NPP; a closed month is NaN. */
export function publicSurround(cube: PublicCube, box: Box4, growDeg = 2.0): Surround {
  const [w, s, e, n] = box;
  const t = cube.box(Math.max(-180, w - growDeg), Math.max(-90, s - growDeg), Math.min(180, e + growDeg), Math.min(90, n + growDeg));
  const nM = cube.manifest.months.count;
  const at = (p: number) => {
    const a = Float64Array.from(t.rows[p]);
    for (const m of t.closedMonths) a[m] = NaN;
    return a;
  };
  return {
    year_month: Array.from({ length: nM }, (_, m) => cube.monthLabel(m)),
    Terra: at(0),
    Aqua: at(1),
    'Suomi NPP': at(2),
    box: t.box,
    build: cube.manifest.source.cube_build,
  };
}

export interface PublicRecordOptions {
  /** The method the Record's route serves: the route on main harmonizes inside the calendar (`overlap_ratio_v1`);
   * once it calls the harmonization (`record_series`), pass the fitted tables and the Record serves `serve.rows`. */
  fitted: Fitted | null;
}

/** The Record of a box from the public file alone, as the cube route answers it; null when no cell of it is loaded. */
export function publicRecord(cube: PublicCube, asked: Box4, opts: PublicRecordOptions): Json | null {
  const t = cube.box(...asked);
  if (!t.loaded) return null;
  const man = cube.manifest;
  const label = (m: number) => cube.monthLabel(m);
  const closed = new Set(t.closedMonths.map(label));
  const totals = new Map<string, Record<string, number>>();
  let rowsRead = 0;
  for (let m = 0; m < man.months.count; m++) {
    let any = false;
    const row: Record<string, number> = {};
    man.platforms.forEach((p, i) => {
      const v = t.rows[i][m];
      if (v) {
        row[p] = v;
        any = true;
        rowsRead += v;
      }
    });
    if (any) totals.set(label(m), row);
  }
  const deliver: Record<string, Set<string>> = {};
  for (const [plat, v] of Object.entries(man.delivering)) {
    deliver[plat] = new Set(v.flatMap((onM, m) => (onM && !closed.has(label(m)) ? [label(m)] : [])));
  }
  const gapMonths: Record<string, Map<string, number>> = {};
  const gapTotals: Record<string, number> = {};
  for (const [plat, perMonth] of Object.entries(man.outage_days)) {
    const g = new Map<string, number>();
    let total = 0;
    perMonth.forEach((d, m) => {
      if (d > 0) g.set(label(m), d);
      total += d;
    });
    gapMonths[plat] = g;
    gapTotals[plat] = total;
  }
  const g = t.box;
  const out = calendarPayload({
    totals,
    rowsRead,
    box: g,
    radiusKm: man.grid.earth_radius_km,
    deliver,
    gapMonths,
    gapTotals,
    head: { region_id: null, region_name: boxLabel(g) },
    provenanceWhere: "inside the box on the cube's 0.25 degree grid, summed in the browser from the public cube file",
    countedRows: 'fire rows (FIRMS type 0), day and night together, as the box calendar counts; the box is answered on whole cells of the grid',
    noaa21Note: 'not in the country files; the cube has no NOAA-21 rows',
    notInCalendar:
      'the months after the last country file month: their rows come from the area API (near real time, no type column); a page of recorded answers does not hold them',
    harmonize: opts.fitted ? { fitted: opts.fitted, closedYears: closedYearsForBox(g, man), surround: publicSurround(cube, g) } : null,
  });
  out.place = { kind: 'box', box: [...g], box_asked: [...asked], countries: [], label: boxLabel(g) };
  out.current_month = { route: '/api/calendar/current?source=firms&box=' + boxText(g) };
  out.closed_months = [...closed].sort();
  out.public_cube = {
    build_id: man.source.cube_build,
    file_sha256: man.file.sha256,
    grid_step_deg: man.grid.step_deg,
    snap: 'outer',
    box_asked: [...asked],
    grid_box: [...g],
    cells: t.cells,
    summed: 'in the browser, from the public cube file',
    not_in_it:
      "a platform's day and night split, static, offshore and volcano rows, fire radiative power and the countries of the box; the months the closed rule closes for the box read as no data",
  };
  return out;
}
