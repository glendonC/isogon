import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countries from 'world-atlas/countries-50m.json';
import type { Box, FeaturedFire, Places, Place } from '../../app/places';
import { FireBlock } from '../../compare/FireBlock';
import '../../styles/place-screen.css';

/** Plate carree with longitude shortened by the cosine of 45 degrees, so the middle latitudes keep their shape. */
const K = Math.cos((45 * Math.PI) / 180);
const toX = (lon: number) => lon * K;
const toY = (lat: number) => -lat;

type Geo = { type: string; coordinates: unknown };
interface CountryShape {
  name: string;
  d: string;
}

function ringsOf(g: Geo): number[][][] {
  if (g.type === 'Polygon') return g.coordinates as number[][][];
  if (g.type === 'MultiPolygon') return (g.coordinates as number[][][][]).flat();
  return [];
}

/** Every country as one path in map units, breaking a ring where it crosses the date line. */
function countryShapes(): CountryShape[] {
  const topo = countries as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const fc = feature(topo, topo.objects.countries) as unknown as { features: Array<{ properties: { name: string }; geometry: Geo | null }> };
  return fc.features
    .filter((f) => f.geometry)
    .map((f) => {
      let d = '';
      for (const ring of ringsOf(f.geometry!)) {
        let prev: number | null = null;
        for (const [lon, lat] of ring) {
          const jump = prev !== null && Math.abs(lon - prev) > 180;
          d += `${prev === null || jump ? 'M' : 'L'}${toX(lon).toFixed(2)},${toY(lat).toFixed(2)}`;
          prev = lon;
        }
      }
      return { name: f.properties.name, d };
    });
}

interface View {
  /** Map units at the screen's centre and map units per pixel. */
  cx: number;
  cy: number;
  scale: number;
}

const lat = (v: number) => `${Math.abs(v).toFixed(2)} ${v < 0 ? 'S' : 'N'}`;
const lon = (v: number) => `${Math.abs(v).toFixed(2)} ${v < 0 ? 'W' : 'E'}`;
/** "39.31 N to 40.31 N, 121.55 W to 120.55 W", as the box calendar labels a box. */
export const boxWords = (b: Box) => `${lat(b[1])} to ${lat(b[3])}, ${lon(b[0])} to ${lon(b[2])}`;

/**
 * Every sentence this screen itself puts on screen. They are labels on things (a place on the map, a fire's block,
 * the area being drawn) and the actions beside them; what the screen is for is the guide's to say.
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
  among: (name: string) => `Fires here in this period, among them the ${name}`,
  show: 'Show this fire',
  find: 'Find a place, a fire, or latitude, longitude',
  findLabel: 'Find a place by name or coordinates',
  fires: 'Featured fires',
  draw: 'Draw an area',
  drawing: 'Drag on the map to draw an area',
  showArea: "Show this area's fire record",
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

/** One more sentence on a fire: the fires an agency list names in its box and period. */
const aboutOf = (f: FeaturedFire): string | null => (f.name ? PLACE_WORDS.among(f.name) : null);

export interface PlaceScreenProps {
  places: Places;
  /** The fire on the land now, marked with corner marks. */
  currentFire: string | null;
  onFire: (place: Place, fire: FeaturedFire) => void;
  onBox: (box: Box) => void;
  onClose: () => void;
}

/**
 * Choose a Place, opened over the stage. The world is the screen: every featured fire is a mark on it, and the
 * fires are a list beside it, grouped by place, as long as the registry makes it. A fire under the pointer or the
 * keyboard's focus, on the list or on the map, opens one card at its mark: the fire's own terrain, its period, its
 * place, what it is to the model, and the action that shows it. Any area drawn on the map opens its fire record.
 * Names on the map are written only where they meet no other; the rest are marks until the pointer is near.
 */
