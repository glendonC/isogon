import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { controlSound } from './controlState.ts';
import { isNear, promptAvoiding, promptSpot, reticleBox, type ScreenBox } from './scene.ts';
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
  /**
   * Things on screen the prompt's words must not cover (a place's pin beside a country): the prompt hangs on the other
   * side of its frame, or, where both sides would cover one, does not show (the frame stands; a click still acts).
   */
  avoid?: () => ScreenBox[];
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
export function ScenePrompt({ box, label, readout, onSelect, shortcut, invite = false, avoid }: ScenePromptProps) {
  const [view, setView] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [near, setNear] = useState(false);
  const [focus, setFocus] = useState(false);
  const frame = reticleBox(box, view);
  // The prompt's own width, measured once drawn, so a long readout (a country's name, place and count) is moved left to
  // stay on the screen instead of running off it.
  const promptRef = useRef<HTMLDivElement | null>(null);
  const [promptW, setPromptW] = useState(340);
  const [promptH, setPromptH] = useState(92);
  useLayoutEffect(() => {
    const w = promptRef.current?.offsetWidth ?? 0;
    const h = promptRef.current?.offsetHeight ?? 0;
    if (w > 0 && Math.abs(w - promptW) > 2) setPromptW(w);
    if (h > 0 && Math.abs(h - promptH) > 2) setPromptH(h);
  });
  const width = Math.min(Math.max(promptW, 120), view.width - 32);
  const clear = barClear(frame, view, width);
  const placed = avoid ? promptAvoiding(frame, view, { w: width, h: promptH }, avoid(), clear) : null;
  const spot = placed ?? promptSpot(frame, view, 92, width, clear);
  // Both sides of the frame would cover a thing to avoid: the words stay out of sight (still measured).
  const withheld = Boolean(avoid) && placed === null;

  useEffect(() => {
    const onResize = () => setView({ width: window.innerWidth, height: window.innerHeight });
    const onMove = (e: PointerEvent) => {
      // near the frame, or over an acting prompt's words, which are a control too
      const words = onSelect ? promptRef.current?.getBoundingClientRect() : null;
      const overWords = Boolean(words && e.clientX >= words.left && e.clientX <= words.right && e.clientY >= words.top && e.clientY <= words.bottom);
      const inside = isNear(frame, e.clientX, e.clientY) || overWords;
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
    <div className="id-scene" data-near={closed ? 'true' : 'false'} data-hot={near || focus ? 'true' : 'false'} data-act={onSelect ? 'true' : 'false'} data-hang={spot.hang} style={style}>
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
      {/* An acting prompt's words are a control too: a click on them does what the frame does (the frame is the one
          readers and the keys reach). */}
      <div
        className="id-scene__prompt"
        aria-hidden="true"
        ref={promptRef}
        style={withheld ? { visibility: 'hidden' } : undefined}
        onClick={
          onSelect
            ? () => {
                controlSound('press');
                onSelect();
              }
            : undefined
        }
      >
        <span className="id-scene__label">{label}</span>
        {readout && <span className="id-scene__readout">{readout}</span>}
        <span className="id-scene__leader" />
      </div>
    </div>
  );
}
