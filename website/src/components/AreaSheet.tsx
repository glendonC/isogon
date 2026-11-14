import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { BurningCalendar } from './BurningCalendar';
import { CONTEXT_BOXES, STAND_IN_REGION, contextBoxOf } from '../content/demo/anyArea';
import { useCalendar } from '../ui/useCalendar';
import { useDialogFocus } from '../ui/useDialogFocus';
import { formatLat, formatLon } from '../content/theaters';
import '../styles/area.css';

/** Degrees of longitude across the map; the map is twice as wide as tall, as the equirectangular image is. */
const SPAN_LON = 40;
const SPAN_LAT = SPAN_LON / 2;

type Box = [number, number, number, number];

interface AreaSheetProps {
  open: boolean;
  onClose: () => void;
  apiBase: string;
  /** Where the map opens: the place on screen. */
  centre: { lat: number; lon: number };
  /** A month picked in a live calendar opens that region and month on the terrain. */
  onOpenMonth: (regionId: string, ym: string) => void;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const clampLat = (v: number) => Math.max(-90, Math.min(90, v));
const wrapLon = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180;

/**
 * S5: choose any area, by drawing a box on a small map of NASA's Blue Marble or typing its corners, and get its
 * monthly fire record. Inside one of the three context boxes the calendar is NASA FIRMS, live; elsewhere it is demo
 * data until the route serves any box (content/demo/anyArea.ts).
 */
export function AreaSheet({ open, onClose, apiBase, centre, onOpenMonth }: AreaSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ lon: number; lat: number } | null>(null);
  useDialogFocus(open, sheetRef, closeRef);

