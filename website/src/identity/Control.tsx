import { useState, type MouseEvent, type ReactNode } from 'react';
import { badgeGlyph, controlAria, controlClass, controlSound, type ControlIcon, type ControlVariant } from './controlState.ts';
import './identity.css';

function Glyph({ name }: { name: Exclude<ControlIcon, 'none'> }) {
  if (name === 'play')
    return (
      <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
        <path d="M1 1l10 6-10 6z" fill="currentColor" />
      </svg>
    );
  if (name === 'pause')
    return (
      <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
        <rect x="0" y="0" width="3" height="12" fill="currentColor" />
        <rect x="7" y="0" width="3" height="12" fill="currentColor" />
      </svg>
    );
  if (name === 'download')
    return (
      <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
        <path d="M6 0v10M1 6l5 5 5-5M0 13h12" stroke="currentColor" strokeWidth="1.6" fill="none" />
      </svg>
    );
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
      <path d="M0 6H14M9 1l5 5-5 5" stroke="currentColor" strokeWidth="1.7" fill="none" />
    </svg>
  );
}

export interface ControlProps {
  children: ReactNode;
  variant?: ControlVariant;
  /** The glyph the badge carries when it arrives on hover: an arrow unless the action is play, pause or download. */
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
  icon = 'arrow',
  selected,
  disabled,
  reason,
  onClick,
  className,
  shortcut,
}: ControlProps) {
  const state = { variant, selected, disabled, reason };
  const [scan, setScan] = useState(0);
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
        setScan((n) => n + 1);
        controlSound('press', state);
        onClick?.(e);
      }}
    >
      <span className="id-control__scan" key={scan} data-run={scan > 0 ? 'true' : 'false'} aria-hidden="true" />
      <span className="id-control__mark" aria-hidden="true" />
      <span className="id-control__label">{children}</span>
      <span className="id-control__badge" aria-hidden="true">
        <Glyph name={badgeGlyph(icon)} />
      </span>
      <span className="id-control__ticks" aria-hidden="true" />
    </button>
  );
}
