/**
 * Actions in the scene, as data. What a visitor can do appears on the thing it acts on: a reticle frames the thing
 * (its screen box, as the stage reports it), and one prompt with a readout stands beside it. No panel, no menu.
 */

export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** The reticle's frame: the thing's box with room around it, kept inside the screen's margins. */
export function reticleBox(box: ScreenBox, view: Viewport, pad = 24, margin = 16): ScreenBox {
  return {
    left: Math.max(margin, box.left - pad),
    top: Math.max(margin, box.top - pad),
    right: Math.min(view.width - margin, box.right + pad),
    bottom: Math.min(view.height - margin, box.bottom + pad),
  };
}

/**
 * Where the prompt stands: above the frame's left corner, or below it when there is no room above. `clear` is the
 * lowest edge of what stands at the top of the screen (the top bar), which the prompt never covers.
 */
export function promptSpot(frame: ScreenBox, view: Viewport, need = 92, width = 340, clear = 16): { x: number; y: number; hang: 'above' | 'below' } {
  const x = Math.min(Math.max(16, frame.left), view.width - 16 - width);
  if (frame.top - need >= clear) return { x, y: frame.top, hang: 'above' };
  return { x, y: frame.bottom, hang: 'below' };
}

/** True while the pointer is within `near` px of the box. */
export function isNear(box: ScreenBox, x: number, y: number, near = 48): boolean {
  return x >= box.left - near && x <= box.right + near && y >= box.top - near && y <= box.bottom + near;
}

/** A count running to its value over `ms`, eased out, whole numbers: what the readout shows at time `t`. */
export function countAt(t: number, value: number, ms = 1500): number {
  if (!Number.isFinite(value)) return 0;
  if (t <= 0) return 0;
  if (t >= ms) return Math.round(value);
  const p = t / ms;
  return Math.round(value * (1 - Math.pow(1 - p, 3)));
}

/** The sweep's position across the screen at time `t` (0 to 1), eased like the page's movement. */
export function sweepAt(t: number, ms = 1600): number {
  if (t <= 0) return 0;
  if (t >= ms) return 1;
  const p = t / ms;
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}
