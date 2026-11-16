import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useDialogFocus } from '../ui/useDialogFocus';
import type { SensorModelPayload } from '../ui/useSensorModel';
import type { OverlapEvidence } from '../content/calendar';
import {
  createAnalyticalSensorDiagnostics,
  normalizeSensorDiagnostics,
  type NormalizedSensorDiagnostics,
  type SensorCurveSample,
  type SensorDiagnosticModalProps,
} from './types';

export type { SensorDiagnosticModalProps } from './types';

/** The page's sensor colours (identity/identity.css): MODIS orange, VIIRS pale blue, harmonized white. */
const INK_MODIS = '#ff7a45';
const INK_VIIRS = '#8fd6f5';
const INK_HARM = '#f3f4f6';
const INK_GRID = 'rgba(243, 244, 246, 0.1)';
const INK_AXIS = 'rgba(243, 244, 246, 0.62)';
const INK_CURTAIN = '#d6f1ff';

const PAGES = [
  { key: 'size', label: 'Pixel size' },
  { key: 'detect', label: 'Smallest fire' },
  { key: 'calibrate', label: 'One record' },
] as const;

const ANGLE_PRESETS = [
  { deg: 0, label: 'Nadir' },
  { deg: 30, label: 'Mid swath' },
  { deg: 55, label: 'Swath edge' },
] as const;

const W = 640;
const H = 400;

function nearestSample(curves: readonly SensorCurveSample[], deg: number): SensorCurveSample {
  let best = curves[0];
  let bestDiff = Math.abs(best.scanAngleDeg - deg);
  for (const c of curves) {
    const d = Math.abs(c.scanAngleDeg - deg);
    if (d < bestDiff) {
      best = c;
      bestDiff = d;
    }
  }
  return best;
}

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

/** Each instrument's orbit and scan, as the sensor model states them (`geometry_metadata`). */
interface Orbit {
  modisKm: number | null;
  viirsKm: number | null;
  modisEdgeDeg: number | null;
  viirsEdgeDeg: number | null;
  /** The fire power VIIRS detects half the time at night, straight down (`thresholds_50pct_mw`). */
  viirsNightNadirMw: number | null;
}

function orbitOf(raw: unknown): Orbit {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const g = o.geometry_metadata && typeof o.geometry_metadata === 'object' ? (o.geometry_metadata as Record<string, unknown>) : {};
  const t = o.thresholds_50pct_mw && typeof o.thresholds_50pct_mw === 'object' ? (o.thresholds_50pct_mw as Record<string, unknown>) : {};
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    modisKm: n(g.modis_altitude_km),
    viirsKm: n(g.viirs_altitude_km),
    modisEdgeDeg: n(g.modis_max_scan_angle_deg),
    viirsEdgeDeg: n(g.viirs_max_scan_angle_deg),
    viirsNightNadirMw: n(t.viirs_night_nadir),
  };
}

