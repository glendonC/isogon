import type { StartCard } from './useGuide';
import '../styles/guide.css';

/** A step's start card, at its thing: the step's name, what to do, what counts as done, and the key that starts it. */
export function StartCardView({ card }: { card: StartCard }) {
  return (
    <>
      <span className="guide-card__name">{card.name}</span>
      <span className="guide-card__do">{card.do}</span>
      <span className="guide-card__done">{card.done}</span>
      {card.act && (
        <span className="guide-card__act">
          {card.act.key && <span className="guide-key">{card.act.key}</span>}
          {card.act.label}
        </span>
      )}
    </>
  );
}
