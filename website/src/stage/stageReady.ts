/**
 * When the stage's first picture is whole: the ground's shape, its imagery and the fire's light all in and
 * drawn. Until then the stage holds a cover over itself. This module imports nothing of three.js, so the page
 * can import it eagerly while the stage loads later, and wait for the picture in three ways:
 *   - `stageReady()`: a promise, resolved once, the moment the cover starts to lift;
 *   - the window event `STAGE_READY_EVENT` at that moment;
 *   - the attribute `data-stage` on the document's root: `loading` while the cover holds, `ready` after.
 */

export const STAGE_READY_EVENT = 'isogon:stage-ready';

let resolveReady: (() => void) | null = null;
const ready = new Promise<void>((resolve) => {
  resolveReady = resolve;
});

/** Resolves when the stage's first whole picture is ready (the cover starts to lift). */
export function stageReady(): Promise<void> {
  return ready;
}

type RootLike = { dataset: DOMStringMap };
type EventTargetLike = { dispatchEvent: (event: Event) => boolean };

function root(): RootLike | null {
  return typeof document !== 'undefined' ? document.documentElement : null;
}

/** The stage holds its cover (called when it mounts; a page already marked ready stays ready). */
export function markStageLoading(target: RootLike | null = root()): void {
  if (target && target.dataset.stage !== 'ready') target.dataset.stage = 'loading';
}

/** The stage's first whole picture is ready: the attribute, the promise and the event, once. */
export function markStageReady(
  target: RootLike | null = root(),
  events: EventTargetLike | null = typeof window !== 'undefined' ? window : null,
): void {
  if (target) {
    if (target.dataset.stage === 'ready') return;
    target.dataset.stage = 'ready';
  }
  resolveReady?.();
  resolveReady = null;
  if (events && typeof CustomEvent !== 'undefined') events.dispatchEvent(new CustomEvent(STAGE_READY_EVENT));
}
