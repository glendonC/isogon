import { SCRIPT } from '../guide/script';

/**
 * Every name and one-line description the product shows for its parts, in one place, so a change of name is one
 * edit. The words follow the product's vocabulary: pass, look, detection, estimate.
 */

export type BeatId = 'calendar' | 'model' | 'world' | 'agent';

export interface BeatName {
  id: BeatId;
  /** The name in the bar and where the part opens. */
  name: string;
  /** The key that opens it. */
  key: string;
  /** One line under the name, the same on the landing and where the part opens. */
  line: string;
  /** The line where the part opens on a recorded test fire, when the usual line would not be true there. */
  recordLine?: string;
  /** The line where the part opens on a run from before VIIRS flew, when the usual line would not be true there. */
  earlyLine?: string;
  /** The line where the part shows a run with every satellite (a hide that has not happened), so as to stay true. */
  openLine?: string;
}

export const BEATS: readonly BeatName[] = [
  { id: 'calendar', name: 'Calendar', key: '0', line: 'Fire record, November 2000 to this month, on one scale.' },
  {
    id: 'model',
    name: '1 World model',
    key: '1',
    line: 'This fire rebuilt from MODIS alone, then checked against VIIRS, which is hidden.',
    recordLine: 'A recorded test fire: its test is on record, and the terrain shows every satellite.',
    earlyLine: 'Before 2012 no VIIRS flew: this fire rebuilt from MODIS alone, with nothing hidden.',
    openLine: 'This fire with every satellite. Hide VIIRS to test the estimate made from MODIS alone.',
  },
  {
    id: 'world',
    name: '2 Test world',
    key: '2',
    line: 'The same fire with VIIRS hidden. A few looks to spend. You choose where to look.',
  },
  { id: 'agent', name: '3 Agent', key: '3', line: 'A rule and a learned agent play the same round. Watch where they look.' },
];

export const beatOf = (id: BeatId): BeatName => BEATS.find((b) => b.id === id) ?? BEATS[0];

/** The landing's one entry, in the script's words: the start step's action that opens the Record (Enter). */
export const ENTRY =
  SCRIPT.steps.find((s) => s.id === 'start')?.states.find((x) => x.id === 'ready')?.actions.find((a) => a.command === 'go:record')?.label ??
  'See the fire record here';

/** The bar's reading entry: the evidence first, then method, sensors, sources. */
export const READING = 'Method';

/** The three parts under the landing's hero, by the same names as the bar, without their numbers. */
export const PART_NAMES = {
  model: 'World model',
  environment: 'Test world',
  agent: 'Agent',
} as const;
