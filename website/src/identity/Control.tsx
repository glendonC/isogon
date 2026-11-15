import type { MouseEvent, ReactNode } from 'react';
import { controlAria, controlClass, controlSound, type ControlVariant } from './controlState.ts';
import './identity.css';

export interface ControlProps {
  children: ReactNode;
  variant?: ControlVariant;
  selected?: boolean;
  disabled?: boolean;
  reason?: string | null;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  /** The keyboard shortcut: announced to readers and drawn inside the control as a key ("Esc", "Enter"). */
  shortcut?: string;
}

/** A key's name as a key cap says it. */
export function keyCap(key: string): string {
  const k = key.trim();
  if (/^esc(ape)?$/i.test(k)) return 'Esc';
  if (/^(enter|return)$/i.test(k)) return 'Enter';
  if (k === ' ' || /^space(bar)?$/i.test(k)) return 'Space';
  if (/^arrowleft$/i.test(k)) return '←';
  if (/^arrowright$/i.test(k)) return '→';
  return k.length === 1 ? k.toUpperCase() : k;
}

/**
 * The page's one control: a square button with a fill, an edge and a light. The primary (one a screen) is solid; the
 * secondary is dark glass with a fine edge. A key that works is drawn inside it at the left, the arrow's square at the
 * right, both one inset from the edges. On hover and keyboard focus the fill lifts and the arrow's square fills; a
 * press sinks it. The look is in identity.css (`.id-control`), where the page's other actions take it too.
 */
export function Control({ children, variant = 'secondary', selected, disabled, reason, onClick, className, shortcut }: ControlProps) {
  const state = { variant, selected, disabled, reason };
  return (
    <button
      type="button"
      className={controlClass(state, className)}
      {...controlAria(state)}
      aria-keyshortcuts={shortcut}
      onPointerEnter={() => controlSound('hover', state)}
      onClick={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        controlSound('press', state);
        onClick?.(e);
      }}
    >
      {shortcut && (
        <kbd className="id-control__key" aria-hidden="true">
          {keyCap(shortcut)}
        </kbd>
      )}
      <span className="id-control__label">{children}</span>
      <span className="id-control__go" aria-hidden="true">
        {'→'}
      </span>
    </button>
  );
}
