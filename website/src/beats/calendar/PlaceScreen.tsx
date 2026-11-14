import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countries from 'world-atlas/countries-50m.json';
import { fireNameWords, type Box, type FeaturedFire, type Places, type Place } from '../../app/places';
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

/** What the fire is to the world model, as the registry says; the place screen is where a fire is chosen for it. */
const standingOf = (f: FeaturedFire): string | null =>
  f.to_the_world_model ? `${f.to_the_world_model} by the world model` : f.blind_test_fire ? 'recorded test fire' : null;

export interface PlaceScreenProps {
  places: Places;
  /** The fire on the terrain now, marked with brackets. */
  currentFire: string | null;
  onFire: (place: Place, fire: FeaturedFire) => void;
  onBox: (box: Box) => void;
  onClose: () => void;
}

/**
 * Choose a place: a map you can drag and zoom. The places with fire rows are labelled marks with their featured fires;
 * the countries whose rows are cached, where any box has a record, are lighter; a search finds a place or fire by
 * name, or goes to coordinates; a box drawn on the map opens its record.
 */
export function PlaceScreen({ places, currentFire, onFire, onBox, onClose }: PlaceScreenProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 1440, h: 900 });
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
    setView(fitView([w - 12, s - 10, e + 12, n + 8], size.w, size.h, 1.05));
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
    setNote(`No place or fire named "${q}" here. Coordinates work anywhere: latitude, longitude.`);
  };

  return (
    <section className="place-screen" aria-label="Choose a place">
      <div
        ref={ref}
        className="place-screen__map"
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
            <path key={s.name + s.d.length} d={s.d} className={cached.has(s.name) ? 'place-screen__land place-screen__land--cached' : 'place-screen__land'} vectorEffect="non-scaling-stroke" />
          ))}
          {firms.map((p) => (
            <rect
              key={p.id}
              x={toX(p.box[0])}
              y={toY(p.box[3])}
              width={toX(p.box[2]) - toX(p.box[0])}
              height={p.box[3] - p.box[1]}
              className="place-screen__box"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {box && (
            <rect
              x={toX(box[0])}
              y={toY(box[3])}
              width={toX(box[2]) - toX(box[0])}
              height={box[3] - box[1]}
              className={note ? 'place-screen__drawn place-screen__drawn--bad' : 'place-screen__drawn'}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {(() => {
          // Each place's label beside its mark, on the side with room; labels are pushed apart vertically so places
          // close together on screen (two on one coast) never cover each other. Leaders join label and mark.
          const PLATE_W = 330;
          // A fire's row: its period and size, then what its name is (two lines at this width).
          const rowH = 64;
          const items = firms
            .map((p) => ({
              p,
              x: sx(toX((p.box[0] + p.box[2]) / 2)),
              y: sy(toY((p.box[1] + p.box[3]) / 2)),
              h: 34 + p.featured_fires.length * rowH,
            }))
            .sort((a, b) => a.y - b.y);
          let bottomLeft = -Infinity;
          let bottomRight = -Infinity;
          const placed = items.map((it) => {
            const right = it.x + 40 + PLATE_W < size.w - 16;
            const left = right ? it.x + 40 : it.x - 40 - PLATE_W;
            const prev = right ? bottomRight : bottomLeft;
            const top = Math.max(it.y - 24, prev + 12, 128);
            if (right) bottomRight = top + it.h;
            else bottomLeft = top + it.h;
            return { ...it, left, top, right };
          });
          return (
            <>
              <svg className="place-screen__leaders" width={size.w} height={size.h}>
                {placed.map((it) => (
                  <g key={it.p.id}>
                    <line x1={it.x} y1={it.y} x2={it.right ? it.left : it.left + PLATE_W} y2={it.top + 16} />
                    <rect x={it.x - 3} y={it.y - 3} width={6} height={6} />
                  </g>
                ))}
              </svg>
              {placed.map((it) => (
                <div key={it.p.id} className="sys-plate place-screen__plate" style={{ left: it.left, top: it.top, width: PLATE_W }}>
                  <span className="sys-label sys-strong">{it.p.name}</span>
                  {it.p.featured_fires.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="sys-sel place-screen__fire"
                      data-selected={currentFire === f.id ? 'true' : 'false'}
                      onClick={() => onFire(it.p, f)}
                    >
                      <span className="sys-label place-screen__period">{f.label}</span>
                      <span className="sys-value place-screen__size">{f.size.modis_pixels_in_box?.toLocaleString('en-US') ?? ''}</span>
                      <span className="sys-fine place-screen__about">
                        {[fireNameWords(f), standingOf(f)].filter(Boolean).join('; ')}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </>
          );
        })()}
      </div>

      {/* Reserved for the plane of featured fires as cut-outs (the compare component), mounted when it lands. */}
      <div className="place-screen__plane" data-slot="featured-fires" aria-hidden="true" />

      <div className="place-screen__head sys-plate">
        <span className="sys-title">Choose a place</span>
        <span className="sys-body">A featured fire, a place by name or coordinates, or a box you draw on the map.</span>
        <form
          className="place-screen__search"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <input
            className="place-screen__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="A name, or latitude, longitude"
            aria-label="Search by name or coordinates"
          />
        </form>
        <div className="place-screen__actions">
          <button type="button" className="sys-ctl sys-sel" data-selected={drawing ? 'true' : 'false'} onClick={() => setDrawing((d) => !d)}>
            <span className="sys-key">B</span> {drawing ? 'Drawing a box: drag on the map' : 'Draw a box'}
          </button>
          {box && !note && (
            <button type="button" className="sys-ctl" onClick={() => onBox(box)}>
              <span className="sys-key">Enter</span> Open this box's record
            </button>
          )}
          <button type="button" className="sys-ctl" onClick={onClose}>
            <span className="sys-key">Esc</span> Back
          </button>
        </div>
        {box && (
          <span className="sys-value place-screen__boxwords">{boxWords(box)}</span>
        )}
        {note && <span className="sys-label place-screen__note">{note}</span>}
      </div>

      <div className="place-screen__zoom">
        <button type="button" className="sys-ctl" aria-label="Zoom in" onClick={() => zoomAt(size.w / 2, size.h / 2, 0.6)}>
          +
        </button>
        <button type="button" className="sys-ctl" aria-label="Zoom out" onClick={() => zoomAt(size.w / 2, size.h / 2, 1.6)}>
          -
        </button>
      </div>
      <span className="place-screen__caption sys-fine">
        Lighter land: countries whose NASA FIRMS rows are cached, where any box has a record. Size: MODIS detections in the
        box at the busiest start.
      </span>
    </section>
  );
}
