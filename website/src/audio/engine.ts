import {
  buildHallImpulseSamples,
  buildPinkNoiseSamples,
  buildSchroederCoefficients,
  buildSoftClipCurve,
} from './dsp.ts';

/**
 * Atmosphere cues. Sound never encodes a measurement: pitch and loudness are fixed per cue.
 * - reveal: hidden detections shown on the stage
 * - look: a look taken on a square in Play
 * - step: moving from one step of the workspace to another
 */
export type SoundCue = 'reveal' | 'look' | 'step';

const STORAGE_KEY = 'isogon:sound';
const MASTER_TARGET = 0.18;

interface AudioGraph {
  ctx: AudioContext;
  master: GainNode;
  dryBus: GainNode;
  reverbSend: GainNode;
}

const VALID_CUES: ReadonlySet<string> = new Set<SoundCue>(['reveal', 'look', 'step']);

let initialized = false;
let enabled = false;
let graph: AudioGraph | null = null;
let unlockDisposer: (() => void) | null = null;
let visibilityBound = false;
let suspendTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(on: boolean) => void>();

function readStoredPreference(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    return window.localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function writeStoredPreference(on: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Ignore private-mode storage failures.
  }
}

function notify(): void {
  for (const fn of listeners) {
    try {
      fn(enabled);
    } catch {
      // Isolate listener errors.
    }
  }
}

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function clearUnlockListeners(): void {
  if (unlockDisposer) {
    unlockDisposer();
    unlockDisposer = null;
  }
}

function clearSuspendTimer(): void {
  if (suspendTimer !== null) {
    clearTimeout(suspendTimer);
    suspendTimer = null;
  }
}

function bindVisibilityHandler(): void {
  if (visibilityBound || typeof document === 'undefined') return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (!graph) return;
    const now = graph.ctx.currentTime;
    if (document.visibilityState === 'hidden') {
      graph.master.gain.cancelScheduledValues(now);
      graph.master.gain.setTargetAtTime(0, now, 0.08);
    } else if (enabled && graph.ctx.state === 'running') {
      graph.master.gain.cancelScheduledValues(now);
      graph.master.gain.setTargetAtTime(MASTER_TARGET, now, 0.28);
    }
  });
}

function buildGraph(): AudioGraph | null {
  if (graph) return graph;
  const Ctor = getAudioContextConstructor();
  if (!Ctor) return null;

  let ctx: AudioContext;
  try {
    ctx = new Ctor({ latencyHint: 'playback' });
  } catch {
    return null;
  }

  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);

  const shaper = ctx.createWaveShaper();
  shaper.curve = buildSoftClipCurve(1024);
  shaper.oversample = '2x';

  const dryBus = ctx.createGain();
  dryBus.gain.value = 0.88;

  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.34;

  const convolver = ctx.createConvolver();
  const [irL, irR] = buildHallImpulseSamples(ctx.sampleRate, 2.2, 2.8, 0x51a7e21);
  const irBuffer = ctx.createBuffer(2, irL.length, ctx.sampleRate);
  irBuffer.copyToChannel(irL, 0);
  irBuffer.copyToChannel(irR, 1);
  convolver.buffer = irBuffer;

  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.52;

  dryBus.connect(shaper);
  reverbSend.connect(convolver);
  convolver.connect(reverbReturn);
  reverbReturn.connect(shaper);
  shaper.connect(master);
  master.connect(ctx.destination);

  // Low ambient bed: Schroeder harmonic drone + filtered night-air pink noise.
  const coeffs = buildSchroederCoefficients([1.0, 0.42, 0.18, 0.08, 0.03]);
  const wave = ctx.createPeriodicWave(coeffs.real, coeffs.imag, { disableNormalization: false });

  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 210;
  padFilter.Q.value = 0.65;

  const padGain = ctx.createGain();
  padGain.gain.value = 0.22;

  const oscRoot = ctx.createOscillator();
  oscRoot.setPeriodicWave(wave);
  oscRoot.frequency.value = 55; // A1

  const oscFifth = ctx.createOscillator();
  oscFifth.type = 'sine';
  oscFifth.frequency.value = 82.407; // E2
  oscFifth.detune.value = -3;

  const fifthGain = ctx.createGain();
  fifthGain.gain.value = 0.38;

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.052;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 28;
  lfo.connect(lfoDepth);
  lfoDepth.connect(padFilter.frequency);

  oscRoot.connect(padFilter);
  oscFifth.connect(fifthGain);
  fifthGain.connect(padFilter);
  padFilter.connect(padGain);
  padGain.connect(dryBus);
  padGain.connect(reverbSend);

  // Seamless pink-noise air bed.
  const airSamples = buildPinkNoiseSamples(Math.floor(ctx.sampleRate * 4), 0x2c91f0d);
  const airBuffer = ctx.createBuffer(1, airSamples.length, ctx.sampleRate);
  airBuffer.copyToChannel(airSamples, 0);

  const airSource = ctx.createBufferSource();
  airSource.buffer = airBuffer;
  airSource.loop = true;

  const airHighpass = ctx.createBiquadFilter();
  airHighpass.type = 'highpass';
  airHighpass.frequency.value = 70;

  const airLowpass = ctx.createBiquadFilter();
  airLowpass.type = 'lowpass';
  airLowpass.frequency.value = 390;

  const airGain = ctx.createGain();
  airGain.gain.value = 0.14;

  airSource.connect(airHighpass);
  airHighpass.connect(airLowpass);
  airLowpass.connect(airGain);
  airGain.connect(dryBus);
  airGain.connect(reverbSend);

  const startAt = ctx.currentTime;
  oscRoot.start(startAt);
  oscFifth.start(startAt);
  lfo.start(startAt);
  airSource.start(startAt);

  bindVisibilityHandler();

  graph = { ctx, master, dryBus, reverbSend };
  return graph;
}