const km = (v: number) => Math.round(v).toLocaleString('en-US');
const deg = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}°`;

/** Page 1: the satellite looking down at the scan angle, and both pixels drawn to scale. */
function PixelSizeVisual({ angle, sample, orbit }: { angle: number; sample: SensorCurveSample; orbit: Orbit }) {
  const satX = W / 2;
  const satY = 46;
  const groundY = 214;
  const h = groundY - satY;
  const rad = (angle * Math.PI) / 180;
  const hitX = satX + Math.tan(rad) * h;
  const edgeX = Math.tan((55 * Math.PI) / 180) * h;
  const arcR = 46;
  const s = 22; // px per km on the ground plan
  const mW = sample.modisAcrossKm * s;
  const mH = sample.modisAlongKm * s;
  const vW = Math.max(3, sample.viirsAcrossKm * s);
  const vH = Math.max(3, sample.viirsAlongKm * s);
  const planY = 300;
  const mX = 210;
  const vX = 470;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="iso-brief__svg"
      role="img"
      aria-label={`At ${Math.round(angle)} degrees off nadir, a MODIS pixel covers ${fmt(sample.modisAreaKm2, 2)} square kilometres and a VIIRS pixel ${fmt(sample.viirsAreaKm2, 2)}.`}
    >
      <path
        d={`M${satX},${satY} L${satX - edgeX},${groundY} L${satX + edgeX},${groundY} Z`}
        fill="rgba(214, 241, 255, 0.05)"
        stroke="rgba(214, 241, 255, 0.18)"
      />
      <line x1={satX} y1={satY} x2={satX} y2={groundY} stroke={INK_GRID} strokeDasharray="3 4" />
      <line x1={20} y1={groundY} x2={W - 20} y2={groundY} stroke="rgba(243, 244, 246, 0.35)" />
      <text x={24} y={groundY - 8} className="iso-brief__axis">
        ground
      </text>
      <text x={satX + edgeX - 4} y={groundY + 18} textAnchor="end" className="iso-brief__axis">
        {orbit.modisEdgeDeg !== null && orbit.viirsEdgeDeg !== null
          ? `swath edge: MODIS ${deg(orbit.modisEdgeDeg)}, VIIRS ${deg(orbit.viirsEdgeDeg)}`
          : 'swath edge'}
      </text>
      <line x1={satX} y1={satY} x2={hitX} y2={groundY} stroke={INK_CURTAIN} strokeWidth={1.5} />
      {angle > 0.5 && (
        <path
          d={`M${satX},${satY + arcR} A${arcR},${arcR} 0 0 0 ${(satX + Math.sin(rad) * arcR).toFixed(1)},${(
            satY +
            Math.cos(rad) * arcR
          ).toFixed(1)}`}
          fill="none"
          stroke={INK_CURTAIN}
        />
      )}
      <text x={satX + 12} y={satY + arcR + 24} className="iso-brief__value">
        {Math.round(angle)}°
      </text>
      <rect x={hitX - 5} y={groundY - 5} width={10} height={10} fill={INK_CURTAIN} />
      <rect x={satX - 7} y={satY - 7} width={14} height={14} fill={INK_HARM} />
      <line x1={satX - 34} y1={satY} x2={satX + 34} y2={satY} stroke={INK_HARM} strokeWidth={3} />
      <text x={satX + 44} y={satY + 4} className="iso-brief__axis">
        {orbit.modisKm !== null && orbit.viirsKm !== null
          ? `MODIS ${km(orbit.modisKm)} km up, VIIRS ${km(orbit.viirsKm)} km`
          : 'satellite'}
      </text>

      <text x={24} y={planY - 48} className="iso-brief__axis">
        one pixel on the ground, to scale
      </text>
      <rect
        x={mX - mW / 2}
        y={planY - mH / 2}
        width={mW}
        height={mH}
        fill="rgba(180, 195, 214, 0.2)"
        stroke={INK_MODIS}
        strokeWidth={1.5}
      />
      <text
        x={mX}
        y={planY + Math.max(mH / 2, 14) + 24}
        textAnchor="middle"
        className="iso-brief__label"
        fill={INK_MODIS}
      >
        MODIS {fmt(sample.modisAcrossKm)} x {fmt(sample.modisAlongKm)} km
      </text>
      <rect
        x={vX - vW / 2}
        y={planY - vH / 2}
        width={vW}
        height={vH}
        fill="rgba(240, 138, 69, 0.35)"
        stroke={INK_VIIRS}
        strokeWidth={1.5}
      />
      <text
        x={vX}
        y={planY + Math.max(mH / 2, 14) + 24}
        textAnchor="middle"
        className="iso-brief__label"
        fill={INK_VIIRS}
      >
        VIIRS {fmt(sample.viirsAcrossKm, 2)} x {fmt(sample.viirsAlongKm, 2)} km
      </text>
      <line x1={W - 20 - s} y1={H - 18} x2={W - 20} y2={H - 18} stroke={INK_AXIS} />
      <line x1={W - 20 - s} y1={H - 22} x2={W - 20 - s} y2={H - 14} stroke={INK_AXIS} />
      <line x1={W - 20} y1={H - 22} x2={W - 20} y2={H - 14} stroke={INK_AXIS} />
      <text x={W - 26 - s} y={H - 14} textAnchor="end" className="iso-brief__axis">
        1 km
      </text>
    </svg>
  );
}

/** Page 2: the smallest fire each sensor detects half the time, across the scan. */
function DetectionVisual({
  angle,
  curves,
  sample,
}: {
  angle: number;
  curves: readonly SensorCurveSample[];
  sample: SensorCurveSample;
}) {
  const L = 56;
  const R = 88;
  const T = 34;
  const B = 48;
  const maxDeg = 55;
  const pts = curves.filter((c) => c.scanAngleDeg <= maxDeg);
  const maxMw = Math.max(10, Math.ceil(Math.max(...pts.map((c) => c.modisMinFrpMw)) / 10) * 10);
  const x = (d: number) => L + (Math.min(maxDeg, Math.max(0, d)) / maxDeg) * (W - L - R);
  const y = (mw: number) => H - B - (Math.min(maxMw, Math.max(0, mw)) / maxMw) * (H - T - B);
  const line = (get: (c: SensorCurveSample) => number) =>
    pts
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${x(c.scanAngleDeg).toFixed(1)},${y(get(c)).toFixed(1)}`)
      .join(' ');
  const band = `${line((c) => c.modisMinFrpMw)} ${[...pts]
    .reverse()
    .map((c) => `L${x(c.scanAngleDeg).toFixed(1)},${y(c.viirsMinFrpMw).toFixed(1)}`)
    .join(' ')} Z`;
  const last = pts[pts.length - 1];
  const mid = nearestSample(pts, 30);
  const bandMidY = (y(mid.modisMinFrpMw) + y(mid.viirsMinFrpMw)) / 2;
  const ticksY = Array.from({ length: maxMw / 10 + 1 }, (_, i) => i * 10);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="iso-brief__svg"
      role="img"
      aria-label={`At ${Math.round(angle)} degrees, MODIS detects fires of ${fmt(sample.modisMinFrpMw)} megawatts half the time and VIIRS ${fmt(sample.viirsMinFrpMw)}.`}
    >
      {ticksY.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={INK_GRID} />
          <text x={L - 10} y={y(t) + 4} textAnchor="end" className="iso-brief__axis">
            {t}
          </text>
        </g>
      ))}
      <text x={L} y={T - 14} className="iso-brief__axis">
        fire power, MW
      </text>
      {[0, 15, 30, 45, 55].map((d) => (
        <text key={d} x={x(d)} y={H - B + 22} textAnchor="middle" className="iso-brief__axis">
          {d}°
        </text>
      ))}
      <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" className="iso-brief__axis">
        scan angle off nadir
      </text>

      <path d={band} fill="rgba(180, 195, 214, 0.13)" />
      <line
        x1={x(mid.scanAngleDeg)}
        x2={x(mid.scanAngleDeg)}
        y1={y(maxMw * 0.42) + 30}
        y2={bandMidY}
        stroke="rgba(243, 244, 246, 0.55)"
      />
      <rect x={x(mid.scanAngleDeg) - 3} y={bandMidY - 3} width={6} height={6} fill={INK_HARM} />
      <text x={x(mid.scanAngleDeg)} y={y(maxMw * 0.42)} textAnchor="middle" className="iso-brief__label" fill={INK_HARM}>
        <tspan x={x(mid.scanAngleDeg)}>VIIRS sees these fires,</tspan>
        <tspan x={x(mid.scanAngleDeg)} dy={18}>
          MODIS misses them
        </tspan>
      </text>
      <path d={line((c) => c.modisMinFrpMw)} fill="none" stroke={INK_MODIS} strokeWidth={2.2} />
      <path d={line((c) => c.viirsMinFrpMw)} fill="none" stroke={INK_VIIRS} strokeWidth={2.2} />
      <text x={x(last.scanAngleDeg) + 8} y={y(last.modisMinFrpMw) + 5} className="iso-brief__label" fill={INK_MODIS}>
        MODIS
      </text>
      <text x={x(last.scanAngleDeg) + 8} y={y(last.viirsMinFrpMw) + 5} className="iso-brief__label" fill={INK_VIIRS}>
        VIIRS
      </text>

      <line x1={x(angle)} x2={x(angle)} y1={T} y2={H - B} stroke={INK_CURTAIN} strokeWidth={1} />
      <rect x={x(angle) - 4} y={y(sample.modisMinFrpMw) - 4} width={8} height={8} fill={INK_MODIS} />
      <rect x={x(angle) - 4} y={y(sample.viirsMinFrpMw) - 4} width={8} height={8} fill={INK_VIIRS} />
      <text
        x={x(angle) - 10}
        y={y(sample.modisMinFrpMw) - 10}
        textAnchor="end"
        className="iso-brief__value-sm"
        fill={INK_MODIS}
      >
        {fmt(sample.modisMinFrpMw)} MW
      </text>
      <text x={x(angle) + 10} y={y(sample.viirsMinFrpMw) + 22} className="iso-brief__value-sm" fill={INK_VIIRS}>
        {fmt(sample.viirsMinFrpMw)} MW
      </text>
    </svg>
  );
}

