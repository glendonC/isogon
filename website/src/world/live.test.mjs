// Run with: npm test. The sealed board says when most of the fires scored lie close together: one weather on one day,
// so they are not separate tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closeGroup, kmBetween } from './live.ts';

test('kilometres between two points', () => {
  assert.ok(Math.abs(kmBetween([0, 0], [1, 0]) - 111.2) < 0.5);
  assert.equal(kmBetween([124, -16], [124, -16]), 0);
});

test("tonight's scored fires: five in the Kimberley together, one in Brazil apart", () => {
  const fires = [
    { id: 'c0f02', centre: [124.84826, -15.43519] },
    { id: 'c0f03', centre: [-46.06666, -4.23129] },
    { id: 'c0f05', centre: [124.27178, -16.94074] },
    { id: 'c0f07', centre: [122.58125, -19.16458] },
    { id: 'c0f09', centre: [124.39602, -18.26862] },
    { id: 'c0f11', centre: [124.03599, -16.47018] },
  ];
  assert.deepEqual(closeGroup(fires).map((f) => f.id).sort(), ['c0f02', 'c0f05', 'c0f07', 'c0f09', 'c0f11']);
});

test('no group is said where the fires lie apart, or where a group is not most of them', () => {
  assert.equal(closeGroup([{ centre: [0, 0] }, { centre: [40, 0] }, { centre: [80, 0] }]), null);
  assert.equal(closeGroup([{ centre: [0, 0] }, { centre: [1, 0] }, { centre: [2, 0] }, { centre: [60, 0] }, { centre: [90, 0] }, { centre: [120, 0] }]), null);
});
