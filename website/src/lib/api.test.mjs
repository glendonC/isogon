import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getJson } from './api.ts';

test('concurrent getJson calls for the same route share one fetch and clear after settling', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let release = () => {};
  globalThis.fetch = async () => {
    calls += 1;
    const callNum = calls;
    await new Promise((r) => {
      release = r;
    });
    return new Response(JSON.stringify({ ok: true, callNum }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const a = getJson('/api/regions', { b: 2, a: 1 });
    const b = getJson('/api/regions', { a: 1, b: 2 });
    assert.equal(calls, 1);
    release();
    const [resA, resB] = await Promise.all([a, b]);
    assert.deepEqual(resA, { ok: true, callNum: 1 });
    assert.deepEqual(resB, { ok: true, callNum: 1 });

    // Once settled, a subsequent request performs a fresh fetch
    const cPromise = getJson('/api/regions', { a: 1, b: 2 });
    assert.equal(calls, 2);
    release();
    const resC = await cPromise;
    assert.deepEqual(resC, { ok: true, callNum: 2 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('aborting one subscriber keeps a shared getJson fetch alive for remaining subscribers', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let underlyingAborted = false;
  let release = () => {};
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    init?.signal?.addEventListener('abort', () => {
      underlyingAborted = true;
    });
    await new Promise((r) => {
      release = r;
    });
    return new Response(JSON.stringify({ shared: true }), { status: 200 });
  };

  try {
    const ctrl1 = new AbortController();
    const ctrl2 = new AbortController();
    const p1 = getJson('/api/calendar', { region_id: 'plumas_ca', source: 'firms' }, { signal: ctrl1.signal });
    const p2 = getJson('/api/calendar', { source: 'firms', region_id: 'plumas_ca' }, { signal: ctrl2.signal });
    assert.equal(calls, 1);

    ctrl1.abort();
    await assert.rejects(p1);
    assert.equal(underlyingAborted, false);

    release();
    const res2 = await p2;
    assert.deepEqual(res2, { shared: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('aborting the only subscriber cancels the underlying fetch and allows immediate retry', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const abortedCalls = [];
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    const id = calls;
    return new Promise((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        abortedCalls.push(id);
        reject(new DOMException('Aborted', 'AbortError'));
      });
      if (id === 2) {
        resolve(new Response(JSON.stringify({ retry: id }), { status: 200 }));
      }
    });
  };

  try {
    const ctrl = new AbortController();
    const p1 = getJson('/api/evidence', undefined, { signal: ctrl.signal });
    assert.equal(calls, 1);
    ctrl.abort();
    await assert.rejects(p1);
    assert.deepEqual(abortedCalls, [1]);

    const res2 = await getJson('/api/evidence');
    assert.equal(calls, 2);
    assert.deepEqual(res2, { retry: 2 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
