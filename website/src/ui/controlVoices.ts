import { isSoundOn, subscribeSound } from '../audio';
import type { ControlSound } from '../identity/controlState';

/**
 * The controls' two voices, one for each satellite's grid: the coarse one (1 km) low, the sharp one (375 m) higher by
 * the ratio of the two grids (1000 / 375). Hover is a short tick in the coarse voice, a press a click in the sharp
 * voice. Made in the browser with no files, on the page's one switch for sound (audio/engine.ts): silent until the
 * visitor turns sound on. Sound never encodes a measurement: each voice has one fixed pitch and loudness.
 */
const COARSE_HZ = 330;
const SHARP_HZ = COARSE_HZ * (1000 / 375);

let ctx: AudioContext | null = null;
let armed = false;
let lastHover = 0;

function contextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Make or resume the context while sound is on; called from a key or a click, as browsers ask. */
function wake(): void {
  if (!isSoundOn()) return;
  if (!ctx) {
    const Ctor = contextConstructor();
    if (!Ctor) return;
    try {
      ctx = new Ctor();
    } catch {
      return;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
}

/** Once, where the page starts. */
export function armControlVoices(): void {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  window.addEventListener('pointerdown', wake, { capture: true, passive: true });
  window.addEventListener('keydown', wake, { capture: true, passive: true });
  subscribeSound((on) => {
    if (on) wake();
    else if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
  });
}

function voice(freq: number, dur: number, gain: number, type: OscillatorType): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.003);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** The identity's sound hook (identity/controlState.ts, setControlSound). */
export function controlVoice(sound: ControlSound): void {
  if (!isSoundOn() || !ctx || ctx.state !== 'running') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (sound === 'hover') {
    const now = performance.now();
    if (now - lastHover < 45) return;
    lastHover = now;
    voice(COARSE_HZ, 0.03, 0.035, 'sine');
  } else {
    voice(SHARP_HZ, 0.05, 0.05, 'triangle');
  }
}
