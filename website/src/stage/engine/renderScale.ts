/**
 * A steady picture on a slow machine. The stage's frames are timed over windows of WINDOW_SEC, each judged
 * by its median frame (so a few long frames while a file arrives are not a pace). Where two windows in a
 * row run slower than SLOW_MS, the stage draws at a smaller render scale, a step a window down to LEAST;
 * where they run at the display's pace for CLIMB_SEC it climbs back, never above a step under a scale found
 * too slow within the last HOLD_SEC. A frame longer than STALL_MS, or one of a tab in the background, is
 * left out. Nothing on screen says so.
 */
export const RENDER_SCALE = {
  WINDOW_SEC: 1.0,
  SLOW_MS: 26,
  SLOW_WINDOWS: 2,
  FAST_MS: 18.5,
  CLIMB_SEC: 6,
  HOLD_SEC: 30,
  STALL_MS: 250,
  STEP_DOWN: 0.15,
  STEP_UP: 0.1,
  LEAST: 0.5,
} as const;

export class RenderScaleGovernor {
  scale = 1;
  private windowSec = 0;
  private gaps: number[] = [];
  private slowWindows = 0;
  private fastSec = 0;
  private ceiling = 1;
  private ceilingSec = 0;

  /** One frame's gap, ms; returns the new scale when it changes, else null. */
  feed(gapMs: number, hidden = false): number | null {
    const R = RENDER_SCALE;
    if (!(gapMs > 0) || gapMs > R.STALL_MS || hidden) return null;
    this.gaps.push(gapMs);
    this.windowSec += gapMs / 1000;
    if (this.ceiling < 1) {
      this.ceilingSec += gapMs / 1000;
      if (this.ceilingSec > R.HOLD_SEC) {
        this.ceiling = Math.min(1, this.ceiling + R.STEP_UP);
        this.ceilingSec = 0;
      }
    }
    if (this.windowSec < R.WINDOW_SEC) return null;
    const sorted = this.gaps.sort((a, b) => a - b);
    const medianMs = sorted[Math.floor(sorted.length / 2)];
    this.windowSec = 0;
    this.gaps = [];
    let next = this.scale;
    if (medianMs > R.SLOW_MS) {
      this.slowWindows += 1;
      this.fastSec = 0;
      if (this.slowWindows >= R.SLOW_WINDOWS && this.scale > R.LEAST) {
        // (a step below the scale found too slow, until the hold has passed)
        this.ceiling = this.scale - R.STEP_UP;
        this.ceilingSec = 0;
        next = Math.max(R.LEAST, this.scale - R.STEP_DOWN);
        this.slowWindows = R.SLOW_WINDOWS - 1;
      }
    } else if (medianMs < R.FAST_MS) {
      this.slowWindows = 0;
      this.fastSec += R.WINDOW_SEC;
      if (this.fastSec >= R.CLIMB_SEC && this.scale < this.ceiling) {
        next = Math.min(this.ceiling, this.scale + R.STEP_UP);
        this.fastSec = 0;
      }
    } else {
      this.slowWindows = 0;
      this.fastSec = 0;
    }
    if (Math.abs(next - this.scale) <= 1e-3) return null;
    this.scale = next;
    return next;
  }
}
