// The parity check of a drawn box's Record summed in the browser (publicCube.ts, boxRecord.ts) against the cube
// route's answers for the same boxes. Run under Node 24, which reads the TypeScript as it is:
//
//   node website/src/world/dev/publicParity.mjs <public cube folder> <boxes.json> <route answers> <served answers> <out.json>
//
// <route answers> holds the cube route's answer for box i as NN.json (the route on main, harmonizing inside the
// calendar); <served answers> the same from a backend with the harmonization's call in the route (record-route.diff),
// which the reader gives when handed the fitted tables. Every field both answers hold is compared, leaf by leaf; the
// fields the public file does not hold are listed and left out. Months the closed rule closes for a box read as no
// data in the public file and are left out of the month by month comparison, as is every whole-record figure of such
// a box (its fit loses those months), and the difference they make is reported apart.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPublicCube } from '../publicCube.ts';
import { publicRecord } from '../boxRecord.ts';

const [folder, boxesPath, mainDir, servedDir, outPath] = process.argv.slice(2);

// Not in the public file: the day and night split, the left out kinds, fire radiative power, the countries, the
// rows of other kinds, and the words that name where the rows were read.
const NOT_IN_FILE = [
  /^records\[\*\]\.raw_counts\.[^.]+\.(day|night|static_excluded|offshore_excluded|volcano_excluded|frp_mw_day|frp_mw_night|frp_mw)$/,
  /^downloaded_firms_rows$/,
  /^summary_metrics\.(static|offshore|volcano)_rows_excluded(\..*)?$/,
  /^provenance$/,
  /^harmonization_method\.(counted_rows|outage_rule|not_in_calendar)$/,
  /^units\.frp_mw$/,
  /^place\.countries(\[\*\])?$/,
  /^cube(\..*)?$/,
  /^public_cube(\..*)?$/,
  /^closed_months(\[\*\])?$/,
];
const notInFile = (p) => NOT_IN_FILE.some((re) => re.test(p));
const norm = (p) => p.replace(/\[\d+\]/g, '[*]');

function compare(a, b, path, acc, skip) {
  const np = norm(path);
  if (notInFile(np) || skip(path)) return;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    acc.leaves += 1;
    if (typeof a === 'number' && typeof b === 'number') {
      const d = Math.abs(a - b);
      const rel = d / Math.max(Math.abs(a), 1e-12);
      const f = (acc.fields[np] ??= { compared: 0, differing: 0, largest_abs: 0, largest_rel: 0, example: null });
      f.compared += 1;
      if (d > 0) {
        f.differing += 1;
        acc.differing += 1;
        if (d > f.largest_abs) {
          f.largest_abs = d;
          f.example = { at: path, route: a, browser: b };
        }
        f.largest_rel = Math.max(f.largest_rel, rel);
      }
    } else if (a !== b) {
      acc.differing += 1;
      const f = (acc.fields[np] ??= { compared: 0, differing: 0, largest_abs: 0, largest_rel: 0, example: null });
      f.compared += 1;
      f.differing += 1;
      f.example ??= { at: path, route: a, browser: b };
    }
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    acc.missing.push(`${path}: one is a list, the other not`);
    return;
  }
  if (Array.isArray(a)) {
    if (a.length !== b.length) acc.missing.push(`${path}: ${a.length} items in the route's, ${b.length} in the browser's`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) compare(a[i], b[i], `${path}[${i}]`, acc, skip);
    return;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const p = path ? `${path}.${k}` : k;
    if (notInFile(norm(p)) || skip(p)) continue;
    if (!(k in a)) acc.missing.push(`${p}: only in the browser's`);
    else if (!(k in b)) acc.missing.push(`${p}: only in the route's`);
    else compare(a[k], b[k], p, acc, skip);
  }
}

const fileFetch = async (url) => {
  const name = String(url).split('/').pop();
  return new Response(readFileSync(join(folder, name)));
};

const t0 = performance.now();
const cube = await loadPublicCube('public/', fileFetch);
const loadMs = performance.now() - t0;
const fitted = JSON.parse(readFileSync(join(folder, 'harmonize-fitted.json'), 'utf8'));
const boxes = JSON.parse(readFileSync(boxesPath, 'utf8'));

const report = {
  what: "a drawn box's Record summed in the browser from the public cube against the cube route's answer, leaf by leaf",
  public_file: cube.manifest.file.sha256,
  cube_build: cube.manifest.source.cube_build,
  unpack_and_index_ms: Math.round(loadMs),
  not_in_the_public_file: NOT_IN_FILE.map(String),
  methods: {},
};

