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
  /** The keyboard shortcut, announced to readers and listed in help; it is not printed on the control. */
  shortcut?: string;
}

/**
 * One action on its own, where no thing in the scene can carry it (the first screen, a sheet's Close): plain words;
 * the place finder's corner brackets close round them on hover and focus. The primary is only brighter.
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
      <span className="id-control__label">{children}</span>
      <span className="id-control__ticks" aria-hidden="true" />
    </button>
  );
}