/**
 * Page 3, on real data only (a simulated run has no independent reference to score against). The error of a
 * held-out year's detection total, with the overlap ratio and without it, from the real calendar's
 * leave-one-year-out check.
 */
function OneRecordVisual({ overlap }: { overlap: OverlapEvidence }) {
  const L = 40;
  const R = 40;
  const rows = [
    { label: 'Raw counts added up', value: overlap.withoutError, ink: INK_MODIS },
    { label: 'With the overlap ratio', value: overlap.heldOutError, ink: INK_HARM },
  ];
  const max = Math.max(0.01, ...rows.map((r) => r.value ?? 0));
  const x = (v: number) => L + (v / max) * (W - L - R);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="iso-brief__svg"
      role="img"
      aria-label="Error of a held-out year's detection total, with and without the overlap ratio."
    >
      <text x={L} y={70} className="iso-brief__axis">
        Error of a held-out year&apos;s total, median
      </text>
      {rows.map((r, i) => {
        const y = 130 + i * 110;
        return (
          <g key={r.label}>
            <text x={L} y={y - 14} className="iso-brief__axis">
              {r.label}
            </text>
            {r.value !== null && <rect x={L} y={y} width={Math.max(2, x(r.value) - L)} height={26} fill={r.ink} />}
            <text x={r.value !== null ? x(r.value) + 10 : L} y={y + 19} className="iso-brief__value-sm" fill={r.ink}>
              {r.value !== null ? `${Math.round(r.value * 100)}%` : 'not sent'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function SensorDiagnosticModal({
  open,
  isOpen,
  onClose,
  model,
  overlap,
  overlapPlace,
  embedded = false,
}: SensorDiagnosticModalProps & {
  /** Drawn inside the reading sheet, without its own backdrop, frame or close button. */
  embedded?: boolean;
  /** The sensor model for the run on screen (ui/useSensorModel.ts); null until it loads or without a backend. */
  model?: SensorModelPayload | null;
  /** The real calendar's overlap ratio and its leave-one-year-out check, and the place it was measured for. */
  overlap?: OverlapEvidence | null;
  overlapPlace?: string | null;
}) {
  const visible = open ?? isOpen ?? true;
  const [diagnostics, setDiagnostics] = useState<NormalizedSensorDiagnostics>(() =>
    createAnalyticalSensorDiagnostics('analytical_baseline'),
  );
  const [page, setPage] = useState(0);
  const [angle, setAngle] = useState<number>(42);
  const scrubRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useDialogFocus(visible && !embedded, drawerRef, closeRef);

  // The page and angle keys work in both forms; inside the reading sheet, Escape belongs to the sheet.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (!embedded) onClose();
      } else if (e.key === 'ArrowRight') {
        setPage((p) => Math.min(PAGES.length - 1, p + 1));
      } else if (e.key === 'ArrowLeft') {
        setPage((p) => Math.max(0, p - 1));
      } else if (/^[1-3]$/.test(e.key)) {
        setPage(Number(e.key) - 1);
      } else if (e.key === ']') {
        setAngle((a) => Math.min(55, a + 5));
      } else if (e.key === '[') {
        setAngle((a) => Math.max(0, a - 5));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, embedded, onClose]);

  useEffect(() => {
    if (!model) return;
    setDiagnostics(normalizeSensorDiagnostics(model.raw, model.source));
  }, [model]);

  const curves = useMemo(
    () => (diagnostics.curves.length > 0 ? diagnostics.curves : createAnalyticalSensorDiagnostics().curves),
    [diagnostics.curves],
  );
  const sample = useMemo(() => nearestSample(curves, angle), [curves, angle]);
  const orbit = useMemo(() => orbitOf(model?.raw), [model]);

  if (!visible) return null;

  const setAngleFromX = (clientX: number) => {
    const el = scrubRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    setAngle(Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * 55));
  };

  const ratio = sample.modisAreaKm2 / Math.max(1e-3, sample.viirsAreaKm2);
  const sourceLine =
    diagnostics.source === 'api'
      ? 'Live sensor model from the backend'
      : diagnostics.source === 'static_artifact'
        ? 'Generated diagnostics file in this build'
        : 'Analytical sensor model, computed in the browser';
  const showAngle = page < 2;

  const content = (
    <>
        <header className="iso-brief__head">
          <h2 id="iso-brief-title" className="iso-brief__title">
            Why MODIS and VIIRS disagree
          </h2>
          <nav className="iso-brief__pages" aria-label="Pages">
            {PAGES.map((p, i) => (
              <button
                key={p.key}
                type="button"
                className="iso-brief__page"
                data-active={page === i ? 'true' : 'false'}
                aria-current={page === i ? 'step' : undefined}
                onClick={() => setPage(i)}
              >
                <span className="iso-brief__page-num">[{i + 1}]</span>
                {p.label}
              </button>
            ))}
          </nav>
          {!embedded && (
            <button ref={closeRef} type="button" className="iso-finder__action" onClick={onClose}>
              Close <kbd>Esc</kbd>
            </button>
          )}
        </header>

        <div className="iso-brief__body" key={page}>
          <div className="iso-brief__visual">
            {page === 0 && <PixelSizeVisual angle={angle} sample={sample} orbit={orbit} />}
            {page === 1 && <DetectionVisual angle={angle} curves={curves} sample={sample} />}
            {page === 2 && overlap && <OneRecordVisual overlap={overlap} />}
          </div>

          <div className="iso-brief__text">
            {page === 0 && (
              <>
                <p className="iso-brief__lead">
                  The further a satellite looks from straight down, the more ground one pixel covers.
                  MODIS pixels stretch a lot; VIIRS pixels barely change.
                </p>
                <div className="iso-brief__stats">
                  <div>
                    <span className="iso-brief__big" style={{ color: INK_MODIS }}>
                      {fmt(sample.modisAreaKm2, 2)}
                    </span>
                    <span className="iso-brief__unit">km² per MODIS pixel</span>
                  </div>
                  <div>
                    <span className="iso-brief__big" style={{ color: INK_VIIRS }}>
                      {fmt(sample.viirsAreaKm2, 2)}
                    </span>
                    <span className="iso-brief__unit">km² per VIIRS pixel</span>
                  </div>
                </div>
                <p className="iso-brief__take">
                  At {Math.round(angle)}° one MODIS pixel covers {fmt(ratio)} times the ground of a VIIRS
                  pixel. A small fire fills less of a big pixel, so the same fire looks weaker to MODIS.
                </p>
              </>
            )}
            {page === 1 && (
              <>
                <p className="iso-brief__lead">
                  A fire has to give off more power before MODIS notices it, and more still at the edge
                  of the swath.
                </p>
                <div className="iso-brief__stats">
                  <div>
                    <span className="iso-brief__big" style={{ color: INK_MODIS }}>
                      {fmt(sample.modisMinFrpMw)}
                    </span>
                    <span className="iso-brief__unit">MW for MODIS, by day</span>
                  </div>
                  <div>
                    <span className="iso-brief__big" style={{ color: INK_VIIRS }}>
                      {fmt(sample.viirsMinFrpMw)}
                    </span>
                    <span className="iso-brief__unit">MW for VIIRS, by day</span>
                  </div>
                </div>
                <p className="iso-brief__take">
                  By day, these are the fire powers each sensor detects half the time at {Math.round(angle)}°.
                  {orbit.viirsNightNadirMw !== null
                    ? ` At night VIIRS sees smaller fires: ${fmt(orbit.viirsNightNadirMw)} MW half the time straight down.`
                    : ''}{' '}
                  Fires in between are in the VIIRS record and missing from the MODIS one, which is why raw counts
                  jump when VIIRS joins in 2012.
                </p>
              </>
            )}
            {page === 2 &&
              (overlap ? (
                <>
                  <p className="iso-brief__lead">
                    Where both sensors fly, 2012 to 2025, VIIRS on Suomi NPP flags {overlap.ratio.toFixed(2)} times
                    as many pixels as MODIS on Terra and Aqua over {overlapPlace ?? 'this box'}. The burning calendar
                    scales the MODIS months by that ratio so the record is one series. The fire estimate does not use
                    it: in the blind test the ratio is one of the two baselines the estimate is scored against.
                  </p>
                  <div className="iso-brief__stats">
                    <div>
                      <span className="iso-brief__big">{overlap.ratio.toFixed(2)}</span>
                      <span className="iso-brief__unit">
                        overlap ratio
                        {overlap.p10 !== null && overlap.p90 !== null
                          ? `, ${overlap.p10.toFixed(2)} to ${overlap.p90.toFixed(2)} across years`
                          : ''}
                      </span>
                    </div>
                  </div>
                  <p className="iso-brief__take">
                    NASA FIRMS rows, each year held out in turn and predicted from the others
                    {overlap.heldYears !== null
                      ? `. The year-to-year range held the truth in ${Math.round(overlap.heldYears * 100)}% of held-out years.`
                      : '.'}
                  </p>
                </>
              ) : (
                <p className="iso-brief__lead">
                  This page shows the overlap of MODIS and VIIRS on real NASA FIRMS rows, for regions that have
                  them: Feather River, Lytton and Evia. A simulated run has no such check, because a simulation
                  can only be scored against its own answer.
                </p>
              ))}

            {showAngle && (
              <div className="iso-brief__angle">
                <div className="iso-brief__angle-head">
                  <span>Scan angle</span>
                  <span className="iso-brief__angle-val">{Math.round(angle)}°</span>
                </div>
                <div
                  ref={scrubRef}
                  className="iso-vernier__hit"
                  role="slider"
                  tabIndex={0}
                  aria-label="Scan angle off nadir, in degrees"
                  aria-valuemin={0}
                  aria-valuemax={55}
                  aria-valuenow={Math.round(angle)}
                  onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
                    draggingRef.current = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setAngleFromX(e.clientX);
                  }}
                  onPointerMove={(e) => {
                    if (draggingRef.current) setAngleFromX(e.clientX);
                  }}
                  onPointerUp={(e) => {
                    draggingRef.current = false;
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      e.stopPropagation();
                      setAngle((a) => Math.min(55, a + 1));
                    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      e.stopPropagation();
                      setAngle((a) => Math.max(0, a - 1));
                    }
                  }}
                >
                  <div className="iso-vernier__rail">
                    <div className="iso-vernier__fill" style={{ width: `${(angle / 55) * 100}%` }} />
                    {[0, 15, 30, 45, 55].map((d) => (
                      <span
                        key={d}
                        className="iso-vernier__tick iso-vernier__tick--major"
                        style={{ left: `${(d / 55) * 100}%` }}
                      />
                    ))}
                  </div>
                  <div className="iso-vernier__needle" style={{ left: `${(angle / 55) * 100}%` }} />
                </div>
                <div className="iso-choice" role="group" aria-label="Angle presets">
                  {ANGLE_PRESETS.map((p) => (
                    <button
                      key={p.deg}
                      type="button"
                      className="iso-choice__opt"
                      data-active={Math.round(angle) === p.deg ? 'true' : 'false'}
                      onClick={() => setAngle(p.deg)}
                    >
                      {p.label} {p.deg}°
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="iso-brief__legend">
          <span className="iso-finder__legend-lead">
            Page <kbd>&larr;</kbd>
            <kbd>&rarr;</kbd>
          </span>
          {showAngle && (
            <span className="iso-finder__legend-lead">
              Angle <kbd>[</kbd>
              <kbd>]</kbd>
            </span>
          )}
          <span className="iso-brief__source">
            {sourceLine}.
          </span>
        </footer>
    </>
  );

  if (embedded) {
    return (
      <div ref={drawerRef} className="iso-brief iso-brief--embedded">
        {content}
      </div>
    );
  }

  return (
    <div className="iso-backdrop iso-backdrop--center iso-backdrop--soft" onClick={onClose} role="presentation">
      <div
        ref={drawerRef}
        className="iso-glass iso-brief"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="iso-brief-title"
      >
        {content}
      </div>
    </div>
  );
}

export default SensorDiagnosticModal;