for (const [method, dir, fit] of [['overlap_ratio_v1 (the route on main)', mainDir, null], ['pooled_month_size_v1 (the route with the harmonization call)', servedDir, fitted]]) {
  const per = [];
  const all = { leaves: 0, differing: 0, fields: {}, missing: [] };
  for (const [i, b] of boxes.entries()) {
    const route = JSON.parse(readFileSync(join(dir, `${String(i).padStart(2, '0')}.json`), 'utf8'));
    const t1 = performance.now();
    const mine = publicRecord(cube, b.box, { fitted: fit });
    const ms = performance.now() - t1;
    if (!mine || route.state === 'not_loaded') {
      per.push({ name: b.name, box: b.box, route_state: route.state ?? 'loaded', browser_loaded: !!mine, equal: !mine === (route.state === 'not_loaded'), ms: Math.round(ms) });
      continue;
    }
    const closed = new Set(mine.closed_months);
    // The served method reads the box grown by 2 degrees; where that meets a closed cell, its closed months are
    // unknown in the public file, so its prior sums differ from the route's (which reads them).
    const [gw, gs, ge, gn] = mine.bbox;
    const grown = cube.box(Math.max(-180, gw - 2), Math.max(-90, gs - 2), Math.min(180, ge + 2), Math.min(90, gn + 2));
    const surroundClosed = fit !== null && grown.closedMonths.length > 0;
    const closedYears = new Set([...closed].map((m) => Number(m.slice(0, 4))));
    const recIdx = new Map(route.records.map((r, k) => [k, r.year_month]));
    const annIdx = new Map(route.annual_summary.map((y, k) => [k, y.year]));
    // A box with closed months: compare its months outside them; its whole-record figures are reported apart.
    const whole = /^(harmonization_method|summary_metrics|month_climatology)/;
    const skip = (p) => {
      if (surroundClosed && /^harmonization_method\.fitted_on\.prior_/.test(p)) return true;
      if (!closed.size) return false;
      let m = /^records\[(\d+)\]/.exec(p);
      if (m && closed.has(recIdx.get(Number(m[1])))) return true;
      if (m && /^records\[\d+\]\.(harmonized_|month_median|anomaly|month_rank|month_years)/.test(p)) return true;
      m = /^annual_summary\[(\d+)\]/.exec(p);
      if (m && (closedYears.has(annIdx.get(Number(m[1]))) || /harmonized/.test(p))) return true;
      return whole.test(p) || /^regime_markers|extreme_fire_years/.test(p);
    };
    const acc = { leaves: 0, differing: 0, fields: {}, missing: [] };
    compare(route, mine, '', acc, skip);
    let apart = null;
    if (closed.size) {
      let rel = 0;
      route.records.forEach((r, k) => {
        const m = mine.records[k];
        if (closed.has(r.year_month) || r.harmonized_mean === null || m.harmonized_mean === null) return;
        rel = Math.max(rel, Math.abs(m.harmonized_mean - r.harmonized_mean) / Math.max(Math.abs(r.harmonized_mean), 1e-12));
      });
      apart = {
        closed_months: closed.size,
        overlap_ratio_route: route.summary_metrics.viirs_to_modis_overlap_ratio,
        overlap_ratio_browser: mine.summary_metrics.viirs_to_modis_overlap_ratio,
        largest_relative_difference_of_a_harmonized_month_outside_them: Number(rel.toFixed(4)),
        why: 'the closed months are no data in the public file, so they leave its fit and its surroundings; the cube route keeps them',
      };
    }
    let surround = null;
    if (surroundClosed) {
      const f = (x) => x.harmonization_method.fitted_on;
      surround = {
        closed_months_in_the_surroundings: grown.closedMonths.length,
        prior_suomi_npp: { route: f(route).prior_suomi_npp, browser: f(mine).prior_suomi_npp },
        prior_modis: { route: f(route).prior_modis, browser: f(mine).prior_modis },
        why: 'the box grown by 2 degrees meets a closed cell: its closed months are unknown in the public file and leave the prior sums',
      };
    }
    per.push({
      name: b.name,
      box: b.box,
      grid_box: mine.bbox,
      ms: Math.round(ms),
      leaves_compared: acc.leaves,
      leaves_differing: acc.differing,
      largest_abs: Math.max(0, ...Object.values(acc.fields).map((f) => f.largest_abs)),
      fields_differing: Object.fromEntries(Object.entries(acc.fields).filter(([, f]) => f.differing)),
      structure: acc.missing,
      closed: apart,
      surroundings_meet_closed_cells: surround,
    });
    all.leaves += acc.leaves;
    all.differing += acc.differing;
    for (const [k, f] of Object.entries(acc.fields)) {
      const g = (all.fields[k] ??= { compared: 0, differing: 0, largest_abs: 0, largest_rel: 0, example: null });
      g.compared += f.compared;
      g.differing += f.differing;
      if (f.largest_abs > g.largest_abs || (f.differing && !g.example)) {
        g.largest_abs = Math.max(g.largest_abs, f.largest_abs);
        g.example = f.example ? { box: b.name, ...f.example } : g.example;
      }
      g.largest_rel = Math.max(g.largest_rel, f.largest_rel);
    }
    all.missing.push(...acc.missing.map((m) => `${b.name}: ${m}`));
  }
  report.methods[method] = {
    boxes: per.length,
    leaves_compared: all.leaves,
    leaves_differing: all.differing,
    largest_abs_difference: Math.max(0, ...Object.values(all.fields).map((f) => f.largest_abs)),
    fields_differing: Object.fromEntries(Object.entries(all.fields).filter(([, f]) => f.differing)),
    structure: all.missing,
    per_box: per,
  };
}

writeFileSync(outPath, JSON.stringify(report, null, 1));
for (const [m, r] of Object.entries(report.methods)) {
  console.log(m, '| leaves', r.leaves_compared, '| differing', r.leaves_differing, '| largest', r.largest_abs_difference, '| fields', Object.keys(r.fields_differing).join(', ') || 'none', '| structure', r.structure.length);
}