export function PlaceScreen({ places, currentFire, onFire, onBox, onClose }: PlaceScreenProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 1440, h: 900 });
  const [measured, setMeasured] = useState(false);
  const shapes = useMemo(countryShapes, []);
  const firms = useMemo(() => places.places.filter((p) => p.rows === 'firms' && p.featured_fires.some((f) => f.default_start)), [places]);
  const fires = useMemo(() => firms.flatMap((place) => place.featured_fires.filter((f) => f.default_start).map((fire) => ({ place, fire }))), [firms]);
  const [view, setView] = useState<View | null>(null);
  // The fire whose card is open: under the pointer, under the keyboard's focus, or pinned by a click on its mark
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [credit, setCredit] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; view: View; mode: 'pan' | 'box'; lon0?: number; lat0?: number; moved: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setSize({ w: e.contentRect.width, h: e.contentRect.height });
      setMeasured(true);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The part of the screen the map is read in: clear of the trail above, the list on the right and the guide below
  const css = rootRef.current ? getComputedStyle(rootRef.current) : null;
  const px = (name: string, fallback: number) => Number.parseFloat(css?.getPropertyValue(name) ?? '') || fallback;
  // On a narrow screen the list lies under the map, so the map is read across the whole width above it
  const narrow = size.w < 900;
  const region = narrow
    ? { left: 16, top: px('--place-top', 104), right: size.w - 16, bottom: Math.round(size.h * 0.52) }
    : { left: 24, top: px('--place-top', 104), right: size.w - px('--place-rail', 340) - 48, bottom: size.h - px('--place-guide', 170) };

  /** A view that holds a box inside the region the map is read in. */
  const viewOf = (b: Box, pad: number): View => {
    const rw = Math.max(80, region.right - region.left);
    const rh = Math.max(80, region.bottom - region.top);
    const x0 = toX(b[0]);
    const x1 = toX(b[2]);
    const y0 = toY(b[3]);
    const y1 = toY(b[1]);
    const scale = (Math.max((x1 - x0) / rw, (y1 - y0) / rh) || 0.05) * pad;
    const cx = (x0 + x1) / 2 - ((region.left + region.right) / 2 - size.w / 2) * scale;
    const cy = (y0 + y1) / 2 - ((region.top + region.bottom) / 2 - size.h / 2) * scale;
    return { cx, cy, scale };
  };

  // When the screen opens the keyboard's focus is on the fire on the land, or on the first fire: Enter shows it, the
  // arrows move between fires, and its card says what it is
  useEffect(() => {
    const rows = listRef.current?.querySelectorAll<HTMLButtonElement>('.place__fire');
    if (!rows || rows.length === 0) return;
    const at = [...rows].find((r) => r.dataset.fire === currentFire) ?? rows[0];
    at.focus({ preventScroll: true });
    at.scrollIntoView({ block: 'nearest' });
  }, [fires.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // First view: every place with a featured fire, with room around them
  useEffect(() => {
    if (view || firms.length === 0 || !measured) return;
    const w = Math.min(...firms.map((p) => p.box[0]));
    const s = Math.min(...firms.map((p) => p.box[1]));
    const e = Math.max(...firms.map((p) => p.box[2]));
    const n = Math.max(...firms.map((p) => p.box[3]));
    setView(viewOf([w - 8, s - 8, e + 8, n + 8], 1.05));
  }, [firms.length, measured]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = view ?? { cx: 0, cy: -40, scale: 0.12 };
  const sx = (x: number) => (x - v.cx) / v.scale + size.w / 2;
  const sy = (y: number) => (y - v.cy) / v.scale + size.h / 2;
  const lonAt = (p: number) => (v.cx + (p - size.w / 2) * v.scale) / K;
  const latAt = (p: number) => -(v.cy + (p - size.h / 2) * v.scale);

  const zoomAt = (x: number, y: number, f: number) => {
    const mx = v.cx + (x - size.w / 2) * v.scale;
    const my = v.cy + (y - size.h / 2) * v.scale;
    const scale = Math.min(0.5, Math.max(0.0004, v.scale * f));
    setView({ cx: mx - (x - size.w / 2) * scale, cy: my - (y - size.h / 2) * scale, scale });
  };

  const limits = places.boxCalendar;
  const boxProblem = (b: Box): string | null => {
    const span = Math.max(b[2] - b[0], b[3] - b[1]);
    if (limits && span > limits.max_span_deg) return `An area can span at most ${limits.max_span_deg} degrees.`;
    if (limits && Math.min(b[2] - b[0], b[3] - b[1]) < limits.min_span_deg) return `An area must span at least ${limits.min_span_deg} degrees.`;
    const extents = Object.values(limits?.country_extents ?? {});
    if (limits && extents.length > 0 && !extents.some((ext) => b[0] < ext[2] && b[2] > ext[0] && b[1] < ext[3] && b[3] > ext[1])) {
      return `Fire records are served inside ${limits.countries.join(', ')} so far.`;
    }
    return null;
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, a')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = drawing
      ? { x, y, view: v, mode: 'box', lon0: lonAt(x), lat0: latAt(y), moved: false }
      : { x, y, view: v, mode: 'pan', moved: false };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (Math.abs(x - d.x) + Math.abs(y - d.y) > 3) d.moved = true;
    if (d.mode === 'pan') {
      setView({ ...d.view, cx: d.view.cx - (x - d.x) * d.view.scale, cy: d.view.cy - (y - d.y) * d.view.scale });
    } else {
      const lon1 = lonAt(x);
      const lat1 = latAt(y);
      const b: Box = [Math.min(d.lon0!, lon1), Math.min(d.lat0!, lat1), Math.max(d.lon0!, lon1), Math.max(d.lat0!, lat1)].map(
        (n) => Math.round(n * 100) / 100,
      ) as Box;
      setBox(b);
      setNote(boxProblem(b));
    }
  };
  const onUp = () => {
    // A click on the open map, not a drag, closes a pinned card
    if (drag.current && !drag.current.moved && drag.current.mode === 'pan') setPinned(null);
    drag.current = null;
  };

  const pinPlace = (place: Place, fire?: FeaturedFire) => {
    const f = fire ?? place.featured_fires.find((x) => x.default_start);
    if (!f) return;
    setPinned(f.id);
    listRef.current?.querySelector<HTMLElement>(`[data-fire="${CSS.escape(f.id)}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const search = () => {
    const q = query.trim();
    if (!q) return;
    const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) {
      const la = Number(m[1]);
      const lo = Number(m[2]);
      if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
        const b: Box = [lo - 0.5, la - 0.5, lo + 0.5, la + 0.5].map((n) => Math.round(n * 100) / 100) as Box;
        setBox(b);
        setNote(boxProblem(b));
        setView(viewOf(b, 6));
        return;
      }
    }
    const t = q.toLowerCase();
    for (const { place, fire } of fires) {
      if ((fire.name ?? '').toLowerCase().includes(t) || fire.label.toLowerCase().includes(t) || place.name.toLowerCase().includes(t)) {
        setView(viewOf(place.box, 30));
        setNote(null);
        pinPlace(place, place.name.toLowerCase().includes(t) ? undefined : fire);
        return;
      }
    }
    setNote(PLACE_WORDS.noneNamed(q));
  };

  // The screen's keys, while the focus is on it or on nothing: B draws an area, Enter shows the drawn area's record or
  // the fire whose card is open, + and - zoom, Escape stops drawing, closes a pinned card, or goes back.
  const active = hovered ?? focused ?? pinned;
  const activeHit = fires.find((f) => f.fire.id === active) ?? null;
  const live = useRef({ drawing, box, note, onBox, onClose, pinned, activeHit, onFire });
  live.current = { drawing, box, note, onBox, onClose, pinned, activeHit, onFire };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      const here = !t || t === document.body || Boolean(rootRef.current?.contains(t));
      if (!here) return;
      const typing = Boolean(t?.closest('input, textarea, select, [contenteditable="true"]'));
      const l = live.current;
      if (e.key === 'Escape') {
        if (l.drawing) setDrawing(false);
        else if (l.pinned) setPinned(null);
        else l.onClose();
      } else if (typing) return;
      else if (e.key.toLowerCase() === 'b') setDrawing((d) => !d);
      else if (e.key === '+' || e.key === '=') zoomAt(size.w / 2, size.h / 2, 0.7);
      else if (e.key === '-') zoomAt(size.w / 2, size.h / 2, 1.4);
      else if (e.key === 'Enter' && !t?.closest('button, a')) {
        if (l.box && !l.note) l.onBox(l.box);
        else if (l.activeHit) l.onFire(l.activeHit.place, l.activeHit.fire);
        else return;
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }); // the latest view and size: zoomAt reads them

  // Marks, and the names written beside them where they meet no other name and no mark. The place whose card is open
  // and the place of the fire on the land are named first; the rest in the registry's order.
  const NAME_H = 18;
  const marks = firms
    .map((p) => ({ p, x: sx(toX((p.box[0] + p.box[2]) / 2)), y: sy(toY((p.box[1] + p.box[3]) / 2)) }))
    .filter((it) => it.x > -20 && it.x < size.w + 20 && it.y > -20 && it.y < size.h + 20);
  const placeOfFire = (id: string | null) => (id ? firms.find((p) => p.featured_fires.some((f) => f.id === id))?.id ?? null : null);
  const activePlace = placeOfFire(active);
  const currentPlace = placeOfFire(currentFire);
  const firstNamed = (id: string) => (id === activePlace ? 0 : id === currentPlace ? 1 : 2);
  // The card at the open fire's mark: on the side of the mark with room, inside the region the map is read in
  const CARD_W = 320;
  const CARD_H = 330;
  const anchor = activeHit ? marks.find((m) => m.p.id === activeHit.place.id) ?? null : null;
  const cardAt = (() => {
    if (!activeHit) return null;
    const mx = anchor ? anchor.x : region.right;
    const my = anchor ? anchor.y : (region.top + region.bottom) / 2;
    const toRight = mx + 24 + CARD_W <= region.right + 40 || mx - 24 - CARD_W < region.left;
    const left = toRight ? mx + 24 : mx - 24 - CARD_W;
    const top = Math.min(Math.max(region.top, my - CARD_H / 2), Math.max(region.top, region.bottom - CARD_H));
    return { left: Math.max(region.left, Math.min(left, region.right + 40 - CARD_W)), top, toRight, mx, my, onMap: anchor !== null };
  })();

  const taken: { l: number; r: number; t: number; b: number }[] = marks.map((m) => ({ l: m.x - 5, r: m.x + 5, t: m.y - 5, b: m.y + 5 }));
  // No name is written under the open card
  if (cardAt) taken.push({ l: cardAt.left - 8, r: cardAt.left + CARD_W + 8, t: cardAt.top - 8, b: cardAt.top + CARD_H + 8 });
  const names = [...marks]
    .sort((a, b) => firstNamed(a.p.id) - firstNamed(b.p.id))
    .flatMap((m) => {
      if (m.x > region.right + 40 || m.y < region.top - 10 || m.y > region.bottom + 10) return [];
      const w = m.p.name.length * 6.6 + 4;
      const right = m.x + 12 + w < region.right + 40;
      const l = right ? m.x + 12 : m.x - 12 - w;
      const box = { l, r: l + w, t: m.y - NAME_H / 2, b: m.y + NAME_H / 2 };
      // The open fire's place is named first, unless the card stands there: the card names it then
      const underCard = cardAt !== null && box.l < cardAt.left + CARD_W + 8 && box.r > cardAt.left - 8 && box.t < cardAt.top + CARD_H + 8 && box.b > cardAt.top - 8;
      if (m.p.id === activePlace && underCard) return [];
      const forced = m.p.id === activePlace;
      if (!forced && taken.some((o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t)) return [];
      taken.push(box);
      return [{ ...m, right, l }];
    });

  // The fires as a list, grouped by place in the registry's order. Up and Down move the focus between fires.
  const onListKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('.place__fire') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = items[Math.max(0, Math.min(items.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
    next?.focus();
    next?.scrollIntoView({ block: 'nearest' });
    e.preventDefault();
  };

  return (
    <section className="place" aria-label={PLACE_WORDS.name} ref={rootRef}>
      <div
        ref={mapRef}
        className="place__map"
        data-drawing={drawing ? 'true' : 'false'}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(e.deltaY * 0.0015));
        }}
      >
        <svg width={size.w} height={size.h} viewBox={`${v.cx - (size.w / 2) * v.scale} ${v.cy - (size.h / 2) * v.scale} ${size.w * v.scale} ${size.h * v.scale}`}>
          {shapes.map((s) => (
            <path key={s.name + s.d.length} d={s.d} className="place__land" vectorEffect="non-scaling-stroke" />
          ))}
          {box && (
            <rect
              x={toX(box[0])}
              y={toY(box[3])}
              width={toX(box[2]) - toX(box[0])}
              height={box[3] - box[1]}
              className={note ? 'place__drawn place__drawn--bad' : 'place__drawn'}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        <svg className="place__marks" width={size.w} height={size.h} aria-hidden="true">
          {marks.map((m) => (
            <rect key={m.p.id} data-on={m.p.id === activePlace ? 'true' : m.p.id === currentPlace ? 'current' : undefined} x={m.x - 3.5} y={m.y - 3.5} width={7} height={7} />
          ))}
          {cardAt && cardAt.onMap && (
            <line className="place__leader" x1={cardAt.mx} y1={cardAt.my} x2={cardAt.toRight ? cardAt.left : cardAt.left + CARD_W} y2={cardAt.my < cardAt.top + 20 ? cardAt.top + 20 : Math.min(cardAt.my, cardAt.top + CARD_H - 20)} />
          )}
        </svg>
        {/* A mark is the way to its place's card */}
        {marks.map((m) => (
          <button
            key={m.p.id}
            type="button"
            className="place__pick"
            aria-label={m.p.name}
            tabIndex={-1}
            style={{ left: m.x - 10, top: m.y - 10 }}
            onClick={() => pinPlace(m.p)}
            onPointerEnter={() => {
              const f = m.p.featured_fires.find((x) => x.default_start);
              if (f) setHovered(f.id);
            }}
            onPointerLeave={() => setHovered(null)}
          />
        ))}
        {names.map((n) => (
          <span key={n.p.id} className="place__name sys-label" data-on={n.p.id === activePlace ? 'true' : undefined} style={{ left: n.l, top: n.y - NAME_H / 2 }}>
            {n.p.name}
          </span>
        ))}
        {box && (
          // The drawn area's own words, and the action beside it
          <div className="place__boxlabel" style={{ left: Math.max(8, sx(toX(box[0]))), top: Math.max(8, sy(toY(box[1])) + 8) }}>
            <span className="sys-value">{boxWords(box)}</span>
            {note ? (
              <span className="sys-label place__note">{note}</span>
            ) : (
              !drag.current && (
                <button type="button" className="place__act place__act--next" onClick={() => onBox(box)}>
                  <span className="place__key">Enter</span>
                  {PLACE_WORDS.showArea}
                </button>
              )
            )}
          </div>
        )}
      </div>

      {cardAt && activeHit && (
        <div
          className="place__card"
          style={{ left: cardAt.left, top: cardAt.top, width: CARD_W }}
          onPointerEnter={() => setHovered(activeHit.fire.id)}
          onPointerLeave={() => setHovered(null)}
        >
          <div className="place__cardblock">
            <FireBlock
              key={activeHit.fire.id}
              place={activeHit.place}
              fire={activeHit.fire}
              onPick={() => onFire(activeHit.place, activeHit.fire)}
              onCredit={setCredit}
              loadingWords={PLACE_WORDS.loadingFire}
              failedWords={PLACE_WORDS.failedFire}
            />
          </div>
          <span className="place__cardperiod">{activeHit.fire.label}</span>
          <span className="sys-label">{activeHit.place.name}</span>
          {standingOf(activeHit.fire) && <span className="sys-label place__standing">{standingOf(activeHit.fire)}</span>}
          {aboutOf(activeHit.fire) && <span className="sys-fine">{aboutOf(activeHit.fire)}</span>}
          <button type="button" className="place__act place__act--next" onClick={() => onFire(activeHit.place, activeHit.fire)}>
            <span className="place__key">Enter</span>
            {PLACE_WORDS.show}
          </button>
        </div>
      )}

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
          {note && !box && <span className="sys-label place__note">{note}</span>}
        </form>
        <div className="place__list" ref={listRef} role="list" aria-label={PLACE_WORDS.fires} onKeyDown={onListKey}>
          {firms.map((place) => (
            <div key={place.id} className="place__group" role="listitem">
              <button type="button" className="place__placename sys-label" tabIndex={-1} onClick={() => setView(viewOf(place.box, 30))}>
                {place.name}
              </button>
              {place.featured_fires
                .filter((f) => f.default_start)
                .map((fire) => (
                  <button
                    key={fire.id}
                    type="button"
                    data-fire={fire.id}
                    className="place__fire sys-sel"
                    data-selected={fire.id === currentFire ? 'true' : 'false'}
                    data-on={fire.id === active ? 'true' : undefined}
                    aria-label={[fire.label, place.name, standingOf(fire)].filter(Boolean).join(', ')}
                    onClick={() => onFire(place, fire)}
                    onFocus={() => setFocused(fire.id)}
                    onBlur={() => setFocused(null)}
                    onPointerEnter={() => setHovered(fire.id)}
                    onPointerLeave={() => setHovered(null)}
                  >
                    <span className="place__period">{fire.label}</span>
                    <span className="sys-fine">{standingOf(fire)}</span>
                  </button>
                ))}
            </div>
          ))}
        </div>
        <div className="place__acts">
          <button type="button" className="place__act" aria-pressed={drawing} onClick={() => setDrawing((d) => !d)}>
            <span className="place__key">B</span>
            {drawing ? PLACE_WORDS.drawing : PLACE_WORDS.draw}
          </button>
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
