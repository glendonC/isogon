import type { OneLook } from '../beats/test-world/useRound';
import { points } from './formats';
import type { ResultRow } from './Results';

/**
 * The guide's words for Play on a page of recorded answers, which scores one look, until the script carries them: the
 * sentence while the look is chosen, the round's end beside the best answer and the players' picks at that pass, and a
 * fire on which the recording holds no scored look.
 */
export const ONE_LOOK_WORDS = {
  choose: 'This copy of the page plays back recorded answers, so you get one look: point at a square and uncover what VIIRS, the sharper satellite, detected there on this pass.',
  endObjective: "Compare your look with the best square and the other players'",
  head: (taken: NonNullable<OneLook['taken']>) =>
    taken.tile === null
      ? 'you let this pass go'
      : taken.reward !== null && taken.reward > 0
        ? `your look raised the score by ${points(taken.reward)} points`
        : 'your look found nothing new',
  best: (o: OneLook) => {
    const b = o.best;
    if (!b) return '';
    if (b.tile === null || b.reward <= 0) return '; no square would have raised it at this pass';
    if (o.taken && o.taken.tile === b.tile) return ': the best square at this pass';
    return `; the best square at this pass would have raised it by ${points(b.reward)}`;
  },
  end: (o: OneLook) => `This copy plays back recorded answers, so it scores one look: ${ONE_LOOK_WORDS.head(o.taken!)}${ONE_LOOK_WORDS.best(o)}.`,
  whole: 'A whole round, with all its looks, runs with the project on your own machine.',
  resultsLine: 'At this pass',
  you: 'You',
  bestSquare: 'The best square',
  letGo: 'Let this pass go.',
  noneObjective: 'Choose a fire you can play',
  none: 'This copy of the page plays back recorded answers, and none of them scores a look on this fire.',
  noneWhole: 'A round runs with the project on your own machine.',
};

/** The round's end after the one look: you, the best square, then each player at that pass, in points. */
export function oneLookRows(o: OneLook): ResultRow[] {
  const rows: ResultRow[] = [];
  const add = (name: string, gain: number | null, strong: boolean, note: string | null) => {
    const value = points(gain);
    if (gain === null || value === null) return;
    rows.push({ name, value, gain, strong, note });
  };
  if (o.taken) add(ONE_LOOK_WORDS.you, o.taken.reward ?? 0, true, o.taken.tile === null ? ONE_LOOK_WORDS.letGo : null);
  if (o.best && o.best.tile !== null && o.best.reward > 0) add(ONE_LOOK_WORDS.bestSquare, o.best.reward, false, null);
  for (const p of o.players ?? []) add(p.name, p.reward, false, p.tile === null ? ONE_LOOK_WORDS.letGo : null);
  return rows;
}
