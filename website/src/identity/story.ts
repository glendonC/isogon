import { WORDS } from './words.ts';

/** The story in the order Play tells it and the bottom line shows it. */
export const STORY = ['world', 'jump', 'place', 'fire', 'tested', 'live', 'turn'] as const;
export type StoryPart = (typeof STORY)[number];
export type PartState = 'done' | 'on' | 'ahead';

export interface StoryFigures {
  /** The year the second sensor starts counting, from the yearly record. */
  jumpYear?: number | null;
  /** How many fires the blind test scored, from the evidence route. */
  testedFires?: number | null;
}

export function storyLabels({ jumpYear, testedFires }: StoryFigures = {}): Record<StoryPart, string> {
  return {
    world: WORDS.story.world,
    jump: jumpYear != null ? String(jumpYear) : WORDS.story.jump,
    place: WORDS.story.place,
    fire: WORDS.story.fire,
    tested: testedFires != null ? `${testedFires} fires` : WORDS.story.tested,
    live: WORDS.story.live,
    turn: WORDS.story.turn,
  };
}

export function partState(part: StoryPart, current: StoryPart | null): PartState {
  if (current === null) return 'ahead';
  const at = STORY.indexOf(current);
  const i = STORY.indexOf(part);
  if (i < at) return 'done';
  if (i === at) return 'on';
  return 'ahead';
}

/** The share of the current part already played, clamped, for the line's fill while Play runs. */
export function partFill(progress: number | null | undefined) {
  if (progress == null || !Number.isFinite(progress)) return 1;
  return Math.min(1, Math.max(0, progress));
}
