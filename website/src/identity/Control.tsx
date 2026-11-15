import type { MouseEvent, ReactNode } from 'react';
import {
  controlAria,
  controlClass,
  controlSound,
  defaultIcon,
  type ControlIcon,
  type ControlVariant,
} from './controlState.ts';
import './identity.css';

function Icon({ name }: { name: ControlIcon }) {
  if (name === 'none') return null;
  if (name === 'play')
    return (
      <svg className="id-control__icon" width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
        <path d="M1 1l10 6-10 6z" fill="currentColor" />
      </svg>
    );
  if (name === 'pause')
    return (
      <svg className="id-control__icon" width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
        <rect x="0" y="0" width="3" height="12" fill="currentColor" />
        <rect x="7" y="0" width="3" height="12" fill="currentColor" />
      </svg>
    );
  if (name === 'download')
    return (
      <svg className="id-control__icon" width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
        <path d="M6 0v10M1 6l5 5 5-5M0 13h12" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
    );
  return (
    <svg className="id-control__icon id-control__icon--trail" width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
      <path d="M0 6H14M9 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </svg>
  );
}

export interface ControlProps {
  children: ReactNode;
  variant?: ControlVariant;
  /** Leading icons (play, pause, download) sit before the label; the arrow trails it. */
  icon?: ControlIcon;
  selected?: boolean;
  disabled?: boolean;
  reason?: string | null;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  /** The keyboard shortcut, announced to readers and listed in help; it is not printed on the control. */
  shortcut?: string;
}

export function Control({
  children,
  variant = 'secondary',
  icon,
  selected,
  disabled,
  reason,
  onClick,
  className,
  shortcut,
}: ControlProps) {
  const state = { variant, selected, disabled, reason };
  const shown = icon ?? defaultIcon(variant);
  const trailing = shown === 'arrow';
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
      {!trailing && <Icon name={shown} />}
      <span className="id-control__label">{children}</span>
      {trailing && <Icon name="arrow" />}
    </button>
  );
}
