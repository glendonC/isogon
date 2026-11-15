import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countries from 'world-atlas/countries-50m.json';
import type { Box, FeaturedFire, Places, Place } from '../../app/places';
import { FeaturedFiresPlane } from '../../compare/FeaturedFiresPlane';
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

const fitView = (box: Box, w: number, h: number, pad = 1.25): View => {
  const x0 = toX(box[0]);
  const x1 = toX(box[2]);
  const y0 = toY(box[3]);
  const y1 = toY(box[1]);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale: (Math.max((x1 - x0) / w, (y1 - y0) / h) || 0.05) * pad };
};

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
  find: 'A name, or latitude, longitude',
  findLabel: 'Find a place by name or coordinates',
  draw: 'Draw an area',
  drawing: 'Drag on the map to draw an area',
  showArea: "Show this area's fire record",
  back: 'Back',
  lighter: 'Lighter land: an area drawn there has a fire record.',
  noneNamed: (q: string) => `No place or fire named "${q}" here. Coordinates work anywhere: latitude, longitude.`,
  imagery: (credits: string[]) => `Imagery: ${credits.join('; ')}`,
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
 * Choose a Place, opened over the stage. The featured fires lead: one block of real terrain per fire, at one scale,
 * each with its period, its place and what it is to the model; a pick shows the fire. The map supports them: it says
 * where the places are, finds a place by name or coordinates, and takes an area the visitor draws, whose fire record
 * then opens. Nothing here stands on anything else: the map's labels are pushed apart, and a block's longer sentence
 * appears in room kept under it.
 */
