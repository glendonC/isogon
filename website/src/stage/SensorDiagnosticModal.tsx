import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  createAnalyticalSensorDiagnostics,
  normalizeSensorDiagnostics,
  type NormalizedSensorDiagnostics,
  type SensorDiagnosticModalProps,
} from './types';

export type { SensorDiagnosticModalProps } from './types';

const MODAL_STYLES = `
.isogon-diag-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  padding: 16px;
  background: rgba(6, 9, 12, 0.66);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  justify-content: flex-end;
  align-items: stretch;
  animation: isogonDiagFade 160ms ease;
}
@keyframes isogonDiagFade {
  from { opacity: 0; }
  to { opacity: 1; }
}
.isogon-diag-drawer {
  --diag-r: 6px;
  width: min(700px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  border-radius: var(--diag-r);
  background: rgba(9, 12, 18, 0.94);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(245, 246, 250, 0.18);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.54);
  color: #F5F6FA;
  padding: 22px 26px 28px;
  overflow-y: auto;
  user-select: text;
  animation: isogonDiagSlide 220ms cubic-bezier(0.22, 1, 0.36, 1);
  font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
@keyframes isogonDiagSlide {
  from { transform: translateX(20px); opacity: 0.68; }
  to { transform: translateX(0); opacity: 1; }
}
.isogon-diag-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 18px;
}
.isogon-diag-kicker {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.05em;
  color: rgba(235, 240, 241, 0.62);
  text-transform: uppercase;
}
.isogon-diag-source-tag {
  padding: 2px 7px;
  border-radius: 3px;
  border: 1px solid rgba(245, 246, 250, 0.16);
  background: rgba(245, 246, 250, 0.08);
  color: #F5F6FA;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.isogon-diag-close {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 11px;
  border-radius: 4px;
  border: 1px solid rgba(245, 246, 250, 0.16);
  background: transparent;
  color: rgba(245, 246, 250, 0.88);
  font-family: inherit;
  font-size: 12px;
  font-weight: 450;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease;
}
.isogon-diag-close:hover {
  background: rgba(245, 246, 250, 0.10);
  border-color: rgba(245, 246, 250, 0.34);
}
.isogon-diag-esc-keycap {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 18px;
  padding: 0 5px;
  border-radius: 2px;
  border: 1px solid rgba(245, 246, 250, 0.28);
  background: transparent;
  color: #F5F6FA;
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  font-weight: 500;
}
.isogon-diag-title {
  margin: 0;
  font-size: 22px;
  line-height: 1.18;
  font-weight: 500;
  letter-spacing: -0.025em;
  color: #F5F6FA;
}
.isogon-diag-lead {
  margin: 9px 0 0;
  font-size: 13.5px;
  line-height: 1.54;
  color: rgba(245, 246, 250, 0.68);
}
.isogon-diag-probe-card {
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: 4px;
  background: rgba(245, 246, 250, 0.03);
  border: 1px solid rgba(245, 246, 250, 0.12);
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: center;
}
.isogon-diag-probe-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.isogon-diag-probe-label {
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(235, 240, 241, 0.66);
}
.isogon-diag-probe-angle {
  padding: 2px 7px;
  border-radius: 3px;
  border: 1px solid rgba(245, 246, 250, 0.16);
  background: rgba(245, 246, 250, 0.08);
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  font-weight: 500;
  color: #F5F6FA;
  font-variant-numeric: tabular-nums;
}
.isogon-diag-scrubber {
  position: relative;
  height: 26px;
  display: flex;
  align-items: center;
  cursor: ew-resize;
  touch-action: none;
  user-select: none;
  outline: none;
}
.isogon-diag-scrubber:focus-visible {
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.42);
  border-radius: 3px;
}
.isogon-diag-scrubber-rail {
  position: relative;
  width: 100%;
  height: 1px;
  background: rgba(255, 255, 255, 0.16);
}
.isogon-diag-scrubber-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 1px;
  background: #E07A5F;
}
.isogon-diag-scrubber-tick {
  position: absolute;
  top: -3px;
  width: 1px;
  height: 7px;
  background: rgba(255, 255, 255, 0.18);
  transform: translateX(-0.5px);
}
.isogon-diag-scrubber-needle {
  position: absolute;
  top: 4px;
  width: 2px;
  height: 18px;
  background: #EBF0F1;
  box-shadow: 0 0 8px rgba(224, 122, 95, 0.65);
  transform: translateX(-1px);
  pointer-events: none;
}
.isogon-diag-scrubber-needle::before {
  content: '';
  position: absolute;
  top: -2px;
  left: -2px;
  width: 6px;
  height: 4px;
  border-radius: 1px;
  background: #E07A5F;
}
.isogon-diag-metrics-row {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
}
.isogon-diag-metric {
  padding: 2px 10px 2px 0;
}
.isogon-diag-metric + .isogon-diag-metric {
  padding-left: 11px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}
.isogon-diag-metric-k {
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.5px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: rgba(235, 240, 241, 0.54);
}
.isogon-diag-metric-v {
  margin-top: 3px;
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  font-weight: 500;
  color: #EBF0F1;
  font-variant-numeric: tabular-nums;
}
.isogon-diag-footprint-box {
  width: 116px;
  height: 96px;
  border-radius: 4px;
  background: rgba(7, 9, 14, 0.88);
  border: 1px solid rgba(245, 246, 250, 0.11);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px;
}
.isogon-diag-footprint-cap {
  margin-top: 4px;
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.5px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: rgba(235, 240, 241, 0.56);
}
.isogon-diag-chart-block {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.isogon-diag-chart-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 8px;
}
.isogon-diag-chart-title {
  margin: 0;
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: #EBF0F1;
}
.isogon-diag-legend {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  color: rgba(235, 240, 241, 0.66);
}
.isogon-diag-swatch {
  display: inline-block;
  width: 10px;
  height: 2px;
  margin-right: 5px;
  vertical-align: middle;
}
.isogon-diag-svg {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 4px;
  border: 1px solid rgba(245, 246, 250, 0.11);
  background: #07090E;
  cursor: crosshair;
}
.isogon-diag-summary-strip {
  margin-top: 12px;
  padding: 11px 14px;
  border-radius: 4px;
  background: rgba(245, 246, 250, 0.03);
  border: 1px solid rgba(245, 246, 250, 0.11);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
}
.isogon-diag-stat-card {
  padding: 0 12px 0 0;
}
.isogon-diag-stat-card + .isogon-diag-stat-card {
  padding-left: 14px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}
.isogon-diag-stat-label {
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(235, 240, 241, 0.56);
}
.isogon-diag-stat-val {
  margin-top: 4px;
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  font-weight: 500;
  color: #EBF0F1;
  font-variant-numeric: tabular-nums;
}
.isogon-diag-gates {
  margin-top: 12px;
  border-radius: 4px;
  background: rgba(245, 246, 250, 0.03);
  border: 1px solid rgba(245, 246, 250, 0.11);
  overflow: hidden;
}
.isogon-diag-gate-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 13px;
  font-size: 12px;
}
.isogon-diag-gate-row + .isogon-diag-gate-row {
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}
.isogon-diag-gate-left {
  display: inline-flex;
  align-items: center;
  gap: 9px;
}
.isogon-diag-drawer .isogon-diag-gate-check {
  width: 10px;
  height: 10px;
  border-radius: 1px;
  border: 1px solid #ffffff;
  background: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.isogon-diag-gate-title {
  font-weight: 500;
  color: #EBF0F1;
}
.isogon-diag-gate-metric {
  padding: 2px 7px;
  border-radius: 3px;
  border: 1px solid rgba(245, 246, 250, 0.14);
  background: rgba(245, 246, 250, 0.06);
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  color: rgba(243, 244, 247, 0.88);
  font-variant-numeric: tabular-nums;
}
.isogon-diag-prov {
  margin-top: 16px;
  padding: 11px 14px;
  border-radius: 4px;
  background: rgba(245, 246, 250, 0.03);
  border: 1px solid rgba(245, 246, 250, 0.11);
  font-size: 12px;
  line-height: 1.5;
  color: rgba(235, 240, 241, 0.64);
}
.isogon-diag-prov strong {
  color: #EBF0F1;
}
.isogon-diag-prov code {
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.88);
}
@media (max-width: 640px) {
  .isogon-diag-backdrop {
    padding: 8px;
  }
  .isogon-diag-drawer {
    width: calc(100vw - 16px);
    max-height: calc(100dvh - 16px);
    padding: 18px 16px 26px;
  }
  .isogon-diag-probe-card {
    grid-template-columns: 1fr;
  }
  .isogon-diag-metrics-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .isogon-diag-metric + .isogon-diag-metric {
    padding-left: 0;
    border-left: none;
  }
  .isogon-diag-summary-strip {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .isogon-diag-stat-card + .isogon-diag-stat-card {
    padding-left: 0;
    padding-top: 8px;
    border-left: none;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .isogon-diag-gate-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
`;

