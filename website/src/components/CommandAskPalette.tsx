import { useEffect, useMemo, useRef, useState } from 'react';
import type { DynamicRegionRun, PipelineStageRecord } from '../stage/types';

export interface RegionPresetOption {
  id: string;
  shortLabel: string;
  title: string;
  subtitle: string;
  coordsLabel: string;
  centerLat: number;
  centerLon: number;
}

export const GLOBAL_THEATER_PRESETS: readonly RegionPresetOption[] = [
  {
    id: 'plumas_ca',
    shortLabel: 'Feather River, CA',
    title: 'Feather River & Plumas, CA',
    subtitle: 'Sierra mixed conifer canyon · Terra/Aqua + NOAA-20',
    coordsLabel: '40.05°N, 121.18°W',
    centerLat: 40.05,
    centerLon: -121.18,
  },
  {
    id: 'lytton_bc',
    shortLabel: 'Lytton Canyon, BC',
    title: 'Lytton & Thompson Canyon, BC',
    subtitle: 'Steep Fraser-Thompson gorge · high-zenith bow-tie regime',
    coordsLabel: '50.23°N, 121.58°W',
    centerLat: 50.23,
    centerLon: -121.58,
  },
  {
    id: 'novo_progresso_br',
    shortLabel: 'Serra do Cachimbo, BR',
    title: 'Serra do Cachimbo, Amazonia',
    subtitle: 'Tropical frontier · sub-pixel 375 m VIIRS regime',
    coordsLabel: '7.15°S, 55.35°W',
    centerLat: -7.15,
    centerLon: -55.35,
  },
  {
    id: 'evia_greece',
    shortLabel: 'Northern Evia, GR',
    title: 'Northern Evia Island, Greece',
    subtitle: 'Coastal Mediterranean relief · marine cloud masking',
    coordsLabel: '38.88°N, 23.32°E',
    centerLat: 38.88,
    centerLon: 23.32,
  },
  {
    id: 'blue_mountains_au',
    shortLabel: 'Blue Mountains, AU',
    title: 'Grose Valley & Blue Mountains, NSW',
    subtitle: 'Sandstone escarpment · crown-fire slope advection',
    coordsLabel: '33.62°S, 150.38°E',
    centerLat: -33.62,
    centerLon: 150.38,
  },
];

const DEFAULT_PIPELINE_STAGES: readonly PipelineStageRecord[] = [
  {
    stage_id: 'terrain_ingest',
    label: 'AWS Terrarium DEM + Sentinel-2 imagery',
    model_name: 'Mercator-WGS84 tile stitcher',
    duration_ms: 0,
    status: 'pending',
    detail: '256x256 DEM + slope normals',
  },
  {
    stage_id: 'sensor_operator',
    label: 'Orbital scan PSF & slope foreshortening',
    model_name: 'MODIS 1 km bow-tie + VIIRS 375 m',
    duration_ms: 0,
    status: 'pending',
    detail: '24 sun-synchronous passes',
  },
  {
    stage_id: 'hurdle_quantile',
    label: 'Cross-sensor hurdle-quantile calibrator',
    model_name: 'Paired 13:30 LST logistic + pinball IRLS',
    duration_ms: 0,
    status: 'pending',
    detail: 'Omission prob + flux quantiles',
  },
  {
    stage_id: 'kalman_smoother',
    label: 'Terrain-coupled advection-diffusion smoother',
    model_name: '2D+t forward-backward state solver',
    duration_ms: 0,
    status: 'pending',
    detail: 'Posterior Z_hat(s,t) + sigma(s,t)',
  },
  {
    stage_id: 'conformal_gate',
    label: 'Split conformal 90% interval calibration',
    model_name: 'Finite-sample conformal wrapper',
    duration_ms: 0,
    status: 'pending',
    detail: 'Empirical 90% coverage check',
  },
];

export interface ReconstructRequestParams {
  regionId?: string;
  queryText?: string;
  holdoutViirs: boolean;
  cloudOverride: number | null;
}

