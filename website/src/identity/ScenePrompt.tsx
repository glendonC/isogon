import { useEffect, useState, type CSSProperties } from 'react';
import { controlSound } from './controlState.ts';
import { isNear, promptSpot, reticleBox, type ScreenBox } from './scene.ts';
import './identity.css';

export interface ScenePromptProps {
  /** The thing's screen box, CSS px of the viewport (the stage's fire anchor gives it). */
  box: ScreenBox;
  /** What pressing does, in a few words: "Show VIIRS". */
  label: string;
  /** The instrument's readout under it: what the thing is now, in exact small type. */
  readout?: string;
  /** What pressing does. Absent, the prompt only names the thing and takes no click (a month with no fire to open). */
  onSelect?: () => void;
  /** The keyboard shortcut, announced to readers; not printed. */
  shortcut?: string;
  /** Show the reticle closed even without the pointer near, for the next step a visitor should see first. */
  invite?: boolean;
}

/**
 * The lowest edge of the top bar's words over the prompt's columns: on a phone the bar holds the path and the links on
 * several rows, and the prompt keeps below them. Measured on the words themselves, not their boxes, so a long path
 * at the left does not push down a prompt that stands clear of it.
 */
function barClear(frame: { left: number }, view: { width: number }, width = 340): number {
  const x0 = Math.min(Math.max(16, frame.left), view.width - 16 - width);
  let clear = 16;
  const range = document.createRange();
  for (const el of document.querySelectorAll('.id-bar__trail, .id-bar__here, .id-bar__coord, .id-bar__right > *')) {
    range.selectNodeContents(el);
    for (const r of range.getClientRects()) {
      if (r.width > 0 && r.right > x0 && r.left < x0 + width) clear = Math.max(clear, Math.ceil(r.bottom) + 8);
    }
  }
  return clear;
}

/**
 * The action on the thing it acts on. A reticle frames the thing, open at rest and closing when the pointer comes near
 * or the prompt has focus; one prompt and its readout stand at the frame's corner, joined by a short line. The whole
 * frame is the target: click it, or Tab to it and press Enter.
 */
export function ScenePrompt({ box, label, readout, onSelect, shortcut, invite = false }: ScenePromptProps) {
  const [view, setView] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [near, setNear] = useState(false);
  const [focus, setFocus] = useState(false);
  const frame = reticleBox(box, view);
  const spot = promptSpot(frame, view, 92, 340, barClear(frame, view));

  useEffect(() => {
    const onResize = () => setView({ width: window.innerWidth, height: window.innerHeight });
    const onMove = (e: PointerEvent) => {
      const inside = isNear(frame, e.clientX, e.clientY);
      setNear((was) => {
        if (inside && !was) controlSound('hover');
        return inside;
      });
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
    };
  }, [frame.left, frame.top, frame.right, frame.bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  const closed = near || focus || invite;
  const style = {
    '--f-l': `${frame.left}px`,
    '--f-t': `${frame.top}px`,
    '--f-w': `${frame.right - frame.left}px`,
    '--f-h': `${frame.bottom - frame.top}px`,
    '--p-x': `${spot.x}px`,
    '--p-y': `${spot.y}px`,
  } as CSSProperties;

  return (
    <div className="id-scene" data-near={closed ? 'true' : 'false'} data-hang={spot.hang} style={style}>
      {onSelect ? (
        <button
          type="button"
          className="id-scene__frame"
          aria-label={readout ? `${label}. ${readout}` : label}
          aria-keyshortcuts={shortcut}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onClick={() => {
            controlSound('press');
            onSelect();
          }}
        >
          <i className="id-scene__corner" />
          <i className="id-scene__corner" />
          <i className="id-scene__corner" />
          <i className="id-scene__corner" />
          <i className="id-scene__centre" />
        </button>
      ) : (
        <div className="id-scene__frame id-scene__frame--still" role="img" aria-label={readout ? `${label}. ${readout}` : label}>
          <i className="id-scene__corner" />
          <i className="id-scene__corner" />
          <i className="id-scene__corner" />
          <i className="id-scene__corner" />
          <i className="id-scene__centre" />
        </div>
      )}
      <div className="id-scene__prompt" aria-hidden="true">
        <span className="id-scene__label">{label}</span>
        {readout && <span className="id-scene__readout">{readout}</span>}
        <span className="id-scene__leader" />
      </div>
    </div>
  );
}
