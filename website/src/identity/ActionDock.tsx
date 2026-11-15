import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { controlSound } from './controlState.ts';
import { litRow, moveRow } from './dockState.ts';
import './identity.css';

export interface DockAction {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Why the row cannot be used now, shown on hover and read aloud. */
  reason?: string | null;
  /** The keyboard shortcut, announced to readers; not printed. */
  shortcut?: string;
}

export interface ActionDockProps {
  actions: DockAction[];
  /** The next step's index: where the light rests when nothing is pointed at. */
  next?: number;
  label?: string;
  className?: string;
}

/**
 * Every action of a screen in one dock: rows on a pane of dark glass lit along its top edge. One bar of light marks
 * the next step and glides to the row under the pointer or the keys; it returns to the next step when they leave.
 */
export function ActionDock({ actions, next = 0, label = 'Actions', className }: ActionDockProps) {
  const [active, setActive] = useState<number | null>(null);
  const [flash, setFlash] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const lit = litRow(actions, next, active);

  const focusRow = (i: number | null) => {
    if (i === null) return;
    refs.current[i]?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, at: number) => {
    const to = moveRow(actions, at, e.key);
    if (to === null) return;
    e.preventDefault();
    focusRow(to);
  };

  return (
    <div
      className={`id-dock${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={label}
      style={{ '--id-rows': actions.length, '--id-lit': lit ?? 0 } as CSSProperties}
      data-has-light={lit === null ? 'false' : 'true'}
      onPointerLeave={() => setActive(null)}
    >
      <span className="id-dock__light" key={`light-${flash}`} data-flash={flash > 0 ? 'true' : 'false'} aria-hidden="true" />
      {actions.map((a, i) => (
        <button
          key={a.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          className="id-dock__row"
          data-lit={i === lit ? 'true' : 'false'}
          aria-disabled={a.disabled || undefined}
          aria-keyshortcuts={a.shortcut}
          title={a.disabled && a.reason ? a.reason : undefined}
          onPointerEnter={() => {
            if (a.disabled) return;
            setActive(i);
            controlSound('hover');
          }}
          onFocus={() => {
            if (!a.disabled) setActive(i);
          }}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => onKey(e, i)}
          onClick={() => {
            if (a.disabled) return;
            setFlash((n) => n + 1);
            controlSound('press');
            a.onSelect();
          }}
        >
          <span className="id-dock__label">{a.label}</span>
        </button>
      ))}
    </div>
  );
}
