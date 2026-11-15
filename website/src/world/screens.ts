import { useSyncExternalStore } from 'react';

/**
 * Which picture of the world is open over the page, if any: the Earth's years, the test across the world or tonight's
 * sealed predictions. `WorldScreens` (mounted once by the page) draws it; anything on the page opens one with
 * `openWorldScreen` and Escape closes it back to what was under it.
 *
 * It follows the address: `?world=years`, `?world=test` and `?world=sealed` open a picture directly, and the address
 * says the picture on show while it is open. The years also take `view=counted` or `view=onescale`, `from=<year>`,
 * `until=<year>` and `play=1`; the film opens `?film=auto&world=years&view=counted&from=2010&until=2012&play=1`.
 */

export type WorldScreenName = 'years' | 'test' | 'sealed';

export interface YearsStart {
  view?: 'counted' | 'onescale';
  from?: number;
  until?: number;
  play?: boolean;
}

export interface WorldScreen {
  name: WorldScreenName;
  years?: YearsStart;
}

const NAMES: WorldScreenName[] = ['years', 'test', 'sealed'];
const YEAR_KEYS = ['view', 'from', 'until', 'play'];

function yearOf(v: string | null): number | undefined {
  const n = Number(v);
  return v && Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : undefined;
}

/** The picture an address opens, or null. */
export function screenOfAddress(search: string): WorldScreen | null {
  const q = new URLSearchParams(search);
  const name = q.get('world') as WorldScreenName | null;
  if (!name || !NAMES.includes(name)) return null;
  if (name !== 'years') return { name };
  const v = q.get('view');
  const view = v === 'onescale' || v === 'one_scale' || v === 'harmonized' ? 'onescale' : v === 'counted' || v === 'as_counted' || v === 'detected' ? 'counted' : undefined;
  const play = q.get('play');
  return { name, years: { view, from: yearOf(q.get('from')), until: yearOf(q.get('until')), play: play === null ? undefined : play !== '0' } };
}

let current: WorldScreen | null = typeof window !== 'undefined' ? screenOfAddress(window.location.search) : null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

// The address says the picture on show; the page's other parameters (film, a place) are kept as they are.
function writeAddress(s: WorldScreen | null) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('world');
  for (const k of YEAR_KEYS) url.searchParams.delete(k);
  if (s) {
    url.searchParams.set('world', s.name);
    if (s.years?.view) url.searchParams.set('view', s.years.view);
    if (s.years?.from) url.searchParams.set('from', String(s.years.from));
    if (s.years?.until) url.searchParams.set('until', String(s.years.until));
    if (s.years?.play) url.searchParams.set('play', '1');
  }
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url.href);
}

// The Earth's years are the level above the test and the sealed predictions: a board opened from the years (or from
// another board opened from them) goes back to them; anything else goes back to what was under it.
let earth: WorldScreen | null = null;

/** Open a picture of the world over the page. */
export function openWorldScreen(name: WorldScreenName, years?: YearsStart) {
  earth = name === 'years' ? null : current?.name === 'years' ? current : current ? earth : null;
  current = { name, ...(name === 'years' && years ? { years } : {}) };
  writeAddress(current);
  emit();
}

/** Close the picture on show, back to what was under it. */
export function closeWorldScreen() {
  earth = null;
  if (!current) return;
  current = null;
  writeAddress(null);
  emit();
}

/** Where the picture on show goes back to: the Earth's years when it was opened from them, else null (what is under). */
export function backOfWorldScreen(): WorldScreen | null {
  return earth;
}

/** One level back: to the Earth's years when the picture was opened from them, else closed to what was under it. */
export function backWorldScreen() {
  const to = earth;
  if (!to) {
    closeWorldScreen();
    return;
  }
  earth = null;
  current = to;
  writeAddress(current);
  emit();
}

/** The picture on show, or null. */
export function worldScreenOnShow(): WorldScreen | null {
  return current;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useWorldScreen(): WorldScreen | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
