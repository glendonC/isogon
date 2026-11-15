import type { ReactNode } from 'react';
import { SoundControl } from '../audio';
import { Locator } from '../ui/Locator';
import { formatCoord, splitPath, type Where } from './where.ts';
import './identity.css';

export interface LocatorBarProps extends Where {
  /** A step of the trail clicked: its index in `path`. Absent, the trail is plain text. */
  onTrail?: (index: number) => void;
  /** Links at the right before the sound control (Search, Method, Sources), each a short word. */
  links?: { label: string; onClick: () => void }[];
  /** Extra content at the right, for example the looks left in a round. */
  right?: ReactNode;
}

/**
 * The top of every screen in place of the four words: at the left the place finder's window on the Earth with its
 * cross hairs, the trail back, the name in view and its coordinates; at the right a few words and the sound control.
 */
export function LocatorBar({ path, lat, lon, onTrail, links = [], right }: LocatorBarProps) {
  const { trail, here } = splitPath(path);
  const coord = formatCoord(lat, lon);
  return (
    <header className="id-bar">
      <div className="id-bar__where">
        <div className="id-bar__win" title="Blue Marble, NASA">
          <Locator lat={lat ?? null} lon={lon ?? null} />
        </div>
        <div className="id-bar__text">
          {trail.length > 0 && (
            <nav className="id-bar__trail" aria-label="Where you are">
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
