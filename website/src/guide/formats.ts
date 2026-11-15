/**
 * The script's formats (`script.json`, "formats"), one function each. A value the answers do not hold comes back
 * null, and a line that names it is not said.
 */

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const finite = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

/** count: a whole number with a comma for thousands. */
export const count = (n: number | null | undefined) => (finite(n) ? Math.round(n).toLocaleString('en-US') : null);
/** count_word: zero to twelve as a word, larger numbers as digits. */
export const countWord = (n: number | null | undefined) =>
  finite(n) ? (n >= 0 && n <= 12 ? WORDS[Math.round(n)] : count(n)) : null;
/** length: the number of items of a list, as count_word. */
export const length = (xs: unknown[] | null | undefined) => (Array.isArray(xs) ? countWord(xs.length) : null);
/** length_digits: the number of items of a list, in digits. */
export const lengthDigits = (xs: unknown[] | null | undefined) => (Array.isArray(xs) ? count(xs.length) : null);
/** ordinal: the value plus one, because the answer counts from zero. */
export const ordinal = (n: number | null | undefined) => (finite(n) ? count(n + 1) : null);
/** points: the value times 100, one decimal place, with a plus or minus sign. */
export const points = (v: number | null | undefined) => {
  if (!finite(v)) return null;
  const p = Math.round(v * 1000) / 10;
  return `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}`;
};
/** mean_points: the mean of a list, as points. */
export const meanPoints = (xs: number[] | null | undefined) =>
  Array.isArray(xs) && xs.length > 0 ? points(xs.reduce((a, x) => a + x, 0) / xs.length) : null;
/** percent1: the value times 100, one decimal place. */
export const percent1 = (v: number | null | undefined) => (finite(v) ? (Math.round(v * 1000) / 10).toFixed(1) : null);
/** list_and: the items with commas and a final and. */
export const listAnd = (xs: Array<string | number>) =>
  xs.length === 0 ? null : xs.length === 1 ? String(xs[0]) : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
/** year: the first four characters of a month or an instant. */
export const year = (s: string | null | undefined) => (typeof s === 'string' && s.length >= 4 ? s.slice(0, 4) : null);

/** The middle longitude of a box [west, south, east, north]. */
export const midLon = (bbox: readonly number[] | null | undefined) =>
  Array.isArray(bbox) && bbox.length === 4 && finite(bbox[0]) && finite(bbox[2]) ? (bbox[0] + bbox[2]) / 2 : null;

/** An instant moved to time by the sun at the fire: the middle longitude over fifteen, in hours, cut to the minute. */
function atFire(iso: string | null | undefined, lon: number | null): Date | null {
  if (typeof iso !== 'string' || lon === null) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const local = t + (lon / 15) * 3_600_000;
  return new Date(Math.floor(local / 60_000) * 60_000);
}

const partOfDay = (h: number) => (h >= 5 && h < 12 ? 'in the morning' : h >= 12 && h < 18 ? 'in the afternoon' : h >= 18 && h < 21 ? 'in the evening' : 'at night');

/** local_day_time: "11 August, 1:11 at night", by the sun at the fire. One function for every line. */
export function localDayTime(iso: string | null | undefined, lon: number | null): string | null {
  const d = atFire(iso, lon);
  if (!d) return null;
  const h = d.getUTCHours();
  const clock = `${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${clock} ${partOfDay(h)}`;
}

/** local_day_range: the days of two instants at the fire, "9 to 12 August 2012". */
export function localDayRange(a: string | null | undefined, b: string | null | undefined, lon: number | null): string | null {
  const x = atFire(a, lon);
  const y = atFire(b, lon);
  if (!x || !y) return null;
  const day = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  const [y1, m1, d1] = [x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()];
  const [y2, m2, d2] = [y.getUTCFullYear(), y.getUTCMonth(), y.getUTCDate()];
  if (y1 === y2 && m1 === m2) return d1 === d2 ? `${day(x)} ${y1}` : `${d1} to ${d2} ${MONTHS[m1]} ${y1}`;
  if (y1 === y2) return `${day(x)} to ${day(y)} ${y1}`;
  return `${day(x)} ${y1} to ${day(y)} ${y2}`;
}
