import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Box, FeaturedFire, Places, Place } from '../../app/places';
import { FireBlock } from '../../compare/FireBlock';
import { ChooseOnEarth } from '../../world/ChooseOnEarth';
import { K } from '../../world/projection';
import '../../styles/place-screen.css';

import { boxWords } from './placeWords';
export { boxWords };

/**
 * Every sentence this screen itself puts on screen: labels on things (a fire in the list, its card) and the actions
 * beside them. The Earth's own words are in `world/words.ts`; what the screen is for is the guide's to say.
 */
export const PLACE_WORDS = {
  name: 'Choose a Place',
  /** What a fire is to the model, by the registry's word for it. A word the registry adds later is shown as it is. */
  standing: {
    'never seen': 'Never seen by the model',
    'fitted on': 'The model was tuned on it',
    'validated on': 'The model was checked on it',
    'recorded test fire': 'A recorded test fire',
  } as Record<string, string>,
  /** What showing the fire will do, by how the registry opens it: said to someone who does not know the model. */
  opens: {
    recorded:
      'The model was tested on this fire once, with the sharp satellite hidden, and that result is on record. Here it opens with both satellites shown.',
    held: 'It opens with the sharp satellite hidden, so you can see the estimate and then test it.',
    heldTuned: 'It opens with the sharp satellite hidden. The model was tuned on fires of these years here, so its test is not a fair one.',
  },
  among: (name: string) => `Fires here in this period, among them the ${name}`,
  show: 'Show this fire',
  find: 'Find a place, a fire, or latitude, longitude',
  findLabel: 'Find a place by name or coordinates',
  fires: 'Featured fires',
  back: 'Back',
  /** The line under the list while fires are below its last whole row. */
  below: (n: number) => (n === 1 ? '1 more fire below' : `${n} more fires below`),
  loadingFire: "Loading this fire's ground",
  failedFire: "This fire's ground did not load.",
  noneNamed: (q: string) => `No place or fire named "${q}". Coordinates work anywhere: latitude, longitude.`,
  imagery: (credit: string) => `Imagery: ${credit}`,
};

/** What the fire is to the model, in a few words. */
export const standingOf = (f: FeaturedFire): string | null => {
  const word = f.to_the_world_model ?? (f.blind_test_fire ? 'recorded test fire' : null);
  return word ? PLACE_WORDS.standing[word] ?? `${word[0].toUpperCase()}${word.slice(1)}` : null;
};

/** What showing a fire will do for the visitor, from how the registry opens it and what the fire is to the model. */
export const opensOf = (f: FeaturedFire): string =>
  f.blind_test_fire || f.opens?.holdout_viirs === false
    ? PLACE_WORDS.opens.recorded
    : f.to_the_world_model === 'fitted on'
      ? PLACE_WORDS.opens.heldTuned
      : PLACE_WORDS.opens.held;

/** One more sentence on a fire: the fires an agency list names in its box and period. */
const aboutOf = (f: FeaturedFire): string | null => (f.name ? PLACE_WORDS.among(f.name) : null);

// On a phone, and on a screen too short for the open row to hold a block and its words with other rows in view, the
// open row leaves out the fire's own ground: the list's part of the screen holds the row's words and its action, and
// the block's run is not asked for there
const NO_BLOCK = '(max-width: 600px), (max-height: 775px)';
const watchNoBlock = (changed: () => void) => {
  const m = window.matchMedia(NO_BLOCK);
  m.addEventListener('change', changed);
  return () => m.removeEventListener('change', changed);
};
const isNoBlock = () => window.matchMedia(NO_BLOCK).matches;

/** An area of a degree round coordinates typed as "latitude, longitude"; null for anything else. */
const coordsOf = (q: string): Box | null => {
  const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const la = Number(m[1]);
  const lo = Number(m[2]);
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return [lo - 0.5, la - 0.5, lo + 0.5, la + 0.5].map((n) => Math.round(n * 100) / 100) as Box;
};
/** A fire named by words: its own name or its period. */
const named = (fire: FeaturedFire, t: string) => (fire.name ?? '').toLowerCase().includes(t) || fire.label.toLowerCase().includes(t);

