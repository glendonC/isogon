import '../styles/guide.css';

export interface StripPass {
  /** A pass of the sharp satellite (taller tick) or of the coarse one. */
  sharp: boolean;
  /** Its detections are hidden from the model and the picture (a dashed tick). */
  hidden: boolean;
}

/**
 * The strip of passes, on demand: one thin tick per pass along the foot of the screen, taller for the sharp satellite,
 * dashed where the pass is hidden, the pass on show marked. It shows while the passes play, when the pointer nears the
 * bottom edge, or when the fire's label is picked; a tick goes to its pass. The fire's label says the rest.
 */
export function PassStrip({
  passes,
  current,
  visible,
  onPick,
}: {
  passes: StripPass[];
  current: number;
  visible: boolean;
  onPick: (pass: number) => void;
}) {
  if (passes.length === 0) return null;
  return (
    <nav className="guide-passes" data-on={visible ? 'true' : 'false'} aria-label="Passes" aria-hidden={visible ? undefined : 'true'}>
      {passes.map((p, i) => (
        <button
          key={i}
          type="button"
          className="guide-passes__tick"
          data-sharp={p.sharp ? 'true' : 'false'}
          data-hidden={p.hidden ? 'true' : 'false'}
          data-current={i === current ? 'true' : 'false'}
          aria-label={`Pass ${i + 1} of ${passes.length}`}
          aria-current={i === current ? 'step' : undefined}
          tabIndex={visible ? 0 : -1}
          onClick={(e) => {
            onPick(i);
            if (e.detail > 0) e.currentTarget.blur();
          }}
        >
          <i />
        </button>
      ))}
    </nav>
  );
}
