// Deterministic procedural DSP helpers for the atmospheric audio bed and cues.
// Pure synthesis: zero external audio files, repeatable across sessions.

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Harmonic coefficients using Schroeder phase distribution so the resulting periodic
 * waveform keeps a flat crest factor without harsh transient peaks.
 */
export function buildSchroederCoefficients(amplitudes: readonly number[]): {
  real: Float32Array<ArrayBuffer>;
  imag: Float32Array<ArrayBuffer>;
} {
  const n = amplitudes.length;
  const real = new Float32Array(n + 1);
  const imag = new Float32Array(n + 1);
  if (n === 0) return { real, imag };
  for (let k = 1; k <= n; k += 1) {
    const amp = amplitudes[k - 1] ?? 0;
    const phase = (-Math.PI * k * (k - 1)) / n;
    real[k] = amp * Math.cos(phase);
    imag[k] = amp * Math.sin(phase);
  }
  return { real, imag };
}

/**
 * Generates a seamless loop of Paul Kellet 7-pole pink noise with an equal-power
 * crossfade across the loop boundary so repeat playback has no seam click.
 */
export function buildPinkNoiseSamples(length: number, seed: number): Float32Array<ArrayBuffer> {
  const fade = Math.min(4096, Math.floor(length / 8));
  const total = length + fade;
  const raw = new Float32Array(total);
  const rand = mulberry32(seed);

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;

  for (let i = 0; i < total; i += 1) {
    const white = rand() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const sample = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
    raw[i] = Math.max(-0.95, Math.min(0.95, sample));
  }

  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    if (i < fade) {
      const t = i / fade;
      const gIn = Math.sin(t * Math.PI * 0.5);
      const gTail = Math.cos(t * Math.PI * 0.5);
      out[i] = raw[i] * gIn + raw[length + i] * gTail;
    } else {
      out[i] = raw[i];
    }
  }
  return out;
}

/**
 * Generates a decorrelated stereo impulse response with gentle high-frequency damping
 * for quiet open-air space around cues and the ambient bed.
 */
export function buildHallImpulseSamples(
  sampleRate: number,
  seconds: number,
  decay: number,
  seed: number,
): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const length = Math.max(256, Math.floor(sampleRate * seconds));
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const randL = mulberry32(seed);
  const randR = mulberry32(seed ^ 0x9e3779b9);

  let lpL = 0;
  let lpR = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / length;
    const env = Math.pow(1 - t, decay) * Math.min(1, i / (sampleRate * 0.012));
    const damp = 0.24 + 0.56 * (1 - t);
    const wL = randL() * 2 - 1;
    const wR = randR() * 2 - 1;
    lpL += damp * (wL - lpL);
    lpR += damp * (wR - lpR);
    left[i] = lpL * env * 0.35;
    right[i] = lpR * env * 0.35;
  }
  return [left, right];
}

export function buildSoftClipCurve(samples = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(samples);
  const norm = Math.tanh(1.6);
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = Math.tanh(x * 1.6) / norm;
  }
  return curve;
}
