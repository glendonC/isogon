import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CommandAskPalette,
  type ReconstructRequestParams,
} from './components/CommandAskPalette';
import { MethodSheet, type DocTabId } from './components/MethodSheet';
import { StageTimelineTrack } from './components/StageTimelineTrack';
import { EarthCutawayStage } from './stage/EarthCutawayStage';
import {
  THEATER_CATALOG,
  type EarthStageTelemetry,
  type InspectorCameraPreset,
  type OrbitalSlewRequest,
  type RecordEraJumpId,
  type TheaterId,
} from './stage/earthCutawayTypes';
import { SensorDiagnosticModal } from './stage/SensorDiagnosticModal';
import type {
  DynamicRegionRun,
  ObserverFilter,
  TerrainFindingCallout,
  WorkspaceMode,
} from './stage/types';

const API_BASE = 'http://127.0.0.1:8788';

const SHORT_THEATER_CODES: Record<TheaterId, string> = {
  plumas_ca: '01 CA',
  lytton_bc: '02 BC',
  evia_greece: '03 GR',
  blue_mountains_au: '04 AU',
};

const STAGE_WINDOW_REGION_LABELS: Record<TheaterId, string> = {
  plumas_ca: 'SIERRA NEVADA, CA',
  lytton_bc: 'FRASER CANYON, BC',
  evia_greece: 'AEGEAN COAST, GR',
  blue_mountains_au: 'BLUE MOUNTAINS, AU',
};

const DEFAULT_ELEV_SPANS: Record<TheaterId, string> = {
  plumas_ca: '313-2,357 m',
  lytton_bc: '195-2,860 m',
  evia_greece: '0-1,385 m',
  blue_mountains_au: '65-1,215 m',
};

function IsogonMark() {
  return (
    <svg
      className="iso-logo__mark"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M8.2 2.5h7.6l5.7 5.7v2.55L10.75 21.5H8.2L2.5 15.8V8.2L8.2 2.5Zm7.6 19 5.7-5.7v-2.15L13.65 21.5h2.15Z"
      />
      <rect
        x="17.3"
        y="3.9"
        width="3.2"
        height="3.2"
        rx="0.4"
        transform="rotate(45 18.9 5.5)"
        fill="currentColor"
        fillOpacity="0.76"
      />
    </svg>
  );
}

function ArrowRightGlyph({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M2.75 8H13.25M13.25 8L8.75 3.5M13.25 8L8.75 12.5"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="square"
      />
    </svg>
  );
}

interface VernierScrubberProps {
  label: string;
  valueText: string;
  fraction: number;
  onChangeFraction: (u: number) => void;
  onResetAuto?: () => void;
}

const VERNIER_TICKS = Array.from({ length: 17 }, (_, idx) => idx);

function VernierScrubber({
  label,
  valueText,
  fraction,
  onChangeFraction,
  onResetAuto,
}: VernierScrubberProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const clamped = Math.min(1, Math.max(0, fraction));

  const updateAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    onChangeFraction(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)));
  };

  return (
    <div className="iso-vernier">
      <div className="iso-vernier__head">
        <span>{label}</span>
        {onResetAuto ? (
          <button
            type="button"
            className="iso-vernier__val iso-vernier__val--interactive"
            onClick={onResetAuto}
            title="Click to resume automatic sweep"
          >
            {valueText}
          </button>
        ) : (
          <span className="iso-vernier__val">{valueText}</span>
        )}
      </div>
      <div
        ref={trackRef}
        className="iso-vernier__hit"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
        onDoubleClick={onResetAuto}
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateAt(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          updateAt(e.clientX);
        }}
        onPointerUp={(e) => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onPointerCancel={(e) => {
          draggingRef.current = false;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            onChangeFraction(Math.min(1, clamped + 0.05));
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            onChangeFraction(Math.max(0, clamped - 0.05));
          }
        }}
      >
        <div className="iso-vernier__rail">
          <div className="iso-vernier__fill" style={{ width: `${clamped * 100}%` }} />
          {VERNIER_TICKS.map((idx) => (
            <span
              key={idx}
              className={`iso-vernier__tick${idx % 4 === 0 ? ' iso-vernier__tick--major' : ''}`}
              style={{ left: `${(idx / 16) * 100}%` }}
            />
          ))}
        </div>
        <div className="iso-vernier__needle" style={{ left: `${clamped * 100}%` }} />
      </div>
    </div>
  );
}

interface LiveObserverTelemetry {
  sensor: string;
  retainedFootprints: number;
  poolFootprints: number;
  meanAreaKm2: number;
  observableFluxPct: number;
  reconstructedMw: number;
}

function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

function isKnownTheaterId(value: string | undefined): value is TheaterId {
  return THEATER_CATALOG.some((t) => t.id === value);
}

