// Run with: npm test. The names on the Earth: each clear of every other name and mark, a shorter form before a name is
// left out, and a name placed first giving way to its shorter form so the next is drawn too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeLabels } from './labels.ts';

// Outside a browser a label is measured at 7 px a letter.
const leaderOf = (l) => ({ left: Math.min(l.from[0], l.to[0]), top: Math.min(l.from[1], l.to[1]), width: Math.abs(l.to[0] - l.from[0]), height: Math.abs(l.to[1] - l.from[1]) });
const touch = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

test('a name with no room takes its shorter form before it is left out', () => {
  const items = [
    { id: 'a', x: 100, y: 100, text: 'A'.repeat(30), alts: ['A short'], rank: 0 },
    { id: 'u', x: 200, y: 100, text: 'U', rank: 1 },
  ];
  const [a] = placeLabels(items, 600, 400);
  assert.equal(a.shown, true);
  assert.equal(a.text, 'A short');
});

test('a name placed first gives way to its shorter form so the next name is drawn too', () => {
  // A strip too low for a name above or below a mark: only right and left.
  const items = [
    { id: 'a', x: 60, y: 30, text: 'A'.repeat(20), alts: ['Ab'], rank: 0 },
    { id: 'u', x: 250, y: 30, text: 'U'.repeat(10), rank: 1 },
    { id: 'c', x: 300, y: 30, text: 'C', rank: 2 },
  ];
  const [a, u, c] = placeLabels(items, 400, 60);
  assert.deepEqual([a.shown, u.shown, c.shown], [true, true, true]);
  assert.equal(a.text, 'Ab');
  assert.equal(u.text, 'U'.repeat(10));
});

test('no drawn name touches another name, another mark or a leader', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let round = 0; round < 60; round++) {
    const items = Array.from({ length: 40 }, (_, i) => ({
      id: `m${i}`,
      x: 20 + rand() * 560,
      y: 20 + rand() * 360,
      text: `Place ${'x'.repeat(Math.floor(rand() * 20))} & More ${2000 + i}`,
      alts: [`Place ${2000 + i}`],
      rank: i,
    }));
    const out = placeLabels(items, 600, 400, { clearLeaders: true });
    const shown = out.filter((l) => l.shown);
    assert.ok(shown.length > 0);
    for (const [i, l] of shown.entries()) {
      for (const k of shown.slice(i + 1)) assert.ok(!touch(l, k), `${l.id} touches ${k.id}`);
      for (const m of items) if (m.id !== l.id) assert.ok(!touch(l, { left: m.x - 7, top: m.y - 7, width: 14, height: 14 }), `${l.id} touches the mark of ${m.id}`);
      for (const k of shown) if (k !== l) assert.ok(!touch(l, leaderOf(k)), `${l.id} stands on the leader of ${k.id}`);
      for (const m of items) if (m.id !== l.id) assert.ok(!touch(leaderOf(l), { left: m.x - 7, top: m.y - 7, width: 14, height: 14 }), `the leader of ${l.id} crosses the mark of ${m.id}`);
    }
  }
});

test('a name\'s leader crosses no other mark', () => {
  // A low strip at the map's left edge: the only free place for a's name is far out on the right, past b's mark, and
  // a leader there would cross it; so a's name is left out (its mark stays).
  const items = [
    { id: 'a', x: 40, y: 30, text: 'Aaaa', rank: 0 },
    { id: 'b', x: 62, y: 30, text: 'B', rank: 1 },
  ];
  const [a, b] = placeLabels(items, 400, 60, { clearLeaders: true });
  assert.equal(a.shown, false);
  assert.equal(b.shown, true);
});
