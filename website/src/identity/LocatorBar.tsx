import type { ReactNode } from 'react';
import { SoundControl } from '../audio';
import { formatCoord, splitPath, type Where } from './where.ts';
import { WORDS } from './words.ts';
import './identity.css';

export interface LocatorBarProps extends Where {
  /** The page's own return to the first screen. Given, the path starts with the way back, on every screen. */
  onHome?: () => void;
  /** The way back's words; the product's name unless the product lane says otherwise. */
  home?: string;
  /** A step of the trail clicked: its index in `path`. Absent, the trail is plain text. */
  onTrail?: (index: number) => void;
  /** Words at the right before the sound control (Search, Method, Sources). */
  links?: { label: string; onClick: () => void }[];
  /** Extra content at the right, for example the looks left in a round. */
  right?: ReactNode;
}

/**
 * The top of every screen in place of the four words: at the left the way back to the start, the path, the name in view
 * and its coordinates; at the right a few words and the sound control.
 */
export function LocatorBar({ path, lat, lon, onHome, home = WORDS.brand, onTrail, links = [], right }: LocatorBarProps) {
  const { trail, here } = splitPath(path);
  const coord = formatCoord(lat, lon);
  const atHome = here === home && trail.length === 0;
  return (
    <header className="id-bar">
      <div className="id-bar__where">
        <div className="id-bar__text">
          {(trail.length > 0 || (onHome && !atHome)) && (
            <nav className="id-bar__trail" aria-label="Where you are">
              {onHome && !atHome && (
                <span className="id-bar__step">
                  <button type="button" className="id-bar__home" onClick={onHome} aria-label={`${home}, back to the start`}>
                    <span className="id-bar__home-label">{home}</span>
                    <span className="id-control__ticks" aria-hidden="true" />
                  </button>
                  <span className="id-bar__sep" aria-hidden="true">
                    /
                  </span>
                </span>
              )}
              {trail.map((step, i) => (
                <span key={`${step}-${i}`} className="id-bar__step">
                  {onTrail ? (
                    <button type="button" className="id-bar__back" onClick={() => onTrail(i)}>
                      {step}
                    </button>
                  ) : (
                    step
                  )}
                  <span className="id-bar__sep" aria-hidden="true">
                    /
                  </span>
                </span>
              ))}
            </nav>
          )}
          <p className="id-bar__here">{here}</p>
          {coord && <p className="id-bar__coord">{coord}</p>}
        </div>
      </div>
      <div className="id-bar__right">
        {right}
        {links.map((l) => (
          <button key={l.label} type="button" className="id-bar__link" onClick={l.onClick}>
            {l.label}
          </button>
        ))}
        <SoundControl className="id-bar__sound" />
      </div>
    </header>
  );
}
