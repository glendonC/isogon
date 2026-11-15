import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildHallImpulseSamples,
  buildPinkNoiseSamples,
  buildSchroederCoefficients,
  mulberry32,
} from './dsp.ts';
import {
  __resetAudioForTest,
  isSoundOn,
  playCue,
  setSound,
  subscribeSound,
  toggleSound,
} from './engine.ts';

function withMockWindow(fn) {
  const prevWindow = globalThis.window;
  const store = new Map();
  const state = { constructed: 0, store };

  class FakeParam {
    value = 0;
    setValueAtTime() {}
    setTargetAtTime() {}
    linearRampToValueAtTime() {}
    exponentialRampToValueAtTime() {}
    cancelScheduledValues() {}
  }

  class FakeNode {
    gain = new FakeParam();
    frequency = new FakeParam();
    detune = new FakeParam();
    Q = new FakeParam();
    type = 'sine';
    loop = false;
    buffer = null;
    curve = null;
    oversample = 'none';
    connect() {}
    setPeriodicWave() {}
    start() {}
    stop() {}
  }

  class FakeAudioContext {
    sampleRate = 8000;
    currentTime = 0;
    state = 'running';
    destination = new FakeNode();
    constructor() {
      state.constructed += 1;
    }
    createGain() {
      return new FakeNode();
    }
    createWaveShaper() {
      return new FakeNode();
    }
    createConvolver() {
      return new FakeNode();
    }
    createBiquadFilter() {
      return new FakeNode();
    }
    createOscillator() {
      return new FakeNode();
    }
    createBufferSource() {
      return new FakeNode();
    }
    createPeriodicWave() {
      return {};
    }
    createBuffer(channels, length) {
      const ch = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        copyToChannel(src, index) {
          ch[index].set(src);
        },
      };
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    suspend() {
      this.state = 'suspended';
      return Promise.resolve();
    }
  }

  const listeners = new Map();
  globalThis.window = {
    AudioContext: FakeAudioContext,
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, v);
      },
    },
    addEventListener: (type, cb) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(cb);
    },
    removeEventListener: (type, cb) => {
      listeners.get(type)?.delete(cb);
    },
  };

  try {
    __resetAudioForTest();
    fn(state);
  } finally {
    __resetAudioForTest();
    if (prevWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = prevWindow;
    }
  }
}

test('sound starts off and never creates an AudioContext before the visitor enables it', () => {
  withMockWindow((state) => {
    assert.equal(isSoundOn(), false);
    playCue('reveal');
    playCue('look');
    playCue('step');
    assert.equal(state.constructed, 0);

    const seen = [];
    const off = subscribeSound((on) => seen.push(on));

    setSound(true);
    assert.equal(isSoundOn(), true);
    assert.equal(state.store.get('isogon:sound'), 'on');
    assert.equal(state.constructed, 1);

    playCue('reveal');
    playCue('look');
    playCue('step');

    toggleSound();
    assert.equal(isSoundOn(), false);
    assert.equal(state.store.get('isogon:sound'), 'off');
    assert.deepEqual(seen, [true, false]);
    off();
  });
});

test('a remembered on preference still creates no AudioContext on cold load before a gesture', () => {
  withMockWindow((state) => {
    state.store.set('isogon:sound', 'on');
    __resetAudioForTest();
    assert.equal(isSoundOn(), true);
    assert.equal(state.constructed, 0);
    playCue('reveal');
    assert.equal(state.constructed, 0);
  });
});

test('procedural DSP generators are deterministic and bounded', () => {
  const r1 = mulberry32(42);
  const r2 = mulberry32(42);
  assert.equal(r1(), r2());
  assert.equal(r1(), r2());

  const pinkA = buildPinkNoiseSamples(8192, 0x2c91f0d);
  const pinkB = buildPinkNoiseSamples(8192, 0x2c91f0d);
  assert.deepEqual(pinkA, pinkB);
  for (let i = 0; i < pinkA.length; i += 1) {
    assert.ok(Math.abs(pinkA[i]) <= 1, 'pink noise stays within [-1, 1]');
  }

  const [irL, irR] = buildHallImpulseSamples(8000, 0.5, 2.5, 0x51a7e21);
  assert.equal(irL.length, 4000);
  assert.equal(irR.length, 4000);
  assert.notDeepEqual(irL, irR);

  const coeffs = buildSchroederCoefficients([1, 0.5, 0.25]);
  assert.equal(coeffs.real.length, 4);
  assert.equal(coeffs.imag.length, 4);
});
