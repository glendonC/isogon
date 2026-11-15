import { useEffect, type ReactNode } from 'react';
import { Control } from './Control';
import { LocatorBar } from './LocatorBar';
import { WORDS, entryTitle } from './words.ts';
import './identity.css';

export interface EntryProps {
  /** The 3D world or the Earth's fire map, behind everything. */
  background?: ReactNode;
  /** The headline. Absent, "Fire on Earth" with the record's years. */
  title?: string;
  /** The one line under it. Absent, the product lane's line in `words.ts`. */
  line?: string;
  /** The record's first and last years, from the yearly route (used only when no `title` is given). */
  firstYear?: number | null;
  lastYear?: number | null;
  onPlay: () => void;
  onExplore: () => void;
  /** Search as an equal way in beside Explore and Play. Given, Search leaves the top bar's words on this screen. */
  onSearch?: () => void;
  links?: { label: string; onClick: () => void }[];
  /** False until the stage's cover says the first full frame is drawn; no word or control shows before. */
  ready?: boolean;
}

/** The first screen: the world behind, one title and one line, and three ways in: Search, Explore, Play. Enter plays. */
export function Entry({ background, title, line, firstYear, lastYear, onPlay, onExplore, onSearch, links = [], ready = true }: EntryProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!ready || e.key !== 'Enter' || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('button, a, input, textarea, select') || target.isContentEditable)) return;
      e.preventDefault();
      onPlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPlay, ready]);

  const barLinks = onSearch ? links.filter((l) => l.label !== WORDS.links.search) : links;

  return (
    <section className="id-entry" aria-label={WORDS.brand} data-ready={ready ? 'true' : 'false'} aria-busy={!ready}>
      <div className="id-entry__bg">{background}</div>
      <div className="id-entry__veil" aria-hidden="true" />
      <LocatorBar path={[WORDS.brand]} lat={null} lon={null} links={barLinks} />
      <div className="id-entry__say">
        <h1 className="id-entry__title">{title ?? entryTitle(firstYear, lastYear)}</h1>
        <p className="id-entry__line">{line ?? WORDS.entryLine}</p>
      </div>
      <div className="id-entry__acts">
        {onSearch && (
          <Control variant="primary" onClick={onSearch} shortcut="/">
            {WORDS.search}
          </Control>
        )}
        <Control variant="primary" onClick={onExplore}>
          {WORDS.explore}
        </Control>
        <Control variant="primary" onClick={onPlay} shortcut="Enter">
          {WORDS.play}
        </Control>
      </div>
    </section>
  );
}
