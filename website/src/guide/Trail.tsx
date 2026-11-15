import { SCRIPT } from './script';
import '../styles/guide.css';

export type TrailWord = 'Record' | 'Estimate' | 'Test' | 'Play';

/**
 * Top left, in place of the bar: the four words of the trail, the current one marked, each a way to its step where it
 * can open (a closed one says why on hover and focus); beside them the place and its dates, which open Choose a Place.
 */
export function Trail({
  current,
  where,
  onWord,
  closed,
  onPlace,
}: {
  current: TrailWord | null;
  where: string | null;
  onWord: (w: TrailWord) => void;
  closed: Partial<Record<TrailWord, string | null>>;
  onPlace: () => void;
}) {
  return (
    <div className="guide-trail">
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
      {where && (
        <button
          type="button"
          className="guide-trail__where"
          onClick={(e) => {
            onPlace();
            if (e.detail > 0) e.currentTarget.blur();
          }}
        >
          {where}
        </button>
      )}
    </div>
  );
}