export function App() {
  const [inWorkspace, setInWorkspace] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('cutaway');
  const [activeTheaterId, setActiveTheaterId] = useState<TheaterId>('plumas_ca');
  const [timeProgress, setTimeProgress] = useState<number>(12);
  const [playing, setPlaying] = useState<boolean>(false);
  const [observerFilter, setObserverFilter] = useState<ObserverFilter>('all');
  const [showUncertainty, setShowUncertainty] = useState<boolean>(true);
  const [sensitivityThreshold, setSensitivityThreshold] = useState<number>(0.22);
  const [cutawaySplit, setCutawaySplit] = useState<number | null>(null);
  const [cameraPreset, setCameraPreset] = useState<InspectorCameraPreset>('overview');
  const [cinemaActive, setCinemaActive] = useState<boolean>(false);
  const [cleanHud, setCleanHud] = useState<boolean>(false);
  const [activeEra, setActiveEra] = useState<RecordEraJumpId>('2026_fused');

  const slewNonceRef = useRef<number>(0);
  const [slewRequest, setSlewRequest] = useState<OrbitalSlewRequest | null>(null);
  const [stageTelemetry, setStageTelemetry] = useState<EarthStageTelemetry | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<TerrainFindingCallout | null>(null);

  const [activeRun, setActiveRun] = useState<DynamicRegionRun | null>(null);
  const [holdoutViirs, setHoldoutViirs] = useState<boolean>(false);
  const [cloudOverride, setCloudOverride] = useState<number | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [execError, setExecError] = useState<string | null>(null);

  const [askOpen, setAskOpen] = useState(false);
  const [sensorModalOpen, setSensorModalOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [docTab] = useState<DocTabId>('architecture');
  const [liveTelemetry, setLiveTelemetry] = useState<LiveObserverTelemetry | null>(null);

  const enterWorkspace = useCallback((initialMode: WorkspaceMode = 'cutaway') => {
    setDocOpen(false);
    setCleanHud(false);
    setInWorkspace(true);
    setWorkspaceMode(initialMode);
    if (initialMode === 'reconstruction') {
      setPlaying(true);
    }
  }, []);

  const exitToOverview = useCallback(() => {
    setPlaying(false);
    setCinemaActive(false);
    setCleanHud(false);
    setSensorModalOpen(false);
    setCutawaySplit(null);
    setSelectedFinding(null);
    setInWorkspace(false);
  }, []);

  const selectWorkspaceMode = useCallback((nextMode: WorkspaceMode) => {
    setWorkspaceMode(nextMode);
    if (nextMode !== 'cutaway') {
      setCutawaySplit(null);
    }
  }, []);

  const executeWorldModel = useCallback(
    async (params: ReconstructRequestParams): Promise<boolean> => {
      setIsExecuting(true);
      setExecError(null);

      if (params.theaterId) {
        setActiveTheaterId(params.theaterId);
        slewNonceRef.current += 1;
        setSlewRequest({
          nonce: slewNonceRef.current,
          targetTheaterId: params.theaterId,
        });
      } else if (isKnownTheaterId(params.regionId)) {
        setActiveTheaterId(params.regionId);
      }

      try {
        const body: Record<string, unknown> = {
          holdout_viirs: params.holdoutViirs,
          cloud_override: params.cloudOverride,
        };
        if (params.regionId) {
          body.region_id = params.regionId;
        }
        if (params.queryText) {
          body.query_text = params.queryText;
        }
        const resp = await fetch(`${API_BASE}/api/reconstruct`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const errJson = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
          throw new Error(
            typeof errJson?.error === 'string' ? errJson.error : `HTTP ${resp.status}`,
          );
        }
        const runData = (await resp.json()) as DynamicRegionRun;
        setActiveRun(runData);
        setSelectedFinding(null);
        setCameraPreset('overview');
        const nextHoldout = Boolean(runData.metrics?.holdout_viirs);
        setHoldoutViirs(nextHoldout);
        setActiveEra((prev) =>
          nextHoldout ? '2006_modis' : prev === '2006_modis' ? '2026_fused' : prev,
        );
        setCloudOverride(runData.metrics?.cloud_override ?? null);
        if (isKnownTheaterId(runData.region?.id)) {
          setActiveTheaterId(runData.region.id);
        } else if (params.queryText) {
          slewNonceRef.current += 1;
          setSlewRequest({
            nonce: slewNonceRef.current,
            targetTheaterId: activeTheaterId,
            eraLabel: runData.region.name.toUpperCase(),
          });
        }
        if (params.enterWorkspace && !inWorkspace) {
          setInWorkspace(true);
          setWorkspaceMode('cutaway');
        }
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Backend unreachable';
        setExecError(msg);
        if (params.enterWorkspace && !inWorkspace) {
          setInWorkspace(true);
          setWorkspaceMode('cutaway');
        }
        return false;
      } finally {
        setIsExecuting(false);
      }
    },
    [inWorkspace, activeTheaterId],
  );

  // Hydrate initial Feather River Canyon, CA run quietly in background
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/reconstruct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region_id: 'plumas_ca', holdout_viirs: false, cloud_override: null }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: DynamicRegionRun | null) => {
        if (!cancelled && data && data.run_id) {
          setActiveRun(data);
        }
      })
      .catch(() => {
        // Static assets serve Feather River Canyon, CA seamlessly if backend warms up later
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const slewToTheater = useCallback(
    (targetId: TheaterId, eraLabel?: string) => {
      setActiveTheaterId(targetId);
      slewNonceRef.current += 1;
      setSlewRequest({
        nonce: slewNonceRef.current,
        targetTheaterId: targetId,
        eraLabel,
      });
      void executeWorldModel({
        regionId: targetId,
        holdoutViirs,
        cloudOverride,
        enterWorkspace: false,
      });
    },
    [holdoutViirs, cloudOverride, executeWorldModel],
  );

  const cycleNextTheaterSlew = useCallback(() => {
    const idx = THEATER_CATALOG.findIndex((t) => t.id === activeTheaterId);
    const nextTheater = THEATER_CATALOG[(idx + 1) % THEATER_CATALOG.length];
    slewToTheater(nextTheater.id);
  }, [activeTheaterId, slewToTheater]);

  const handleCinemaStepTheater = useCallback(
    (nextTheaterId: TheaterId) => {
      setActiveTheaterId(nextTheaterId);
      if (activeRun?.region.id !== nextTheaterId) {
        void executeWorldModel({
          regionId: nextTheaterId,
          holdoutViirs,
          cloudOverride,
          enterWorkspace: false,
        });
      }
    },
    [activeRun?.region.id, holdoutViirs, cloudOverride, executeWorldModel],
  );

  const toggleHoldoutLive = useCallback(() => {
    const nextHoldout = !holdoutViirs;
    setHoldoutViirs(nextHoldout);
    setActiveEra(nextHoldout ? '2006_modis' : '2026_fused');
    void executeWorldModel({
      regionId: activeRun?.region.id ?? activeTheaterId,
      holdoutViirs: nextHoldout,
      cloudOverride,
      enterWorkspace: false,
    });
  }, [holdoutViirs, activeRun?.region.id, activeTheaterId, cloudOverride, executeWorldModel]);

  const toggleCloudLive = useCallback(() => {
    const nextCloud = cloudOverride === null ? 0.55 : null;
    setCloudOverride(nextCloud);
    if (!askOpen) {
      void executeWorldModel({
        regionId: activeRun?.region.id ?? activeTheaterId,
        holdoutViirs,
        cloudOverride: nextCloud,
        enterWorkspace: false,
      });
    }
  }, [cloudOverride, askOpen, activeRun?.region.id, activeTheaterId, holdoutViirs, executeWorldModel]);

  const handleJumpEra = useCallback(
    (era: RecordEraJumpId) => {
      setActiveEra(era);
      const nextHoldout = era === '2006_modis';
      const eraLabel =
        era === '2006_modis'
          ? '2000-2011 MODIS ONLY (BLIND TEST)'
          : era === '2012_snpp'
            ? '2012 S-NPP LAUNCH · 1.03X CONTINUITY'
            : '2026 FUSED 375 M RECORD';
      const targetEpoch = era === '2006_modis' ? 6 : era === '2012_snpp' ? 12 : 18;

      setPlaying(false);
      setTimeProgress(targetEpoch);
      setHoldoutViirs(nextHoldout);
      slewNonceRef.current += 1;
      setSlewRequest({
        nonce: slewNonceRef.current,
        targetTheaterId: activeTheaterId,
        eraLabel,
      });

      void executeWorldModel({
        regionId: activeRun?.region.id ?? activeTheaterId,
        holdoutViirs: nextHoldout,
        cloudOverride,
        enterWorkspace: false,
      });
    },
    [activeTheaterId, activeRun?.region.id, cloudOverride, executeWorldModel],
  );

  // Continuous 60fps time evolution when playback is active
  useEffect(() => {
    if (!inWorkspace || !playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      raf = window.requestAnimationFrame(step);
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      setTimeProgress((prev) => {
        const next = prev + dt * 1.25;
        return next > 23 ? 0 : next;
      });
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [inWorkspace, playing]);

  // Query live Python backend (:8788) for real-time forward sensor diagnostics
  const activeEpoch = Math.min(23, Math.max(0, Math.round(timeProgress)));
  useEffect(() => {
    if (!inWorkspace) return;
    const controller = new AbortController();
    const minFrp = Math.round(sensitivityThreshold * 38 * 10) / 10;
    const runParam = activeRun?.run_id ? `&run_id=${encodeURIComponent(activeRun.run_id)}` : '';
    const url = `${API_BASE}/api/observer?frame=${activeEpoch}&sensor=${observerFilter}&min_frp=${minFrp}${runParam}`;
    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Record<string, unknown> | null) => {
        if (!d) return;
        const diag = d.sensitivity_diagnostics as Record<string, unknown> | undefined;
        if (!diag) return;
        setLiveTelemetry({
          sensor:
            typeof d.sensor === 'string'
              ? d.sensor.replace('_', ' ')
              : observerFilter.toUpperCase(),
          retainedFootprints:
            typeof diag.retained_footprints === 'number' ? diag.retained_footprints : 0,
          poolFootprints:
            typeof diag.sensor_pool_footprints === 'number' ? diag.sensor_pool_footprints : 0,
          meanAreaKm2:
            typeof diag.mean_footprint_area_km2 === 'number' ? diag.mean_footprint_area_km2 : 0,
          observableFluxPct:
            typeof diag.observable_flux_fraction === 'number'
              ? Math.round(diag.observable_flux_fraction * 100)
              : 0,
          reconstructedMw:
            typeof diag.reconstructed_field_total_frp_mw === 'number'
              ? diag.reconstructed_field_total_frp_mw
              : 0,
        });
      })
      .catch(() => {
        // Offline telemetry fallback handled via activeRun.epoch_summaries
      });
    return () => controller.abort();
  }, [inWorkspace, activeEpoch, observerFilter, sensitivityThreshold, activeRun?.run_id]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAskOpen((prev) => !prev);
        return;
      }

      if (inInput) return;

      if (e.key === '/') {
        e.preventDefault();
        setAskOpen((prev) => !prev);
        return;
      }

      if (askOpen || sensorModalOpen || docOpen) return;

      if (e.key.toLowerCase() === 'v' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleHoldoutLive();
        return;
      }

      if (e.key.toLowerCase() === 'm' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setSensorModalOpen(true);
        return;
      }

      if (!inWorkspace && e.key === 'Enter') {
        e.preventDefault();
        enterWorkspace('cutaway');
        return;
      }

      if (inWorkspace) {
        const lower = e.key.toLowerCase();
        if (e.key === 'Escape') {
          e.preventDefault();
          if (cinemaActive) {
            setCinemaActive(false);
          } else if (cleanHud) {
            setCleanHud(false);
          } else {
            exitToOverview();
          }
        } else if (e.key === ' ') {
          e.preventDefault();
          setPlaying((p) => !p);
        } else if (lower === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          setCinemaActive((c) => !c);
        } else if (lower === 'h' && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          setCleanHud((h) => !h);
        } else if (lower === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          cycleNextTheaterSlew();
        } else if (lower === 'u' && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          setShowUncertainty((u) => !u);
        } else if (e.key === '1') {
          selectWorkspaceMode('cutaway');
        } else if (e.key === '2') {
          selectWorkspaceMode('reconstruction');
        } else if (e.key === '3') {
          selectWorkspaceMode('observer');
        } else if (e.key === '4') {
          selectWorkspaceMode('world');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    askOpen,
    sensorModalOpen,
    docOpen,
    inWorkspace,
    cinemaActive,
    cleanHud,
    enterWorkspace,
    exitToOverview,
    selectWorkspaceMode,
    toggleHoldoutLive,
    cycleNextTheaterSlew,
  ]);

  const activeTheaterMeta = useMemo(
    () => THEATER_CATALOG.find((t) => t.id === activeTheaterId) ?? THEATER_CATALOG[0],
    [activeTheaterId],
  );

  const isCustomRegion = Boolean(activeRun && !isKnownTheaterId(activeRun.region.id));

  const topCoordBarLabel =
    isCustomRegion && activeRun
      ? `XY · ${activeRun.region.name.toUpperCase()} · ${formatLatLon(activeRun.region.center_lat, activeRun.region.center_lon)}`
      : `${activeTheaterMeta.indexCode} · ${activeTheaterMeta.title.toUpperCase()} · ${activeTheaterMeta.coordsLabel}`;

  const stageBottomLeftRegion =
    isCustomRegion && activeRun
      ? activeRun.region.name.toUpperCase()
      : STAGE_WINDOW_REGION_LABELS[activeTheaterId];

  const regionTitle = isCustomRegion && activeRun ? activeRun.region.name : activeTheaterMeta.title;
  const regionCoords =
    isCustomRegion && activeRun
      ? formatLatLon(activeRun.region.center_lat, activeRun.region.center_lon)
      : activeRun && activeRun.region.id === activeTheaterId
        ? formatLatLon(activeRun.region.center_lat, activeRun.region.center_lon)
        : activeTheaterMeta.coordsLabel;

  const elevRangeText =
    activeRun &&
    (isCustomRegion || activeRun.region.id === activeTheaterId) &&
    Number.isFinite(activeRun.region.min_elev_m) &&
    Number.isFinite(activeRun.region.max_elev_m)
      ? `${Math.round(activeRun.region.min_elev_m).toLocaleString()}-${Math.round(activeRun.region.max_elev_m).toLocaleString()} m`
      : DEFAULT_ELEV_SPANS[activeTheaterId];

  const epochSummary = activeRun?.epoch_summaries?.[activeEpoch];
  const currentMw = Math.round(
    epochSummary?.reconstructed_total_mw ??
      liveTelemetry?.reconstructedMw ??
      1140 + activeEpoch * 28,
  );
  const metrics = activeRun?.metrics;
  const rmseReductionPct = metrics ? Math.round(metrics.rmse_reduction_pct) : 18;
  const reconRmseText = metrics ? metrics.reconstructed_rmse_mw_km2.toFixed(2) : '4.85';
  const coverageText = metrics ? metrics.empirical_90_coverage_pct.toFixed(1) : '90.6';
  const stepHarmText = metrics ? metrics.step_2012_harmonized_ratio.toFixed(2) : '1.03';
  const stepRawText = metrics ? metrics.step_2012_raw_ratio.toFixed(2) : '3.81';

  const totalPipelineMs = Math.round(
    (activeRun?.pipeline_stages ?? []).reduce((acc, s) => acc + (s.duration_ms || 0), 0) || 142,
  );

  const rawGeoJsonUrl =
    activeRun?.assets.export_geojson_url ?? `${API_BASE}/api/runs/default/export.geojson`;
  const exportGeoJsonUrl = rawGeoJsonUrl.startsWith('http')
    ? rawGeoJsonUrl
    : `${API_BASE}${rawGeoJsonUrl}`;

  const rawCsvUrl =
    activeRun?.assets.export_csv_url ?? `${API_BASE}/api/runs/default/export.csv`;
  const exportCsvUrl = rawCsvUrl.startsWith('http') ? rawCsvUrl : `${API_BASE}${rawCsvUrl}`;

  const stageFps = stageTelemetry?.fps ? Math.round(stageTelemetry.fps) : 60;
  const orthoShort = stageTelemetry?.orthoResolution || 'Maxar 2K';
  const demShort = stageTelemetry?.demResolution || '512²';

  const effectiveMode: WorkspaceMode = inWorkspace ? workspaceMode : 'cutaway';

  return (
    <div className="iso-app" data-workspace={inWorkspace ? 'true' : 'false'}>
      {/* Persistent 60fps GPU clip-path stage container (never resizes WebGL canvas) */}
      <div className="iso-stage-clip" data-workspace={inWorkspace ? 'true' : 'false'}>
        <EarthCutawayStage
          apiBase={API_BASE}
          inWorkspace={inWorkspace}
          mode={effectiveMode}
          activeTheaterId={activeTheaterId}
          activeRun={activeRun}
          timeProgress={timeProgress / 23}
          observerFilter={observerFilter}
          showUncertainty={showUncertainty}
          holdoutViirs={holdoutViirs}
          sensitivityThreshold={sensitivityThreshold}
          cutawaySplit={cutawaySplit}
          cameraPreset={cameraPreset}
          cinemaActive={cinemaActive}
          cleanHud={cleanHud}
          slewRequest={slewRequest}
          selectedFindingId={selectedFinding?.id ?? null}
          onSelectFinding={setSelectedFinding}
          onEnterWorkspace={() => enterWorkspace('cutaway')}
          onCinemaStepTheater={handleCinemaStepTheater}
          onTelemetry={setStageTelemetry}
        />
      </div>

      {/* Daylight Mineral Studio Sheet (!inWorkspace) */}
      {!inWorkspace && (
        <div className="iso-landing-shell">
          {/* Top Architectural Bar (height: 58px) */}
          <header className="iso-land-topbar">
            <div className="iso-land-topbar__left">
              <button
                type="button"
                className="iso-brand"
                onClick={() => enterWorkspace('cutaway')}
                aria-label="Isogon home"
              >
                <IsogonMark />
                <span>Isogon</span>
              </button>

              <span className="iso-vrule" aria-hidden="true" />

              <button
                type="button"
                className="iso-coord-trigger"
                onClick={() => setAskOpen(true)}
                title="Search any coordinate or select calibrated region (/)"
              >
                <span>{topCoordBarLabel}</span>
                <span className="iso-coord-trigger__key">[/]</span>
              </button>
            </div>

            <nav className="iso-joined-cells" aria-label="Search coordinates and scientific reference">
              <button
                type="button"
                className="iso-cell-btn"
                onClick={() => setAskOpen(true)}
              >
                <span>Search Coordinate</span>
                <span className="iso-cell-btn__key">· /</span>
              </button>
              <button
                type="button"
                className="iso-cell-btn"
                onClick={() => setSensorModalOpen(true)}
              >
                Sensor Physics
              </button>
              <button
                type="button"
                className="iso-cell-btn"
                onClick={() => setDocOpen(true)}
              >
                Methodology
              </button>
            </nav>
          </header>

          {/* Asymmetric 12-Column Hero Band */}
          <section className="iso-hero-band" aria-label="Calibrated Global Fire Record">
            <div className="iso-hero-band__left">
              <p className="iso-eyebrow">
                NASA SPACE APPS 2026 · MODIS 1,000 M + VIIRS 375 M HARMONIZATION
              </p>
              <h1 className="iso-hero-h1">
                <span className="iso-hero-h1__primary">One Calibrated</span>
                <span className="iso-hero-h1__secondary">Fire Record.</span>
              </h1>
            </div>

            <div className="iso-hero-band__right">
              <p className="iso-hero-subcopy">
                NASA&apos;s 1 km MODIS and 375 m VIIRS satellites see the same mountain wildfire
                differently. Isogon reconciles 26 years of orbital passes into one terrain-aware
                375-meter record.
              </p>

              <div className="iso-hero-cta-row">
                <button
                  type="button"
                  className="iso-coupled-cta"
                  onClick={() => enterWorkspace('cutaway')}
                >
                  <span className="iso-coupled-cta__cell-label">
                    <span className="iso-slot-roll">
                      <span className="iso-slot-roll__primary">Enter 3D Terrain</span>
                      <span className="iso-slot-roll__clone" aria-hidden="true">
                        Enter 3D Terrain
                      </span>
                    </span>
                  </span>
                  <span className="iso-coupled-cta__cell-icon" aria-hidden="true">
                    <ArrowRightGlyph className="iso-arrow-svg iso-arrow-svg--lead" />
                    <ArrowRightGlyph className="iso-arrow-svg iso-arrow-svg--trail" />
                  </span>
                </button>

                <button
                  type="button"
                  className="iso-secondary-cell"
                  onClick={() => setAskOpen(true)}
                >
                  <span>Search Any Coordinate</span>
                  <span className="iso-secondary-cell__key">· /</span>
                </button>
              </div>
            </div>
          </section>

          {/* Unobstructed Framed 3D Stage Window Chrome (pointer-events: none) */}
          <div className="iso-stage-window-chrome" aria-hidden="true">
            <div className="iso-stage-window-chrome__top">
              <span className="iso-stage-window-chrome__tag">
                LEFT OF CURTAIN · RAW MODIS (1 KM SMEARED PIXELS)
              </span>
              <span className="iso-stage-window-chrome__tag iso-stage-window-chrome__tag--right">
                RIGHT OF CURTAIN · HARMONIZED 375 M FIRE FRONT + 90% CI
              </span>
            </div>

            <div className="iso-stage-window-chrome__bottom">
              <span className="iso-stage-window-chrome__tag iso-stage-window-chrome__tag--subtle">
                REAL 30 M DEM + MAXAR 2K SATELLITE · {stageBottomLeftRegion}
              </span>
              <span className="iso-stage-window-chrome__tag iso-stage-window-chrome__tag--right iso-stage-window-chrome__tag--subtle">
                MOVE CURSOR TO SWEEP SENSOR CURTAIN · DRAG TO ORBIT
              </span>
            </div>
          </div>

          {/* Bottom Architectural Datum Rail */}
          <footer className="iso-datum-rail" aria-label="Calibrated mountain regions">
            <div className="iso-datum-rail__left">
              <span className="iso-crosshair" aria-hidden="true">
                +
              </span>
              {THEATER_CATALOG.map((theater) => {
                const isActive = !isCustomRegion && activeTheaterId === theater.id;
                return (
                  <button
                    key={theater.id}
                    type="button"
                    className="iso-datum-theater"
                    data-active={isActive ? 'true' : 'false'}
                    onClick={() => slewToTheater(theater.id)}
                  >
                    <span className="iso-datum-theater__idx">{theater.indexCode}</span>
                    <span>{theater.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            <div className="iso-datum-rail__right">
              <button
                type="button"
                className="iso-datum-search"
                onClick={() => setAskOpen(true)}
              >
                <span>[ / ] Search Any Coordinate</span>
              </button>
              <span className="iso-crosshair" aria-hidden="true">
                +
              </span>
            </div>
          </footer>
        </div>
      )}

      {/* Full-Bleed Dark 3D Workspace (inWorkspace === true) */}
      {inWorkspace && (
        <>
          {cleanHud && (
            <button
              type="button"
              className="iso-clean-restore"
              onClick={() => setCleanHud(false)}
            >
              H · Restore HUD
            </button>
          )}

          <div className="iso-ws-layer" data-clean={cleanHud ? 'true' : 'false'}>
            {/* Top Workspace Perimeter Bar (50px) */}
            <header className="iso-ws-topbar">
              <div className="iso-ws-topbar__left">
                <button
                  type="button"
                  className="iso-ws-back"
                  onClick={exitToOverview}
                  title="Return to Daylight Sheet (Esc)"
                >
                  <IsogonMark />
                  <span>Isogon</span>
                </button>

                <div
                  className="iso-joined-cells--night"
                  role="group"
                  aria-label="Slew across calibrated mountain regions"
                >
                  {THEATER_CATALOG.map((theater) => (
                    <button
                      key={theater.id}
                      type="button"
                      className="iso-ws-cell iso-ws-cell--mono"
                      data-active={!isCustomRegion && activeTheaterId === theater.id ? 'true' : 'false'}
                      onClick={() => slewToTheater(theater.id)}
                      title={`Slew to ${theater.title}`}
                    >
                      {SHORT_THEATER_CODES[theater.id]}
                    </button>
                  ))}
                </div>
              </div>

              <nav className="iso-ws-topbar__center" aria-label="3D terrain view modes">
                <div className="iso-joined-cells--night">
                  <button
                    type="button"
                    className="iso-ws-cell"
                    data-active={workspaceMode === 'cutaway' ? 'true' : 'false'}
                    onClick={() => selectWorkspaceMode('cutaway')}
                  >
                    Sensor Split
                  </button>
                  <button
                    type="button"
                    className="iso-ws-cell"
                    data-active={workspaceMode === 'reconstruction' ? 'true' : 'false'}
                    onClick={() => selectWorkspaceMode('reconstruction')}
                  >
                    375 m Fire Field
                  </button>
                  <button
                    type="button"
                    className="iso-ws-cell"
                    data-active={workspaceMode === 'observer' ? 'true' : 'false'}
                    onClick={() => selectWorkspaceMode('observer')}
                  >
                    Satellite Passes
                  </button>
                  <button
                    type="button"
                    className="iso-ws-cell"
                    data-active={workspaceMode === 'world' ? 'true' : 'false'}
                    onClick={() => selectWorkspaceMode('world')}
                  >
                    True-Color Earth
                  </button>
                </div>
              </nav>

              <div className="iso-ws-topbar__right">
                <div className="iso-joined-cells--night">
                  <button
                    type="button"
                    className="iso-ws-cell"
                    data-active={cinemaActive ? 'true' : 'false'}
                    onClick={() => setCinemaActive((c) => !c)}
                  >
                    <span>Cinema</span>
                    <span className="iso-ws-cell__key">· C</span>
                  </button>
                  <button
                    type="button"
                    className="iso-ws-cell"
                    data-active={cleanHud ? 'true' : 'false'}
                    onClick={() => setCleanHud((h) => !h)}
                  >
                    <span>Clean Feed</span>
                    <span className="iso-ws-cell__key">· H</span>
                  </button>
                  <button
                    type="button"
                    className="iso-ws-cell"
                    onClick={() => setAskOpen(true)}
                  >
                    <span>Search</span>
                    <span className="iso-ws-cell__key">· /</span>
                  </button>
                  <button
                    type="button"
                    className="iso-ws-cell"
                    onClick={() => setSensorModalOpen(true)}
                  >
                    <span>Physics</span>
                    <span className="iso-ws-cell__key">· M</span>
                  </button>
                  <button
                    type="button"
                    className="iso-ws-cell"
                    onClick={() => setDocOpen(true)}
                  >
                    Method
                  </button>
                </div>
              </div>
            </header>

            {/* Right Compact Scientific Telemetry Frame (320px) */}
            <aside className="iso-telemetry-frame" aria-label="Scientific reconstruction telemetry">
              <div className="iso-telemetry-head">
                <div>
                  <div className="iso-telemetry-head__code">
                    {isCustomRegion
                      ? 'XY · LIVE GLOBAL TERRAIN'
                      : `${activeTheaterMeta.indexCode} · ${activeTheaterMeta.regionTag}`}
                  </div>
                  <div className="iso-telemetry-head__title">{regionTitle}</div>
                  <div className="iso-telemetry-head__coords">
                    {regionCoords} · {elevRangeText}
                  </div>
                </div>
                {holdoutViirs && <span className="iso-telemetry-badge">Blind Test</span>}
              </div>

              <div className="iso-telemetry-body">
                <div className="iso-power-readout">
                  <div>
                    <span className="iso-power-readout__val">{currentMw.toLocaleString()}</span>
                    <span className="iso-power-readout__unit">MW</span>
                  </div>
                  <span className="iso-power-readout__label">RECONSTRUCTED FIRE POWER</span>
                </div>

                <div className="iso-kv-rows">
                  <div className="iso-kv-row">
                    <span className="iso-kv-row__k">Error vs Raw 1 km MODIS</span>
                    <span className="iso-kv-row__v">
                      {reconRmseText} MW/km&sup2; (-{rmseReductionPct}%)
                    </span>
                  </div>
                  <div className="iso-kv-row">
                    <span className="iso-kv-row__k">90% Confidence Coverage</span>
                    <span className="iso-kv-row__v">{coverageText}%</span>
                  </div>
                  {workspaceMode === 'observer' && liveTelemetry ? (
                    <div className="iso-kv-row">
                      <span className="iso-kv-row__k">Captured Footprints</span>
                      <span className="iso-kv-row__v">
                        {liveTelemetry.retainedFootprints}/{liveTelemetry.poolFootprints} (
                        {liveTelemetry.observableFluxPct}% flux)
                      </span>
                    </div>
                  ) : (
                    <div className="iso-kv-row">
                      <span className="iso-kv-row__k">2012 Sensor Continuity</span>
                      <span className="iso-kv-row__v">
                        {stepHarmText}x (raw {stepRawText}x)
                      </span>
                    </div>
                  )}
                  <div className="iso-kv-row">
                    <span className="iso-kv-row__k">3D Terrain &amp; Ortho</span>
                    <span className="iso-kv-row__v">
                      {orthoShort} · {demShort} DEM · {stageFps} fps
                    </span>
                  </div>
                </div>

                {workspaceMode === 'observer' ? (
                  <>
                    <div className="iso-cell-grid" role="group" aria-label="Orbital sensor filter">
                      <button
                        type="button"
                        className="iso-ws-cell"
                        data-active={observerFilter === 'all' ? 'true' : 'false'}
                        onClick={() => setObserverFilter('all')}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className="iso-ws-cell"
                        data-active={observerFilter === 'modis' ? 'true' : 'false'}
                        onClick={() => setObserverFilter('modis')}
                      >
                        MODIS 1 km
                      </button>
                      <button
                        type="button"
                        className="iso-ws-cell"
                        data-active={observerFilter === 'viirs' ? 'true' : 'false'}
                        onClick={() => setObserverFilter('viirs')}
                      >
                        VIIRS 375 m
                      </button>
                    </div>

                    <VernierScrubber
                      label="Minimum FRP Filter"
                      valueText={`${Math.round(sensitivityThreshold * 38)} MW`}
                      fraction={(sensitivityThreshold - 0.04) / 0.78}
                      onChangeFraction={(u) => setSensitivityThreshold(0.04 + u * 0.78)}
                    />
                  </>
                ) : (
                  <>
                    <div className="iso-cell-grid" role="group" aria-label="Camera preset">
                      {(['overview', 'canyon', 'ridge', 'nadir'] as const).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className="iso-ws-cell"
                          data-active={cameraPreset === preset ? 'true' : 'false'}
                          onClick={() => setCameraPreset(preset)}
                        >
                          {preset.charAt(0).toUpperCase() + preset.slice(1)}
                        </button>
                      ))}
                    </div>

                    {workspaceMode === 'cutaway' && (
                      <VernierScrubber
                        label="Sensor Scan Curtain"
                        valueText={
                          cutawaySplit === null
                            ? 'Auto sweep'
                            : `${Math.round(((cutawaySplit + 1) / 2) * 100)}%`
                        }
                        fraction={cutawaySplit === null ? 0.5 : (cutawaySplit + 1) / 2}
                        onChangeFraction={(u) => setCutawaySplit(u * 2 - 1)}
                        onResetAuto={
                          cutawaySplit !== null ? () => setCutawaySplit(null) : undefined
                        }
                      />
                    )}
                  </>
                )}

                <div className="iso-lipari-block">
                  <div className="iso-lipari-bar" aria-hidden="true" />
                  <div className="iso-lipari-ticks">
                    <span>0 MW/km&sup2;</span>
                    <span>40 · Reconstructed Intensity (Lipari)</span>
                    <span>80+ MW/km&sup2;</span>
                  </div>
                </div>

                {selectedFinding && (
                  <div className="iso-finding-inset">
                    <div className="iso-finding-inset__head">
                      <span>{selectedFinding.title}</span>
                      <button
                        type="button"
                        className="iso-finding-inset__close"
                        onClick={() => setSelectedFinding(null)}
                        aria-label="Dismiss finding"
                      >
                        x
                      </button>
                    </div>
                    <div className="iso-finding-inset__sub">{selectedFinding.subtitle}</div>
                    <div className="iso-finding-inset__val">{selectedFinding.valueText}</div>
                  </div>
                )}
              </div>

              <div className="iso-telemetry-foot">
                <span className="iso-telemetry-foot__meta">5/5 · {totalPipelineMs} ms</span>
                <div className="iso-joined-cells--night">
                  <a
                    href={exportGeoJsonUrl}
                    download={`${activeRun?.region.id ?? activeTheaterId}_harmonized.geojson`}
                    className="iso-ws-cell"
                  >
                    Export GeoJSON
                  </a>
                  <a
                    href={exportCsvUrl}
                    download={`${activeRun?.region.id ?? activeTheaterId}_harmonized.csv`}
                    className="iso-ws-cell"
                  >
                    Export CSV
                  </a>
                </div>
              </div>
            </aside>

            {/* Bottom Linked Timeline & Continuity Record */}
            <StageTimelineTrack
              timeProgress={timeProgress}
              onChangeTime={(next) => {
                setPlaying(false);
                setTimeProgress(next);
              }}
              playing={playing}
              onTogglePlay={() => setPlaying((p) => !p)}
              epochSummaries={activeRun?.epoch_summaries}
              cinemaActive={cinemaActive}
              onToggleCinema={() => setCinemaActive((c) => !c)}
              cleanHud={cleanHud}
              onToggleCleanHud={() => setCleanHud((h) => !h)}
              onNextRegion={cycleNextTheaterSlew}
              onToggleHoldout={toggleHoldoutLive}
              holdoutViirs={holdoutViirs}
              showUncertainty={showUncertainty}
              onToggleUncertainty={() => setShowUncertainty((u) => !u)}
              activeEra={activeEra}
              onJumpEra={handleJumpEra}
              onExitOverview={exitToOverview}
            />
          </div>
        </>
      )}

      <CommandAskPalette
        open={askOpen}
        onClose={() => setAskOpen(false)}
        activeTheaterId={activeTheaterId}
        activeRun={activeRun}
        holdoutViirs={holdoutViirs}
        onToggleHoldoutViirs={toggleHoldoutLive}
        cloudOverride={cloudOverride}
        onToggleCloudOverride={toggleCloudLive}
        isExecuting={isExecuting}
        errorMessage={execError}
        onExecute={executeWorldModel}
      />

      <SensorDiagnosticModal open={sensorModalOpen} onClose={() => setSensorModalOpen(false)} />

      <MethodSheet open={docOpen} initialTab={docTab} onClose={() => setDocOpen(false)} />
    </div>
  );
}