  const [view, setView] = useState(centre);
  const [box, setBox] = useState<Box | null>(null);
  const [fields, setFields] = useState(['', '', '', '']);
  const [asked, setAsked] = useState<Box | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The map opens on the place on screen; later renders keep wherever the player moved it.
  const centreRef = useRef(centre);
  centreRef.current = centre;
  useEffect(() => {
    if (open) setView(centreRef.current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const live = asked ? contextBoxOf(asked) : null;
  const calendarRegion = live ? live.region_id : STAND_IN_REGION;
  // Fetched only once a box is asked for; an empty id answers "missing" at once.
  const calendar = useCalendar(apiBase, open && asked ? calendarRegion : '');
  const askedCentre = useMemo(
    () => (asked ? { lat: (asked[1] + asked[3]) / 2, lon: (asked[0] + asked[2]) / 2 } : null),
    [asked],
  );

  if (!open) return null;

  const west = view.lon - SPAN_LON / 2;
  const north = view.lat + SPAN_LAT / 2;
  const toMap = (lon: number, lat: number) => ({ x: ((lon - west) / SPAN_LON) * 100, y: ((north - lat) / SPAN_LAT) * 100 });
  const fromPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      lon: round2(wrapLon(west + ((e.clientX - r.left) / r.width) * SPAN_LON)),
      lat: round2(clampLat(north - ((e.clientY - r.top) / r.height) * SPAN_LAT)),
    };
  };
  const setBoxAndFields = (b: Box) => {
    setBox(b);
    setFields(b.map((v) => String(v)));
    setError(null);
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = fromPointer(e);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const a = dragRef.current;
    if (!a) return;
    const b = fromPointer(e);
    setBoxAndFields([Math.min(a.lon, b.lon), Math.min(a.lat, b.lat), Math.max(a.lon, b.lon), Math.max(a.lat, b.lat)]);
  };
  const onUp = () => {
    dragRef.current = null;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = fields.map((f) => Number(f.trim()));
    const [w, s, ea, n] = v;
    if (v.some((x) => !Number.isFinite(x)) || w >= ea || s >= n || Math.abs(s) > 90 || Math.abs(n) > 90 || Math.abs(w) > 180 || Math.abs(ea) > 180) {
      setError('Give west, south, east and north in degrees, west below east and south below north.');
      return;
    }
    const b: Box = [w, s, ea, n];
    setBox(b);
    setAsked(b);
    setError(null);
    setView({ lat: (s + n) / 2, lon: (w + ea) / 2 });
  };

  // The Blue Marble image is 360 by 180 degrees, twice as wide as tall like the map, so its size and offsets in
  // percent of the map's width (left) and height (top) are the same numbers.
  const imgW = (360 / SPAN_LON) * 100;
  const imgLeft = -((west + 180) / 360) * imgW;
  const imgTop = -((90 - north) / 180) * imgW;

  const drawn = box ? { a: toMap(box[0], box[3]), b: toMap(box[2], box[1]) } : null;
  const labels = ['West', 'South', 'East', 'North'];

  return (
    <div className="iso-backdrop iso-backdrop--center" onClick={onClose} role="presentation">
      <div
        ref={sheetRef}
        className="iso-sheet iso-area"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="iso-area-title"
      >
        <div className="iso-sheet__head">
          <h2 id="iso-area-title" className="iso-sheet__title">
            Any area
          </h2>
          <button ref={closeRef} type="button" className="iso-key" onClick={onClose}>
            <kbd>Esc</kbd>
            <span>Close</span>
          </button>
        </div>
        <p className="iso-sheet__lede">
          Draw a box on the map, or type its corners, and get its monthly fire record since 2000.
        </p>

        <div className="iso-area__pick">
          <div
            ref={mapRef}
            className="iso-area__map"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            role="img"
            aria-label={`Map from ${formatLon(west)} to ${formatLon(west + SPAN_LON)}; drag to draw a box`}
          >
            <img
              className="iso-area__img"
              src="/generated/terrain/earth_day.jpg"
              alt=""
              draggable={false}
              style={{ width: `${imgW}%`, left: `${imgLeft}%`, top: `${imgTop}%` }}
            />
            <svg className="iso-area__marks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {CONTEXT_BOXES.map((c) => {
                const a = toMap(c.bbox[0], c.bbox[3]);
                const b = toMap(c.bbox[2], c.bbox[1]);
                return (
                  <rect key={c.region_id} className="iso-area__context" x={a.x} y={a.y} width={b.x - a.x} height={b.y - a.y} vectorEffect="non-scaling-stroke" />
                );
              })}
              {drawn && (
                <rect
                  className="iso-area__box"
                  x={drawn.a.x}
                  y={drawn.a.y}
                  width={drawn.b.x - drawn.a.x}
                  height={drawn.b.y - drawn.a.y}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
            <span className="iso-area__credit">Blue Marble, NASA</span>
          </div>

          <form className="iso-area__fields" onSubmit={submit}>
            {labels.map((label, i) => (
              <label key={label} className="iso-area__field">
                <span>{label}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={fields[i]}
                  placeholder={i % 2 === 0 ? 'lon' : 'lat'}
                  onChange={(e) => setFields((f) => f.map((x, k) => (k === i ? e.target.value : x)))}
                />
              </label>
            ))}
            <button type="submit" className="iso-key">
              <kbd>Enter</kbd>
              <span>Get its calendar</span>
            </button>
          </form>
          <p className="iso-area__hint">
            Outlined: the three boxes with NASA FIRMS rows on this machine. A box inside one gets that record, live.
          </p>
          {error && <p className="iso-area__error">{error}</p>}
        </div>

        {asked && askedCentre && (
          <div className="iso-area__result">
            <p className="iso-area__line" data-source={live ? 'firms' : 'demo'}>
              {live
                ? `${formatLat(askedCentre.lat)}  ${formatLon(askedCentre.lon)} lies in the ${live.name} box: its NASA FIRMS record. Pick a month to open it on the terrain.`
                : `Demo data: no record is served for this box yet. Standing in, so you can see what its record will look like: the real Feather River record, which is somewhere else.`}
            </p>
            <BurningCalendar
              apiBase={apiBase}
              regionId={calendarRegion}
              area={{ name: `the box at ${formatLat(askedCentre.lat)} ${formatLon(askedCentre.lon)}`, lat: askedCentre.lat, lon: askedCentre.lon }}
              calendar={calendar}
              run={{ realStart: null, pendingStart: null, failed: null }}
              stageMonth={null}
              selectedMonth={null}
              onSelectMonth={(ym) => {
                if (live) onOpenMonth(live.region_id, ym);
              }}
              standIn={!live}
            />
          </div>
        )}
      </div>
    </div>
  );
}
