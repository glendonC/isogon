import { useEffect, useState } from 'react';
import { useWorkspace } from '../../app/store';
import { ThreeWaysPlane } from '../../compare/ThreeWaysPlane';
import type { StageFireAnchor } from '../../stage/earthCutawayTypes';
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
const INSIDE = 12;

/**
 * World model on the stage: only what belongs to the scene. One label on the fire, joined by a leader, in the script's
 * words for the state on show (the guide at the bottom says the rest); beside the fire's extent, never on its marks, the
 * action that acts on the fire, shown only while the pointer or the keyboard's focus is on or near the fire. After the
 * reveal, Side by Side takes the stage's place while it is open.
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

  // The prompt shows while the pointer is inside the fire's extent (a patch of it, with a small margin) or the label
  // has the keyboard's focus; never on bare ground near the leader's foot.
  const [near, setNear] = useState(false);
  const [focused, setFocused] = useState(false);
  const insideKey = avoid.map((b) => `${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}`).join(';');
  useEffect(() => {
    const boxes = avoid.length > 0 ? avoid : extent ? [extent] : [];
    if (boxes.length === 0) return;
    const onMove = (e: PointerEvent) => {
      const inside = boxes.some((b) => e.clientX >= b.left - INSIDE && e.clientX <= b.right + INSIDE && e.clientY >= b.top - INSIDE && e.clientY <= b.bottom + INSIDE);
      setNear((was) => (was === inside ? was : inside));
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [insideKey, extent?.left, extent?.top, extent?.right, extent?.bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  if (test.revealed && model.threeWays) {
    return (
      <div className="wm-scene" data-scene="three-ways">
        <div className="wm-three">
          <ThreeWaysPlane />
        </div>
      </div>
    );
  }

  const act = guide.besideFire;
  const W = window.innerWidth;
  const promptAt =
    act && beside
      ? beside.right + 16 + 320 <= W - 24
        ? { left: beside.right + 16, top: (beside.top + beside.bottom) / 2 - 10 }
        : { left: Math.max(24, beside.left - 16 - 320), top: (beside.top + beside.bottom) / 2 - 10 }
      : null;
  const keyOpen = model.marksOpen && guide.marks.length > 0;

  return (
    <div className="wm-scene" data-scene={test.revealed ? 'revealed' : test.hidden ? 'blind' : 'open'}>
      {at && keyOpen && <MarksKey at={at} avoid={avoid} title={SCRIPT.marks?.name ?? 'The Marks'} rows={guide.marks} />}
      {at && guide.fireLabel && !keyOpen && (
        <ClearPin at={at} avoid={avoid} className="wm-pin" plateClass="wm-label" label={guide.fireLabel} focusable onFocusChange={setFocused} onPick={time.toggleStrip}>
          <span className="guide-label">{guide.fireLabel}</span>
        </ClearPin>
      )}
      {act && promptAt && (near || focused) && (
        <button type="button" className="guide-prompt" style={{ left: promptAt.left, top: promptAt.top }} onClick={() => ws.runCommand(act.command)}>
          {act.key && <kbd className="guide-key">{act.key}</kbd>}
          <span>{act.label}</span>
        </button>
      )}
    </div>
  );
}
