import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IsogonMark } from '../ui/IsogonMark';
import { BEATS, READING, type BeatId } from '../app/names';

/** The workspace's inner steps, until each beat holds its own: the Calendar, the fire and its test, a round. */
export type Step = 'record' | 'fire' | 'test' | 'look' | 'agent';

/** The part of the product a step belongs to. */
export const beatOfStep = (s: Step): BeatId =>
  s === 'record' ? 'calendar' : s === 'look' ? 'world' : s === 'agent' ? 'agent' : 'model';

interface WorkspaceBarProps {
  place: string;
  /** The dates of the run on the terrain, beside the place. */
  placeDates?: string | null;
  /** Setting, coordinates and relief, shown beside the place when the pointer is on it. */
  placeDetail?: string;
  onPlace: () => void;
  beat: BeatId;
  onBeat: (b: BeatId) => void;
  /** Why a part cannot be opened here (null: it can). */
  beatBlocked: Partial<Record<BeatId, string | null>>;
  onReading: () => void;
  onLanding: () => void;
  /** The quiet control's contents. */
  menu: ReactNode;
}

/**
 * The top bar holds only where (the place and the dates on the terrain), the Calendar and the three parts, and one
 * entry to the reading. The open part carries the corner brackets. View commands live behind the quiet control.
 */
export function WorkspaceBar({ place, placeDates, placeDetail, onPlace, beat, onBeat, beatBlocked, onReading, onLanding, menu }: WorkspaceBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [menuOpen]);

  return (
    <header className="iso-bar">
      <div className="iso-bar__where">
        <button type="button" className="iso-bar__brand" onClick={onLanding} aria-label="Isogon, back to the landing (Esc)">
          <IsogonMark />
        </button>
        <button
          type="button"
          className="iso-bar__place"
          onClick={(e) => {
            onPlace();
            if (e.detail > 0) e.currentTarget.blur();
          }}
          aria-describedby="iso-bar-placecard"
        >
          <span>{place}</span>
          {placeDates ? <span className="sys-value iso-bar__dates">{placeDates}</span> : null}
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 3.5 5 6.5 8 3.5" />
          </svg>
          <span className="iso-bar__placecard" id="iso-bar-placecard" role="tooltip">
            {placeDetail ? <span>{placeDetail}</span> : null}
            <em>Change place: a region, coordinates or a box you draw</em>
          </span>
        </button>
      </div>

      <nav className="iso-bar__steps" aria-label="Parts">
        {BEATS.map((b) => {
          const blocked = beatBlocked[b.id] ?? null;
          return (
            <button
              key={b.id}
              type="button"
              className="sys-ctl sys-sel"
              data-selected={beat === b.id ? 'true' : 'false'}
              aria-current={beat === b.id ? 'step' : undefined}
              disabled={Boolean(blocked)}
              title={blocked ?? `${b.line} (${b.key})`}
              onClick={(e) => {
                onBeat(b.id);
                if (e.detail > 0) e.currentTarget.blur();
              }}
            >
              {b.name}
            </button>
          );
        })}
      </nav>

      <div className="iso-bar__end">
        <button type="button" className="iso-bar__read" onClick={onReading}>
          {READING}
        </button>
        <div className="iso-bar__menuwrap" ref={menuRef}>
          <button
            type="button"
            className="iso-bar__quiet"
            aria-label="View and tools"
            aria-expanded={menuOpen}
            data-active={menuOpen ? 'true' : 'false'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 4.5h12M2 8h12M2 11.5h12" />
            </svg>
          </button>
          {menuOpen && (
            <div className="iso-menu" role="menu" aria-label="View and tools">
              {menu}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/** A labelled group inside the quiet control. */
export function MenuGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="iso-menu__group">
      <p className="iso-menu__title">{title}</p>
      {children}
    </div>
  );
}

/** One command in the quiet control, with its key. */
export function MenuItem({
  label,
  hint,
  active,
  onClick,
  href,
  download,
}: {
  label: string;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
  href?: string;
  download?: string;
}) {
  const inner = (
    <>
      <span className="iso-menu__tick" data-on={active ? 'true' : 'false'} aria-hidden="true" />
      <span className="iso-menu__label">{label}</span>
      {hint && <kbd>{hint}</kbd>}
    </>
  );
  if (href) {
    return (
      <a className="iso-menu__item" role="menuitem" href={href} download={download}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" className="iso-menu__item" role="menuitemcheckbox" aria-checked={Boolean(active)} onClick={onClick}>
      {inner}
    </button>
  );
}
