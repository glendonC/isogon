import { useSyncExternalStore } from 'react';

/**
 * What the players' picture tells the rest of the page while it is open, and the commands it takes. The guide reads
 * it to say its lines and to offer its actions. Every gain is one the round's end or a play served.
 */

export interface PlayerView {
  /** "you", or the player's id as the backend names it. */
  id: string;
  name: string;
  /** What the player's looks added to the agreement, as a share (0.114 is 11.4 points). For Chance, the mean. */
  gain: number | null;
  /** Chance only: over how many rounds of random looks, and the least and the most of them. */
  rounds?: number;
  least?: number;
  most?: number;
  /** The earlier player whose looks this one's equal, when there is one. */
  sameLooksAs: string | null;
}

export interface PlayersView {
  state: 'closed' | 'held' | 'loading' | 'ready' | 'failed';
  /** Why, when the picture has nothing to draw. */
  line: string | null;
  /** Where the plays come from: the round the visitor just played, or plays asked for on the open fire. */
  from: 'round' | 'plays' | null;
  players: PlayerView[];
  /** What the looks found is drawn; and whether the visitor may ask for it now. */
  foundShown: boolean;
  canReveal: boolean;
  /** The looks are being played one after another. */
  watching: boolean;
  reveal: () => void;
  watch: () => void;
}

const nothing = () => undefined;

export const PLAYERS_CLOSED: PlayersView = {
  state: 'closed',
  line: null,
  from: null,
  players: [],
  foundShown: false,
  canReveal: false,
  watching: false,
  reveal: nothing,
  watch: nothing,
};

let view: PlayersView = PLAYERS_CLOSED;
const listeners = new Set<() => void>();

/** The picture says what it holds. Only the picture calls this. */
export function publishPlayersView(next: PlayersView) {
  view = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const readPlayersView = () => view;

export function usePlayersView(): PlayersView {
  return useSyncExternalStore(subscribe, readPlayersView, readPlayersView);
}
