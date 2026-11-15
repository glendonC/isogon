import { useSyncExternalStore } from 'react';

/**
 * What The Record tells the rest of the page while it is open, and the commands it takes: the month that is marked
 * (the fire the stage holds or opens on), the month the visitor picked, the facts of the correction, and whether the
 * record is loading or failed. The guide reads this to say its lines and to offer its actions; it holds no figure of
 * its own. Every number here is one the record's answer served.
 */

export interface RecordMonthView {
  /** "2012-08". */
  ym: string;
  /** "August 2012". */
  words: string;
  /** A real fire of this month can be shown on the stage. */
  opens: boolean;
  /** Detections per 1,000 km² a day, every year on the sharp satellite's scale; null where no satellite flew. */
  rate: number | null;
  /** The median of this calendar month over the record's years, in the same unit. */
  usual: number | null;
  /** This month over that median (2 is twice a usual one). */
  timesUsual: number | null;
  /** 1 is the most fire among this calendar month's years, and how many years that is of. */
  rank: number | null;
  rankOf: number | null;
  /** The route of this month's detections as a CSV file, for the page's link through its client. */
  csvPath: string;
}

export interface RecordView {
  /** `not loaded`: a drawn area none of whose squares has a detection, so it has no record (not a failure). */
  state: 'closed' | 'loading' | 'ready' | 'failed' | 'not recorded' | 'not loaded';
  /** Why, when the record did not load. */
  failure: string | null;
  /** "Feather River & Plumas, CA", or a box's corners in words. */
  place: string;
  /**
   * A drawn area as the fire cube reads it: the box on every whole square it touches, in words (its rates are over
   * that box), how many squares and how many have any detection in the files, and whether every country is loaded.
   * Null for a region of the registry.
   */
  grid: { box: string; cells: number; loaded: number; complete: boolean } | null;
  /**
   * The sentence the Record says where the record's check finds the two satellites' ratio does not hold here (lava or
   * gas flares can do this): the harmonized value is not meaningful. Null where the place is stable or not tested.
   */
  unstable: string | null;
  firstYear: number | null;
  lastYear: number | null;
  /** The unit of every rate, in plain words. */
  unit: string | null;
  /** The month of the fire the stage holds or opens on. One action shows it. */
  marked: RecordMonthView | null;
  /** The month the visitor picked in the grid, when it is not the marked one. */
  picked: RecordMonthView | null;
  correction: {
    /** The first year the sharp satellite counted here. */
    sharpFromYear: number | null;
    /** How many times more the sharp satellite flags than the coarse one, over the months both flew. */
    ratio: number | null;
    /** Hide one year and predict it from the others: the share the prediction is off by, with the correction and without. */
    heldOut: number | null;
    heldOutWithout: number | null;
    /** The grid is showing the years as counted, before the correction. */
    asCounted: boolean;
  };
  /** This month so far, once the visitor has asked for it. */
  now: {
    state: 'idle' | 'loading' | 'ready' | 'unavailable';
    /** "2026-11" and "November 2026". */
    ym: string | null;
    words: string | null;
    /** The rate over the days counted, the median of this calendar month, and their ratio as served. */
    rate: number | null;
    usual: number | null;
    timesUsual: number | null;
    daysCounted: number | null;
    daysInMonth: number | null;
    /** Why the figure is rough, as the route says it, sentence by sentence. */
    caveats: string[];
    /** Why it cannot be counted now, in words, when it cannot. */
    why: string | null;
  };
  /** Ask for this month so far. */
  askNow: () => void;
  /** Show the fire of a month on the stage: the picked month when there is one, else the marked one. */
  show: (ym?: string) => void;
  /** Pick a month ("2021-07"); none goes back to the marked one. */
  pick: (ym: string | null) => void;
  /** Let the visitor look over the months: the ones with a fire to show get their corner marks. */
  browse: () => void;
  /** Draw the years as the satellites counted them, or back on one scale. */
  showAsCounted: (on: boolean) => void;
}

const nothing = () => undefined;

export const RECORD_CLOSED: RecordView = {
  state: 'closed',
  failure: null,
  place: '',
  grid: null,
  unstable: null,
  firstYear: null,
  lastYear: null,
  unit: null,
  marked: null,
  picked: null,
  correction: { sharpFromYear: null, ratio: null, heldOut: null, heldOutWithout: null, asCounted: false },
  now: { state: 'idle', ym: null, words: null, rate: null, usual: null, timesUsual: null, daysCounted: null, daysInMonth: null, caveats: [], why: null },
  askNow: nothing,
  show: nothing,
  pick: nothing,
  browse: nothing,
  showAsCounted: nothing,
};

let view: RecordView = RECORD_CLOSED;
const listeners = new Set<() => void>();

/** The Record says what it holds. Only The Record calls this. */
export function publishRecordView(next: RecordView) {
  view = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const readRecordView = () => view;

/** The Record's view, for the guide: it changes when the visitor picks a month or the record arrives. */
export function useRecordView(): RecordView {
  return useSyncExternalStore(subscribe, readRecordView, readRecordView);
}
