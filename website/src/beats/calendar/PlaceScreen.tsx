import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Box, FeaturedFire, Places, Place } from '../../app/places';
import { FireBlock } from '../../compare/FireBlock';
import { ChooseOnEarth } from '../../world/ChooseOnEarth';
import '../../styles/place-screen.css';

const lat = (v: number) => `${Math.abs(v).toFixed(2)} ${v < 0 ? 'S' : 'N'}`;
const lon = (v: number) => `${Math.abs(v).toFixed(2)} ${v < 0 ? 'W' : 'E'}`;
/** "39.31 N to 40.31 N, 121.55 W to 120.55 W", as the box calendar labels a box. */
export const boxWords = (b: Box) => `${lat(b[1])} to ${lat(b[3])}, ${lon(b[0])} to ${lon(b[2])}`;

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

// On a phone the open row leaves out the fire's own ground: the list's part of the screen holds the row's words and
// its action, not a block as well, and the block's run is not asked for there
const PHONE = '(max-width: 600px)';
const watchPhone = (changed: () => void) => {
  const m = window.matchMedia(PHONE);
  m.addEventListener('change', changed);
  return () => m.removeEventListener('change', changed);
};
const isPhone = () => window.matchMedia(PHONE).matches;

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
  const phone = useSyncExternalStore(watchPhone, isPhone, () => false);
  useEffect(() => {
    if (phone) setCredit(null);
  }, [phone]);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);
  // The Earth's first view, and what Find asked it to open: a place's card, or an area of a degree round coordinates
  const [earth, setEarth] = useState<{ key: number; focus: Box | undefined; open: string | null; box: Box | null }>({
    key: 0,
    focus: undefined,
    open: null,
    box: null,
  });

  /**
   * A box widened above and below by the trail and the guide, so that what it holds is seen clear of them when the
   * Earth fits it to its canvas, which runs from the left edge to the list and from the top to the bottom.
   */
  const clearOf = useCallback((b: Box, pad: number): Box => {
    const el = rootRef.current;
    const dx = (b[2] - b[0]) * pad;
    const dy = (b[3] - b[1]) * pad;
    const cx = (b[0] + b[2]) / 2;
    const cy = (b[1] + b[3]) / 2;
    // On a narrow screen the Earth has its own part of the screen, between the trail and the list
    if ((el?.clientWidth || 1440) < 900) return [cx - dx / 2, Math.max(-85, cy - dy / 2), cx + dx / 2, Math.min(85, cy + dy / 2)];
    const h = el?.clientHeight || 900;
    const css = el ? getComputedStyle(el) : null;
    const px = (name: string, fallback: number) => Number.parseFloat(css?.getPropertyValue(name) ?? '') || fallback;
    const top = px('--place-top', 104);
    const bottom = px('--place-guide', 170);
    const vert = (dy * (top + bottom)) / Math.max(1, h - top - bottom);
    return [cx - dx / 2, Math.max(-85, cy - dy / 2 - (vert * bottom) / (top + bottom)), cx + dx / 2, Math.min(85, cy + dy / 2 + (vert * top) / (top + bottom))];
  }, []);

  // The first view: every place with a featured fire, with room round them, clear of the list, the trail and the guide
  useEffect(() => {
    if (earth.focus || firms.length === 0) return;
    const b: Box = [
      Math.min(...firms.map((p) => p.box[0])) - 8,
      Math.min(...firms.map((p) => p.box[1])) - 8,
      Math.max(...firms.map((p) => p.box[2])) + 8,
      Math.max(...firms.map((p) => p.box[3])) + 8,
    ];
    setEarth((e) => ({ ...e, focus: clearOf(b, 1) }));
  }, [firms, earth.focus, clearOf]);

  // When the screen opens the keyboard's focus is on the fire on the land, or on the first fire: Enter shows it, the
  // arrows move between fires, and its card says what it is
  useEffect(() => {
    const rows = listRef.current?.querySelectorAll<HTMLButtonElement>('.place__fire');
    if (!rows || rows.length === 0) return;
    const at = [...rows].find((r) => r.dataset.fire === currentFire) ?? rows[0];
    at.focus({ preventScroll: true });
  }, [fires.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // The open row is brought whole into the list's view, its ground and its action with it
  useEffect(() => {
    const open = listRef.current?.querySelector<HTMLElement>('.place__item[data-open="true"]');
    open?.scrollIntoView({ block: 'nearest' });
  }, [chosen]);

  const search = () => {
    const q = query.trim();
    if (!q) return;
    const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) {
      const la = Number(m[1]);
      const lo = Number(m[2]);
      if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
        const b: Box = [lo - 0.5, la - 0.5, lo + 0.5, la + 0.5].map((n) => Math.round(n * 100) / 100) as Box;
        setNote(null);
        setEarth((e) => ({ key: e.key + 1, focus: clearOf(b, 6), open: null, box: b }));
        return;
      }
    }
    const t = q.toLowerCase();
    for (const { place, fire } of fires) {
      if ((fire.name ?? '').toLowerCase().includes(t) || fire.label.toLowerCase().includes(t) || place.name.toLowerCase().includes(t)) {
        setNote(null);
        setEarth((e) => ({ key: e.key + 1, focus: clearOf(place.box, 30), open: place.id, box: null }));
        listRef.current?.querySelector<HTMLElement>(`[data-fire="${CSS.escape(fire.id)}"]`)?.scrollIntoView({ block: 'nearest' });
        return;
      }
    }
    setNote(PLACE_WORDS.noneNamed(q));
  };

  // The screen's own key is Escape, which goes back once the Earth has not used it (to stop drawing, close its card
  // or clear its box): the Earth takes its keys first.
  const live = useRef({ onClose });
  live.current = { onClose };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t && t !== document.body && !rootRef.current?.contains(t)) return;
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
      <div className="place__map">
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
          <input className="place__input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={PLACE_WORDS.find} aria-label={PLACE_WORDS.findLabel} />
          {note && <span className="sys-label place__note">{note}</span>}
        </form>
        <div className="place__list" ref={listRef} role="list" aria-label={PLACE_WORDS.fires} onKeyDown={onListKey}>
          {firms.map((place) => (
            <div key={place.id} className="place__group" role="listitem">
              <button
                type="button"
                className="place__placename sys-label"
                tabIndex={-1}
                onClick={() => setEarth((e) => ({ key: e.key + 1, focus: clearOf(place.box, 30), open: place.id, box: null }))}
              >
                {place.name}
              </button>
              {place.featured_fires
                .filter((f) => f.default_start)
                .map((fire) => {
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
                          {!phone && (
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