function startOrResumeGraph(): void {
  clearSuspendTimer();
  const g = buildGraph();
  if (!g) return;
  if (g.ctx.state === 'suspended') {
    void g.ctx.resume().catch(() => undefined);
  }
  const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
  const now = g.ctx.currentTime;
  g.master.gain.cancelScheduledValues(now);
  g.master.gain.setTargetAtTime(visible ? MASTER_TARGET : 0, now, 0.28);
}

function armGestureUnlock(): void {
  if (unlockDisposer || typeof window === 'undefined') return;
  const unlock = () => {
    clearUnlockListeners();
    if (enabled) {
      startOrResumeGraph();
    }
  };
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('keydown', unlock, { capture: true, passive: true });
  unlockDisposer = () => {
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
}

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  enabled = readStoredPreference();
  // Never construct an AudioContext on page load before a gesture.
  if (enabled) {
    armGestureUnlock();
  }
}

export function isSoundOn(): boolean {
  ensureInitialized();
  return enabled;
}

export function setSound(on: boolean): void {
  ensureInitialized();
  const next = Boolean(on);
  const changed = enabled !== next;
  enabled = next;
  writeStoredPreference(enabled);

  if (enabled) {
    clearUnlockListeners();
    startOrResumeGraph();
  } else {
    clearUnlockListeners();
    clearSuspendTimer();
    if (graph) {
      const g = graph;
      const now = g.ctx.currentTime;
      g.master.gain.cancelScheduledValues(now);
      g.master.gain.setTargetAtTime(0, now, 0.07);
      suspendTimer = setTimeout(() => {
        suspendTimer = null;
        if (!enabled && g.ctx.state === 'running') {
          void g.ctx.suspend().catch(() => undefined);
        }
      }, 320);
    }
  }

  if (changed) notify();
}

export function toggleSound(): boolean {
  const next = !isSoundOn();
  setSound(next);
  return next;
}

export function subscribeSound(listener: (on: boolean) => void): () => void {
  ensureInitialized();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function playCue(cue: SoundCue): void {
  ensureInitialized();
  if (!enabled || !VALID_CUES.has(cue)) return;
  if (!graph || graph.ctx.state !== 'running') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

  const { ctx, dryBus, reverbSend } = graph;
  const now = ctx.currentTime;

  if (cue === 'reveal') {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(860, now);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.24, now + 0.036);
    env.gain.exponentialRampToValueAtTime(0.0008, now + 0.68);

    const low = ctx.createOscillator();
    low.type = 'sine';
    low.frequency.setValueAtTime(220, now);

    const high = ctx.createOscillator();
    high.type = 'triangle';
    high.frequency.setValueAtTime(329.628, now);

    const highMix = ctx.createGain();
    highMix.gain.value = 0.42;

    low.connect(filter);
    high.connect(highMix);
    highMix.connect(filter);
    filter.connect(env);
    env.connect(dryBus);
    env.connect(reverbSend);

    low.start(now);
    high.start(now);
    low.stop(now + 0.72);
    high.stop(now + 0.72);
    return;
  }

  if (cue === 'look') {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(980, now);
    filter.Q.setValueAtTime(2.2, now);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.2, now + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0008, now + 0.145);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.14);

    osc.connect(filter);
    filter.connect(env);
    env.connect(dryBus);
    env.connect(reverbSend);

    osc.start(now);
    osc.stop(now + 0.16);
    return;
  }

  if (cue === 'step') {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(520, now);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.16, now + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0008, now + 0.095);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(196, now);
    osc.frequency.exponentialRampToValueAtTime(164.81, now + 0.09);

    osc.connect(filter);
    filter.connect(env);
    env.connect(dryBus);

    osc.start(now);
    osc.stop(now + 0.11);
  }
}

/** Test-only reset hook so unit tests can verify cold-load and storage transitions cleanly. */
export function __resetAudioForTest(): void {
  clearUnlockListeners();
  clearSuspendTimer();
  initialized = false;
  enabled = false;
  graph = null;
  listeners.clear();
}
