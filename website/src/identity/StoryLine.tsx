import type { CSSProperties } from 'react';
import { STORY, partFill, partState, storyLabels, type StoryFigures, type StoryPart } from './story.ts';
import './identity.css';

export interface StoryLineProps extends StoryFigures {
  current: StoryPart | null;
  /** While Play runs, the share of the current part already played (0 to 1). */
  progress?: number | null;
  /** A part clicked. Absent, the line only shows where the visitor is. */
  onPart?: (part: StoryPart) => void;
}

/** The story along the bottom edge: done parts grey, the current one white, the rest faint. */
export function StoryLine({ current, progress, onPart, jumpYear, testedFires }: StoryLineProps) {
  const labels = storyLabels({ jumpYear, testedFires });
  return (
    <nav className="id-story" aria-label="The story">
      {STORY.map((part) => {
        const state = partState(part, current);
        const style = state === 'on' ? ({ '--id-fill': partFill(progress) } as CSSProperties) : undefined;
        const body = <span className="id-story__label">{labels[part]}</span>;
        return onPart ? (
          <button
            key={part}
            type="button"
            className="id-story__part"
            data-state={state}
            style={style}
            aria-current={state === 'on' ? 'step' : undefined}
            onClick={() => onPart(part)}
          >
            {body}
          </button>
        ) : (
          <span key={part} className="id-story__part" data-state={state} style={style} aria-current={state === 'on' ? 'step' : undefined}>
            {body}
          </span>
        );
      })}
    </nav>
  );
}
