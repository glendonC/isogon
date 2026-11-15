import { SCRIPT } from './script';
import '../styles/guide.css';

export type TrailWord = 'Record' | 'Estimate' | 'Test' | 'Play';

/**
 * Top left, in place of the bar: the objective, one line of what the visitor is doing now; under it the four words
 * of the trail, the current one marked, each a way to its step where it can open (a closed one says why on hover and
 * focus); beside them the step's context, the place and its days, fainter, which opens Choose a Place.
 */
export function Trail({
  objective,
  current,
  context,
  onWord,
  closed,
  onPlace,
}: {
  objective: string | null;
  current: TrailWord | null;
  context: string | null;
  onWord: (w: TrailWord) => void;
  closed: Partial<Record<TrailWord, string | null>>;
  onPlace: () => void;
}) {
  return (
    <div className="guide-trail">
      {objective && <p className="guide-trail__objective">{objective}</p>}
      <div className="guide-trail__row">
        <nav className="guide-trail__words" aria-label="Steps">
          {(SCRIPT.trail as TrailWord[]).map((w) => (
            <button
              key={w}
              type="button"
              className="guide-trail__word"
              aria-current={current === w ? 'step' : undefined}
              data-on={current === w ? 'true' : 'false'}
              disabled={Boolean(closed[w])}
              title={closed[w] ?? undefined}
              onClick={(e) => {
                onWord(w);
                if (e.detail > 0) e.currentTarget.blur();
              }}
            >
              {w}
            </button>
          ))}
        </nav>
        {context && (
          <button
            type="button"
            className="guide-trail__where"
            onClick={(e) => {
              onPlace();
              if (e.detail > 0) e.currentTarget.blur();
            }}
          >
            {context}
          </button>
        )}
      </div>
    </div>
  );
}
