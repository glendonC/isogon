import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { BurningCalendar } from './BurningCalendar';
import { CONTEXT_BOXES, STAND_IN_REGION, contextBoxOf } from '../content/demo/anyArea';
import { useCalendar } from '../ui/useCalendar';
import { formatLat, formatLon } from '../content/theaters';
import { publicUrl } from '../lib/api';
import { Loader } from '../ui/Loader';
import { SideSheet } from './BlindScoreTable';
import '../styles/area.css';

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
 * Side-opening area picker over the stage.
 * Inside one of the three stored context boxes the calendar is NASA FIRMS, live; elsewhere it is disclosed as demo stand-in data.
 */
export function AreaSheet({ open, onClose, apiBase, centre, onOpenMonth }: AreaSheetProps) {
  const dragRef = useRef<{ lon: number; lat: number } | null>(null);
  const [view, setView] = useState(centre);
  const [box, setBox] = useState<Box | null>(null);
  const [fields, setFields] = useState(['', '', '', '']);
  const [asked, setAsked] = useState<Box | null>(null);
  const [error, setError] = useState<string | null>(null);

  const centreRef = useRef(centre);
  centreRef.current = centre;
  useEffect(() => {
    if (open) setView(centreRef.current);
  }, [open]);

  const live = asked ? contextBoxOf(asked) : null;
  const calendarRegion = live ? live.region_id : STAND_IN_REGION;
  const calendar = useCalendar(apiBase, open && asked ? calendarRegion : '');
  const askedCentre = useMemo(
    () => (asked ? { lat: (asked[1] + asked[3]) / 2, lon: (asked[0] + asked[2]) / 2 } : null),
    [asked],
  );

  if (!open) return null;

  const west = view.lon - SPAN_LON / 2;
  const north = view.lat + SPAN_LAT / 2;
  const toMap = (lon: number, lat: number) => ({
    x: ((lon - west) / SPAN_LON) * 100,
    y: ((north - lat) / SPAN_LAT) * 100,
  });
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
    if (
      v.some((x) => !Number.isFinite(x)) ||
      w >= ea ||
      s >= n ||
      Math.abs(s) > 90 ||
      Math.abs(n) > 90 ||
      Math.abs(w) > 180 ||
      Math.abs(ea) > 180
    ) {
      setError('Give west, south, east and north in degrees, west below east and south below north.');
      return;
    }
    const b: Box = [w, s, ea, n];
    setBox(b);
    setAsked(b);
    setError(null);
    setView({ lat: (s + n) / 2, lon: (w + ea) / 2 });
  };

  const imgW = (360 / SPAN_LON) * 100;
  const imgLeft = -((west + 180) / 360) * imgW;
  const imgTop = -((90 - north) / 180) * imgW;

  const drawn = box ? { a: toMap(box[0], box[3]), b: toMap(box[2], box[1]) } : null;
  const labels = ['West', 'South', 'East', 'North'];

  return (
    <SideSheet open={open} title="Draw an Area" onClose={onClose}>
      <section className="iso-doc-lead">
        <p className="iso-doc-lead__p iso-doc-lead__p--strong">
          Draw a box on the map, or enter its four edges in degrees, to open its monthly fire record since 2000.
        </p>
        <p className="iso-doc-lead__p">
          Dashed boxes show the three places stored here. Any box inside one reads its real NASA FIRMS record.
        </p>
      </section>

      <figure className="iso-doc-media" aria-label="Area map">
        <div
          className="iso-area-map"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          role="img"
          aria-label={`Map from ${formatLon(west)} to ${formatLon(west + SPAN_LON)}; drag to draw a box`}
        >
          <img
            className="iso-area-map__img"
            src={publicUrl('generated/terrain/earth_day.jpg')}
            alt=""
            draggable={false}
            style={{ width: `${imgW}%`, left: `${imgLeft}%`, top: `${imgTop}%` }}
          />
          <svg className="iso-area-map__marks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {CONTEXT_BOXES.map((c) => {
              const a = toMap(c.bbox[0], c.bbox[3]);
              const b = toMap(c.bbox[2], c.bbox[1]);
              return (
                <rect
                  key={c.region_id}
                  className="iso-area-map__context"
                  x={a.x}
                  y={a.y}
                  width={b.x - a.x}
                  height={b.y - a.y}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {drawn && (
              <rect
                className="iso-area-map__box"
                x={drawn.a.x}
                y={drawn.a.y}
                width={drawn.b.x - drawn.a.x}
                height={drawn.b.y - drawn.a.y}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          <span className="iso-area-map__credit">Blue Marble, NASA</span>
        </div>
        <figcaption className="iso-doc-media__caption">
          <span>Drag across the map to set the four edges</span>
          <span>
            {box
              ? `${formatLon(box[0])} to ${formatLon(box[2])}, ${formatLat(box[1])} to ${formatLat(box[3])}`
              : `${CONTEXT_BOXES.length} stored NASA FIRMS context boxes`}
          </span>
        </figcaption>
      </figure>

      <form className="iso-area-form" onSubmit={submit}>
        <div className="iso-area-fields">
          {labels.map((label, i) => (
            <label key={label} className="iso-area-field">
              <span className="iso-area-field__label">{label} (deg)</span>
              <input
                type="text"
                inputMode="decimal"
                className="iso-area-field__input"
                value={fields[i]}
                placeholder={i % 2 === 0 ? 'lon' : 'lat'}
                onChange={(e) => setFields((f) => f.map((x, k) => (k === i ? e.target.value : x)))}
              />
            </label>
          ))}
        </div>

        <div className="iso-plain-actions">
          <button type="submit" className="iso-plain-action" data-primary="true">
            <span className="iso-plain-action__key">Enter</span>
            <span>Get its fire record</span>
          </button>
        </div>

        {error && <p className="iso-area-error">{error}</p>}
      </form>

      {asked && askedCentre && (
        <section className="iso-doc-section" aria-label="Area fire record">
          <p className="iso-area-status" data-source={live ? 'firms' : 'demo'}>
            {live
              ? `${formatLat(askedCentre.lat)} ${formatLon(askedCentre.lon)} lies inside ${live.name}: its real NASA FIRMS record. Pick a month to open it on the terrain.`
              : 'Demo data: no stored record covers this box yet. Standing in so you can see the layout: the real Feather River record, from another place.'}
          </p>

          {calendar.state === 'loading' ? (
            <Loader surface="inline" line="Loading this area's monthly fire record" />
          ) : (
            <BurningCalendar
              regionId={calendarRegion}
              area={{
                name: `the box at ${formatLat(askedCentre.lat)} ${formatLon(askedCentre.lon)}`,
                lat: askedCentre.lat,
                lon: askedCentre.lon,
              }}
              calendar={calendar}
              run={{ realStart: null, pendingStart: null, failed: null }}
              stageMonth={null}
              selectedMonth={null}
              onSelectMonth={(ym) => {
                if (live) onOpenMonth(live.region_id, ym);
              }}
              standIn={!live}
            />
          )}
        </section>
      )}
    </SideSheet>
  );
}
