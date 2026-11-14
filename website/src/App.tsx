import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CommandAskPalette,
  type ReconstructRequestParams,
} from './components/CommandAskPalette';
import { ReadingSheet, type ReadingSection } from './components/ReadingSheet';
import { EvidenceSheet } from './components/EvidenceSheet';
import type { EvidenceDoc, EvidenceState } from './content/evidence';
import { AreaSheet } from './components/AreaSheet';
import { PassTrack } from './components/PassTrack';
import { Debrief } from './components/Debrief';
import { WorkspaceBar, MenuGroup, MenuItem, beatOfStep, type Step } from './components/WorkspaceBar';
import { BEATS, beatOf, type BeatId } from './app/names';
import { WorkspaceProvider, type WorkspaceStore } from './app/store';
import { CalendarBeat } from './beats/calendar/CalendarBeat';
import { WorldModelBeat } from './beats/world-model/WorldModelBeat';
import { TestWorldBeat } from './beats/test-world/TestWorldBeat';
import { revealedPassesOf, type TrackState } from './content/passTrack';
import { partsStatus, type PartId } from './content/partsStatus';
import { NEW_ROUND, TileOverlay, type RoundState, type ScreenRect } from './components/NextLookRound';
import { DEMO_NEXT_LOOK_START, type NextLookEnd } from './content/demo/nextLook';
import { frameNearest, withLooks } from './content/nextLook';
import { liveNextLookEnv, runWithEndReveal, type NextLookEnv } from './content/nextLookEnv';
import { EarthCutawayStage } from './stage/EarthCutawayStage';
import {
  THEATER_CATALOG,
  type EarthStageTelemetry,
  type InspectorCameraPreset,
  type OrbitalSlewRequest,
  type TheaterId,
} from './stage/earthCutawayTypes';
import { plainText } from './ui/plainText';
import { useSensorModel } from './ui/useSensorModel';
import { LandingComposition } from './ui/LandingComposition';
import { imageryCredit } from './ui/attribution';
import { useCalendar } from './ui/useCalendar';
import { fireOfStart, openingStart, usePlaces, type Box, type FeaturedFire, type Place } from './app/places';
import type { FireRecord, RecordPlace } from './beats/calendar/record';
import { boxWords } from './beats/calendar/PlaceScreen';
import { usePassList } from './ui/usePassList';
import {
  isRealRun,
  parseBlindTest,
  parseIntensityLegend,
  parseModel,
  withReveal,
  beforeSharpSatellite,
  runWindow,
  startBeforeSharp,
  startForMonth,
  utcSpan,
} from './content/realRuns';
import { THEATER_DISPLAY, formatLat, formatLon } from './content/theaters';
import type {
  DynamicRegionRun,
  ObserverFilter,
  TerrainFindingCallout,
  WorkspaceMode,
} from './stage/types';

import { API_BASE, getJson } from './lib/api';

/**
 * Landing world view: `landingSubjectFrame` names the rectangle the stage keeps calm (sky or haze) for the type.
 * Wide screens: the top 38%. Phones: the type wraps longer, so the top 42%.
 */
const LANDING_CALM_BAND = { left: 0.0, top: 0.0, right: 1.0, bottom: 0.38 } as const;
const LANDING_CALM_BAND_NARROW = { left: 0.0, top: 0.0, right: 1.0, bottom: 0.42 } as const;

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

/**
 * Where the slab may sit during a round of next look. The calendar and the pass track step aside, so the terrain may
 * take more of the screen: it stays clear of the top bar and of the readout column on the right. The column is 336 px
 * plus the page gutter (styles/workspace.css), so the right edge is computed from the viewport width. Under 960 px
 * the readout moves to the bottom.
 */
function roundFrame(width: number) {
  if (width < 960) return { left: 0.0, top: 0.12, right: 1.0, bottom: 0.5 };
  const gutter = Math.min(36, Math.max(20, width * 0.02));
  const right = 1 - (336 + gutter + 32) / width;
  return { left: 0.02, top: 0.09, right: Math.max(0.5, right), bottom: 0.93 };
}

/**
 * Where the stage puts the region's top face when it looks straight down: fitted into the subject frame, keeping the
 * box's own proportions (measured on the nadir view at 1440 by 900; perspective moves the corners by up to about 3
 * percent). The tiles are drawn there, not on the grid the stage can project (`telemetry.regionGrid`).
 */
function nadirRect(frame: { left: number; top: number; right: number; bottom: number }, aspect: number): ScreenRect {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const fx = frame.left * W;
  const fy = frame.top * H;
  const fw = (frame.right - frame.left) * W;
  const fh = (frame.bottom - frame.top) * H;
  const w = Math.min(fw, fh * aspect);
  const h = w / aspect;
  return { x: fx + (fw - w) / 2, y: fy + (fh - h) / 2, w, h };
}

function workspaceFrame(width: number) {
  if (width < 960) return { left: 0.0, top: 0.12, right: 1.0, bottom: 0.5 };
  const gutter = Math.min(36, Math.max(20, width * 0.02));
  const right = 1 - (360 + 2 * gutter + 24) / width;
  // One panel at the right and the pass track along the bottom (about 170 px plus the gutter).
  return { left: 0.0, top: 0.08, right: Math.max(0.5, right), bottom: 0.76 };
}

const WORKSPACE_VIEWS: ReadonlyArray<{ mode: WorkspaceMode; label: string; key: string }> = [
  { mode: 'cutaway', label: 'Sensor split', key: '1' },
  { mode: 'reconstruction', label: '375 m field', key: '2' },
  { mode: 'observer', label: 'Satellite passes', key: '3' },
  { mode: 'world', label: 'True color', key: '4' },
];

const OBSERVER_FILTERS: ReadonlyArray<{ id: ObserverFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'modis', label: 'MODIS 1 km' },
  { id: 'viirs', label: 'VIIRS 375 m' },
];

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

function isKnownTheaterId(value: string | undefined): value is TheaterId {
  return THEATER_CATALOG.some((t) => t.id === value);
}

