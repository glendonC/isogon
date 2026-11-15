import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const here = new URL('.', import.meta.url);
const skin = readFileSync(new URL('./sheet.css', here), 'utf8');
const frame = readFileSync(new URL('../components/BlindScoreTable.tsx', here), 'utf8');

test('every class of the shared viewer frame is styled by the sheets skin', () => {
  const used = new Set();
  for (const m of frame.matchAll(/iso-viewer[a-z0-9_-]*/g)) used.add(m[0]);
  assert.ok(used.size >= 8, `the frame still uses its classes (${[...used].join(', ')})`);
  const missing = [...used].filter((c) => !new RegExp(`\\.${c}(?![a-z0-9_-])`).test(skin));
  assert.deepEqual(missing, []);
});

test('the skin keeps the house rules: square corners, no printed key letter', () => {
  for (const m of skin.matchAll(/border-radius:\s*([^;]+);/g)) assert.equal(m[1].trim(), '0');
  assert.match(skin, /\.iso-viewer kbd\s*{\s*display: none;/);
});
