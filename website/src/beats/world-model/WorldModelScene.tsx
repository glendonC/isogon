import { useEffect, useState } from 'react';
import { useWorkspace } from '../../app/store';
import { ThreeWaysPlane } from '../../compare/ThreeWaysPlane';
import type { StageFireAnchor } from '../../stage/earthCutawayTypes';
import { fireAt, onScreen, runBox, type ScreenBox } from './fire';
import { labelPoint } from '../../guide/anchor';
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

/** How near the fire's extent the pointer must come for its prompt to show, px. */
const NEAR = 48;
/** For a fire that spreads over much of the screen, how near its anchor instead, px. */
const NEAR_ANCHOR = 150;

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
  // A fire that fills much of the screen has no side to stand beside: nearness and the prompt go by its anchor then.
  const compact = Boolean(extent && extent.right - extent.left < window.innerWidth * 0.5 && extent.bottom - extent.top < window.innerHeight * 0.5);

  // The prompt shows while the pointer is near the fire's extent or the label has the keyboard's focus.
  const [near, setNear] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!extent || !at) return;
    const onMove = (e: PointerEvent) => {
      const inside = compact
        ? e.clientX >= extent.left - NEAR && e.clientX <= extent.right + NEAR && e.clientY >= extent.top - NEAR && e.clientY <= extent.bottom + NEAR
        : Math.hypot(e.clientX - at.x, e.clientY - at.y) <= NEAR_ANCHOR;
      setNear((was) => (was === inside ? was : inside));
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [compact, extent?.left, extent?.top, extent?.right, extent?.bottom, at?.x, at?.y]); // eslint-disable-line react-hooks/exhaustive-deps

  if (test.revealed && model.threeWays) {
    return (
      <div className="wm-scene" data-scene="three-ways">
        <div className="wm-three">
          <ThreeWaysPlane />
        </div>
      </div>
    );
  }

  const hang = at && at.y < 300 ? 'below' : 'above';
  const side = at && at.x > window.innerWidth - 460 ? 'left' : 'right';
  const act = guide.besideFire;
  const W = window.innerWidth;
  const promptAt =
    act && extent && at
      ? compact
        ? extent.right + 16 + 320 <= W - 24
          ? { left: extent.right + 16, top: (extent.top + extent.bottom) / 2 - 10 }
          : { left: Math.max(24, extent.left - 16 - 320), top: (extent.top + extent.bottom) / 2 - 10 }
        : { left: Math.min(at.x + 18, W - 24 - 320), top: at.y + 10 }
      : null;

  return (
    <div className="wm-scene" data-scene={test.revealed ? 'revealed' : test.hidden ? 'blind' : 'open'}>
      {at && guide.fireLabel && (
        <div
          className="sys-pin wm-pin"
          data-hang={hang}
          data-side={side}
          style={{ ['--x' as string]: `${at.x}px`, ['--y' as string]: `${at.y}px`, ['--lead' as string]: hang === 'below' ? '72px' : '96px' }}
        >
          <span className="sys-pin__leader" />
          <span className="sys-pin__anchor" />
          <div
            className="sys-pin__plate wm-label"
            tabIndex={0}
            aria-label={guide.fireLabel}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          >
            <span className="guide-label">{guide.fireLabel}</span>
          </div>
        </div>
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