export function App() {
  const [inWorkspace, setInWorkspace] = useState(false);
  /** Month chosen in the burning calendar ("2021-08"); null until the user picks one. */
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const viewportWidth = useViewportWidth();
  const narrowViewport = viewportWidth <= 760;
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

  const slewNonceRef = useRef<number>(0);
  const [slewRequest, setSlewRequest] = useState<OrbitalSlewRequest | null>(null);
  const [stageTelemetry, setStageTelemetry] = useState<EarthStageTelemetry | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<TerrainFindingCallout | null>(null);

  const [activeRun, setActiveRun] = useState<DynamicRegionRun | null>(null);
  const [holdoutViirs, setHoldoutViirs] = useState<boolean>(false);
  const [cloudOverride, setCloudOverride] = useState<number | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [execError, setExecError] = useState<string | null>(null);
  /** Real runs: the start of the FIRMS run on the stage, the one being requested, and the last failure. */
  const [realStart, setRealStart] = useState<string | null>(null);
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [realFailed, setRealFailed] = useState<{ start: string; message: string } | null>(null);
  /**
   * The blind test: hiding VIIRS requests the blind run; the reveal keeps that run on the terrain with its hidden
   * detections laid on (`withReveal`) and its own score in the table. The reveal never swaps in another run.
   */
  const [revealed, setRevealed] = useState(false);
  /** The reveal's request is in flight. */
  const [revealing, setRevealing] = useState(false);
  /** A round of next look in progress (null: none). */
  const [round, setRound] = useState<RoundState | null>(null);
  /** The round's routes (demo: answered in the page from the blind run) and the answer of /end once it is done. */
  const [roundEnv, setRoundEnv] = useState<NextLookEnv | null>(null);
  const [roundEnd, setRoundEnd] = useState<NextLookEnd | null>(null);
  /** Terra's morning pass estimated from VIIRS alone, shown beside the blind test's score (demo data, experimental). */
  const [terraOpen, setTerraOpen] = useState(false);
  /**
   * The region the user asked for (a tab, the palette, the cinema, or Feather River on load). Opening a region
   * requests its real run when it has one; the nonce makes asking again for the same region count.
   */
  const [regionAsk, setRegionAsk] = useState<{ id: TheaterId; nonce: number } | null>({ id: 'plumas_ca', nonce: 0 });
  const askRegion = useCallback((id: TheaterId) => setRegionAsk((r) => ({ id, nonce: (r?.nonce ?? 0) + 1 })), []);
  /** Overlapping requests: each new one aborts the last, and a stale answer is dropped. */
  const requestSeqRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);

  const [askOpen, setAskOpen] = useState(false);
  /** The one reading sheet (method, sensors, sources, credits) and its open section; null when closed. */
  const [reading, setReading] = useState<ReadingSection | null>(null);
  /** A step asked for from the landing's three parts, taken once the workspace is open. */
  const pendingStepRef = useRef<Step | null>(null);
  /** The evidence sheet opened on its agents' table. */
  const [evidenceFocus, setEvidenceFocus] = useState<'next_look' | null>(null);
  /** The step of the story the workspace is on, and the blind test's debrief screen. */
  const [step, setStep] = useState<Step>('fire');
  const [debriefOpen, setDebriefOpen] = useState(false);
  const telemetryRef = useRef<EarthStageTelemetry | null>(null);
  /** How a selected item is marked, from the address (?sel=chip|square|box); chip unless it says otherwise. */
  const selStyle = useMemo(() => {
    const v = new URLSearchParams(window.location.search).get('sel');
    return v === 'square' || v === 'box' ? v : 'chip';
  }, []);
  /** The evidence sheet, read from GET /api/evidence. */
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  /** Any area's record. A month picked there opens its region and month here. */
  const [areaOpen, setAreaOpen] = useState(false);
  const [monthAsk, setMonthAsk] = useState<{ region: string; ym: string } | null>(null);
  /** The place screen over the Calendar, and a box drawn on it (its record replaces the place's). */
  const [placesOpen, setPlacesOpen] = useState(false);
  const [recordBox, setRecordBox] = useState<{ box: Box; name: string } | null>(null);
  /** A featured fire chosen on the place screen: its start replaces the place's opening start once. */
  const fireStartRef = useRef<{ region: string; start: string } | null>(null);
  const [liveTelemetry, setLiveTelemetry] = useState<LiveObserverTelemetry | null>(null);

  const handleTelemetry = useCallback((t: EarthStageTelemetry) => {
    telemetryRef.current = t;
    setStageTelemetry(t);
  }, []);

  const enterWorkspace = useCallback((initialMode: WorkspaceMode = 'cutaway') => {
    setReading(null);
    setCleanHud(false);
    setInWorkspace(true);
    // The workspace opens on the fire, at the pass the landing showed, so entering does not jump in time.
    setStep('fire');
    setDebriefOpen(false);
    const landingPass = telemetryRef.current?.realPass?.index;
    if (typeof landingPass === 'number') setTimeProgress(landingPass);
    setWorkspaceMode(initialMode);
    if (initialMode === 'reconstruction') {
      setPlaying(true);
    }
  }, []);

  const exitToOverview = useCallback(() => {
    setPlaying(false);
    setCinemaActive(false);
    setCleanHud(false);
    setReading(null);
    setDebriefOpen(false);
    setRound(null);
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
      const seq = ++requestSeqRef.current;
      requestAbortRef.current?.abort();
      const controller = new AbortController();
      requestAbortRef.current = controller;
      const stale = () => controller.signal.aborted || seq !== requestSeqRef.current;
      setIsExecuting(true);
      setExecError(null);
      const realStartParam = params.source === 'firms' && params.start ? params.start : null;
      if (realStartParam) setPendingStart(realStartParam);
      if (params.queryText) setRegionAsk(null);

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
          // A synthetic cloud deck is a simulation knob; the real path keeps the clouds the satellites saw.
          cloud_override: realStartParam ? null : params.cloudOverride,
        };
        if (realStartParam) {
          body.source = 'firms';
          body.start = realStartParam;
          if (params.holdoutViirs) body.holdout = 'viirs';
          if (params.reveal) body.reveal = true;
        }
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
          signal: controller.signal,
        });
        if (!resp.ok) {
          const errJson = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
          throw new Error(
            typeof errJson?.error === 'string' ? errJson.error : `HTTP ${resp.status}`,
          );
        }
        const runData = (await resp.json()) as DynamicRegionRun;
        if (stale()) return false;
        // Nothing simulated on the real path: a simulated answer to a FIRMS request is refused, not shown.
        if (realStartParam && !isRealRun(runData)) {
          throw new Error('the backend answered with a simulated run');
        }
        setActiveRun(runData);
        // A reveal is the same run with what the scorer wrote: the picture keeps its camera and its pass.
        setRevealed(Boolean(params.reveal));
        setRealStart(realStartParam);
        if (realStartParam) setRealFailed(null);
        setSelectedFinding(null);
        if (!params.reveal) setCameraPreset('overview');
        const reported = runData.metrics?.holdout_viirs;
        const nextHoldout = params.reveal ? false : typeof reported === 'boolean' ? reported : params.holdoutViirs;
        setHoldoutViirs(nextHoldout);
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
        if (stale()) return false;
        const msg = err instanceof Error ? err.message : 'Backend unreachable';
        setExecError(msg);
        if (realStartParam) setRealFailed({ start: realStartParam, message: msg.replace(/\.$/, '') });
        if (params.enterWorkspace && !inWorkspace) {
          setInWorkspace(true);
          setWorkspaceMode('cutaway');
        }
        return false;
      } finally {
        if (seq === requestSeqRef.current) setIsExecuting(false);
        if (realStartParam) setPendingStart((p) => (p === realStartParam ? null : p));
      }
    },
    [inWorkspace, activeTheaterId],
  );

  const slewToTheater = useCallback(
    (targetId: TheaterId, eraLabel?: string) => {
      setActiveTheaterId(targetId);
      setSelectedMonth(null);
      slewNonceRef.current += 1;
      setSlewRequest({
        nonce: slewNonceRef.current,
        targetTheaterId: targetId,
        eraLabel,
      });
      askRegion(targetId);
    },
    [askRegion],
  );

  const cycleNextTheaterSlew = useCallback(() => {
    const idx = THEATER_CATALOG.findIndex((t) => t.id === activeTheaterId);
    const nextTheater = THEATER_CATALOG[(idx + 1) % THEATER_CATALOG.length];
    slewToTheater(nextTheater.id);
  }, [activeTheaterId, slewToTheater]);

  const handleCinemaStepTheater = useCallback(
    (nextTheaterId: TheaterId) => {
      setActiveTheaterId(nextTheaterId);
      if (activeRun?.region.id !== nextTheaterId) askRegion(nextTheaterId);
    },
    [activeRun?.region.id, askRegion],
  );

  /** The palette opens a known region the same way a tab does; searches go to the backend. */
  const handlePaletteExecute = useCallback(
    async (params: ReconstructRequestParams): Promise<boolean> => {
      if (params.theaterId && !params.queryText) {
        slewToTheater(params.theaterId);
        if (params.enterWorkspace) enterWorkspace('cutaway');
        return true;
      }
      return executeWorldModel(params);
    },
    [slewToTheater, enterWorkspace, executeWorldModel],
  );

  const toggleHoldoutLive = useCallback(() => {
    // Before 2012 no sharp satellite flew: nothing to hide, so no blind test
    if (beforeSharpSatellite(activeRun)) return;
    // A real blind run is revealed. Its first response holds nothing the scorer wrote, so the reveal asks again with
    // `reveal: true` (served from the server's cache); a run that already carries its blind test is revealed in
    // place.
    if (holdoutViirs && isRealRun(activeRun) && activeRun?.metrics?.holdout_viirs) {
      if (!('blind_test' in (activeRun as unknown as Record<string, unknown>))) {
        if (revealing) return;
        setRevealing(true);
        void executeWorldModel({
          regionId: activeRun.region.id,
          holdoutViirs: true,
          cloudOverride: null,
          enterWorkspace: false,
          ...(realStart ? { source: 'firms' as const, start: realStart } : {}),
          reveal: true,
        }).finally(() => setRevealing(false));
        return;
      }
      setHoldoutViirs(false);
      setRevealed(true);
      return;
    }
    const nextHoldout = revealed ? false : !holdoutViirs;
    setRevealed(false);
    setHoldoutViirs(nextHoldout);
    void executeWorldModel({
      regionId: activeRun?.region.id ?? activeTheaterId,
      holdoutViirs: nextHoldout,
      cloudOverride,
      enterWorkspace: false,
      ...(realStart ? { source: 'firms' as const, start: realStart } : {}),
    });
  }, [holdoutViirs, revealed, revealing, activeRun, activeTheaterId, cloudOverride, executeWorldModel, realStart]);

  const toggleCloudLive = useCallback(() => {
    // A synthetic cloud deck would put simulated data on the real path.
    if (realStart) return;
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
  }, [cloudOverride, askOpen, activeRun?.region.id, activeTheaterId, holdoutViirs, executeWorldModel, realStart]);

  // Burning calendar: real when the backend serves FIRMS for this region, otherwise simulated. It
  // follows the region asked for, so opening a region can read its start list before any run arrives.
  const calendarRegionId = regionAsk?.id ?? activeRun?.region.id ?? activeTheaterId;
  const calendar = useCalendar(API_BASE, calendarRegionId);
  // The places registry: the default fire and each place's opening start, by the rule the route states.
  const placesState = usePlaces();

  // Real is the default: a region with real run starts opens on its default start; one without real rows opens on a
  // simulated run, labelled as such. Each ask is handled once, after its calendar is in.
  const handledAskRef = useRef<string | null>(null);
  useEffect(() => {
    if (!regionAsk) return;
    const key = `${regionAsk.id}:${regionAsk.nonce}`;
    if (handledAskRef.current === key) return;
    if (calendar.regionId !== regionAsk.id || calendar.state === 'loading' || placesState.state === 'loading') return;
    handledAskRef.current = key;
    const chosen = fireStartRef.current && fireStartRef.current.region === regionAsk.id ? fireStartRef.current.start : null;
    fireStartRef.current = null;
    const opening =
      calendar.cal && !calendar.cal.simulated
        ? chosen ?? openingStart(placesState.places, regionAsk.id) ?? calendar.cal.defaultStart
        : null;
    if (opening) {
      if (isRealRun(activeRun) && activeRun?.region.id === regionAsk.id && realStart === opening) return;
      void executeWorldModel({
        regionId: regionAsk.id,
        holdoutViirs: false,
        cloudOverride: null,
        enterWorkspace: false,
        source: 'firms',
        start: opening,
      });
    } else if (activeRun?.region.id !== regionAsk.id || isRealRun(activeRun)) {
      void executeWorldModel({ regionId: regionAsk.id, holdoutViirs: false, cloudOverride, enterWorkspace: false });
    }
  }, [regionAsk, calendar, placesState, activeRun, realStart, cloudOverride, executeWorldModel]);

  /** Selecting a month that has a real run requests it; the stage replays whatever comes back. */
  const handleSelectMonth = useCallback(
    (ym: string) => {
      setSelectedMonth(ym);
      if (!calendar.cal || calendar.cal.simulated) return;
      const month = calendar.cal.months.find((m) => m.yearMonth === ym);
      const pre = startBeforeSharp(ym, month?.modis ?? null);
      const start = startForMonth(ym, calendar.runStarts, calendar.cal.defaultStart) ?? pre;
      if (!start || start === realStart || start === pendingStart) return;
      void executeWorldModel({
        regionId: calendarRegionId,
        // Before 2012 there is no VIIRS to hide
        holdoutViirs: pre ? false : holdoutViirs,
        cloudOverride: null,
        enterWorkspace: false,
        source: 'firms',
        start,
      });
    },
    [calendar, realStart, pendingStart, calendarRegionId, holdoutViirs, executeWorldModel],
  );

  // A month picked in the any-area sheet waits for its region's calendar, then is selected like a click.
  useEffect(() => {
    if (!monthAsk || calendar.regionId !== monthAsk.region || calendar.state !== 'ready') return;
    setMonthAsk(null);
    handleSelectMonth(monthAsk.ym);
  }, [monthAsk, calendar, handleSelectMonth]);

  const openAreaMonth = useCallback(
    (regionId: string, ym: string) => {
      setAreaOpen(false);
      if (isKnownTheaterId(regionId) && regionId !== calendarRegionId) slewToTheater(regionId);
      setMonthAsk({ region: regionId, ym });
    },
    [calendarRegionId, slewToTheater],
  );

  // A round of next look on the Dixie fire's blind run. The page knows only what the round's routes answered: a
  // look's detections, then everything at the end.
  const roundEpisode = roundEnv?.start ?? DEMO_NEXT_LOOK_START;
  const roundRun =
    round && activeRun && isRealRun(activeRun) && activeRun.metrics?.holdout_viirs && activeRun.region.id === roundEpisode.episode.region_id
      ? activeRun
      : null;
  const [roundTiles, roundCols] = roundEpisode.episode.tiles;
  const roundBusyRef = useRef(false);

  // The round's routes.
  useEffect(() => {
    if (!round || roundEnv) return;
    const controller = new AbortController();
    liveNextLookEnv(API_BASE, roundEpisode.episode.region_id, controller.signal)
      .then(setRoundEnv)
      .catch(() => {});
    return () => controller.abort();
  }, [round !== null, roundEnv, roundRun]); // eslint-disable-line react-hooks/exhaustive-deps

  const startRound = useCallback(() => {
    setRound(NEW_ROUND);
    setRoundEnv(null);
    setRoundEnd(null);
    setRevealed(false);
    setPlaying(false);
    setCinemaActive(false);
    setCleanHud(false);
    setSelectedFinding(null);
    void executeWorldModel({
      regionId: roundEpisode.episode.region_id,
      holdoutViirs: true,
      cloudOverride: null,
      enterWorkspace: false,
      source: 'firms',
      start: roundEpisode.estimate.start,
    });
  }, [executeWorldModel, roundEpisode]);

  const leaveRound = useCallback(() => {
    setRound(null);
    setRoundEnv(null);
    setRoundEnd(null);
    setCameraPreset('overview');
    askRegion(roundEpisode.episode.region_id as TheaterId);
  }, [askRegion, roundEpisode]);

  /** Spend the current look on a tile (or pass with -1); the answer says what it revealed and what comes next. */
  const answerLook = useCallback(
    (tile: number) => {
      if (!round || round.done || !roundEnv || roundBusyRef.current) return;
      const decision = round.decision;
      roundBusyRef.current = true;
      roundEnv
        .look(decision, tile)
        .then((res) => {
          setRound((r) =>
            r && r.decision === decision
              ? {
                  ...r,
                  picks: [...r.picks, { decision, tile: res.tile >= 0 ? res.tile : null, pixels: res.pixels, revealed: res.revealed, reward: res.reward }],
                  awaitingNext: res.tile >= 0,
                  next: res.next_decision,
                  decision: res.tile >= 0 || res.next_decision === null ? decision : res.next_decision,
                  done: res.tile < 0 && res.done,
                }
              : r,
          );
          if (res.tile < 0 && res.done) return roundEnv.end().then(setRoundEnd);
        })
        .catch(() => {})
        .finally(() => {
          roundBusyRef.current = false;
        });
    },
    [round, roundEnv],
  );

  const pickTile = useCallback(
    (tile: number) => {
      if (!round || round.awaitingNext) return;
      answerLook(tile);
    },
    [round, answerLook],
  );

  const nextLook = useCallback(() => {
    if (!round) return;
    if (round.done) {
      // Play again on the same run: a fresh round from the routes.
      setRound(NEW_ROUND);
      setRoundEnd(null);
      setRoundEnv(null);
      return;
    }
    if (!round.awaitingNext) {
      answerLook(-1);
      return;
    }
    if (round.next === null) {
      setRound({ ...round, awaitingNext: false, done: true });
      void roundEnv?.end().then(setRoundEnd).catch(() => {});
    } else {
      setRound({ ...round, decision: round.next, awaitingNext: false });
    }
  }, [round, roundEnv, answerLook]);

  // The steps. Record and fire show the run with every sensor; the test hides VIIRS and reveals it; the look is
  // a round of next look. Moving between them undoes what the step left behind.
  const pendingHideRef = useRef(false);
  const restoreFullRun = useCallback(() => {
    if (!holdoutViirs && !revealed) return;
    setRevealed(false);
    setHoldoutViirs(false);
    void executeWorldModel({
      regionId: activeRun?.region.id ?? activeTheaterId,
      holdoutViirs: false,
      cloudOverride,
      enterWorkspace: false,
      ...(realStart ? { source: 'firms' as const, start: realStart } : {}),
    });
  }, [holdoutViirs, revealed, activeRun, activeTheaterId, cloudOverride, executeWorldModel, realStart]);

  const goStep = useCallback(
    (next: Step) => {
      setDebriefOpen(false);
      if (next === step && next !== 'look') return;
      if (step === 'look' && next !== 'look' && round) leaveRound();
      if (next === 'record' || next === 'fire') {
        if (step === 'test') restoreFullRun();
      } else if (next === 'test') {
        if (!holdoutViirs && !revealed) {
          if (round || step === 'look') pendingHideRef.current = true;
          else toggleHoldoutLive();
        }
      } else if (next === 'look') {
        startRound();
      }
      setStep(next);
    },
    [step, round, leaveRound, restoreFullRun, holdoutViirs, revealed, toggleHoldoutLive, startRound],
  );

  /** A part from the bar or its key: the Calendar, the fire and its test, a round. The Agent is not open yet. */
  const goBeat = useCallback(
    (b: BeatId) => {
      if (b === 'calendar') goStep('record');
      else if (b === 'model') {
        if (step !== 'fire' && step !== 'test') goStep('fire');
        else setDebriefOpen(false);
      } else if (b === 'world') goStep('look');
    },
    [goStep, step],
  );

  // The reference players are computed on the server from the round's start; when the end arrived before them, ask
  // once more (the ask waits up to two more minutes on the state route) and show them when they come.
  const referenceTriesRef = useRef(0);
  useEffect(() => {
    if (!roundEnv || !roundEnd || roundEnd.reference) {
      referenceTriesRef.current = 0;
      return;
    }
    if (referenceTriesRef.current >= 3) return;
    referenceTriesRef.current += 1;
    let live = true;
    roundEnv
      .end()
      .then((e) => {
        if (live && e.reference) setRoundEnd(e);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [roundEnv, roundEnd]);

  // A part opened from the landing enters the workspace, then takes its step.
  useEffect(() => {
    if (!inWorkspace || !pendingStepRef.current) return;
    const next = pendingStepRef.current;
    pendingStepRef.current = null;
    goStep(next);
  }, [inWorkspace, goStep]);

  // The parts' status lines and the evidence sheet read the evidence route live; until it answers they show no
  // figures. A sheet opened after a failed answer asks again.
  const [evidenceLive, setEvidenceLive] = useState<EvidenceDoc | null>(null);
  const [evidenceState, setEvidenceState] = useState<EvidenceState>('loading');
  const [evidenceAsk, setEvidenceAsk] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setEvidenceState('loading');
    getJson<unknown>('/api/evidence', undefined, { signal: controller.signal })
      .then((d) => {
        if (d && typeof d === 'object' && (d as Partial<EvidenceDoc>).test_fires) {
          setEvidenceLive(d as EvidenceDoc);
          setEvidenceState('ready');
        } else {
          setEvidenceState('failed');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setEvidenceState('failed');
      });
    return () => controller.abort();
  }, [evidenceAsk]);
  useEffect(() => {
    if (evidenceOpen && evidenceState === 'failed') setEvidenceAsk((n) => n + 1);
  }, [evidenceOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const landingParts = useMemo(() => partsStatus(evidenceLive), [evidenceLive]);
  const openPart = useCallback(
    (id: PartId) => {
      if (id === 'agent') {
        setEvidenceFocus('next_look');
        setEvidenceOpen(true);
        return;
      }
      pendingStepRef.current = id === 'model' ? 'test' : 'look';
      enterWorkspace('cutaway');
    },
    [enterWorkspace],
  );

  // A test asked for while a round was closing waits for the region's run to come back, then hides VIIRS.
  useEffect(() => {
    if (!pendingHideRef.current || step !== 'test' || round || isExecuting || !activeRun || !isRealRun(activeRun)) return;
    pendingHideRef.current = false;
    if (!holdoutViirs && !revealed) toggleHoldoutLive();
  }, [step, round, isExecuting, activeRun, holdoutViirs, revealed, toggleHoldoutLive]);

  /** V: on the test step it hides, then reveals, then opens the score; elsewhere it goes to the test. */
  const testAction = useCallback(() => {
    if (step !== 'test') return goStep('test');
    if (revealed) return setDebriefOpen(true);
    toggleHoldoutLive();
  }, [step, revealed, goStep, toggleHoldoutLive]);

  // The round looks straight down on the 375 m field, at the frame nearest the look being decided.
  useEffect(() => {
    if (!round || !roundRun) return;
    setCameraPreset('nadir');
    const slot = roundEpisode.looks[round.decision];
    setTimeProgress(frameNearest(roundRun, Date.parse(slot.time_utc) / 1000));
  }, [round?.decision, round !== null, roundRun, roundEpisode]); // eslint-disable-line react-hooks/exhaustive-deps

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

      if (askOpen || reading !== null || evidenceOpen || areaOpen) return;

      if (inWorkspace && placesOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setPlacesOpen(false);
        }
        return;
      }
      if (inWorkspace && step === 'record' && e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setPlacesOpen(true);
        return;
      }

      if (round && inWorkspace) {
        if (e.key === 'Escape') {
          e.preventDefault();
          leaveRound();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          nextLook();
        }
        return;
      }

      if (e.key.toLowerCase() === 'l' && inWorkspace && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        goStep('look');
        return;
      }

      if (e.key.toLowerCase() === 'v' && inWorkspace && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        testAction();
        return;
      }

      if (e.key.toLowerCase() === 'm' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setReading('sensors');
        return;
      }

      // Enter on a focused trigger activates that trigger; only a bare Enter opens the terrain.
      const onControl = Boolean(target?.closest('button, a, [role="slider"], [role="option"]'));
      if (!inWorkspace && e.key === 'Enter' && !onControl) {
        e.preventDefault();
        enterWorkspace('cutaway');
        return;
      }

      if (inWorkspace) {
        const lower = e.key.toLowerCase();
        if (e.key === 'Escape') {
          e.preventDefault();
          if (debriefOpen) {
            setDebriefOpen(false);
          } else if (cinemaActive) {
            setCinemaActive(false);
          } else if (cleanHud) {
            setCleanHud(false);
          } else {
            exitToOverview();
          }
        } else if (e.key === 'Enter' && (!onControl || Boolean(target?.closest('.iso-bar__step[data-active="true"], .iso-track__lane')))) {
          e.preventDefault();
          // The step's one forward action
          if (step === 'record') goStep('fire');
          else if (step === 'fire') goStep('test');
          else if (step === 'test') {
            if (debriefOpen) goStep('look');
            else testAction();
          }
        } else if (e.key === 'ArrowRight' && !onControl) {
          e.preventDefault();
          setPlaying(false);
          setTimeProgress((t) => Math.min(23, Math.round(t) + 1));
        } else if (e.key === 'ArrowLeft' && !onControl) {
          e.preventDefault();
          setPlaying(false);
          setTimeProgress((t) => Math.max(0, Math.round(t) - 1));
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
        } else if (lower === 'u' && !e.metaKey && !e.ctrlKey && !e.altKey && !isRealRun(activeRun)) {
          // The stage draws the uncertainty layer on simulated runs only.
          e.preventDefault();
          setShowUncertainty((u) => !u);
        } else {
          const b = BEATS.find((x) => x.key === e.key);
          if (b) goBeat(b.id);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    askOpen,
    reading,
    debriefOpen,
    step,
    goStep,
    goBeat,
    testAction,
    evidenceOpen,
    areaOpen,
    inWorkspace,
    cinemaActive,
    cleanHud,
    enterWorkspace,
    exitToOverview,
    toggleHoldoutLive,
    cycleNextTheaterSlew,
    round,
    leaveRound,
    nextLook,
    startRound,
    activeRun,
    placesOpen,
  ]);

  const isCustomRegion = Boolean(activeRun && !isKnownTheaterId(activeRun.region.id));

  const activeDisplay = THEATER_DISPLAY[activeTheaterId];
  const runMatchesRegion = Boolean(
    activeRun && (isCustomRegion || activeRun.region.id === activeTheaterId),
  );
  // The place's name from the registry; the typed display table only until the registry has answered.
  const registryName = placesState.places.places.find((p) => p.id === activeTheaterId)?.name ?? null;
  const regionTitle =
    isCustomRegion && activeRun ? plainText(activeRun.region.name) : registryName ?? activeDisplay.title;
  const regionSetting = isCustomRegion ? 'Live terrain from search' : activeDisplay.setting;
  const regionLat =
    runMatchesRegion && activeRun ? formatLat(activeRun.region.center_lat) : activeDisplay.lat;
  const regionLon =
    runMatchesRegion && activeRun ? formatLon(activeRun.region.center_lon) : activeDisplay.lon;

  const elevRangeText =
    runMatchesRegion &&
    activeRun &&
    Number.isFinite(activeRun.region.min_elev_m) &&
    Number.isFinite(activeRun.region.max_elev_m)
      ? `${Math.round(activeRun.region.min_elev_m).toLocaleString()} to ${Math.round(activeRun.region.max_elev_m).toLocaleString()} m`
      : activeDisplay.elevation;

  // No invented numbers: until a run for this region reports, readouts say so.
  const epochSummary = runMatchesRegion ? activeRun?.epoch_summaries?.[activeEpoch] : undefined;
  const rawMw = epochSummary?.reconstructed_total_mw ?? liveTelemetry?.reconstructedMw ?? null;
  const currentMw = rawMw === null || !Number.isFinite(rawMw) ? null : Math.round(rawMw);

  // The physics briefing's diagram data. Its simulated self-check and gates are not shown.
  const sensorModel = useSensorModel(activeRun?.run_id ?? null);

  const pipelineStages = activeRun?.pipeline_stages ?? [];
  const pipelineStageCount = pipelineStages.length;
  const completedStages = pipelineStages.filter((st) => st.status === 'completed').length;
  const totalPipelineMs = Math.round(
    pipelineStages.reduce((acc, st) => acc + (st.duration_ms || 0), 0),
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

  // Real or simulated, for every number on screen. A real run's blind test shows only after the reveal.
  const runIsReal = isRealRun(activeRun);
  const runModel = runIsReal ? parseModel(activeRun) : null;
  const runSpan = runIsReal ? runWindow(activeRun) : null;
  const noSharp = beforeSharpSatellite(activeRun);
  const blindKey = runIsReal && activeRun && realStart ? `${activeRun.region.id}:${realStart}` : '';
  const blindTest = useMemo(() => (revealed ? parseBlindTest(activeRun, blindKey) : null), [revealed, activeRun, blindKey]);
  const blindModel = revealed ? parseModel(activeRun) : null;
  const blindInterval = blindTest?.methods.find((m) => m.id === 'reconstruction') ?? null;
  const sourceSlug = runIsReal ? 'firms' : 'simulated';
  /** What the terrain shows: after a reveal, the blind run with its hidden detections laid on. */
  const stageRun = useMemo(() => {
    if (round && roundRun) {
      if (round.done) return roundEnd ? withReveal(runWithEndReveal(roundRun, roundEnd)) : roundRun;
      const looked = round.picks.filter((p) => p.tile !== null);
      const layers = looked.flatMap((p) =>
        p.revealed.map((o) => ({
          frame: frameNearest(roundRun, Date.parse(o.time_utc) / 1000),
          platform: o.platform,
          footprints: o.footprints,
        })),
      );
      return withLooks(roundRun, layers, `looks_${looked.map((p) => `${p.decision}-${p.tile}`).join('_')}`);
    }
    return revealed && activeRun ? withReveal(activeRun) : activeRun;
  }, [revealed, activeRun, round, roundRun, roundEnd]);
  /** Real runs carry their own intensity scale (`encoding`); simulated runs use the fixed linear key. */
  const intensity = runIsReal ? parseIntensityLegend(activeRun) : null;

  const effectiveMode: WorkspaceMode = inWorkspace ? workspaceMode : 'cutaway';
  const credit = imageryCredit(activeRun);
  const calendarArea = {
    name: regionTitle,
    lat: runMatchesRegion && activeRun ? activeRun.region.center_lat : activeDisplay.centerLat,
    lon: runMatchesRegion && activeRun ? activeRun.region.center_lon : activeDisplay.centerLon,
  };

  // What the pass track shows, what each step needs, and the quiet control's contents.
  const trackState: TrackState = !runIsReal ? 'simulated' : holdoutViirs ? 'hidden' : revealed ? 'revealed' : 'normal';
  const trackRevealed = useMemo(() => (revealed ? revealedPassesOf(activeRun) : []), [revealed, activeRun]);
  const passLists = usePassList(activeRun);
  const stageMonth = activeRun?.epoch_summaries?.[0]?.timestamp_utc?.slice(0, 7) ?? null;
  const lookHere = activeRun?.region.id === roundEpisode.episode.region_id || Boolean(round);
  const stepBlocked: Partial<Record<Step, string | null>> = {
    test: noSharp
      ? 'No VIIRS flew before 2012, so there is nothing to hide'
      : !runIsReal
        ? 'The test needs a real NASA FIRMS run'
        : null,
    look: lookHere ? null : 'A round is ready for the Dixie fire, in Feather River only',
  };
  const span = runSpan ? utcSpan(runSpan.first, runSpan.last) : null;
  const beatBlocked: Partial<Record<BeatId, string | null>> = {
    world: stepBlocked.look ?? null,
    agent: 'Watching an agent play opens after a round in Test world',
  };
  const blindLoading = holdoutViirs && !revealing && (isExecuting || !activeRun?.metrics?.holdout_viirs);

  const quietMenu = (
    <>
      <MenuGroup title="Show">
        <MenuItem label="Hide the interface" hint="H" active={cleanHud} onClick={() => setCleanHud((h) => !h)} />
        <MenuItem label="Cinema" hint="C" active={cinemaActive} onClick={() => setCinemaActive((c) => !c)} />
        {/* The stage draws the uncertainty layer and filters by fire power on simulated runs only. */}
        {!runIsReal && (
          <MenuItem label="Uncertainty" hint="U" active={showUncertainty} onClick={() => setShowUncertainty((u) => !u)} />
        )}
      </MenuGroup>
      <MenuGroup title="View">
        {WORKSPACE_VIEWS.map((v) => (
          <MenuItem key={v.mode} label={v.label} active={workspaceMode === v.mode} onClick={() => selectWorkspaceMode(v.mode)} />
        ))}
        {workspaceMode === 'cutaway' && (
          <VernierScrubber
            label="Curtain"
            valueText={cutawaySplit === null ? 'auto sweep' : `${Math.round(((cutawaySplit + 1) / 2) * 100)}%`}
            fraction={cutawaySplit === null ? 0.5 : (cutawaySplit + 1) / 2}
            onChangeFraction={(u) => setCutawaySplit(u * 2 - 1)}
            onResetAuto={cutawaySplit !== null ? () => setCutawaySplit(null) : undefined}
          />
        )}
        {workspaceMode === 'observer' && (
          <>
            {OBSERVER_FILTERS.map((f) => (
              <MenuItem key={f.id} label={`Sensor: ${f.label}`} active={observerFilter === f.id} onClick={() => setObserverFilter(f.id)} />
            ))}
            {!runIsReal && (
              <VernierScrubber
                label="Minimum fire power"
                valueText={`${Math.round(sensitivityThreshold * 38)} MW`}
                fraction={(sensitivityThreshold - 0.04) / 0.78}
                onChangeFraction={(u) => setSensitivityThreshold(0.04 + u * 0.78)}
              />
            )}
          </>
        )}
      </MenuGroup>
      <MenuGroup title="Camera">
        {(['overview', 'canyon', 'ridge', 'nadir'] as const).map((preset) => (
          <MenuItem
            key={preset}
            label={preset.charAt(0).toUpperCase() + preset.slice(1)}
            active={cameraPreset === preset}
            onClick={() => setCameraPreset(preset)}
          />
        ))}
      </MenuGroup>
      <MenuGroup title="This run">
        <p className="iso-menu__fact">
          Terrain: Esri World Imagery at {orthoShort.replace(/^(Maxar|Esri)\s*/, '')}, elevation {demShort}
        </p>
        <p className="iso-menu__fact">Frame rate: {stageFps} fps</p>
        <p className="iso-menu__fact">
          Pipeline: {activeRun ? `${completedStages} of ${pipelineStageCount} stages, ${totalPipelineMs.toLocaleString()} ms` : 'pending'}
        </p>
        {workspaceMode === 'observer' && liveTelemetry && !runIsReal && (
          <p className="iso-menu__fact">
            Footprints: {liveTelemetry.retainedFootprints} of {liveTelemetry.poolFootprints}, {liveTelemetry.observableFluxPct}% of flux
          </p>
        )}
        <MenuItem label="Export GeoJSON" href={exportGeoJsonUrl} download={`${activeRun?.region.id ?? activeTheaterId}_${sourceSlug}_harmonized.geojson`} />
        <MenuItem label="Export CSV" href={exportCsvUrl} download={`${activeRun?.region.id ?? activeTheaterId}_${sourceSlug}_harmonized.csv`} />
      </MenuGroup>
      <MenuGroup title="Keys">
        <p className="iso-menu__keys">
          <span><kbd>0</kbd> to <kbd>3</kbd> parts</span>
          <span><kbd>Space</kbd> play</span>
          <span><kbd>&larr;</kbd> <kbd>&rarr;</kbd> pass</span>
          <span><kbd>V</kbd> hide, reveal</span>
          <span><kbd>/</kbd> place</span>
          <span><kbd>N</kbd> next place</span>
          <span><kbd>M</kbd> sensors</span>
          <span><kbd>Esc</kbd> back</span>
        </p>
      </MenuGroup>
    </>
  );

  // A simulated run's callouts only: a real run shows no scenario callouts.
  const finding = selectedFinding && !runIsReal && (
    <div className="iso-finding">
      <div className="iso-finding__head">
        <span>{selectedFinding.title}</span>
        <button type="button" className="iso-finding__close" onClick={() => setSelectedFinding(null)} aria-label="Dismiss finding">
          Close
        </button>
      </div>
      <p className="iso-finding__sub">{selectedFinding.subtitle}</p>
      <p className="iso-finding__val">{selectedFinding.valueText}</p>
    </div>
  );

  // The workspace's shared state for the beats (app/store.tsx). The shell owns the state and the requests.
  const recordPlace: RecordPlace = recordBox
    ? { kind: 'box', box: recordBox.box, name: recordBox.name }
    : { kind: 'region', regionId: calendarRegionId, name: regionTitle };
  const chooseFire = (place: Place, fire: FeaturedFire) => {
    setRecordBox(null);
    setPlacesOpen(false);
    setSelectedMonth(fire.months[0] ?? null);
    if (!fire.default_start) return;
    if (place.id === calendarRegionId) {
      if (realStart === fire.default_start) return;
      void executeWorldModel({
        regionId: place.id,
        holdoutViirs: false,
        cloudOverride: null,
        enterWorkspace: false,
        source: 'firms',
        start: fire.default_start,
      });
    } else if (isKnownTheaterId(place.id)) {
      fireStartRef.current = { region: place.id, start: fire.default_start };
      slewToTheater(place.id);
    }
  };
  const store: WorkspaceStore = {
    places: placesState.places,
    currentFire: activeRun && realStart ? fireOfStart(placesState.places, activeRun.region.id, realStart)?.id ?? null : null,
    place: { regionId: calendarRegionId, title: regionTitle, area: calendarArea },
    calendar: {
      place: recordPlace,
      placesOpen,
      openPlaces: () => setPlacesOpen(true),
      closePlaces: () => setPlacesOpen(false),
      chooseFire,
      chooseBox: (box: Box) => {
        setRecordBox({ box, name: boxWords(box) });
        setPlacesOpen(false);
      },
      canOpen: (ym: string, rec: FireRecord) => rec.place.kind === 'region' && rec.runStarts.some((st) => st.start.startsWith(ym)),
      openMonth: (ym: string, rec: FireRecord) => {
        if (rec.place.kind !== 'region') return;
        handleSelectMonth(ym);
        goStep('fire');
      },
      state: calendar,
      selectedMonth,
      stageMonth,
      selectMonth: handleSelectMonth,
      openArea: () => setAreaOpen(true),
    },
    run: {
      active: activeRun,
      isReal: runIsReal,
      realStart,
      pendingStart,
      failed: realFailed,
      span,
      beforeSharp: noSharp,
      model: runModel,
      intensity,
      source: sourceSlug,
    },
    test: {
      hidden: holdoutViirs,
      revealed,
      revealing,
      loading: blindLoading,
      score: blindTest,
      act: testAction,
      openScore: () => setDebriefOpen(true),
    },
    time: { pass: activeEpoch, powerMw: currentMw },
    round: {
      state: round,
      start: roundEpisode,
      end: roundEnd,
      runError: realFailed && realFailed.start === roundEpisode.estimate.start ? realFailed.message : null,
      next: nextLook,
    },
    step,
    goStep,
    blocked: stepBlocked,
  };
  const beatPanel = step === 'look' ? <TestWorldBeat /> : <WorldModelBeat>{finding}</WorldModelBeat>;

  return (
    <WorkspaceProvider value={store}>
    <div className="iso-app" data-workspace={inWorkspace ? 'true' : 'false'} data-sel={selStyle}>
      {!inWorkspace && (
        <LandingComposition
          imageryCredit={credit}
          parts={landingParts}
          onOpenPart={openPart}
          realPass={stageTelemetry?.realPass ?? null}
          onOpenSearch={() => setAskOpen(true)}
          onOpenSensor={() => setReading('sensors')}
          onOpenMethod={() => setReading('method')}
          onEnter={() => {
            enterWorkspace('cutaway');
            setStep('record');
            setPlacesOpen(true);
          }}
        />
      )}

      {inWorkspace && (
        <>
          {cleanHud && (
            <button type="button" className="iso-restore" onClick={() => setCleanHud(false)}>
              <kbd>H</kbd>
              <span>Show the interface</span>
            </button>
          )}

          <div className="iso-ws" data-clean={cleanHud ? 'true' : 'false'} data-step={step} data-debrief={debriefOpen ? 'true' : 'false'}>
            <div className="iso-ws__scrim iso-ws__scrim--top" aria-hidden="true" />
            <div className="iso-ws__scrim iso-ws__scrim--right" aria-hidden="true" />
            <div className="iso-ws__scrim iso-ws__scrim--bottom" aria-hidden="true" />

            <WorkspaceBar
              place={regionTitle}
              placeDetail={[regionSetting, `${regionLat} ${regionLon}`, elevRangeText].filter(Boolean).join(', ')}
              placeDates={span}
              onPlace={() => {
                goStep('record');
                setPlacesOpen(true);
              }}
              beat={beatOfStep(step)}
              onBeat={goBeat}
              beatBlocked={beatBlocked}
              onReading={() => setReading('method')}
              onLanding={exitToOverview}
              menu={quietMenu}
            />

            {/* Wide screens: no box (display: contents). Under 960 px: the scrolling bottom half. */}
            {step === 'record' && <CalendarBeat />}
            <div className="iso-ws__dock" hidden={step === 'record'}>
              {debriefOpen && blindTest ? (
                <Debrief
                  score={blindTest}
                  model={blindModel}
                  place={regionTitle}
                  onBack={() => setDebriefOpen(false)}
                  onNext={lookHere ? () => goStep('look') : null}
                  onEvidence={() => setEvidenceOpen(true)}
                  terra={null}
                  terraOpen={terraOpen}
                  onToggleTerra={() => setTerraOpen((o) => !o)}
                />
              ) : (
                <aside className="iso-step" data-step={step} aria-label={beatOf(beatOfStep(step)).name}>
                  {beatPanel}
                </aside>
              )}

              {!round && (
                <div className="iso-ws__track">
                  <PassTrack
                    run={activeRun}
                    passLists={passLists}
                    state={trackState}
                    revealed={trackRevealed}
                    timeProgress={timeProgress}
                    onChangeTime={(next) => {
                      setPlaying(false);
                      setTimeProgress(next);
                    }}
                    playing={playing}
                    onTogglePlay={() => setPlaying((p) => !p)}
                  />
                </div>
              )}
            </div>
          </div>

          {round && roundRun && activeRun && (
            <TileOverlay
              rect={nadirRect(roundFrame(viewportWidth), activeRun.region.width_km / Math.max(1e-6, activeRun.region.depth_km))}
              rows={roundTiles}
              cols={roundCols}
              round={round}
              canPick={Boolean(roundEnv) && !round.done && !round.awaitingNext && round.picks.filter((p) => p.tile !== null).length < roundEpisode.episode.budget}
              onPick={pickTile}
            />
          )}

          <button type="button" className="iso-credit" onClick={() => setReading('credits')} title="Imagery credit and sources">
            Imagery: {credit}
          </button>
        </>
      )}

      {/* The stage comes after the interface in DOM order so Tab reaches the triggers first;
          stacking is by z-index, not order. */}
      <div className="iso-stage-clip" data-workspace={inWorkspace ? 'true' : 'false'}>
        <EarthCutawayStage
          apiBase={API_BASE}
          inWorkspace={inWorkspace}
          mode={round ? 'reconstruction' : effectiveMode}
          activeTheaterId={activeTheaterId}
          activeRun={stageRun}
          timeProgress={timeProgress / 23}
          observerFilter={observerFilter}
          showUncertainty={showUncertainty}
          holdoutViirs={round ? !round.done : holdoutViirs}
          sensitivityThreshold={sensitivityThreshold}
          cutawaySplit={cutawaySplit}
          cameraPreset={cameraPreset}
          cinemaActive={cinemaActive}
          cleanHud={cleanHud}
          slewRequest={slewRequest}
          selectedFindingId={selectedFinding?.id ?? null}
          onSelectFinding={runIsReal ? undefined : setSelectedFinding}
          onEnterWorkspace={() => enterWorkspace('cutaway')}
          onCinemaStepTheater={handleCinemaStepTheater}
          onTelemetry={handleTelemetry}
          landingView="world"
          landingSubjectFrame={narrowViewport ? LANDING_CALM_BAND_NARROW : LANDING_CALM_BAND}
          workspaceSubjectFrame={round ? roundFrame(viewportWidth) : workspaceFrame(viewportWidth)}
        />
      </div>

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
        onExecute={handlePaletteExecute}
      />

      <AreaSheet
        open={areaOpen}
        onClose={() => setAreaOpen(false)}
        apiBase={API_BASE}
        centre={{ lat: calendarArea.lat, lon: calendarArea.lon }}
        onOpenMonth={openAreaMonth}
      />

      <EvidenceSheet
        open={evidenceOpen}
        onClose={() => {
          setEvidenceOpen(false);
          setEvidenceFocus(null);
        }}
        focus={evidenceFocus}
        doc={evidenceLive}
        state={evidenceState}
      />

      <ReadingSheet
        section={reading}
        onSection={setReading}
        onClose={() => setReading(null)}
        imageryCredit={credit}
        verticalExaggeration={stageTelemetry?.verticalExaggeration ?? null}
        apiBase={API_BASE}
        regionId={calendarRegionId}
        regionName={regionTitle}
        sensorModel={sensorModel}
        overlap={calendar.cal?.overlap ?? null}
        overlapPlace={calendar.cal && !calendar.cal.simulated ? calendar.cal.regionName.split(',')[0] : null}
        evidence={{
          real: runIsReal,
          model: runModel,
          overlap: calendar.cal?.overlap ?? null,
          overlapPlace: calendar.cal && !calendar.cal.simulated ? calendar.cal.regionName.split(',')[0] : null,
          interval:
            blindInterval && blindInterval.intervalCovered !== null && blindInterval.intervalN !== null
              ? { covered: blindInterval.intervalCovered, n: blindInterval.intervalN, level: blindInterval.intervalLevel }
              : null,
        }}
      />
    </div>
    </WorkspaceProvider>
  );
}
