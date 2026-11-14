import type { NextLookRevealed } from '../../content/demo/nextLook';

/** One decision of the round: the look's slot, the tile chosen (null: passed) and what it revealed. */
export interface RoundPick {
  decision: number;
  tile: number | null;
  pixels: number;
  /** What the look's answer revealed: the hidden detections of its slot inside the tile. */
  revealed: NextLookRevealed[];
  /** The change in the score this look made. */
  reward?: number | null;
}

export interface RoundState {
  decision: number;
  picks: RoundPick[];
  /** The current look has been spent; the result shows until the player moves on. */
  awaitingNext: boolean;
  /** The look the last answer said comes next; null when the round is over. */
  next: number | null;
  done: boolean;
}

export const NEW_ROUND: RoundState = { decision: 0, picks: [], awaitingNext: false, next: 0, done: false };
