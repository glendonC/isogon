import { lazy, Suspense, useEffect, useState } from 'react';
import { ScenePrompt } from '../../identity/ScenePrompt';
import { useWorkspace } from '../../app/store';
import type { StageFireAnchor } from '../../stage/earthCutawayTypes';

const ThreeWaysPlane = lazy(() =>
  import('../../compare/ThreeWaysPlane').then((m) => ({ default: m.ThreeWaysPlane })),
);
import { fireAt, onScreen, runBox, type ScreenBox } from './fire';
import { labelPoint } from '../../guide/anchor';
import { MarksKey } from '../../guide/MarksKey';
import { ClearPin, patchBoxes } from '../../guide/ClearPin';
import { SCRIPT } from '../../guide/script';
import '../../styles/world-model.css';
import '../../styles/guide.css';

/** The stage's fire anchor, at most once a frame, without redrawing the shell. */
function useFireAnchor(subscribe: (fn: (a: StageFireAnchor | null) => void) => () => void): StageFireAnchor | null {
  const [anchor, setAnchor] = useState<StageFireAnchor | null>(null);
  useEffect(() => {
    let latest: StageFireAnchor | null = null;
    let frame = 0;
    const off = subscribe((a) => {
      latest = a;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setAnchor((was) =>
          was && latest && samePoint(labelPoint(was), labelPoint(latest)) && Math.abs(was.x - latest.x) < 0.5 && was.right === latest.right && was.visible === latest.visible
            ? was
            : latest,
        );
      });
    });
    return () => {
      off();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [subscribe]);
  return anchor;
}

const samePoint = (a: { x: number; y: number } | null, b: { x: number; y: number } | null) =>
  a === b || Boolean(a && b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5);

/** The stage's box of the fire on show, with a margin for the glow, held inside the screen; null when off screen. */
function anchorBox(a: StageFireAnchor | null): ScreenBox | null {
  if (!a || !(a.right > a.left) || !(a.bottom > a.top)) return null;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const m = 14;
  const box = { left: Math.max(0, a.left - m), top: Math.max(0, a.top - m), right: Math.min(W, a.right + m), bottom: Math.min(H, a.bottom + m) };
  return box.right - box.left > 8 && box.bottom - box.top > 8 ? box : null;
}

/** The margin round a patch inside which the pointer counts as on the fire, px. */

/**
 * World model on the stage: only what belongs to the scene. One label on the fire, joined by a leader, in the script's
 * words for the state on show (the guide at the bottom says the rest); the next step on the fire itself, framed by the
 * identity's reticle with the fire's label as its readout. After the reveal, Side by Side takes the stage's place while
 * it is open.
 */
export function WorldModelScene() {
  const ws = useWorkspace();
  const { run, time, model, test, guide } = ws;
  const box = runBox(run.active);
  const fire = fireAt(run.active, time.pass);
  const anchor = useFireAnchor(model.subscribeAnchor);
  // The label hangs on the larger patch of the fire (`labelPoint`); the prompt stands beside the whole fire's extent.
  const at = labelPoint(anchor) ?? (fire && box ? onScreen(fire.lon, fire.lat, box, model.grid) : null);
  const extent = anchorBox(anchor) ?? (at ? { left: at.x - 40, top: at.y - 30, right: at.x + 40, bottom: at.y + 30 } : null);
  // The boxes the label stands clear of: each patch of the fire (or the whole fire, where the stage gives no patches).
  const avoid = patchBoxes(anchor);
  // The prompt's place: beside the larger patch, else beside the fire's extent.
  const beside = avoid[0] ?? extent;

  if (test.revealed && model.threeWays) {
    return (
      <div className="wm-scene" data-scene="three-ways">
        <div className="wm-three">
          <Suspense fallback={null}>
            <ThreeWaysPlane />
          </Suspense>
        </div>
      </div>
    );
  }

  // The next step on the fire itself (the identity's ScenePrompt): the reticle frames the fire, the action and the fire's
  // own label as its readout stand at the frame's corner; while it stands the label is not drawn a second time.
  const act = guide.besideFire;
  const onFire = Boolean(act && beside);
  const keyOpen = model.marksOpen && guide.marks.length > 0;

  return (
    <div className="wm-scene" data-scene={test.revealed ? 'revealed' : test.hidden ? 'blind' : 'open'}>
      {at && keyOpen && <MarksKey at={at} avoid={avoid} title={SCRIPT.marks?.name ?? 'The Marks'} rows={guide.marks} />}
      {at && guide.fireLabel && !keyOpen && !onFire && (
        <ClearPin at={at} avoid={avoid} className="wm-pin" plateClass="wm-label" label={guide.fireLabel} focusable onPick={time.toggleStrip}>
          <span className="guide-label">{guide.fireLabel}</span>
        </ClearPin>
      )}
      {act && beside && (
        <ScenePrompt
          box={beside}
          label={act.label}
          readout={guide.fireReadout ?? guide.fireLabel ?? undefined}
          onSelect={() => ws.runCommand(act.command)}
          shortcut={act.key ?? undefined}
          invite={!test.revealed}
        />
      )}
    </div>
  );
}
