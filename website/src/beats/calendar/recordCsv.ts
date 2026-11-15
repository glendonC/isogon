import type { FireRecord } from './record.ts';
import { METHOD_PLAIN } from './recordWords.ts';

/**
 * The Record as a file a user of fire data can take away: made in the browser from the answer on screen, so it works
 * on a page of recorded answers and for a drawn area. One row a month: the detections each satellite counted, each
 * kind's own rate as counted, the value on one scale and its range. At the top, as comment lines, the place or box, the
 * source in the answer's own words, the method and what the range is, the units, and the page's address. Every figure
 * is the answer's, written as it came.
 */

const PLATFORMS: Array<[string, string]> = [
  ['Terra', 'terra_detections'],
  ['Aqua', 'aqua_detections'],
  ['Suomi NPP', 'suomi_npp_detections'],
  ['NOAA-20', 'noaa20_detections'],
  ['NOAA-21', 'noaa21_detections'],
];

export const CSV_COLUMNS = [
  'month',
  ...PLATFORMS.map(([, c]) => c),
  'modis_rate_as_counted',
  'viirs_rate_as_counted',
  'rate_on_one_scale',
  'range_low',
  'range_high',
];

const cell = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
const corners = (b: [number, number, number, number]) => b.map((n) => String(n)).join(', ');
/** A comment line holds no line break. */
const line = (s: string) => `# ${s.replace(/\s*\n\s*/g, ' ')}`;

export function recordCsv(rec: FireRecord, href: string): string {
  const head: string[] = [line(`The fire record of ${rec.label}, month by month, ${rec.firstMonth} to ${rec.lastMonth}`)];
  if (rec.grid) {
    head.push(line(`Area drawn: west, south, east, north = ${corners(rec.grid.asked)}`));
    head.push(line(`Read on whole squares of ${rec.grid.step} degree: ${corners(rec.grid.box)} (${rec.grid.cells} squares)`));
  } else if (rec.box) {
    head.push(line(`Place: ${rec.label}; its box, west, south, east, north = ${corners(rec.box)}`));
  }
  head.push(line(`Source: ${rec.provenance ?? 'NASA FIRMS standard processing rows: MODIS on Terra and Aqua, VIIRS on Suomi NPP, NOAA-20 and NOAA-21'}`));
  const plain = rec.method.id ? METHOD_PLAIN[rec.method.id] : undefined;
  if (rec.method.id) head.push(line(`Method: ${plain ? `every year on the newer satellite's scale by ${plain}` : 'the method the record names'} (${rec.method.id})`));
  if (rec.method.what || rec.method.level !== null) {
    const level = rec.method.level !== null ? `the middle ${Math.round(rec.method.level * 100)} percent` : 'the range';
    head.push(line(`range_low to range_high: ${level}${rec.method.what ? `, ${rec.method.what}` : ''}`));
  }
  head.push(
    line(
      "Units: every rate is detections per 1,000 square kilometres a day; modis_rate_as_counted and viirs_rate_as_counted are each kind of satellite's own count, with no correction; rate_on_one_scale and its range are on the Suomi NPP scale; detections are rows counted inside the box",
    ),
  );
  head.push(line('An empty cell: no satellite of that kind counted that month, or the answer gives no value'));
  head.push(line(`Page: ${href}`));
  const rows = [...rec.months.values()]
    .sort((a, b) => a.ym.localeCompare(b.ym))
    .map((m) => {
      const count = (p: string) => m.counts.find((c) => c.platform === p)?.total;
      return [m.ym, ...PLATFORMS.map(([p]) => cell(count(p))), cell(m.modisRate), cell(m.viirsRate), cell(m.value), cell(m.p10), cell(m.p90)].join(',');
    });
  return [...head, CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
}

/** A file name from the record's place: "fire-record-feather-river-plumas-ca.csv". */
export function recordFileName(rec: FireRecord): string {
  const slug = rec.label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `fire-record-${slug || 'area'}.csv`;
}