const CHART_W = 580;
const CHART_H = 166;
const PAD_L = 48;
const PAD_R = 18;
const PAD_T = 16;
const PAD_B = 28;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

export function SensorDiagnosticModal({ open, isOpen, onClose }: SensorDiagnosticModalProps) {
  const visible = open ?? isOpen ?? true;

  const [diagnostics, setDiagnostics] = useState<NormalizedSensorDiagnostics>(() =>
    createAnalyticalSensorDiagnostics('analytical_baseline'),
  );
  const [probeAngle, setProbeAngle] = useState<number>(42);
  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const draggingScrubberRef = useRef<boolean>(false);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();

    const loadDiagnostics = async () => {
      const endpoints: Array<{ url: string; source: NormalizedSensorDiagnostics['source'] }> = [
        { url: '/api/sensor-model', source: 'api' },
        { url: 'http://127.0.0.1:8788/api/sensor-model', source: 'api' },
        { url: '/generated/fields/sensor_model_diagnostics.json', source: 'static_artifact' },
      ];

      for (const ep of endpoints) {
        try {
          const res = await fetch(ep.url, { signal: controller.signal });
          if (!res.ok) continue;
          const raw: unknown = await res.json();
          if (!controller.signal.aborted) {
            setDiagnostics(normalizeSensorDiagnostics(raw, ep.source));
          }
          return;
        } catch {
          // Proceed to next fallback endpoint
        }
      }
    };

    void loadDiagnostics();
    return () => controller.abort();
  }, [visible]);

  const probedSample = useMemo(() => {
    const list = diagnostics.curves;
    if (list.length === 0) return createAnalyticalSensorDiagnostics().curves[42];
    let best = list[0];
    let bestDiff = Math.abs(best.scanAngleDeg - probeAngle);
    for (let i = 1; i < list.length; i++) {
      const d = Math.abs(list[i].scanAngleDeg - probeAngle);
      if (d < bestDiff) {
        best = list[i];
        bestDiff = d;
      }
    }
    return best;
  }, [diagnostics.curves, probeAngle]);

  if (!visible) return null;

  const maxScanAngle = Math.max(56, diagnostics.curves[diagnostics.curves.length - 1]?.scanAngleDeg ?? 56);
  const xForScan = (deg: number) => PAD_L + (Math.min(maxScanAngle, Math.max(0, deg)) / maxScanAngle) * PLOT_W;

  const updateAngleFromClientX = (clientX: number) => {
    const el = scrubberRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setProbeAngle(Math.round(frac * maxScanAngle));
  };

  const onScrubberPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    draggingScrubberRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateAngleFromClientX(e.clientX);
  };

  const onScrubberPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingScrubberRef.current) return;
    updateAngleFromClientX(e.clientX);
  };

  const onScrubberPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingScrubberRef.current) return;
    draggingScrubberRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onScrubberKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const maxDeg = Math.round(maxScanAngle);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      setProbeAngle((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      setProbeAngle((prev) => Math.min(maxDeg, prev + 1));
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      setProbeAngle((prev) => Math.max(0, prev - 5));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      setProbeAngle((prev) => Math.min(maxDeg, prev + 5));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setProbeAngle(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setProbeAngle(maxDeg);
    }
  };

  const updateAngleFromScanSvg = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * CHART_W;
    const frac = Math.min(1, Math.max(0, (svgX - PAD_L) / PLOT_W));
    setProbeAngle(Math.round(frac * maxScanAngle));
  };

  // --- Chart 1: Pixel Area Growth (km^2 vs Scan Angle) ---
  const maxArea = Math.max(10.2, ...diagnostics.curves.map((c) => c.modisAreaKm2 * 1.05));
  const yArea = (km2: number) => PAD_T + PLOT_H - (Math.min(maxArea, Math.max(0, km2)) / maxArea) * PLOT_H;

  const modisAreaPath = diagnostics.curves
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${xForScan(c.scanAngleDeg).toFixed(1)},${yArea(c.modisAreaKm2).toFixed(1)}`)
    .join(' ');
  const modisAreaFill = `${modisAreaPath} L${xForScan(diagnostics.curves[diagnostics.curves.length - 1].scanAngleDeg).toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} L${PAD_L},${(PAD_T + PLOT_H).toFixed(1)} Z`;

  const viirsAreaPath = diagnostics.curves
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${xForScan(c.scanAngleDeg).toFixed(1)},${yArea(c.viirsAreaKm2).toFixed(1)}`)
    .join(' ');

  // --- Chart 2: Minimum Detectable FRP (MW vs Scan Angle) ---
  const maxFrp = Math.max(46, ...diagnostics.curves.map((c) => c.modisMinFrpMw * 1.08));
  const yFrp = (mw: number) => PAD_T + PLOT_H - (Math.min(maxFrp, Math.max(0, mw)) / maxFrp) * PLOT_H;

  const modisFrpPath = diagnostics.curves
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${xForScan(c.scanAngleDeg).toFixed(1)},${yFrp(c.modisMinFrpMw).toFixed(1)}`)
    .join(' ');
  const viirsFrpPath = diagnostics.curves
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${xForScan(c.scanAngleDeg).toFixed(1)},${yFrp(c.viirsMinFrpMw).toFixed(1)}`)
    .join(' ');

  const reversedViirsFrp = [...diagnostics.curves]
    .reverse()
    .map((c) => `L${xForScan(c.scanAngleDeg).toFixed(1)},${yFrp(c.viirsMinFrpMw).toFixed(1)}`)
    .join(' ');
  const censoredPolygonPath = `${modisFrpPath} ${reversedViirsFrp} Z`;

  // --- Chart 3: Paired 13:30 LST Overpass Residuals ---
  const maxVzaAngle = Math.max(
    65,
    ...diagnostics.residuals.map((r) => r.scanAngleDeg),
    ...diagnostics.pairedSamples.map((s) => s.angleDeg),
  );
  const xForVza = (deg: number) => PAD_L + (Math.min(maxVzaAngle, Math.max(0, deg)) / maxVzaAngle) * PLOT_W;

  const rawResPeak = Math.max(
    0.26,
    ...diagnostics.residuals.map((r) => Math.max(Math.abs(r.rawResidual), Math.abs(r.harmonizedResidual) + r.ci90HalfWidth)),
    ...diagnostics.pairedSamples.map((s) => Math.min(0.45, Math.max(Math.abs(s.rawLogRatio), Math.abs(s.harmonizedLogRatio)))),
  );
  const maxAbsRes = rawResPeak * 1.15;
  const yRes = (val: number) =>
    PAD_T + PLOT_H * 0.5 - (Math.max(-maxAbsRes, Math.min(maxAbsRes, val)) / maxAbsRes) * (PLOT_H * 0.46);
  const resTickStep = maxAbsRes <= 0.6 ? 0.2 : 0.5;
  const resTicks = [-2 * resTickStep, -resTickStep, 0, resTickStep, 2 * resTickStep].filter(
    (t) => Math.abs(t) <= maxAbsRes * 1.02,
  );

  const rawResPath = diagnostics.residuals
    .map((r, i) => `${i === 0 ? 'M' : 'L'}${xForVza(r.scanAngleDeg).toFixed(1)},${yRes(r.rawResidual).toFixed(1)}`)
    .join(' ');
  const harmResPath = diagnostics.residuals
    .map((r, i) => `${i === 0 ? 'M' : 'L'}${xForVza(r.scanAngleDeg).toFixed(1)},${yRes(r.harmonizedResidual).toFixed(1)}`)
    .join(' ');

  const ciUpper = diagnostics.residuals
    .map((r, i) => `${i === 0 ? 'M' : 'L'}${xForVza(r.scanAngleDeg).toFixed(1)},${yRes(r.harmonizedResidual + r.ci90HalfWidth).toFixed(1)}`)
    .join(' ');
  const ciLower = [...diagnostics.residuals]
    .reverse()
    .map((r) => `L${xForVza(r.scanAngleDeg).toFixed(1)},${yRes(r.harmonizedResidual - r.ci90HalfWidth).toFixed(1)}`)
    .join(' ');
  const ciBandPath = `${ciUpper} ${ciLower} Z`;

  const probeScanX = xForScan(probeAngle);
  const probeFracPct = Math.min(100, Math.max(0, (probeAngle / maxScanAngle) * 100));
  const rmseReductionPct = Math.round(
    (1 - diagnostics.summary.harmonizedRmse / Math.max(1e-4, diagnostics.summary.rawRmse)) * 100,
  );

  const sourceBadge =
    diagnostics.source === 'api'
      ? 'Live /api/sensor-model'
      : diagnostics.source === 'static_artifact'
        ? 'Static Diagnostic Artifact'
        : 'Clean-Room Analytical Physics';

  return (
    <div className="isogon-diag-backdrop" onClick={onClose} role="presentation">
      <style>{MODAL_STYLES}</style>
      <aside
        className="isogon-diag-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="isogon-sensor-diag-title"
      >
        <div className="isogon-diag-topbar">
          <div className="isogon-diag-kicker">
            <span>Research · Sensor Forward Model</span>
            <span className="isogon-diag-source-tag">{sourceBadge}</span>
          </div>
          <button type="button" className="isogon-diag-close" onClick={onClose}>
            <span>Close</span>
            <kbd className="isogon-diag-esc-keycap" aria-hidden="true">
              Esc
            </kbd>
          </button>
        </div>

        <h2 id="isogon-sensor-diag-title" className="isogon-diag-title">
          MODIS vs VIIRS Scan Geometry &amp; 13:30 Overpass Calibration
        </h2>
        <p className="isogon-diag-lead">
          Why raw multi-sensor fire counts jump at 2012 and diverge at swath edges: MODIS 1 km pixels
          expand nearly tenfold into 4.8 x 2.0 km bow-tie ellipses at 55 deg scan angle, elevating the
          minimum detectable radiative threshold while VIIRS onboard three-zone aggregation preserves
          sub-kilometer acuity.
        </p>

        {/* Synchronized Scan-Angle Hairline Scrubber + 1:1 Footprint Comparison Inset */}
        <div className="isogon-diag-probe-card">
          <div>
            <div className="isogon-diag-probe-header">
              <span className="isogon-diag-probe-label">Scan-Angle Probe · Hover Charts or Drag Needle</span>
              <span className="isogon-diag-probe-angle">theta = {probeAngle.toFixed(0)}° off-nadir</span>
            </div>

            <div
              ref={scrubberRef}
              className="isogon-diag-scrubber"
              role="slider"
              tabIndex={0}
              aria-label="Probe off-nadir scan angle in degrees"
              aria-valuemin={0}
              aria-valuemax={Math.round(maxScanAngle)}
              aria-valuenow={probeAngle}
              onPointerDown={onScrubberPointerDown}
              onPointerMove={onScrubberPointerMove}
              onPointerUp={onScrubberPointerUp}
              onPointerCancel={onScrubberPointerUp}
              onKeyDown={onScrubberKeyDown}
            >
              <div className="isogon-diag-scrubber-rail">
                <div className="isogon-diag-scrubber-fill" style={{ width: `${probeFracPct.toFixed(2)}%` }} />
                {[0, 15, 31.72, 44.86, maxScanAngle].map((deg) => (
                  <span
                    key={deg}
                    className="isogon-diag-scrubber-tick"
                    style={{ left: `${((deg / maxScanAngle) * 100).toFixed(2)}%` }}
                  />
                ))}
              </div>
              <div className="isogon-diag-scrubber-needle" style={{ left: `${probeFracPct.toFixed(2)}%` }} />
            </div>

            <div className="isogon-diag-metrics-row">
              <div className="isogon-diag-metric">
                <div className="isogon-diag-metric-k">MODIS Area</div>
                <div className="isogon-diag-metric-v">{probedSample.modisAreaKm2.toFixed(2)} km²</div>
              </div>
              <div className="isogon-diag-metric">
                <div className="isogon-diag-metric-k">VIIRS Area</div>
                <div className="isogon-diag-metric-v">{probedSample.viirsAreaKm2.toFixed(2)} km²</div>
              </div>
              <div className="isogon-diag-metric">
                <div className="isogon-diag-metric-k">MODIS D_50 FRP</div>
                <div className="isogon-diag-metric-v">{probedSample.modisMinFrpMw.toFixed(1)} MW</div>
              </div>
              <div className="isogon-diag-metric">
                <div className="isogon-diag-metric-k">VIIRS D_50 FRP</div>
                <div className="isogon-diag-metric-v">{probedSample.viirsMinFrpMw.toFixed(1)} MW</div>
              </div>
            </div>
          </div>

          <div className="isogon-diag-footprint-box" aria-hidden="true">
            <svg width="98" height="64" viewBox="-49 -32 98 64">
              <line x1="-45" y1="0" x2="45" y2="0" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
              <line x1="0" y1="-28" x2="0" y2="28" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
              <ellipse
                cx="0"
                cy="0"
                rx={Math.min(44, probedSample.modisAcrossKm * 8.2)}
                ry={Math.min(25, probedSample.modisAlongKm * 8.2)}
                fill="rgba(224, 122, 95, 0.22)"
                stroke="#E07A5F"
                strokeWidth="1.4"
              />
              <polygon
                points={`0,-${(probedSample.viirsAlongKm * 8.8).toFixed(1)} ${(probedSample.viirsAcrossKm * 8.8).toFixed(1)},0 0,${(probedSample.viirsAlongKm * 8.8).toFixed(1)} -${(probedSample.viirsAcrossKm * 8.8).toFixed(1)},0`}
                fill="rgba(86, 180, 233, 0.48)"
                stroke="#56B4E9"
                strokeWidth="1.2"
              />
            </svg>
            <div className="isogon-diag-footprint-cap">1:1 Ground Scale</div>
          </div>
        </div>

        {/* Chart 1: Pixel Area Growth */}
        <div className="isogon-diag-chart-block">
          <div className="isogon-diag-chart-head">
            <h3 className="isogon-diag-chart-title">1. Ground Pixel Footprint Growth (Scan Angle vs km²)</h3>
            <div className="isogon-diag-legend">
              <span>
                <i className="isogon-diag-swatch" style={{ background: '#E07A5F' }} />
                MODIS 1 km
              </span>
              <span>
                <i className="isogon-diag-swatch" style={{ background: '#56B4E9' }} />
                VIIRS 375 m (3-Zone)
              </span>
            </div>
          </div>
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="isogon-diag-svg"
            onMouseMove={updateAngleFromScanSvg}
            onClick={updateAngleFromScanSvg}
            aria-label="MODIS versus VIIRS ground pixel area in square kilometers across scan angle"
          >
            {[0, 2.5, 5.0, 7.5, 10.0].map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD_L}
                  y1={yArea(tick)}
                  x2={CHART_W - PAD_R}
                  y2={yArea(tick)}
                  stroke="rgba(235, 240, 241, 0.08)"
                  strokeWidth="1"
                />
                <text
                  x={PAD_L - 7}
                  y={yArea(tick) + 3.5}
                  textAnchor="end"
                  fontSize="9.5"
                  fill="rgba(235, 240, 241, 0.56)"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {tick.toFixed(1)}
                </text>
              </g>
            ))}

            {[31.72, 44.86].map((zDeg) => (
              <g key={zDeg}>
                <line
                  x1={xForScan(zDeg)}
                  y1={PAD_T}
                  x2={xForScan(zDeg)}
                  y2={PAD_T + PLOT_H}
                  stroke="rgba(86, 180, 233, 0.34)"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={xForScan(zDeg) + 5}
                  y={PAD_T + 10}
                  textAnchor="start"
                  fontSize="8.5"
                  fill="rgba(235, 240, 241, 0.66)"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {zDeg.toFixed(1)}° agg
                </text>
              </g>
            ))}

            <path d={modisAreaFill} fill="rgba(224, 122, 95, 0.14)" />
            <path d={modisAreaPath} fill="none" stroke="#E07A5F" strokeWidth="2.0" />
            <path d={viirsAreaPath} fill="none" stroke="#56B4E9" strokeWidth="2.0" />

            <line
              x1={probeScanX}
              y1={PAD_T}
              x2={probeScanX}
              y2={PAD_T + PLOT_H}
              stroke="rgba(235, 240, 241, 0.78)"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle cx={probeScanX} cy={yArea(probedSample.modisAreaKm2)} r="3.6" fill="#E07A5F" />
            <circle cx={probeScanX} cy={yArea(probedSample.viirsAreaKm2)} r="3.6" fill="#56B4E9" />

            {[0, 15, 30, 45, 55].map((deg) => (
              <text
                key={deg}
                x={xForScan(deg)}
                y={CHART_H - 8}
                textAnchor="middle"
                fontSize="9.5"
                fill="rgba(235, 240, 241, 0.56)"
                fontFamily="IBM Plex Mono, monospace"
              >
                {deg}°
              </text>
            ))}
            <text
              x={PAD_L + 4}
              y={PAD_T + 10}
              fontSize="9.5"
              fill="rgba(235, 240, 241, 0.56)"
              fontFamily="IBM Plex Mono, monospace"
            >
              km²
            </text>
          </svg>
        </div>

        {/* Chart 2: Minimum Detectable FRP Curves */}
        <div className="isogon-diag-chart-block">
          <div className="isogon-diag-chart-head">
            <h3 className="isogon-diag-chart-title">2. Minimum Detectable Fire Radiative Power D_50 (MW)</h3>
            <div className="isogon-diag-legend">
              <span>
                <i className="isogon-diag-swatch" style={{ background: '#E07A5F' }} />
                MODIS Day D_50
              </span>
              <span>
                <i className="isogon-diag-swatch" style={{ background: '#56B4E9' }} />
                VIIRS Day D_50
              </span>
            </div>
          </div>
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="isogon-diag-svg"
            onMouseMove={updateAngleFromScanSvg}
            onClick={updateAngleFromScanSvg}
            aria-label="Minimum detectable Fire Radiative Power in Megawatts across scan angle"
          >
            {[0, 10, 20, 30, 40].map((mw) => (
              <g key={mw}>
                <line
                  x1={PAD_L}
                  y1={yFrp(mw)}
                  x2={CHART_W - PAD_R}
                  y2={yFrp(mw)}
                  stroke="rgba(235, 240, 241, 0.08)"
                  strokeWidth="1"
                />
                <text
                  x={PAD_L - 7}
                  y={yFrp(mw) + 3.5}
                  textAnchor="end"
                  fontSize="9.5"
                  fill="rgba(235, 240, 241, 0.56)"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {mw}
                </text>
              </g>
            ))}

            <path d={censoredPolygonPath} fill="rgba(224, 122, 95, 0.14)" />
            <text
              x={xForScan(24)}
              y={yFrp(17)}
              textAnchor="middle"
              fontSize="9.5"
              fill="rgba(224, 122, 95, 0.92)"
              fontFamily="IBM Plex Mono, monospace"
            >
              MODIS left-truncated blind zone
            </text>

            <path d={modisFrpPath} fill="none" stroke="#E07A5F" strokeWidth="2.0" />
            <path d={viirsFrpPath} fill="none" stroke="#56B4E9" strokeWidth="2.0" />

            <line
              x1={probeScanX}
              y1={PAD_T}
              x2={probeScanX}
              y2={PAD_T + PLOT_H}
              stroke="rgba(235, 240, 241, 0.78)"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle cx={probeScanX} cy={yFrp(probedSample.modisMinFrpMw)} r="3.6" fill="#E07A5F" />
            <circle cx={probeScanX} cy={yFrp(probedSample.viirsMinFrpMw)} r="3.6" fill="#56B4E9" />

            {[0, 15, 30, 45, 55].map((deg) => (
              <text
                key={deg}
                x={xForScan(deg)}
                y={CHART_H - 8}
                textAnchor="middle"
                fontSize="9.5"
                fill="rgba(235, 240, 241, 0.56)"
                fontFamily="IBM Plex Mono, monospace"
              >
                {deg}°
              </text>
            ))}
            <text
              x={PAD_L + 4}
              y={PAD_T + 10}
              fontSize="9.5"
              fill="rgba(235, 240, 241, 0.56)"
              fontFamily="IBM Plex Mono, monospace"
            >
              MW
            </text>
          </svg>
        </div>

        {/* Chart 3: Paired 13:30 Overpass Residuals */}
        <div className="isogon-diag-chart-block">
          <div className="isogon-diag-chart-head">
            <h3 className="isogon-diag-chart-title">3. Paired 13:30 LST Overpass Residuals (log10 FRP Ratio vs VZA)</h3>
            <div className="isogon-diag-legend">
              <span>
                <i className="isogon-diag-swatch" style={{ background: '#E07A5F' }} />
                Raw Bias
              </span>
              <span>
                <i className="isogon-diag-swatch" style={{ background: '#EBF0F1' }} />
                Harmonized
              </span>
            </div>
          </div>
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="isogon-diag-svg"
            aria-label="Paired 13:30 afternoon overpass residuals before and after sensor harmonization"
          >
            {resTicks.map((rv) => (
              <g key={rv}>
                <line
                  x1={PAD_L}
                  y1={yRes(rv)}
                  x2={CHART_W - PAD_R}
                  y2={yRes(rv)}
                  stroke={rv === 0 ? 'rgba(235, 240, 241, 0.28)' : 'rgba(235, 240, 241, 0.08)'}
                  strokeDasharray={rv === 0 ? '4 3' : undefined}
                  strokeWidth="1"
                />
                <text
                  x={PAD_L - 7}
                  y={yRes(rv) + 3.5}
                  textAnchor="end"
                  fontSize="9.5"
                  fill="rgba(235, 240, 241, 0.56)"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {rv > 0 ? `+${rv.toFixed(2)}` : rv.toFixed(2)}
                </text>
              </g>
            ))}

            {diagnostics.pairedSamples.map((s, idx) => (
              <g key={idx}>
                <circle
                  cx={xForVza(s.angleDeg)}
                  cy={yRes(s.rawLogRatio)}
                  r="1.9"
                  fill="rgba(224, 122, 95, 0.34)"
                />
                <circle
                  cx={xForVza(s.angleDeg)}
                  cy={yRes(s.harmonizedLogRatio)}
                  r="1.9"
                  fill="rgba(86, 180, 233, 0.42)"
                />
              </g>
            ))}

            <path d={ciBandPath} fill="rgba(86, 180, 233, 0.14)" />
            <path
              d={rawResPath}
              fill="none"
              stroke="#E07A5F"
              strokeWidth="2.0"
              strokeDasharray="4 3"
            />
            <path d={harmResPath} fill="none" stroke="#EBF0F1" strokeWidth="2.1" />

            {diagnostics.residuals.map((r) => (
              <g key={r.scanAngleDeg}>
                <circle cx={xForVza(r.scanAngleDeg)} cy={yRes(r.rawResidual)} r="3.0" fill="#E07A5F" />
                <circle cx={xForVza(r.scanAngleDeg)} cy={yRes(r.harmonizedResidual)} r="3.1" fill="#EBF0F1" />
              </g>
            ))}

            {[0, 15, 30, 45, 60].map((deg) => (
              <text
                key={deg}
                x={xForVza(deg)}
                y={CHART_H - 8}
                textAnchor="middle"
                fontSize="9.5"
                fill="rgba(235, 240, 241, 0.56)"
                fontFamily="IBM Plex Mono, monospace"
              >
                {deg}° VZA
              </text>
            ))}
          </svg>

          <div className="isogon-diag-summary-strip">
            <div className="isogon-diag-stat-card">
              <div className="isogon-diag-stat-label">MODIS Edge Expansion</div>
              <div className="isogon-diag-stat-val">
                {diagnostics.summary.edgeAreaRatioModis.toFixed(1)}x nadir area
              </div>
            </div>
            <div className="isogon-diag-stat-card">
              <div className="isogon-diag-stat-label">Paired Overpass RMSE</div>
              <div className="isogon-diag-stat-val">
                {diagnostics.summary.rawRmse.toFixed(3)} to {diagnostics.summary.harmonizedRmse.toFixed(3)} (-{rmseReductionPct}%)
              </div>
            </div>
            <div className="isogon-diag-stat-card">
              <div className="isogon-diag-stat-label">90% Interval Coverage</div>
              <div className="isogon-diag-stat-val">
                {diagnostics.summary.conformalCoveragePct.toFixed(1)}% ({diagnostics.summary.totalPairedPasses} pairs)
              </div>
            </div>
          </div>

          {diagnostics.benchmarkGates.length > 0 && (
            <div className="isogon-diag-gates" aria-label="Scientific benchmark gates">
              {diagnostics.benchmarkGates.map((g) => (
                <div key={g.gateId} className="isogon-diag-gate-row">
                  <span className="isogon-diag-gate-left">
                    <span className="isogon-diag-gate-check" aria-hidden="true">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path
                          d="M1.5 4.2L3.2 5.8L6.5 2.2"
                          stroke="#090D10"
                          strokeWidth="1.4"
                          strokeLinecap="square"
                        />
                      </svg>
                    </span>
                    <span className="isogon-diag-gate-title">{g.title}</span>
                  </span>
                  <span className="isogon-diag-gate-metric">
                    {g.metric} · {g.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="isogon-diag-prov">
          <strong>Provenance &amp; Calibration Basis:</strong> {diagnostics.provenanceNote} Reference:{' '}
          <code>{diagnostics.referenceLabel}</code>.
        </div>
      </aside>
    </div>
  );
}

export default SensorDiagnosticModal;
