import { useEffect, type ReactNode } from 'react';
import { Control } from './Control';
import { LocatorBar } from './LocatorBar';
import { WORDS, entryTitle } from './words.ts';
import './identity.css';

export interface EntryProps {
  /** The Earth's fire map, drawn by the world view, behind everything. */
  background?: ReactNode;
  /** The record's first and last years, from the yearly route. */
  firstYear?: number | null;
  lastYear?: number | null;
  onPlay: () => void;
  onExplore: () => void;
  links?: { label: string; onClick: () => void }[];
}

/** The first screen: the Earth's fire map, one title and one line, Play or Explore. Enter plays. */
export function Entry({ background, firstYear, lastYear, onPlay, onExplore, links }: EntryProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('button, a, input, textarea, select') || target.isContentEditable)) return;
      e.preventDefault();
      onPlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPlay]);

  return (
    <section className="id-entry" aria-label={WORDS.brand}>
      <div className="id-entry__bg">{background}</div>
      <div className="id-entry__veil" aria-hidden="true" />
      <LocatorBar path={[WORDS.brand]} lat={null} lon={null} links={links} />
      <div className="id-entry__say">
        <h1 className="id-entry__title">{entryTitle(firstYear, lastYear)}</h1>
        <p className="id-entry__line">{WORDS.entryLine}</p>
      </div>
      <div className="id-entry__acts">
        <Control onClick={onExplore}>{WORDS.explore}</Control>
        <Control variant="primary" icon="play" onClick={onPlay} shortcut="Enter">
          {WORDS.play}
        </Control>
      </div>
    </section>
  );
}