interface CommandAskPaletteProps {
  open: boolean;
  onClose: () => void;
  activeRun: DynamicRegionRun | null;
  holdoutViirs: boolean;
  onToggleHoldoutViirs: () => void;
  cloudOverride: number | null;
  onToggleCloudOverride: () => void;
  isExecuting: boolean;
  errorMessage: string | null;
  onExecute: (params: ReconstructRequestParams) => Promise<boolean>;
}

export function CommandAskPalette({
  open,
  onClose,
  activeRun,
  holdoutViirs,
  onToggleHoldoutViirs,
  cloudOverride,
  onToggleCloudOverride,
  isExecuting,
  errorMessage,
  onExecute,
}: CommandAskPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [runningStepIdx, setRunningStepIdx] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filteredPresets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GLOBAL_THEATER_PRESETS;
    return GLOBAL_THEATER_PRESETS.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q) ||
        p.coordsLabel.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!isExecuting) {
      setRunningStepIdx(-1);
      return;
    }
    setRunningStepIdx(0);
    const timer = window.setInterval(() => {
      setRunningStepIdx((prev) => (prev < 4 ? prev + 1 : 4));
    }, 110);
    return () => window.clearInterval(timer);
  }, [isExecuting]);

  if (!open) return null;

  const stagesToDisplay: readonly PipelineStageRecord[] = isExecuting
    ? DEFAULT_PIPELINE_STAGES.map((st, idx) => ({
        ...st,
        status: idx < runningStepIdx ? 'completed' : idx === runningStepIdx ? 'running' : 'pending',
      }))
    : activeRun?.pipeline_stages?.length
      ? activeRun.pipeline_stages
      : DEFAULT_PIPELINE_STAGES.map((st) => ({ ...st, status: 'completed', duration_ms: 28.4 }));

  const totalMs = stagesToDisplay.reduce((acc, s) => acc + (s.duration_ms || 0), 0);

  const triggerRun = async (preset?: RegionPresetOption) => {
    if (isExecuting) return;
    const trimmed = query.trim();
    const chosen =
      preset ?? (filteredPresets.length > 0 && !trimmed ? filteredPresets[activeIndex] : undefined);
    const ok = await onExecute({
      regionId: chosen?.id,
      queryText: chosen ? undefined : trimmed || GLOBAL_THEATER_PRESETS[activeIndex]?.title,
      holdoutViirs,
      cloudOverride,
    });
    if (ok) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredPresets.length > 0) {
        setActiveIndex((prev) => (prev + 1) % filteredPresets.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredPresets.length > 0) {
        setActiveIndex((prev) => (prev - 1 + filteredPresets.length) % filteredPresets.length);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const targetPreset = filteredPresets[activeIndex];
      const looksLikeCustomCoords = /-?\d+(\.\d+)?\s*[, ]\s*-?\d+/.test(query.trim());
      void triggerRun(looksLikeCustomCoords ? undefined : targetPreset);
    }
  };

  return (
    <>
      <div className="eq-ask-backdrop" onClick={onClose} role="presentation" />
      <div
        className="eq-ask-bar"
        role="dialog"
        aria-modal="true"
        aria-label="Search coordinates or select wildfire theater"
        onKeyDown={handleKeyDown}
      >
        <div className="eq-ask-bar__field">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search coordinates (50.23, -121.58) or choose a wildfire theater..."
            className="eq-ask-bar__input"
            aria-label="Coordinates or wildfire theater"
          />
        </div>

        <div className="eq-ask-bar__options">
          <span>Counterfactual setup</span>
          <div className="eq-ask-bar__toggles">
            <button
              type="button"
              className="eq-check-btn"
              data-active={holdoutViirs ? 'true' : 'false'}
              onClick={onToggleHoldoutViirs}
            >
              <span
                className={`eq-request-card__check${holdoutViirs ? ' eq-request-card__check--done' : ''}`}
                aria-hidden="true"
              />
              <span>Hold out VIIRS (pre-2012 test)</span>
            </button>

            <button
              type="button"
              className="eq-check-btn"
              data-active={cloudOverride !== null ? 'true' : 'false'}
              onClick={onToggleCloudOverride}
            >
              <span
                className={`eq-request-card__check${cloudOverride !== null ? ' eq-request-card__check--done' : ''}`}
                aria-hidden="true"
              />
              <span>55% cloud cover</span>
            </button>
          </div>
        </div>

        <ul className="eq-ask-bar__list" role="listbox" aria-label="Global wildfire theaters">
          {filteredPresets.length > 0 ? (
            filteredPresets.map((item, idx) => {
              const isSelected = idx === activeIndex;
              const isCurrentRegion = activeRun?.region.id === item.id;
              return (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={isSelected}
                  className={`eq-ask-bar__item${isSelected ? ' eq-ask-bar__item--active' : ''}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => void triggerRun(item)}
                >
                  <span className="eq-ask-bar__num">{String(idx + 1).padStart(2, '0')}</span>
                  <div className="eq-ask-bar__item-main">
                    <span className="eq-ask-bar__item-title">
                      {item.title}
                      {isCurrentRegion ? ' · Current' : ''}
                    </span>
                    <span className="eq-ask-bar__item-sub">{item.subtitle}</span>
                  </div>
                  <span className="eq-ask-bar__item-coords">{item.coordsLabel}</span>
                </li>
              );
            })
          ) : (
            <li
              role="option"
              aria-selected={true}
              className="eq-ask-bar__item eq-ask-bar__item--active"
              onClick={() => void triggerRun(undefined)}
            >
              <span className="eq-ask-bar__num">01</span>
              <div className="eq-ask-bar__item-main">
                <span className="eq-ask-bar__item-title">
                  Reconstruct custom location: &ldquo;{query.trim()}&rdquo;
                </span>
                <span className="eq-ask-bar__item-sub">
                  Fetch AWS Terrarium DEM + Sentinel-2 tiles and run 3-stage solver
                </span>
              </div>
              <span className="eq-ask-bar__item-coords">Live API</span>
            </li>
          )}
        </ul>

        <div className="eq-ask-bar__stages">
          <div className="eq-ask-bar__stage-head">
            <span>
              {isExecuting
                ? 'Running 3-stage physical + ML solver...'
                : errorMessage
                  ? `Backend note: ${errorMessage}`
                  : '3-stage world-model pipeline'}
            </span>
            <span>{isExecuting ? 'Running' : `${Math.round(totalMs)} ms`}</span>
          </div>
          {stagesToDisplay.map((st) => (
            <div key={st.stage_id} className="eq-ask-bar__stage-row">
              <span
                className={`eq-request-card__check${st.status === 'completed' ? ' eq-request-card__check--done' : ''}`}
                aria-hidden="true"
              />
              <span>{st.label}</span>
              <span className="eq-ask-bar__stage-ms">
                {st.status === 'running'
                  ? '...'
                  : st.duration_ms > 0
                    ? `${st.duration_ms.toFixed(1)} ms`
                    : 'ready'}
              </span>
            </div>
          ))}
        </div>

        <div className="eq-ask-bar__actions">
          <span className="eq-ask-bar__action eq-ask-bar__action--lead">
            <span className="eq-ask-bar__key">&uarr;&darr;</span>
            <span>Choose theater or type lat, lon</span>
          </span>

          <span className="eq-ask-bar__action">
            <button
              type="button"
              className="eq-ask-bar__button"
              disabled={isExecuting}
              onClick={() => {
                const targetPreset = filteredPresets[activeIndex];
                const looksLikeCustomCoords = /-?\d+(\.\d+)?\s*[, ]\s*-?\d+/.test(query.trim());
                void triggerRun(looksLikeCustomCoords ? undefined : targetPreset);
              }}
            >
              {isExecuting ? 'Reconstructing...' : 'Run model'}
            </button>
            <span className="eq-ask-bar__key">&crarr;</span>
          </span>

          <span className="eq-ask-bar__action">
            <button type="button" className="eq-ask-bar__button" onClick={onClose}>
              Close
            </button>
            <span className="eq-ask-bar__key">Esc</span>
          </span>
        </div>
      </div>
    </>
  );
}
