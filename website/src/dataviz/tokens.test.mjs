import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COLOR, MOTION, TYPE, classOf, countTo, shareBreaks } from './tokens.ts';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = ([r, g, b]) => {
  const f = (c) => ((c / 255) <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test('the colours are the identity agreed: ground, ink, MODIS orange, VIIRS blue, the estimate white', () => {
  assert.equal(COLOR.ground, '#05070c');
  assert.equal(COLOR.modis, '#ff7a45');
  assert.equal(COLOR.viirs, '#8fd6f5');
  assert.equal(COLOR.estimate, COLOR.ink);
  assert.equal(COLOR.ui, '#9fe3ff', 'one pale cyan for the interface');
  for (const k of ['modis', 'viirs', 'estimate']) assert.notEqual(COLOR[k], COLOR.ui, `${k} is not the interface colour`);
  for (const k of ['modis', 'viirs', 'ink']) assert.ok(contrast(rgb(COLOR[k]), rgb(COLOR.ground)) >= 4.5, `${k} reads on the ground`);
  const css = readFileSync(new URL('./dataviz.css', import.meta.url), 'utf8');
  for (const name of ['--id-modis', '--id-viirs', '--id-estimate', '--id-ground', '--id-ink', '--id-line']) assert.ok(css.includes(name), `reads ${name}`);
  assert.ok(css.includes(COLOR.modis) && css.includes(COLOR.viirs), 'the same fallbacks');
});

test('share breaks put an equal share of the values with fire in each step', () => {
  const values = [0, ...Array.from({ length: 800 }, (_, i) => (i + 1) ** 2)];
  const breaks = shareBreaks(values, 8);
  assert.equal(breaks.length, 7);
  const counts = new Array(8).fill(0);
  for (const v of values.slice(1)) counts[classOf(v, breaks)] += 1;
  for (const c of counts) assert.equal(c, 100);
  assert.deepEqual(shareBreaks([0, 0], 8), []);
});

test('nothing a visitor reads is under 16 px, no rounded corner, nothing fades', () => {
  assert.ok(TYPE.min >= 16 && TYPE.label >= 16 && TYPE.title >= 16 && TYPE.readout >= 16 && TYPE.action >= 16);
  const css = readFileSync(new URL('./dataviz.css', import.meta.url), 'utf8');
  for (const m of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 16, `font-size ${m[1]}px`);
  for (const m of css.matchAll(/border-radius:\s*([^;]+);/g)) assert.equal(m[1].trim(), '0');
  assert.doesNotMatch(css, /opacity\s*:/);
  assert.doesNotMatch(css, /\.dv-readout[^}]*(background|border)\s*:/, 'the readout has no box');
});

test('a figure counts to its value once and stays there', () => {
  assert.equal(countTo(36.9, 0), 0);
  assert.equal(countTo(36.9, MOTION.countMs), 36.9);
  assert.equal(countTo(36.9, MOTION.countMs * 4), 36.9);
  let last = 0;
  for (let t = 20; t < MOTION.countMs; t += 20) {
    const v = countTo(36.9, t);
    assert.ok(v >= last && v <= 36.9);
    last = v;
  }
});
