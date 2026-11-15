// Run with: npm test. The stage's named error for a browser that cannot draw the 3D picture, which the
// page's boundary recognises by name.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasWebGL2, isStageWebGLError, StageWebGLError, STAGE_WEBGL_ERROR } from './stageErrors.ts';

test('the stage names its WebGL error and says why', () => {
  const missing = new StageWebGLError('unavailable');
  assert.equal(missing.name, STAGE_WEBGL_ERROR);
  assert.equal(missing.reason, 'unavailable');
  assert.ok(missing instanceof Error);
  const cause = new Error('context creation failed');
  const failed = new StageWebGLError('failed', cause);
  assert.equal(failed.reason, 'failed');
  assert.equal(failed.cause, cause);
});

test('the error is recognised by its name, and nothing else is', () => {
  assert.equal(isStageWebGLError(new StageWebGLError('unavailable')), true);
  // (a copy of the class from another chunk: the same name is enough)
  const elsewhere = new Error('no WebGL2');
  elsewhere.name = STAGE_WEBGL_ERROR;
  assert.equal(isStageWebGLError(elsewhere), true);
  assert.equal(isStageWebGLError(new Error('a shader failed')), false);
  assert.equal(isStageWebGLError(new TypeError('x is undefined')), false);
  assert.equal(isStageWebGLError({ name: STAGE_WEBGL_ERROR }), false);
  assert.equal(isStageWebGLError(null), false);
});

test('WebGL2 is there only when a canvas gives a context', () => {
  const doc = (getContext) => ({ createElement: () => ({ getContext }) });
  assert.equal(hasWebGL2(doc(() => null)), false);
  assert.equal(hasWebGL2(doc(() => { throw new Error('blocked'); })), false);
  let released = false;
  const gl = { getExtension: () => ({ loseContext: () => { released = true; } }) };
  assert.equal(hasWebGL2(doc((kind) => (kind === 'webgl2' ? gl : null))), true);
  assert.equal(released, true, 'the throwaway context is released');
});
