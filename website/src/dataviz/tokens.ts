/**
 * Tokens for the displays of data, for drawing in SVG and canvas.
 *
 * The source of truth is `website/src/identity/identity.css` (`--id-modis`, `--id-viirs`, `--id-estimate`,
 * `--id-ground`, `--id-ink`, `--id-ink-2`, `--id-ink-3`, `--id-line`); these hex values are the same, and
 * `dataviz.css` reads the identity's variables first. Colour is only for data: orange is MODIS fire, light blue is
 * VIIRS fire, a white outline is the estimate, a hatch is VIIRS hidden. Controls and text are white and grey.
 * Plain erasable TypeScript, so the tests import it directly.
 */

export const COLOR = {
  ground: '#05070c',
  ink: '#f4f6f9',
  ink2: 'rgba(244, 246, 249, 0.7)',
  ink3: 'rgba(244, 246, 249, 0.4)',
  line: 'rgba(244, 246, 249, 0.18)',
  /** MODIS fire. */
  modis: '#ff7a45',
  /** VIIRS fire. */
  viirs: '#8fd6f5',
  /** The estimate: a white outline. */
  estimate: '#f4f6f9',
  /** A reference that is not one of the models drawn (MODIS alone as a method, in a comparison). */
  reference: '#8a8f99',
} as const;

/** The same colours as CSS variables, for SVG attributes. */
export const CSS = {
  ground: 'var(--dv-ground)',
  ink: 'var(--dv-ink)',
  ink2: 'var(--dv-ink-2)',
  ink3: 'var(--dv-ink-3)',
  line: 'var(--dv-line)',
  modis: 'var(--dv-modis)',
  viirs: 'var(--dv-viirs)',
  estimate: 'var(--dv-estimate)',
  reference: 'var(--dv-reference)',
} as const;

/**
 * Breaks that put an equal share of `values` in each of `steps` classes, so a place's months spread over the whole
 * ramp. Returns `steps - 1` ascending breaks. Zero and missing values are left out: they are drawn as no fire.
 */
export function shareBreaks(values: readonly number[], steps = 8): number[] {
  const v = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (v.length === 0) return [];
  const out: number[] = [];
  for (let k = 1; k < steps; k += 1) out.push(v[Math.min(v.length - 1, Math.floor((v.length * k) / steps))]);
  return out;
}

/** The class (0 to breaks.length) of a value against ascending breaks. */
export function classOf(value: number, breaks: readonly number[]): number {
  let c = 0;
  for (const b of breaks) if (value >= b) c += 1;
  return c;
}

/**
 * The white ramp of the estimate: step 0 is the dimmest that still reads on the ground, the last is full white.
 * Grey levels, no hue, since the record is the estimate.
 */
export function estimateStep(step: number, steps = 8): string {
  const t = steps <= 1 ? 1 : Math.max(0, Math.min(1, step / (steps - 1)));
  const lo = 52;
  const hi = 244;
  const g = Math.round(lo + (hi - lo) * Math.pow(t, 0.9));
  return `rgb(${g}, ${g + 1}, ${Math.min(255, g + 3)})`;
}

/** The two square modules of the identity: 56 px, and 21 px (56 times 0.375) for the sharp grid and a month. */
export const MODULE = { coarse: 56, fine: 21 } as const;

export const MARK = {
  cell: 21,
  gap: 3,
  stroke: 1.5,
  hatchSize: 5,
  hatchStroke: 1.4,
  bar: 14,
} as const;

/** Type: the system font; mono only for coordinates and fingerprints. Nothing a visitor must read under 16 px. */
export const TYPE = {
  font: 'var(--dv-font)',
  mono: 'var(--dv-mono)',
  min: 16,
  label: 16,
  title: 20,
} as const;

/** Motion: the identity's timing and ease; a figure counts to its value once. */
export const MOTION = {
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
  fastMs: 160,
  countMs: 400,
} as const;

/** The eased value of a count from 0 to `value` after `elapsedMs`; it reaches the value exactly and stays there. */
export function countTo(value: number, elapsedMs: number, durationMs: number = MOTION.countMs): number {
  if (!(elapsedMs > 0)) return 0;
  if (elapsedMs >= durationMs) return value;
  const t = elapsedMs / durationMs;
  return value * (1 - Math.pow(1 - t, 3));
}
