/**
 * The Record's months as cells, from `GET /api/calendar` (or `GET /api/cube/record`, the same shape): one cell a
 * month on the white ramp of the estimate, steps set so each holds an equal share of the place's months. Pure.
 */
import { classOf, shareBreaks } from './tokens.ts';

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
];

export interface RecordCell {
  ym: string;
  year: number;
  month: number;
  value: number | null;
  low: number | null;
  high: number | null;
  /** The ramp step, or null for no fire (a value of zero) or no value. */
  step: number | null;
}

export interface RecordCells {
  cells: RecordCell[];
  breaks: number[];
  steps: number;
  firstYear: number;
  lastYear: number;
  /** The first month the record holds, and the first month with VIIRS rows of its own. */
  firstMonth: string | null;
  firstViirsMonth: string | null;
  unit: string;
}

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj | null => (x && typeof x === 'object' ? (x as Obj) : null);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export function cellsFromCalendar(calendar: unknown, steps = 8): RecordCells | null {
  const c = obj(calendar);
  const records = Array.isArray(c?.records) ? (c!.records as unknown[]) : [];
  const rows = records
    .map(obj)
    .filter((r): r is Obj => !!r && typeof r.year === 'number' && typeof r.month === 'number')
    .sort((a, b) => (a.year as number) - (b.year as number) || (a.month as number) - (b.month as number));
  if (rows.length === 0) return null;
  const values = rows.map((r) => num(r.harmonized_mean)).filter((v): v is number => v !== null);
  const breaks = shareBreaks(values, steps);
  const cells: RecordCell[] = rows.map((r) => {
    const year = r.year as number;
    const month = r.month as number;
    const value = num(r.harmonized_mean);
    return {
      ym: `${year}-${String(month).padStart(2, '0')}`,
      year,
      month,
      value,
      low: num(r.harmonized_p10),
      high: num(r.harmonized_p90),
      step: value !== null && value > 0 ? classOf(value, breaks) : null,
    };
  });
  const firstViirs = rows.find((r) => num(r.viirs_raw_rate) !== null);
  const units = obj(c?.units);
  return {
    cells,
    breaks,
    steps,
    firstYear: cells[0].year,
    lastYear: cells[cells.length - 1].year,
    firstMonth: cells[0].ym,
    firstViirsMonth: firstViirs ? `${firstViirs.year}-${String(firstViirs.month).padStart(2, '0')}` : null,
    unit: typeof units?.harmonized_mean === 'string' ? (units.harmonized_mean as string) : '',
  };
}

/** A rate: two decimals under 10, one from 10. */
export function rateText(v: number): string {
  return v < 10 ? v.toFixed(2) : v.toFixed(1);
}

/** The readout for one month: its value and its range, in plain words. */
export function cellReadout(cell: RecordCell): string {
  const name = `${MONTHS_LONG[cell.month - 1]} ${cell.year}`;
  if (cell.value === null) return `${name}: no value`;
  if (cell.value === 0) return `${name}: no fire detected`;
  const range = cell.low !== null && cell.high !== null ? `, likely ${rateText(cell.low)} to ${rateText(cell.high)}` : '';
  return `${name}: ${rateText(cell.value)} detections per 1,000 km² a day${range}`;
}

export interface HeldOut {
  /** Median error on a held-out year with the method, and without any correction (shares, 0 to 1). */
  method: number;
  none: number;
  years: number;
}

/** The method's error on years it did not see, as the calendar route reports it for this place. */
export function heldOutFromCalendar(calendar: unknown): HeldOut | null {
  const v = obj(obj(obj(calendar)?.harmonization_method)?.validation);
  const method = num(v?.median_abs_relative_error_annual);
  const none = num(v?.median_abs_relative_error_without_harmonization);
  if (method === null || none === null) return null;
  const years = Array.isArray(v?.held_out_years) ? (v!.held_out_years as unknown[]).length : 0;
  return { method, none, years };
}

/** The one line under the grid. */
export function heldOutText(h: HeldOut): string {
  return `Error on a year it did not see: ${Math.round(h.method * 100)} percent. Without correction: ${Math.round(h.none * 100)} percent.`;
}
