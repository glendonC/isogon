// Run with: npm test. The terrain's flat grid, filled into typed arrays, is the same mesh as three.js's
// plane turned flat.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { flatGridArrays } from './flatGrid.ts';

test('the flat grid is the plane turned a quarter turn about x', () => {
  for (const n of [1, 3, 8]) {
    const plane = new THREE.PlaneGeometry(1, 1, n, n);
    plane.rotateX(-Math.PI / 2);
    const grid = flatGridArrays(n);
    const close = (a, b, what) => {
      assert.equal(a.length, b.length, `${what} length at ${n}`);
      for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-6, `${what}[${i}] at ${n}: ${a[i]} vs ${b[i]}`);
    };
    close(grid.position, plane.getAttribute('position').array, 'position');
    close(grid.normal, plane.getAttribute('normal').array, 'normal');
    close(grid.uv, plane.getAttribute('uv').array, 'uv');
    assert.deepEqual(Array.from(grid.index), Array.from(plane.getIndex().array), `index at ${n}`);
  }
});