export function PlaceScreen({ places, currentFire, onFire, onBox, onClose }: PlaceScreenProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [credits, setCredits] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 440, h: 440 });
  const shapes = useMemo(countryShapes, []);
  const cached = new Set(places.boxCalendar?.countries ?? []);
  const firms = places.places.filter((p) => p.rows === 'firms' && p.featured_fires.length > 0);
  const [view, setView] = useState<View | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; view: View; mode: 'pan' | 'box'; lon0?: number; lat0?: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // First view: every place with fire rows, with room around them.
  useEffect(() => {
    if (view || firms.length === 0) return;
    const w = Math.min(...firms.map((p) => p.box[0]));
    const s = Math.min(...firms.map((p) => p.box[1]));
    const e = Math.max(...firms.map((p) => p.box[2]));
    const n = Math.max(...firms.map((p) => p.box[3]));
    setView(fitView([w - 6, s - 8, e + 6, n + 8], size.w, size.h, 1.05));
  }, [firms.length, size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = view ?? { cx: 0, cy: -40, scale: 0.12 };
  const sx = (x: number) => (x - v.cx) / v.scale + size.w / 2;
  const sy = (y: number) => (y - v.cy) / v.scale + size.h / 2;
  const lonAt = (px: number) => (v.cx + (px - size.w / 2) * v.scale) / K;
  const latAt = (py: number) => -(v.cy + (py - size.h / 2) * v.scale);

  const zoomAt = (px: number, py: number, f: number) => {
    const mx = v.cx + (px - size.w / 2) * v.scale;
    const my = v.cy + (py - size.h / 2) * v.scale;
    const scale = Math.min(0.5, Math.max(0.0004, v.scale * f));
    setView({ cx: mx - (px - size.w / 2) * scale, cy: my - (py - size.h / 2) * scale, scale });
  };

  const limits = places.boxCalendar;
  const boxProblem = (b: Box): string | null => {
    const span = Math.max(b[2] - b[0], b[3] - b[1]);
    if (limits && span > limits.max_span_deg) return `A box can span at most ${limits.max_span_deg} degrees.`;
    if (limits && Math.min(b[2] - b[0], b[3] - b[1]) < limits.min_span_deg) return `A box must span at least ${limits.min_span_deg} degrees.`;
    const inside = Object.values(limits?.country_extents ?? {}).some((ext) => b[0] < ext[2] && b[2] > ext[0] && b[1] < ext[3] && b[3] > ext[1]);
    if (limits && !inside) return `Records are served inside ${limits.countries.join(', ')} for now.`;
    return null;
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, a')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = drawing ? { x: px, y: py, view: v, mode: 'box', lon0: lonAt(px), lat0: latAt(py) } : { x: px, y: py, view: v, mode: 'pan' };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    if (d.mode === 'pan') {
      setView({ ...d.view, cx: d.view.cx - (px - d.x) * d.view.scale, cy: d.view.cy - (py - d.y) * d.view.scale });
    } else {
      const lon1 = lonAt(px);
      const lat1 = latAt(py);
      const b: Box = [
        Math.min(d.lon0!, lon1),
        Math.min(d.lat0!, lat1),
        Math.max(d.lon0!, lon1),
        Math.max(d.lat0!, lat1),
      ].map((n) => Math.round(n * 100) / 100) as Box;
      setBox(b);
      setNote(boxProblem(b));
    }
  };
  const onUp = () => {
    drag.current = null;
  };

  const search = () => {
    const q = query.trim();
    if (!q) return;
    const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) {
      const lat = Number(m[1]);
      const lon = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        const b: Box = [lon - 0.5, lat - 0.5, lon + 0.5, lat + 0.5].map((n) => Math.round(n * 100) / 100) as Box;
        setBox(b);
        setNote(boxProblem(b));
        setView(fitView(b, size.w, size.h, 6));
        return;
      }
    }
    const t = q.toLowerCase();
    for (const p of firms) {
      const fire = p.featured_fires.find((f) => (f.name ?? '').toLowerCase().includes(t) || f.label.toLowerCase().includes(t));
      if (p.name.toLowerCase().includes(t) || fire) {
        setView(fitView(p.box, size.w, size.h, 8));
        setNote(null);
        return;
      }
    }
    setNote(PLACE_WORDS.noneNamed(q));
  };


  // The screen's keys, while the focus is on it or on nothing: B draws an area, Enter shows the drawn area's record,
  // Escape stops drawing or goes back.
  const live = useRef({ drawing, box, note, onBox, onClose });
  live.current = { drawing, box, note, onBox, onClose };
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
        else l.onClose();
      } else if (typing) return;
      else if (e.key.toLowerCase() === 'b') setDrawing((d) => !d);
      else if (e.key === 'Enter' && !t?.closest('button, a') && l.box && !l.note) l.onBox(l.box);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const tellCredits = useCallback((c: string[]) => setCredits(c), []);

  // Each place's name beside its mark, on the side with room; names are pushed apart so that places close together
  // on the map (two on one coast) never stand on each other. A thin leader joins name and mark.
  const NAME_W = 190;
  const NAME_H = 20;
  const items = firms
    .map((p) => ({ p, x: sx(toX((p.box[0] + p.box[2]) / 2)), y: sy(toY((p.box[1] + p.box[3]) / 2)) }))
    .filter((it) => it.x > 0 && it.x < size.w && it.y > 0 && it.y < size.h)
    .sort((a, b) => a.y - b.y);
  let bottomLeft = -Infinity;
  let bottomRight = -Infinity;
  const placed = items.map((it) => {
    const right = it.x + 18 + NAME_W < size.w;
    const top = Math.min(size.h - NAME_H, Math.max(it.y - NAME_H / 2, (right ? bottomRight : bottomLeft) + 4, 0));
    if (right) bottomRight = top + NAME_H;
    else bottomLeft = top + NAME_H;
    return { ...it, right, top };
  });

  return (
    <section className="place" aria-label={PLACE_WORDS.name} ref={rootRef}>
      <div className="place__side">
        <div
          ref={ref}
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
              <path key={s.name + s.d.length} d={s.d} className={cached.has(s.name) ? 'place__land place__land--cached' : 'place__land'} vectorEffect="non-scaling-stroke" />
            ))}
            {firms.map((p) => (
              <rect key={p.id} x={toX(p.box[0])} y={toY(p.box[3])} width={toX(p.box[2]) - toX(p.box[0])} height={p.box[3] - p.box[1]} className="place__box" vectorEffect="non-scaling-stroke" />
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
            {placed.map((it) => (
              <g key={it.p.id} data-over={over === it.p.id ? 'true' : 'false'}>
                <line x1={it.x} y1={it.y} x2={it.right ? it.x + 14 : it.x - 14} y2={it.top + NAME_H / 2} />
                <rect x={it.x - 3} y={it.y - 3} width={6} height={6} />
              </g>
            ))}
          </svg>
          {placed.map((it) => (
            <span
              key={it.p.id}
              className="place__name sys-label"
              data-over={over === it.p.id ? 'true' : 'false'}
              style={it.right ? { left: it.x + 18, top: it.top } : { right: size.w - it.x + 18, top: it.top }}
            >
              {it.p.name}
            </span>
          ))}
          <div className="place__zoom">
            <button type="button" className="place__act" aria-label="Zoom in" onClick={() => zoomAt(size.w / 2, size.h / 2, 0.6)}>
              +
            </button>
            <button type="button" className="place__act" aria-label="Zoom out" onClick={() => zoomAt(size.w / 2, size.h / 2, 1.6)}>
              -
            </button>
          </div>
        </div>

        <form
          className="place__find"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <input className="place__input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={PLACE_WORDS.find} aria-label={PLACE_WORDS.findLabel} />
        </form>
        <div className="place__acts">
          <button type="button" className="place__act" aria-pressed={drawing} onClick={() => setDrawing((d) => !d)}>
            <span className="place__key">B</span>
            {drawing ? PLACE_WORDS.drawing : PLACE_WORDS.draw}
          </button>
          {box && !note && (
            <button type="button" className="place__act place__act--next" onClick={() => onBox(box)}>
              <span className="place__key">Enter</span>
              {PLACE_WORDS.showArea}
            </button>
          )}
          <button type="button" className="place__act" onClick={onClose}>
            <span className="place__key">Esc</span>
            {PLACE_WORDS.back}
          </button>
        </div>
        {box && <span className="sys-value">{boxWords(box)}</span>}
        {note && <span className="sys-label place__note">{note}</span>}
        <span className="sys-fine">{PLACE_WORDS.lighter}</span>
      </div>

      {/* The featured fires as blocks of terrain on one plane at one scale; a pick shows the fire. */}
      <div className="place__plane" data-slot="featured-fires">
        <FeaturedFiresPlane
          places={places}
          currentFire={currentFire}
          onFire={onFire}
          include="all"
          perRow={3}
          standing={standingOf}
          about={aboutOf}
          showWords={PLACE_WORDS.show}
          onHoverPlace={setOver}
          onCredits={tellCredits}
        />
      </div>

      {credits.length > 0 && <p className="place__credit sys-fine">{PLACE_WORDS.imagery(credits)}</p>}
    </section>
  );
}