export interface PlaceScreenProps {
  places: Places;
  /** The fire on the land now, marked with corner marks. */
  currentFire: string | null;
  onFire: (place: Place, fire: FeaturedFire) => void;
  onBox: (box: Box) => void;
  onClose: () => void;
}

/**
 * Choose a Place, opened over the stage. The Earth is the screen (`world/ChooseOnEarth`): where fire is detected,
 * every featured fire's place as a mark with its own card, and an area drawn anywhere, whose fire record then opens.
 * Beside it the featured fires are a list, grouped by place, as long as the registry makes it. The chosen fire's row
 * opens where it stands: the fire's own terrain, what it is to the model, what showing it will do, and the action
 * that shows it. Nothing of the list stands over the Earth. Find brings a place or coordinates into view.
 */
export function PlaceScreen({ places, currentFire, onFire, onBox, onClose }: PlaceScreenProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // The row that was open when a pointer pressed a row: pressing gives the row the focus, which opens it, before the
  // click lands, so the click asks what was open at the press, not after it
  const openAtPress = useRef<string | null>(null);
  const firms = useMemo(() => places.places.filter((p) => p.rows === 'firms' && p.featured_fires.some((f) => f.default_start)), [places]);
  const fires = useMemo(() => firms.flatMap((place) => place.featured_fires.filter((f) => f.default_start).map((fire) => ({ place, fire }))), [firms]);
  // The fire whose row is open: the fire on the land first, then the one the keyboard's focus or a click moves to
  const [chosen, setChosen] = useState<string | null>(currentFire);
  const [credit, setCredit] = useState<string | null>(null);
  const noBlock = useSyncExternalStore(watchNoBlock, isNoBlock, () => false);
  useEffect(() => {
    if (noBlock) setCredit(null);
  }, [noBlock]);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);
  // What Find found, which Enter again with the same words opens
  const found = useRef<{ q: string; open: () => void } | null>(null);
  // The list narrowed by the words in the field: a place named shows all its fires, a fire named only itself
  const narrowBy = query.trim().toLowerCase();
  const listed = useMemo(() => {
    if (!narrowBy || coordsOf(narrowBy)) return firms.map((place) => ({ place, shown: place.featured_fires.filter((f) => f.default_start) }));
    return firms
      .map((place) => {
        const withStart = place.featured_fires.filter((f) => f.default_start);
        return { place, shown: place.name.toLowerCase().includes(narrowBy) ? withStart : withStart.filter((f) => named(f, narrowBy)) };
      })
      .filter((g) => g.shown.length > 0);
  }, [firms, narrowBy]);
  // The Earth's first view, and what Find asked it to open: a place's card, or an area of a degree round coordinates
  const [earth, setEarth] = useState<{ key: number; focus: Box | undefined; open: string | null; box: Box | null }>({
    key: 0,
    focus: undefined,
    open: null,
    box: null,
  });

  /**
   * The box to give the Earth so that a box of places is seen whole in the free part of its canvas: below the trail,
   * above the guide and above the room kept for the Earth's legend. With featured fires on every continent no corner
   * of the map is free of marks, so the legend's height is kept below them all. The Earth fits the box it is given to
   * its whole canvas by a linear projection (`world/projection`), so the box is worked out from the view wanted: its
   * scale, and its centre moved so that the places' centre falls in the middle of the free part. At the world's
   * scale that box runs past the poles, which the projection takes as plain numbers.
   */
  // The Earth's legend as it stands, measured once drawn; and whether the visitor has moved the map since it opened
  const legendH = useRef<number | null>(null);
  const [legendSeen, setLegendSeen] = useState(0);
  const touched = useRef(false);
  const clearOf = useCallback((b: Box, pad: number): Box => {
    const el = rootRef.current;
    const map = el?.querySelector<HTMLElement>('.place__map');
    const w = map?.clientWidth || 1000;
    const h = map?.clientHeight || 700;
    const css = el ? getComputedStyle(el) : null;
    const px = (name: string, fallback: number) => {
      const v = Number.parseFloat(css?.getPropertyValue(name) ?? '');
      return Number.isFinite(v) ? v : fallback;
    };
    // On a narrow screen the Earth has its own part of the screen, below the trail and above the list
    const narrow = (el?.clientWidth || 1440) < 900;
    const top = narrow ? 0 : px('--place-top', 104);
    // Under 640 pixels the Earth fits itself above its own legend; wider, the legend's height is kept, as measured
    const legend = w < 640 ? 0 : legendH.current !== null ? legendH.current + 16 : px('--place-legend', 0);
    const bottom = (narrow ? 0 : px('--place-guide', 170)) + legend;
    const free = Math.max(40, h - top - bottom);
    const dx = (b[2] - b[0]) * pad;
    const dy = (b[3] - b[1]) * pad;
    const cx = (b[0] + b[2]) / 2;
    const cy = (b[1] + b[3]) / 2;
    // The Earth keeps a margin of six in a hundred round the box it fits (fitView)
    const FIT = 1.06;
    const scale = Math.max((dx * K) / w, dy / free) * FIT;
    const viewY = -cy - (top + free / 2 - h / 2) * scale;
    const halfLon = (w * scale) / FIT / K / 2;
    const halfLat = (h * scale) / FIT / 2;
    return [cx - halfLon, -viewY - halfLat, cx + halfLon, -viewY + halfLat];
  }, []);

  // The legend's height changes as its layer loads; until the visitor moves the map the first view follows it
  useEffect(() => {
    const lg = rootRef.current?.querySelector<HTMLElement>('.place__map .world-legend');
    if (!lg) return;
    const ro = new ResizeObserver(() => {
      const h = Math.round(lg.offsetHeight);
      if (h === legendH.current) return;
      legendH.current = h;
      setLegendSeen(h);
    });
    ro.observe(lg);
    return () => ro.disconnect();
  }, [earth.key, Boolean(earth.focus)]); // eslint-disable-line react-hooks/exhaustive-deps

  // The first view: every place with a featured fire, with room round them, clear of the list, the trail, the guide
  // and the legend. Find opens another view (a new key), after which the first is not fitted again.
  useEffect(() => {
    if (firms.length === 0 || earth.key !== 0 || (earth.focus && touched.current)) return;
    const b: Box = [
      Math.min(...firms.map((p) => p.box[0])) - 8,
      Math.min(...firms.map((p) => p.box[1])) - 8,
      Math.max(...firms.map((p) => p.box[2])) + 8,
      Math.max(...firms.map((p) => p.box[3])) + 8,
    ];
    const next = clearOf(b, 1);
    setEarth((e) => (e.focus && e.focus.join(',') === next.join(',') ? e : { ...e, focus: next }));
  }, [firms, earth.key, legendSeen, clearOf]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the screen opens the keyboard's focus is on the fire on the land, or on the first fire: Enter shows it, the
  // arrows move between fires, and its card says what it is
  useEffect(() => {
    const rows = listRef.current?.querySelectorAll<HTMLButtonElement>('.place__fire');
    if (!rows || rows.length === 0) return;
    const at = [...rows].find((r) => r.dataset.fire === currentFire) ?? rows[0];
    at.focus({ preventScroll: true });
  }, [fires.length]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The list ends inside the screen on a whole row. It scrolls within its own height; a row its edge would cut is not
   * drawn until it is scrolled whole into view, a place's name stays at the top while its fires are in view, and the
   * line under the list says how many fires are below. A row taller than the list (the open row on a short screen) is
   * drawn while any of it is in view.
   */
  const [below, setBelow] = useState(0);
  const markWhole = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const L = list.getBoundingClientRect();
    const pad = Number.parseFloat(getComputedStyle(list).paddingTop) || 0;
    let n = 0;
    for (const group of list.querySelectorAll<HTMLElement>('.place__group')) {
      const name = group.querySelector<HTMLElement>('.place__placename');
      const N = name?.getBoundingClientRect();
      if (name && N) name.dataset.whole = String(N.top >= L.top - 1 && N.bottom <= L.bottom + 1);
      // A fire under its place's name is whole below the name, which stands over it at the top
      const floor = Math.max(L.top, N?.bottom ?? L.top);
      // The most of a row the list can show: all of it below its place's name at the top
      const room = L.height - pad - (N?.height ?? 0);
      for (const item of group.querySelectorAll<HTMLElement>('.place__item')) {
        const r = item.getBoundingClientRect();
        const whole = r.height > room + 1 ? r.bottom > floor && r.top < L.bottom : r.top >= floor - 1 && r.bottom <= L.bottom + 1;
        item.dataset.whole = String(whole);
        if (!whole && r.bottom > L.bottom + 1) {
          n += 1;
          // A place's name is not left at the foot of the list without its first fire
          if (name && item === group.querySelector('.place__item')) name.dataset.whole = 'false';
        }
      }
    }
    setBelow(n);
  }, []);
  // Where the list may rest: the scroll positions at which a row starts at its top, a fire below its place's name
  const restsOf = (list: HTMLElement) => {
    const L = list.getBoundingClientRect();
    const pad = Number.parseFloat(getComputedStyle(list).paddingTop) || 0;
    const at = (el: Element) => el.getBoundingClientRect().top - L.top + list.scrollTop;
    const rests: number[] = [];
    for (const g of list.querySelectorAll<HTMLElement>('.place__group')) {
      const nameH = g.querySelector<HTMLElement>('.place__placename')?.offsetHeight ?? 0;
      rests.push(Math.round(at(g) - pad));
      for (const item of g.querySelectorAll('.place__item')) rests.push(Math.round(at(item) - pad - nameH));
    }
    return { rests: [...new Set(rests)].sort((a, b) => a - b), pad, at };
  };
  // The scroll positions between which a row is whole: its top below its place's name, its foot above the list's
  const wholeBetween = (list: HTMLElement, item: HTMLElement) => {
    const { pad, at } = restsOf(list);
    const nameH = item.closest('.place__group')?.querySelector<HTMLElement>('.place__placename')?.offsetHeight ?? 0;
    const top = at(item);
    return { lo: top + item.offsetHeight - list.clientHeight, hi: top - pad - nameH };
  };
  // A row is brought whole into view, the list resting with a row whole at its top
  const bringWhole = useCallback((item: HTMLElement | null | undefined) => {
    const list = listRef.current;
    if (!list || !item) return;
    const { lo, hi } = wholeBetween(list, item);
    const s = list.scrollTop;
    if (s >= lo - 1 && s <= hi + 1) return;
    if (s > hi || lo > hi) list.scrollTop = hi;
    else list.scrollTop = restsOf(list).rests.find((v) => v >= lo && v <= hi) ?? lo;
  }, []);
  // Once scrolling stops the list moves to the nearer place to rest, unless that would cut the open row
  const settle = () => {
    const list = listRef.current;
    if (!list) return;
    const s = list.scrollTop;
    if (s >= list.scrollHeight - list.clientHeight - 1) return;
    const { rests } = restsOf(list);
    if (rests.some((v) => Math.abs(v - s) <= 1)) return;
    const up = [...rests].reverse().find((v) => v < s);
    const down = rests.find((v) => v > s);
    const open = list.querySelector<HTMLElement>('.place__item[data-open="true"]');
    const range = open ? wholeBetween(list, open) : null;
    const keeps = (v: number) => !range || !(s >= range.lo - 1 && s <= range.hi + 1) || (v >= range.lo - 1 && v <= range.hi + 1);
    const tries = [up, down].filter((v): v is number => v !== undefined && keeps(v)).sort((a, b) => Math.abs(a - s) - Math.abs(b - s));
    if (tries.length === 0) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({ top: tries[0], behavior: smooth ? 'smooth' : 'auto' });
  };
  const marking = useRef(0);
  const settling = useRef(0);
  const onListScroll = () => {
    window.clearTimeout(settling.current);
    settling.current = window.setTimeout(settle, 160);
    if (marking.current) return;
    marking.current = window.requestAnimationFrame(() => {
      marking.current = 0;
      markWhole();
    });
  };
  useEffect(
    () => () => {
      window.cancelAnimationFrame(marking.current);
      window.clearTimeout(settling.current);
    },
    [],
  );
  // Whatever changes the list's height or a row's (the screen, the note under Find, a row opening) marks it again
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const ro = new ResizeObserver(() => markWhole());
    ro.observe(list);
    for (const g of list.querySelectorAll('.place__group')) ro.observe(g);
    markWhole();
    return () => ro.disconnect();
  }, [listed, markWhole]);

  // The line under the list brings the first fire below to the top, under its place's name
  const showBelow = () => {
    const list = listRef.current;
    if (!list) return;
    const L = list.getBoundingClientRect();
    const next = [...list.querySelectorAll<HTMLElement>('.place__item')].find((r) => r.dataset.whole === 'false' && r.getBoundingClientRect().bottom > L.bottom + 1);
    if (next) list.scrollTop = wholeBetween(list, next).hi;
  };

  // The open row is brought whole into the list's view, its ground and its action with it
  useEffect(() => {
    bringWhole(listRef.current?.querySelector<HTMLElement>('.place__item[data-open="true"]'));
    markWhole();
  }, [chosen, bringWhole, markWhole]);

  /**
   * Find: coordinates draw an area of a degree round them; a name brings its place into view with its card, opens the
   * fire in the list (the one named, or the place's opening fire) and narrows the list to what it names. Enter again
   * with the same words opens what was found: the fire, or the area's record. The Earth leaves the keys of a field to
   * the field, so Escape in it clears the card or the area here.
   */
  const search = () => {
    const q = query.trim();
    if (!q) return;
    if (found.current?.q === q) {
      found.current.open();
      return;
    }
    const b = coordsOf(q);
    if (b) {
      setNote(null);
      setEarth((e) => ({ key: e.key + 1, focus: clearOf(b, 6), open: null, box: b }));
      found.current = { q, open: () => onBox(b) };
      return;
    }
    const t = q.toLowerCase();
    // A fire by its own name first; else a place by its name, on its opening fire
    const byFire = fires.find(({ fire }) => named(fire, t));
    const byPlace = byFire ? null : fires.filter(({ place }) => place.name.toLowerCase().includes(t));
    const opening = byPlace?.find(({ place, fire }) => fire.id === place.starts?.default_featured_fire) ?? byPlace?.find(({ fire }) => !fire.blind_test_fire) ?? byPlace?.[0];
    const hit = byFire ?? opening;
    if (!hit) {
      setNote(PLACE_WORDS.noneNamed(q));
      found.current = null;
      return;
    }
    setNote(null);
    setChosen(hit.fire.id);
    setEarth((e) => ({ key: e.key + 1, focus: clearOf(hit.place.box, 30), open: hit.place.id, box: null }));
    found.current = { q, open: () => onFire(hit.place, hit.fire) };
  };


  // The screen's own key is Escape, which goes back once the Earth has not used it (to stop drawing, close its card
  // or clear its box): the Earth takes its keys first.
  const live = useRef({ onClose, earth });
  live.current = { onClose, earth };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t && t !== document.body && !rootRef.current?.contains(t)) return;
      // In the field the Earth leaves Escape alone: a card or an area Find opened closes here, the view kept
      if (t?.classList.contains('place__input') && (live.current.earth.open || live.current.earth.box)) {
        setEarth((x) => ({ ...x, key: x.key + 1, open: null, box: null }));
        found.current = null;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // The Earth listens the same way and may be mounted after this screen: while it is drawing, or has a card or a
      // box open, its Escape closes that first, and this screen leaves the key to it
      if (rootRef.current?.querySelector('.world-hint, .world-card, .world-box')) return;
      live.current.onClose();
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const chosenHit = fires.find((f) => f.fire.id === chosen) ?? fires[0] ?? null;

  // The fires as a list, grouped by place in the registry's order. Up and Down move the focus between fires.
  const onListKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('.place__fire') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = items[Math.max(0, Math.min(items.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
    next?.focus();
    e.preventDefault();
  };

  return (
    <section className="place" aria-label={PLACE_WORDS.name} ref={rootRef}>
      <div
        className="place__map"
        onPointerDownCapture={() => {
          touched.current = true;
        }}
        onWheelCapture={() => {
          touched.current = true;
        }}
      >
        {earth.focus && (
          <ChooseOnEarth
            key={earth.key}
            layers="/api/cube/layers"
            factor={null}
            places={places.places}
            currentFire={currentFire}
            limits={places.boxCalendar}
            onFire={onFire}
            onBox={onBox}
            focus={earth.focus}
            startOpen={earth.open}
            startBox={earth.box}
          />
        )}
      </div>

      <div className="place__railground" aria-hidden="true" />
      <div className="place__rail">
        <form
          className="place__find"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <input
            className="place__input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setNote(null);
            }}
            placeholder={PLACE_WORDS.find}
            aria-label={PLACE_WORDS.findLabel}
          />
          {/* Why nothing is found: on Enter, or as soon as the words narrow the list to nothing */}
          {(note ?? (listed.length === 0 && narrowBy && !coordsOf(narrowBy) ? PLACE_WORDS.noneNamed(query.trim()) : null)) && (
            <span className="sys-label place__note">{note ?? PLACE_WORDS.noneNamed(query.trim())}</span>
          )}
        </form>
        <div className="place__list" ref={listRef} role="list" aria-label={PLACE_WORDS.fires} onKeyDown={onListKey} onScroll={onListScroll}>
          {listed.map(({ place, shown }) => (
            <div key={place.id} className="place__group" role="listitem">
              <button
                type="button"
                className="place__placename sys-label"
                tabIndex={-1}
                onClick={() => setEarth((e) => ({ key: e.key + 1, focus: clearOf(place.box, 30), open: place.id, box: null }))}
              >
                {place.name}
              </button>
              {shown.map((fire) => {
                  const open = chosenHit?.fire.id === fire.id;
                  return (
                    <div key={fire.id} className="place__item" data-open={open ? 'true' : 'false'}>
                      {/* A click or the focus opens a row; a click on a row already open, or Enter, shows the fire */}
                      <button
                        type="button"
                        data-fire={fire.id}
                        className="place__fire sys-sel"
                        data-selected={fire.id === currentFire ? 'true' : 'false'}
                        aria-expanded={open}
                        aria-label={[fire.label, place.name, standingOf(fire)].filter(Boolean).join(', ')}
                        onPointerDown={() => {
                          openAtPress.current = chosenHit?.fire.id ?? null;
                        }}
                        onClick={(e) => {
                          // A click from the keyboard (Enter, Space) has no press: the row is open by its focus
                          const wasOpen = e.detail === 0 ? open : openAtPress.current === fire.id;
                          if (wasOpen) onFire(place, fire);
                          else setChosen(fire.id);
                        }}
                        onFocus={() => setChosen(fire.id)}
                      >
                        <span className="place__period">{fire.label}</span>
                        <span className="sys-fine">{standingOf(fire)}</span>
                      </button>
                      {open && (
                        <div className="place__open">
                          {!noBlock && (
                            <div className="place__cardblock">
                              <FireBlock
                                place={place}
                                fire={fire}
                                onPick={() => onFire(place, fire)}
                                onCredit={setCredit}
                                loadingWords={PLACE_WORDS.loadingFire}
                                failedWords={PLACE_WORDS.failedFire}
                              />
                            </div>
                          )}
                          <span className="sys-label place__opens">{opensOf(fire)}</span>
                          {aboutOf(fire) && <span className="sys-fine">{aboutOf(fire)}</span>}
                          <button type="button" className="place__act place__act--next" tabIndex={-1} onClick={() => onFire(place, fire)}>
                            <span className="place__key">Enter</span>
                            {PLACE_WORDS.show}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
        <div className="place__more">
          {below > 0 && (
            <button type="button" className="place__act" tabIndex={-1} onClick={showBelow}>
              {PLACE_WORDS.below(below)}
            </button>
          )}
        </div>
        <div className="place__acts">
          <button type="button" className="place__act" onClick={onClose}>
            <span className="place__key">Esc</span>
            {PLACE_WORDS.back}
          </button>
        </div>
      </div>

      {credit && <p className="place__credit sys-fine">{PLACE_WORDS.imagery(credit)}</p>}
    </section>
  );
}
