import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReconstructRequestParams } from './components/CommandAskPalette';
import type { ReadingSection } from './components/ReadingSheet';
import type { EvidenceDoc, EvidenceState } from './content/evidence';
import { PassTrack } from './components/PassTrack';
const CommandAskPalette = lazy(() =>
  import('./components/CommandAskPalette').then((m) => ({ default: m.CommandAskPalette })),
);
const ReadingSheet = lazy(() =>
  import('./components/ReadingSheet').then((m) => ({ default: m.ReadingSheet })),
);
const EvidenceSheet = lazy(() =>
  import('./components/EvidenceSheet').then((m) => ({ default: m.EvidenceSheet })),
);
const AreaSheet = lazy(() =>
  import('./components/AreaSheet').then((m) => ({ default: m.AreaSheet })),
);
const Debrief = lazy(() =>
  import('./components/Debrief').then((m) => ({ default: m.Debrief })),
);
// The pictures of the world over the page (the Earth's years, the test across the world, the sealed predictions).
const WorldScreens = lazy(() => import('./world/WorldScreens').then((m) => ({ default: m.WorldScreens })));
import { type Step } from './components/WorkspaceBar';
import type { TrailWord } from './guide/Trail';
import { LocatorBar } from './identity/LocatorBar';
import { StoryLine } from './identity/StoryLine';
import { RevealSweep } from './identity/RevealSweep';
import { Entry } from './identity/Entry';
import { stageReady } from './stage/stageReady';
import type { StageThingBox } from './stage/earthCutawayTypes';
import { usePlay, type PlayShot } from './ui/usePlay';
import { agentWalkDone, startAgentWalk, stopAgentWalk } from './walk/agentWalk';
import { AgentWalkLine } from './walk/AgentWalkLine';
import type { StoryPart } from './identity/story';
import { WORDS } from './identity/words';
import { GuideStrip } from './guide/GuideStrip';
import { PassStrip } from './guide/PassStrip';
import { useGuide, type Guide } from './guide/useGuide';
import { keyMatches, says, stateOf } from './guide/script';
import { StageBoundary } from './ui/StageBoundary';
// Read first: the pictures' keys listen before any screen of the page installs its own.
import './world/keys';
import { closeWorldScreen, openWorldScreen, useWorldScreen, worldScreenOnShow } from './world/screens';
import { useWorldFirstYear, useWorldYears } from './guide/world';
import { dayPictureCredit, nextDayPicture, type DayPictureKind } from './guide/dayPicture';
import { openingHiddenPass, type OpeningFrame } from './app/openingPass';
import { BEATS, type BeatId } from './app/names';
import { WorkspaceProvider, type WorkspaceBase, type WorkspaceStore } from './app/store';
import { CalendarBeat } from './beats/calendar/CalendarBeat';
import { useRecordView } from './beats/calendar/recordView';
import { usePlayersView } from './beats/agent/playersView';
import { WorldModelScene } from './beats/world-model/WorldModelScene';
import { isClosedWindow } from './beats/world-model/fire';
import { PlayScene } from './beats/test-world/PlayScene';
import { AgentBeat } from './beats/agent/AgentBeat';
import { revealedPassesOf, type TrackState } from './content/passTrack';
import { partsStatus, type PartId } from './content/partsStatus';
import { useRound, type RoundApi, type RoundFire } from './beats/test-world/useRound';
const EarthCutawayStage = lazy(() => import('./stage/EarthCutawayStage'));
import {
  THEATER_CATALOG,
  type EarthStageTelemetry,
  type StageFireAnchor,
  type InspectorCameraPreset,
  type OrbitalSlewRequest,
  type TheaterId,
} from './stage/earthCutawayTypes';
import { plainText } from './ui/plainText';
import { useSensorModel } from './ui/useSensorModel';
import { LandingComposition } from './ui/LandingComposition';
import { playCue } from './audio';
import { imageryCredit } from './ui/attribution';
import { useCalendar } from './ui/useCalendar';
import { fireOfStart, openingStart, registryStartOf, usePlaces, type Box, type FeaturedFire, type Place } from './app/places';
import type { FireRecord, RecordPlace } from './beats/calendar/record';
import { boxWords } from './beats/calendar/placeWords';
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
import { THEATER_DISPLAY } from './content/theaters';
import type {
  DynamicRegionRun,
  ObserverFilter,
  TerrainFindingCallout,
  WorkspaceMode,
} from './stage/types';

import { answerSourceLine, API_BASE, assetUrl, assetUrlNow, getJson, onAnswerSource, postJson, recordedProvenance, runRequestBody, TRANSPORT } from './lib/api';
import type { AnswerSource } from './lib/browserModel';

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
 * Where the slab sits during a round: the whole width, clear of the bar, of what the round is at the top left and of
 * the readout and keys along the bottom. Under 960 px the top half.
 */
function roundFrame(width: number) {
  // A phone: the board under the trail and the pass's label, above the guide's sentence and actions.
  if (width < 600) return { left: 0.02, top: 0.26, right: 0.98, bottom: 0.73 };
  if (width < 960) return { left: 0.0, top: 0.12, right: 1.0, bottom: 0.5 };
  return { left: 0.04, top: 0.14, right: 0.96, bottom: 0.84 };
}

function workspaceFrame(width: number) {
  if (width < 960) return { left: 0.0, top: 0.12, right: 1.0, bottom: 0.5 };
  const gutter = Math.min(36, Math.max(20, width * 0.02));
  const right = 1 - (360 + 2 * gutter + 24) / width;
  // One panel at the right and the pass track along the bottom (about 170 px plus the gutter).
  return { left: 0.0, top: 0.08, right: Math.max(0.5, right), bottom: 0.76 };
}

/**
 * World model on a real run: no column, so the fire takes the width, low enough for its label to hang above it. On a
 * narrow screen, the part the words leave free: under the objective and the trail, above the guide's sentence.
 */
function modelFrame(width: number) {
  // A phone: under the fire's label (which hangs under the trail), above the guide's sentence.
  if (width < 600) return { left: 0.03, top: 0.3, right: 0.97, bottom: 0.6 };
  if (width < 960) return { left: 0.03, top: 0.2, right: 0.97, bottom: 0.58 };
  return { left: 0.04, top: 0.2, right: 0.96, bottom: 0.78 };
}

interface LiveObserverTelemetry {
  sensor: string;
  retainedFootprints: number;
  poolFootprints: number;
  meanAreaKm2: number;
  observableFluxPct: number;
  reconstructedMw: number;
}

/**
 * The places the page can open: every place the registry serves (`GET /api/regions`), and the typed catalogue's until the
 * registry has answered. Nothing here assumes a number of places: a place the registry adds opens like the others.
 */
/** Play's two shots of the Earth's years, as the film takes them. */
const YEARS_COUNTED = { view: 'counted', from: 2010, until: 2012, play: true } as const;
const YEARS_ONE_SCALE = { view: 'onescale', from: 2010, until: 2012, play: true } as const;

const KNOWN_PLACES = new Set<string>(THEATER_CATALOG.map((t) => t.id));
function isKnownTheaterId(value: string | undefined): value is TheaterId {
  return value !== undefined && KNOWN_PLACES.has(value);
}

/** How long a pass holds while the passes play, ms. */
const PASS_HOLD_MS = 1500;

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
  const [observerFilter] = useState<ObserverFilter>('all');
  const [showUncertainty, setShowUncertainty] = useState<boolean>(true);
  const [sensitivityThreshold] = useState<number>(0.22);
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
  /** The real run asked for last that did not load: its place and start, whether it was the reveal, and the request. */
  const [realFailed, setRealFailed] = useState<{ start: string; regionId: string; reveal: boolean; message: string; params: ReconstructRequestParams } | null>(null);
  /**
   * The blind test: hiding VIIRS requests the blind run; the reveal keeps that run on the terrain with its hidden
   * detections laid on (`withReveal`) and its own score in the table. The reveal never swaps in another run.
   */
  const [revealed, setRevealed] = useState(false);
  /** The reveal's request is in flight. */
  const [revealing, setRevealing] = useState(false);
  /** After the reveal: one fire three ways in the stage's place. */
  const [threeWays, setThreeWays] = useState(false);
  useEffect(() => {
    if (!revealed) setThreeWays(false);
  }, [revealed]);
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
  /** The step as the run requests see it when their answer arrives. */
  const stepRef = useRef<Step>('fire');
  stepRef.current = step;
  const [debriefOpen, setDebriefOpen] = useState(false);
  /** After a round: the script's last words (step "finish") on the stage. */
  const [finishOpen, setFinishOpen] = useState(false);
  /** The key of marks is open; the estimate's squares sized by chance are drawn (off at rest). */
  const [marksOpen, setMarksOpen] = useState(false);
  const [chanceOn, setChanceOn] = useState(false);
  /** The strip of passes: picked open from the fire's label, and the pointer near the screen's foot. */
  const [stripOpen, setStripOpen] = useState(false);
  const [nearFoot, setNearFoot] = useState(false);
  /** Sentences said on demand in place of the standing ones, for the state they were asked in. */
  const [said, setSaid] = useState<{ key: string; lines: string[] } | null>(null);
  /** A new try at the Record after it failed to load: it is mounted afresh. */
  const [recordTry, setRecordTry] = useState(0);
  /** NASA's photograph of the box for the day of the pass on show, on Estimate and Test (guide/dayPicture.ts). */
  const [dayPicture, setDayPicture] = useState<DayPictureKind | null>(null);
  const telemetryRef = useRef<EarthStageTelemetry | null>(null);
  /** How a selected item is marked, from the address (?sel=chip|square|box); chip unless it says otherwise. */
  /**
   * The film presentation (any `film` in the address): a state's film caption stands in the objective's place and the
   * guide's sentences are off (the script's reading of `film`).
   */
  // The film presentation: from the address (a recorder's link), or while Play tells the story by itself.
  const filmByAddress = useMemo(() => new URLSearchParams(window.location.search).has('film'), []);
  const [filmMode, setFilmMode] = useState(filmByAddress);
  useEffect(() => {
    document.documentElement.classList.toggle('iso-film', filmMode);
  }, [filmMode]);
  const selStyle = useMemo(() => {
    const v = new URLSearchParams(window.location.search).get('sel');
    return v === 'square' || v === 'box' ? v : 'chip';
  }, []);
  /** The evidence sheet, read from GET /api/evidence. */
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  /** Any area's record. A month picked there opens its region and month here. */
  const [areaOpen, setAreaOpen] = useState(false);
  const openedSheetsRef = useRef({ ask: false, area: false, evidence: false, reading: false });
  const [monthAsk, setMonthAsk] = useState<{ region: string; ym: string } | null>(null);
  /** The place screen over the Calendar, and a box drawn on it (its record replaces the place's). */
  const [placesOpen, setPlacesOpen] = useState(false);
  /** The place screen was opened to draw an area (Finish's "Draw your own area"): it opens ready to draw. */
  const [placesDraw, setPlacesDraw] = useState(false);
  useEffect(() => {
    if (!placesOpen) setPlacesDraw(false);
  }, [placesOpen]);
  /**
   * The picture of the world over the page, if any (world/screens.ts): the Earth's years, the test across the world or
   * the sealed predictions. It draws its own trail and guide and takes every key while it shows; Escape closes it back
   * to what is under it, which stays as it was.
   */
  const worldScreen = useWorldScreen();
  /** The last press came from a touch screen: a tap on the round's board marks a square before a look. */
  const touchRef = useRef(false);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      touchRef.current = e.pointerType === 'touch';
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);
  /**
   * The stage is mounted once no picture of the world covers the page: a page opened on a picture (its address, or
   * ?years) loads and draws no ground under it until it closes. Once mounted, it stays.
   */
  const [stageOn, setStageOn] = useState(() => worldScreenOnShow() === null && !new URLSearchParams(window.location.search).has('years'));
  useEffect(() => {
    // The picture on show now, not this render's; and ?years, whose own effect (below) opens its picture.
    if (!stageOn && worldScreenOnShow() === null && !new URLSearchParams(window.location.search).has('years')) setStageOn(true);
  }, [stageOn, worldScreen]);
  const [recordBox, setRecordBox] = useState<{ box: Box; name: string } | null>(null);
  /** A featured fire chosen on the place screen: its start replaces the place's opening start once. */
  const fireStartRef = useRef<{ region: string; start: string } | null>(null);
  const [liveTelemetry, setLiveTelemetry] = useState<LiveObserverTelemetry | null>(null);
  /** Where the stage says the fire on show sits, passed on to World model's scene without redrawing the shell. */
  const anchorListeners = useRef(new Set<(a: StageFireAnchor | null) => void>());
  const emitAnchor = useCallback((a: StageFireAnchor | null) => anchorListeners.current.forEach((fn) => fn(a)), []);
  const subscribeAnchor = useCallback((fn: (a: StageFireAnchor | null) => void) => {
    anchorListeners.current.add(fn);
    return () => {
      anchorListeners.current.delete(fn);
    };
  }, []);
  /** The round's marked square as the stage boxes it (its things, G66), passed on to the round's scene the same way. */
  const markedBoxListeners = useRef(new Set<(b: StageThingBox | null) => void>());
  const subscribeMarkedBox = useCallback((fn: (b: StageThingBox | null) => void) => {
    markedBoxListeners.current.add(fn);
    return () => {
      markedBoxListeners.current.delete(fn);
    };
  }, []);
  const onThings = useCallback((boxes: Record<string, StageThingBox | null>) => {
    const b = boxes.square ?? null;
    markedBoxListeners.current.forEach((fn) => fn(b));
  }, []);
  /** The guide on show and its commands, for the key handler defined before them. */
  const guideRef = useRef<Guide | null>(null);
  const runCommandRef = useRef<(command: string) => void>(() => {});
  const marksOpenRef = useRef(false);
  /** The guide's field for asking, for the key that puts the focus in it. */
  /** The round of Test world (beats/test-world/useRound.ts), for the callbacks defined before it. */
  const roundRef = useRef<RoundApi | null>(null);
  // The places registry: the default fire, each place's opening start, and the recorded test fires.
  const placesState = usePlaces();
  /**
   * A window of a recorded test fire is never hidden, revealed or scored again. Until the registry has answered, no
   * window can be hidden.
   */
  const placesRef = useRef(placesState);
  placesRef.current = placesState;
  // Every place the registry serves can be opened, however many there are.
  for (const pl of placesState.places.places) KNOWN_PLACES.add(pl.id);
  const hideRefused = useCallback(
    (regionId: string, start: string | null) =>
      placesRef.current.state !== 'ready' || isClosedWindow(placesRef.current.places, regionId, start),
    [],
  );

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

  /**
   * The way in from the landing, by Enter or its entry: the Record of the fire on show, the trail's first step. Choose a
   * Place opens only when asked for (P, or the place beside the trail).
   */
  const enterRecord = useCallback(() => {
    enterWorkspace('cutaway');
    setStep('record');
    setPlacesOpen(false);
  }, [enterWorkspace]);
  // The address ?years opens the Earth's years at once over the Record's step, so Escape goes back to the Record; in
  // the film they play once by themselves. The pictures' own addresses (?world=years, test, sealed) open over the page.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('years')) return;
    url.searchParams.delete('years');
    window.history.replaceState(window.history.state, '', url.href);
    enterRecord();
    openWorldScreen('years', url.searchParams.has('film') ? { play: true } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exitToOverview = useCallback(() => {
    setPlaying(false);
    setCinemaActive(false);
    setCleanHud(false);
    setReading(null);
    setDebriefOpen(false);
    roundRef.current?.leave();
    setCutawaySplit(null);
    setSelectedFinding(null);
    setInWorkspace(false);
  }, []);

  const executeWorldModel = useCallback(
    async (asked: ReconstructRequestParams): Promise<boolean> => {
      // A held-out run or a reveal on a recorded test fire's window is never asked for: the run with every satellite is.
      const closed =
        asked.source === 'firms' && Boolean(asked.start) && Boolean(asked.regionId) && hideRefused(asked.regionId ?? '', asked.start ?? null);
      const params = closed && (asked.holdoutViirs || asked.reveal) ? { ...asked, holdoutViirs: false, reveal: false } : asked;
      // Nothing simulated is ever asked for: a run is a place's real rows from a start, or nothing.
      if (params.source !== 'firms' || !params.start || !params.regionId) return false;
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
        // A real run's body comes from the one builder in the client (contract item 20), so a recorded page finds it.
        const body = { ...runRequestBody(params.regionId, params.start, params.holdoutViirs ? 'VIIRS' : null, Boolean(params.reveal)) };
        const runData = await postJson<DynamicRegionRun>('/api/reconstruct', body, { signal: controller.signal });
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
        // World model looks at its fire from close by; elsewhere a new run opens on the overview. A reveal keeps the camera.
        if (!params.reveal)
          setCameraPreset(
            stepRef.current === 'fire' || stepRef.current === 'test' ? 'canyon' : stepRef.current === 'look' || stepRef.current === 'agent' ? 'region' : 'overview',
          );
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
        if (realStartParam)
          setRealFailed({ start: realStartParam, regionId: params.regionId, reveal: Boolean(params.reveal), message: msg.replace(/\.$/, ''), params });
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
    [inWorkspace, activeTheaterId, hideRefused],
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

  const handleCinemaStepTheater = useCallback(
    (nextTheaterId: TheaterId) => {
      // The tour steps only to places with a real fire record: never a simulated region.
      const real = placesRef.current.places.places.some((p) => p.id === nextTheaterId && p.featured_fires.some((f) => f.default_start));
      if (!real) return;
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
        if (params.enterWorkspace) {
          // A place opened from search opens on Estimate: its held-out run is asked for (the region's ask hides on
          // Estimate wherever the window can be hidden) and it opens on its hidden pass; a recorded test fire or a year
          // before the sharp satellite opens with every satellite, as Estimate says.
          roundRef.current?.leave();
          enterWorkspace('cutaway');
          setStep('test');
          // On a hidden pass of that place's own run, once it is in (not of the run on show while it comes).
          openingDueRef.current = params.theaterId;
        }
        return true;
      }
      return executeWorldModel(params);
    },
    [slewToTheater, enterWorkspace, executeWorldModel],
  );

  const toggleHoldoutLive = useCallback(() => {
    // Before 2012 no sharp satellite flew: nothing to hide, so no blind test. A recorded test fire is not tested again.
    if (beforeSharpSatellite(activeRun)) return;
    if (hideRefused(activeRun?.region.id ?? activeTheaterId, realStart)) return;
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
  }, [holdoutViirs, revealed, revealing, activeRun, activeTheaterId, cloudOverride, executeWorldModel, realStart, hideRefused]);


  // Burning calendar: real when the backend serves FIRMS for this region, otherwise simulated. It
  // follows the region asked for, so opening a region can read its start list before any run arrives.
  const calendarRegionId = regionAsk?.id ?? activeRun?.region.id ?? activeTheaterId;
  const calendar = useCalendar(API_BASE, calendarRegionId);
  // On a page of recorded answers, this month so far is what the recording holds for the place: the day its answer stood
  // at (the last day it counted), asked for once, so the guide's action can say that day or be left out.
  const [recordedNow, setRecordedNow] = useState<{ place: string; day: string | null } | null>(null);
  useEffect(() => {
    if (TRANSPORT !== 'recorded' || recordedNow?.place === calendarRegionId) return;
    let live = true;
    getJson<{ days?: { last?: string } }>('/api/calendar/current', { source: 'firms', region_id: calendarRegionId })
      .then((b) => live && setRecordedNow({ place: calendarRegionId, day: typeof b?.days?.last === 'string' ? b.days.last : null }))
      .catch(() => live && setRecordedNow({ place: calendarRegionId, day: null }));
    return () => {
      live = false;
    };
  }, [calendarRegionId, recordedNow?.place]);

  // A region with real run starts opens on its default start. Each ask is handled once, after its calendar is in.
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
        ? chosen ?? openingStart(placesState.places, regionAsk.id)
        : null;
    if (opening) {
      // On the landing, and on Estimate (a place stepped to with N, or opened from search), the fire is shown as the
      // model saw it: the sharp satellite hidden wherever its window can be (from 2012, not a recorded test fire), so
      // what lights up is what the model was given, and Estimate has its held-out run to show.
      const hideable = (!inWorkspace || step === 'test') && Number(opening.slice(0, 4)) >= 2012 && !hideRefused(regionAsk.id, opening);
      // The run on show already is the one wanted: nothing to ask.
      const shownHidden = activeRun?.metrics?.holdout_viirs === true;
      if (isRealRun(activeRun) && activeRun?.region.id === regionAsk.id && realStart === opening && shownHidden === hideable) return;
      void executeWorldModel({
        regionId: regionAsk.id,
        holdoutViirs: hideable,
        cloudOverride: null,
        enterWorkspace: false,
        source: 'firms',
        start: opening,
      });
    }
    // A place with no real rows, or without a start from the registry, opens nothing new: never a simulated run.
  }, [regionAsk, calendar, placesState, activeRun, realStart, executeWorldModel, inWorkspace, hideRefused, step]);

  /** Selecting a month that has a real run requests it; the stage replays whatever comes back. */
  const handleSelectMonth = useCallback(
    (ym: string) => {
      setSelectedMonth(ym);
      if (!calendar.cal || calendar.cal.simulated) return;
      const month = calendar.cal.months.find((m) => m.yearMonth === ym);
      const pre = startBeforeSharp(ym, month?.modis ?? null);
      const start = startForMonth(ym, calendar.runStarts, registryStartOf(placesState.places, calendarRegionId, ym)) ?? pre;
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
    [calendar, realStart, pendingStart, calendarRegionId, holdoutViirs, executeWorldModel, placesState],
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

  // Test world: a round on the fire that is open (its place and start), its state in beats/test-world/useRound.ts.
  const showFrame = useCallback((frame: number) => {
    setPlaying(false);
    setTimeProgress(frame);
  }, []);
  const requestBlindRun = useCallback(
    (f: RoundFire) => {
      setRevealed(false);
      setPlaying(false);
      setCinemaActive(false);
      setCleanHud(false);
      setSelectedFinding(null);
      void executeWorldModel({ regionId: f.regionId, holdoutViirs: true, cloudOverride: null, enterWorkspace: false, source: 'firms', start: f.start });
    },
    [executeWorldModel],
  );
  const restoreRun = useCallback(
    (f: RoundFire) => {
      void executeWorldModel({ regionId: f.regionId, holdoutViirs: false, cloudOverride: null, enterWorkspace: false, source: 'firms', start: f.start });
    },
    [executeWorldModel],
  );
  const rnd = useRound({ activeRun, activeStart: realStart, requestBlindRun, restoreRun, showFrame });
  roundRef.current = rnd;
  const round = rnd.state;
  const { leave: leaveRound, next: nextLook, begin: beginRound } = rnd;
  const startRound = useCallback(() => {
    if (!activeRun || !realStart || !isRealRun(activeRun)) return;
    beginRound({ regionId: activeRun.region.id, start: realStart });
  }, [activeRun, realStart, beginRound]);

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
      // A round or a test on a recorded test fire, or where nothing can be hidden: not played or run.
      const nothingToHide = !isRealRun(activeRun) || beforeSharpSatellite(activeRun) || hideRefused(activeRun?.region.id ?? '', realStart);
      // While a run is on its way (the landing's, a fire just chosen), the test waits for it rather than being refused;
      // the hide refuses a closed window or a year before VIIRS by itself once the run is in.
      const runInFlight = isExecuting || !activeRun;
      if ((next === 'look' || next === 'agent') && step !== next && nothingToHide) {
        // A recorded test fire or a window before the sharp satellite: Play opens and the guide says why no round is
        // played. Anything else (no real run yet) stays where it is.
        const closed = activeRun !== null && isRealRun(activeRun) && isClosedWindow(placesRef.current.places, activeRun.region.id, realStart);
        if (next === 'look' && (closed || beforeSharpSatellite(activeRun))) {
          setFinishOpen(false);
          setCameraPreset('region');
          setStep('look');
        }
        return;
      }
      if (next === 'test' && step !== 'test' && !holdoutViirs && !revealed && !runInFlight && nothingToHide) return;
      if (next === step && next !== 'look') return;
      // Leaving a round for World model keeps the round's held-out run: the test opens blind on it at once.
      setFinishOpen(false);
      // The key of marks and the squares sized by chance belong to Estimate and Test.
      if (next !== 'fire' && next !== 'test') {
        setMarksOpen(false);
        setChanceOn(false);
        setStripOpen(false);
      }
      // The players open over the round's end and keep it; anything else leaves the round.
      if ((step === 'look' || step === 'agent') && next !== 'look' && next !== 'agent' && round) leaveRound(next === 'test');
      if (next === 'record' || next === 'fire') {
        if (step === 'test') restoreFullRun();
      } else if (next === 'test') {
        // A run is on its way (a fire just chosen, a month just opened): the hide waits for it.
        if (!holdoutViirs && !revealed) {
          if (round || step === 'look' || runInFlight) pendingHideRef.current = true;
          else toggleHoldoutLive();
        }
      } else if (next === 'look') {
        setCameraPreset('region');
        // Back from the players to the round's end; otherwise a new round on the fire that is open.
        if (!(step === 'agent' && round?.done)) startRound();
      } else if (next === 'agent') {
        setCameraPreset('region');
      }
      if (inWorkspace && next !== step) playCue('step');
      setStep(next);
    },
    [step, inWorkspace, round, leaveRound, restoreFullRun, holdoutViirs, revealed, toggleHoldoutLive, startRound, hideRefused, activeRun, realStart, isExecuting],
  );

  /**
   * The one way into World model, from the bar, its key, Enter on the Calendar, V, Esc from a round or the Agent part:
   * VIIRS hidden where it can be hidden (a real run from 2012 on, not a recorded test fire), on the estimate's own view,
   * close to its fire. Elsewhere the run as it is.
   */
  const openModel = useCallback(() => {
    if (step === 'fire' || step === 'test') return setDebriefOpen(false);
    setWorkspaceMode('reconstruction');
    setCameraPreset('canyon');
    const blind =
      isExecuting || !activeRun || (isRealRun(activeRun) && !beforeSharpSatellite(activeRun) && !hideRefused(activeRun.region.id, realStart));
    goStep(blind ? 'test' : 'fire');
  }, [goStep, step, activeRun, realStart, hideRefused, isExecuting]);

  /** A part from the bar or its key: the Calendar, World model, a round, the players. */
  const goBeat = useCallback(
    (b: BeatId) => {
      if (b === 'calendar') goStep('record');
      else if (b === 'model') openModel();
      else if (b === 'world') goStep('look');
      else if (b === 'agent') goStep('look');
    },
    [goStep, openModel],
  );


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
      pendingStepRef.current = id === 'model' ? 'test' : 'look';
      enterWorkspace('cutaway');
      if (id === 'model') {
        setWorkspaceMode('reconstruction');
        setCameraPreset('canyon');
      }
    },
    [enterWorkspace],
  );

  // A test asked for while a round was closing waits for the region's run to come back, then hides VIIRS.
  useEffect(() => {
    if (!pendingHideRef.current || step !== 'test' || round || isExecuting || !activeRun || !isRealRun(activeRun)) return;
    pendingHideRef.current = false;
    if (!holdoutViirs && !revealed) toggleHoldoutLive();
  }, [step, round, isExecuting, activeRun, holdoutViirs, revealed, toggleHoldoutLive]);

  // Estimate opens on a hidden pass of the sharp satellite (app/openingPass.ts), whatever pass the landing's tour or
  // the step before stood on, once its blind run is in: the white frames are on screen from the first moment.
  // Due for the run on show (true), or for the run of the place named (a place opened from search or N, whose run is
  // still to come while the one before stays on show).
  const openingDueRef = useRef<boolean | string>(false);
  /** Test asked for from another step: the reveal waits for Estimate's opening hidden pass (below). */
  const revealDueRef = useRef(false);
  const stepBeforeRef = useRef(step);
  if (stepBeforeRef.current !== step) {
    if (step !== 'test') openingDueRef.current = false;
    // Left for another step before the reveal came: it is no longer due.
    if (step !== 'test' && step !== 'fire') revealDueRef.current = false;
    else if (!openingDueRef.current) openingDueRef.current = true;
    stepBeforeRef.current = step;
  }
  useEffect(() => {
    const due = openingDueRef.current;
    if (!due || step !== 'test' || round || isExecuting || pendingStart || !activeRun || !isRealRun(activeRun)) return;
    if (typeof due === 'string' && activeRun.region.id !== due) return;
    if (!holdoutViirs || revealed) {
      // That place's run came with every satellite (a recorded test fire, a year before the sharp satellite): no
      // hidden pass to open on.
      if (typeof due === 'string') openingDueRef.current = false;
      return;
    }
    openingDueRef.current = false;
    const run = activeRun as unknown as { observer_passes?: { frames?: OpeningFrame[] }; window?: { first_overpass_utc?: string } };
    const k = openingHiddenPass(run.observer_passes?.frames ?? [], run.window?.first_overpass_utc);
    if (k === null) return;
    setPlaying(false);
    setTimeProgress(k);
  }, [step, round, isExecuting, pendingStart, activeRun, holdoutViirs, revealed]);

  // Test asked for from another step: once Estimate stands on its opening hidden pass, the reveal (Test's start).
  const revealTimerRef = useRef(0);
  useEffect(() => {
    if (!revealDueRef.current || revealTimerRef.current) return;
    if (step !== 'test' && step !== 'fire') return;
    if (round || isExecuting || pendingStart || !activeRun || !isRealRun(activeRun) || openingDueRef.current) return;
    if (!holdoutViirs || revealed) {
      revealDueRef.current = false;
      return;
    }
    // One tick later, so the pass the opening chose is the one on show when the reveal reads it.
    revealTimerRef.current = window.setTimeout(() => {
      revealTimerRef.current = 0;
      revealDueRef.current = false;
      runCommandRef.current('go:test');
    }, 0);
  }, [step, round, isExecuting, pendingStart, activeRun, holdoutViirs, revealed, timeProgress]);

  /** V: on the test step it hides, then reveals, then opens the score; elsewhere it goes to the test. */
  const testAction = useCallback(() => {
    if (step !== 'test') return step === 'fire' ? goStep('test') : openModel();
    if (revealed) return setDebriefOpen(true);
    toggleHoldoutLive();
  }, [step, revealed, goStep, openModel, toggleHoldoutLive]);

  // Each reveal runs the identity's sweep once across the screen (identity/RevealSweep.tsx).
  const [revealRun, setRevealRun] = useState(0);
  const prevRevealedRef = useRef(revealed);
  useEffect(() => {
    if (revealed && !prevRevealedRef.current) {
      playCue('reveal');
      setRevealRun((n) => n + 1);
    }
    prevRevealedRef.current = revealed;
  }, [revealed]);


  // The strip of passes, from the run's own passes: the sharp satellite's taller, hidden ones dashed (until the reveal).
  const stripPasses = useMemo(() => {
    const fs = (activeRun as unknown as { observer_passes?: { frames?: Array<{ sensor?: string; held_out?: boolean }> } } | null)?.observer_passes?.frames ?? [];
    return fs.map((f) => ({ sharp: typeof f.sensor === 'string' && f.sensor.startsWith('VIIRS'), hidden: f.held_out === true && !revealed }));
  }, [activeRun, revealed]);
  // The pointer near the screen's foot shows the strip, while the guide speaks on Estimate or Test.
  useEffect(() => {
    if (!inWorkspace) return;
    const onMove = (e: PointerEvent) => {
      const near = e.clientY > window.innerHeight - 64;
      setNearFoot((was) => (was === near ? was : near));
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [inWorkspace]);

  // Playing the passes: each pass holds about a second and a half, then the next one; after the run's last, its first.
  const passCount = Math.max(1, (activeRun as unknown as { observer_passes?: { frames?: unknown[] } } | null)?.observer_passes?.frames?.length ?? 24);
  useEffect(() => {
    if (!inWorkspace || !playing) return;
    const id = window.setInterval(() => {
      setTimeProgress((prev) => {
        const next = Math.round(prev) + 1;
        return next >= passCount ? 0 : next;
      });
    }, PASS_HOLD_MS);
    return () => window.clearInterval(id);
  }, [inWorkspace, playing, passCount]);

  // Query live Python backend (:8788) for real-time forward sensor diagnostics
  const activeEpoch = Math.min(23, Math.max(0, Math.round(timeProgress)));
  useEffect(() => {
    if (!inWorkspace) return;
    const controller = new AbortController();
    const minFrp = Math.round(sensitivityThreshold * 38 * 10) / 10;
    getJson<Record<string, unknown> | null>(
      '/api/observer',
      { frame: activeEpoch, sensor: observerFilter, min_frp: minFrp, run_id: activeRun?.run_id ?? undefined },
      { signal: controller.signal },
    )
      .then((d) => {
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
        } else if (e.key.toLowerCase() === 'o' && !e.metaKey && !e.ctrlKey && !e.altKey) {
          // The Earth's years over the choice of a place, which stays under them.
          e.preventDefault();
          openWorldScreen('years');
        }
        return;
      }
      if (inWorkspace && step === 'record' && e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setPlacesOpen(true);
        return;
      }

      // The guide's actions answer their keys first, where the guide speaks (Estimate and Test).
      const g = guideRef.current;
      if (inWorkspace && g?.step && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const onCtl = Boolean(target?.closest('button, a, [role="slider"], [role="option"]'));
        const a = g.actions.find((x) => keyMatches(x.key, e)) ?? g.also.find((x) => keyMatches(x.key, e));
        if (a && !(onCtl && (e.key === 'Enter' || e.key === ' '))) {
          e.preventDefault();
          runCommandRef.current(a.command);
          return;
        }
        if (marksOpenRef.current && e.key === 'Escape') {
          e.preventDefault();
          setMarksOpen(false);
          return;
        }
        if (g.step === 'finish' && e.key === 'Escape') {
          e.preventDefault();
          setFinishOpen(false);
          return;
        }
      }

      if (round && inWorkspace) {
        // The round's own keys besides the guide's: the arrows mark a square, Esc leaves (from the players, back to
        // the round's end).
        const move: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        if (e.key === 'Escape') {
          e.preventDefault();
          if (step === 'agent') setStep('look');
          else openModel();
        } else if (move[e.key]) {
          e.preventDefault();
          rnd.moveFocus(...move[e.key]);
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
        // Before the reveal V does what Enter and the Reveal button do: the nearest pass of the sharp satellite, then
        // the reveal. After it, the score.
        if ((step === 'fire' || step === 'test') && holdoutViirs && !revealed) runCommandRef.current('go:test');
        else testAction();
        return;
      }

      if (e.key.toLowerCase() === 'm' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setReading('sensors');
        return;
      }

      // Enter on a focused trigger activates that trigger; only a bare Enter opens the terrain.
      const onControl = Boolean(target?.closest('button, a, [role="slider"], [role="option"]'));
      // Entry plays on Enter itself; the recorder's landing (the film's address) still opens the Record.
      if (!inWorkspace && filmByAddress && e.key === 'Enter' && !onControl) {
        e.preventDefault();
        enterRecord();
        return;
      }

      if (inWorkspace) {
        const lower = e.key.toLowerCase();
        if (e.key === 'Escape') {
          e.preventDefault();
          if (debriefOpen) {
            setDebriefOpen(false);
          } else if (threeWays) {
            setThreeWays(false);
          } else if (cinemaActive) {
            setCinemaActive(false);
          } else if (cleanHud) {
            setCleanHud(false);
          } else if (step === 'agent') {
            openModel();
          } else if (step === 'fire' || step === 'test') {
            // One place back on the path (World / the place / the fire): from the fire to the place's record.
            goStep('record');
          } else {
            exitToOverview();
          }
        } else if (e.key === 'Enter' && (!onControl || Boolean(target?.closest('.iso-bar__step[data-active="true"], .iso-track__lane')))) {
          e.preventDefault();
          // The step's one forward action
          if (step === 'record') openModel();
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
        } else if (lower === 't' && revealed && (step === 'fire' || step === 'test') && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          setThreeWays((t) => !t);
        } else if (lower === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          setEvidenceOpen(true);
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
    openModel,
    holdoutViirs,
    testAction,
    evidenceOpen,
    areaOpen,
    inWorkspace,
    cinemaActive,
    cleanHud,
    enterWorkspace,
    exitToOverview,
    toggleHoldoutLive,
    round,
    rnd,
    leaveRound,
    nextLook,
    startRound,
    activeRun,
    placesOpen,
    threeWays,
    revealed,
  ]);

  const isCustomRegion = Boolean(activeRun && !isKnownTheaterId(activeRun.region.id));

  // The typed display table covers only the first places; any other place the registry serves is read from it.
  const activeDisplay: (typeof THEATER_DISPLAY)[keyof typeof THEATER_DISPLAY] | undefined = (THEATER_DISPLAY as Record<string, (typeof THEATER_DISPLAY)[keyof typeof THEATER_DISPLAY]>)[activeTheaterId];
  const runMatchesRegion = Boolean(
    activeRun && (isCustomRegion || activeRun.region.id === activeTheaterId),
  );
  // The place's name from the registry; the typed display table only until the registry has answered.
  const registryPlace = placesState.places.places.find((p) => p.id === activeTheaterId) ?? null;
  const registryName = registryPlace?.name ?? null;
  const registryBox = (registryPlace?.box ?? []) as readonly number[];
  const regionTitle =
    isCustomRegion && activeRun ? plainText(activeRun.region.name) : registryName ?? activeDisplay?.title ?? '';
  // No invented numbers: until a run for this region reports, readouts say so.
  const epochSummary = runMatchesRegion ? activeRun?.epoch_summaries?.[activeEpoch] : undefined;
  const rawMw = epochSummary?.reconstructed_total_mw ?? liveTelemetry?.reconstructedMw ?? null;
  const currentMw = rawMw === null || !Number.isFinite(rawMw) ? null : Math.round(rawMw);

  // The physics briefing's diagram data. Its simulated self-check and gates are not shown.
  const sensorModel = useSensorModel(activeRun?.run_id ?? null);

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
  const plainStageRun = useMemo(() => (revealed && activeRun ? withReveal(activeRun) : activeRun), [revealed, activeRun]);
  const stageRun = rnd.stageRun ?? plainStageRun;
  /** Real runs carry their own intensity scale (`encoding`); simulated runs use the fixed linear key. */
  const intensity = runIsReal ? parseIntensityLegend(activeRun) : null;

  const effectiveMode: WorkspaceMode = inWorkspace ? workspaceMode : 'cutaway';
  // While NASA's photograph of the day lies on the box, the credit names it.
  const credit = (dayPicture && dayPictureCredit(stageTelemetry?.dayPicture)) || imageryCredit(activeRun);
  const calendarArea = {
    name: regionTitle,
    lat: runMatchesRegion && activeRun ? activeRun.region.center_lat : activeDisplay?.centerLat ?? (registryBox.length === 4 ? (registryBox[1] + registryBox[3]) / 2 : 0),
    lon: runMatchesRegion && activeRun ? activeRun.region.center_lon : activeDisplay?.centerLon ?? (registryBox.length === 4 ? (registryBox[0] + registryBox[2]) / 2 : 0),
  };

  // What the pass track shows, what each step needs, and the quiet control's contents.
  const trackState: TrackState = !runIsReal ? 'simulated' : holdoutViirs ? 'hidden' : revealed ? 'revealed' : 'normal';
  const trackRevealed = useMemo(() => (revealed ? revealedPassesOf(activeRun) : []), [revealed, activeRun]);
  // While VIIRS is held out the pass list carries nothing of what it saw; the full list comes with the reveal (D16).
  const passLists = usePassList(activeRun, Boolean(activeRun?.metrics?.holdout_viirs) && !revealed);
  const stageMonth = activeRun?.epoch_summaries?.[0]?.timestamp_utc?.slice(0, 7) ?? null;
  /** The run on the terrain is a recorded test fire's window: its record shows, and it is not tested again. */
  const closedWindow = Boolean(runIsReal && activeRun && isClosedWindow(placesState.places, activeRun.region.id, realStart));
  const stepBlocked: Partial<Record<Step, string | null>> = {
    test: noSharp
      ? 'No VIIRS flew before 2012, so there is nothing to hide'
      : !runIsReal
        ? 'The test needs a real NASA FIRMS run'
        : closedWindow
          ? 'A recorded test fire: its test is on record and is not run again'
          : null,
    look: round || closedWindow || noSharp
      ? null
      : !runIsReal
            ? 'A round needs a real NASA FIRMS run'
            : null,
  };
  const span = runSpan ? utcSpan(runSpan.first, runSpan.last) : null;
  const blindLoading = holdoutViirs && !revealing && (isExecuting || !activeRun?.metrics?.holdout_viirs);



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
  // The things the stage boxes for the page (G66): the round's marked square, for the frame of the look on it.
  const markedTile = round ? rnd.marked : null;
  const stageThings = useMemo(() => (markedTile !== null ? { square: { kind: 'tile' as const, tile: markedTile } } : undefined), [markedTile]);
  const storeBase: WorkspaceBase = {
    places: placesState.places,
    currentFire: activeRun && realStart ? fireOfStart(placesState.places, activeRun.region.id, realStart)?.id ?? null : null,
    place: { regionId: calendarRegionId, title: regionTitle, area: calendarArea },
    calendar: {
      place: recordPlace,
      placesOpen,
      placesDraw,
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
        setDebriefOpen(false);
        setWorkspaceMode('reconstruction');
        setCameraPreset('canyon');
        // World model opens blind on the month's run once it is in, unless nothing can be hidden there.
        if (Number(ym.slice(0, 4)) < 2012 || hideRefused(rec.place.regionId, ym)) {
          pendingHideRef.current = false;
          setStep('fire');
        } else {
          pendingHideRef.current = true;
          setStep('test');
        }
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
    model: {
      closed: closedWindow,
      canHide: !stepBlocked.test,
      grid: stageTelemetry?.regionGrid,
      subscribeAnchor,
      threeWays,
      toggleThreeWays: () => setThreeWays((t) => !t),
      lastSeen: stageTelemetry?.lastSeen ?? null,
      marksOpen,
      missingFiles: stageTelemetry?.missingFiles ?? null,
      evidence: evidenceLive,
      openEvidence: () => setEvidenceOpen(true),
      revealedHere: revealed ? trackRevealed.filter((r) => r.frame === activeEpoch).reduce((a, r) => a + r.pixels, 0) : null,
      revealedTotal:
        revealed && trackRevealed.length > 0
          ? { detections: trackRevealed.reduce((a, r) => a + r.pixels, 0), passes: trackRevealed.length }
          : null,
    },
    time: { pass: activeEpoch, powerMw: currentMw, toggleStrip: () => setStripOpen((o) => !o) },
    round: {
      state: round,
      start: rnd.start,
      end: rnd.end,
      error: rnd.error,
      oneLook: rnd.oneLook,
      noLook: rnd.noLook,
      runError: realFailed && rnd.fire && realFailed.start === rnd.fire.start ? realFailed.message : null,
      next: nextLook,
      focus: rnd.focus,
      canPick: rnd.canPick,
      pickFocused: () => {
        if (rnd.canPick) playCue('look');
        rnd.pickMarked();
      },
      ready: rnd.run !== null,
      hover: rnd.hover,
      marked: rnd.marked,
      takenTile: rnd.takenTile,
      subscribeAnchors: rnd.subscribeAnchors,
      subscribeMarkedBox,
    },
    step,
    goStep,
    openModel,
    toFirstScreen: exitToOverview,
    blocked: stepBlocked,
  };
  // What the Record publishes for the guide (the compare-view lane's view), and the guide worked out from the store.
  const recordView = useRecordView();
  const playersView = usePlayersView();
  const worldFirstYear = useWorldFirstYear();
  const worldYears = useWorldYears();
  // The day's photograph's manifest (the same route with format=json): the side of its pixel, for the guide's sentence.
  const dayShown = stageTelemetry?.dayPicture?.state === 'shown' ? stageTelemetry.dayPicture : null;
  const photoKey = dayShown && activeRun ? `${activeRun.region.id}|${dayShown.day}|${dayShown.platform}|${dayShown.kind}` : null;
  const [photoPixel, setPhotoPixel] = useState<{ key: string; km: number | null } | null>(null);
  useEffect(() => {
    if (!photoKey || !dayShown || !activeRun || photoPixel?.key === photoKey) return;
    let live = true;
    getJson<{ pixel_km?: number }>('/api/gibs/day', { region_id: activeRun.region.id, day: dayShown.day, platform: dayShown.platform, kind: dayShown.kind, format: 'json' })
      .then((m) => live && setPhotoPixel({ key: photoKey, km: typeof m?.pixel_km === 'number' ? m.pixel_km : null }))
      .catch(() => live && setPhotoPixel({ key: photoKey, km: null }));
    return () => {
      live = false;
    };
  }, [photoKey, dayShown, activeRun, photoPixel?.key]);
  const guide = useGuide(storeBase, { scores: debriefOpen, sideBySide: threeWays, finish: finishOpen }, recordView, playersView, {
    playing,
    film: filmMode,
    narrow: viewportWidth < 600,
    chance: chanceOn,
    marksOpen,
    places: placesState.state,
    worldFirstYear,
    recordedNow: TRANSPORT === 'recorded' ? (recordedNow?.place === calendarRegionId && recordedNow.day ? recordedNow.day : false) : undefined,
    day:
      inWorkspace && (step === 'fire' || step === 'test') && runIsReal && !round && !debriefOpen
        ? { asked: dayPicture, shown: stageTelemetry?.dayPicture ?? null, pixelKm: photoPixel && photoPixel.key === photoKey ? photoPixel.km : null }
        : undefined,
    worldYears,
  });
  const guideKey = `${guide.step}:${guide.stateId}:${realStart}`;
  // The room the guide's strip takes at the bottom (its height and its distance from the edge), for the Record to keep
  // clear however many lines the guide holds.
  const [guideRoom, setGuideRoom] = useState<number | null>(null);
  useEffect(() => {
    const strip = document.querySelector<HTMLElement>('.guide-strip');
    if (!strip) {
      setGuideRoom(null);
      return;
    }
    const measure = () => {
      const b = strip.getBoundingClientRect();
      const room = Math.ceil(window.innerHeight - b.top + 16);
      setGuideRoom((prev) => (prev === room ? prev : room));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(strip);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [guideKey, step, inWorkspace]);
  // At the round's end the board stands above the results rows (the stage fits it into a shorter frame): the frame's
  // bottom is the rows' top over the window's height, less a little room.
  const [endFrameBottom, setEndFrameBottom] = useState<number | null>(null);
  const resultsShown = Boolean(round?.done && guide.results && guide.results.rows.length > 0);
  useEffect(() => {
    if (!resultsShown) {
      setEndFrameBottom(null);
      return;
    }
    const measure = () => {
      const top = document.querySelector('.guide-results')?.getBoundingClientRect().top;
      if (top === undefined || window.innerHeight <= 0) return;
      const b = Math.round((top / window.innerHeight - 0.03) * 1000) / 1000;
      setEndFrameBottom((prev) => (prev === b ? prev : b));
    };
    const t = window.setTimeout(measure, 0);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', measure);
    };
  }, [resultsShown, guide.results?.rows.length, viewportWidth]);
  guideRef.current = guide;
  marksOpenRef.current = marksOpen;
  /** The commands the guide's actions name (script.json, "commands"). */
  const runCommand = (command: string) => {
    // The pictures of the world, over what is on show: the Earth's years from the choice of a place and the Record,
    // the test across the world and the sealed predictions from Test.
    if (command === 'years:open' || command === 'world:test' || command === 'world:sealed') {
      openWorldScreen(command === 'years:open' ? 'years' : command === 'world:test' ? 'test' : 'sealed');
      return;
    }
    if (command === 'photo:next') {
      setDayPicture(nextDayPicture);
      return;
    }
    if (command === 'go:test') {
      // From another step (the trail's Test from the Record, say): Test starts with the reveal, so Estimate opens on its
      // hidden pass and the reveal follows there (the effect after the opening pass).
      if (step !== 'fire' && step !== 'test' && holdoutViirs && !revealed) {
        revealDueRef.current = true;
        openModel();
        return;
      }
      if (holdoutViirs && !revealed) {
        const fs = (activeRun as unknown as { observer_passes?: { frames?: Array<{ sensor?: string }> } } | null)?.observer_passes?.frames ?? [];
        const sharp = (k: number) => typeof fs[k]?.sensor === 'string' && fs[k].sensor!.startsWith('VIIRS');
        if (fs.length > 0 && !sharp(activeEpoch)) {
          // The next pass of the sharp satellite, else the one before.
          let k = fs.findIndex((_, i) => i > activeEpoch && sharp(i));
          if (k < 0) for (let i = activeEpoch - 1; i >= 0 && k < 0; i -= 1) if (sharp(i)) k = i;
          if (k >= 0) {
            setPlaying(false);
            setTimeProgress(k);
          }
        }
        toggleHoldoutLive();
      }
      else if (step !== 'fire' && step !== 'test') openModel();
    } else if (command === 'go:estimate') {
      // On the Record: the fire of the month picked there when it has one, else of the month it marks (the script's
      // "Show the fire of {default_fire_month}" on a month with no fire to show). After a reveal: the sharp satellite
      // hidden again, on the same run.
      if (step === 'record' && recordView.state === 'ready') {
        const picked = recordView.picked;
        recordView.show(picked && picked.opens ? picked.ym : recordView.marked?.ym);
      } else if ((step === 'fire' || step === 'test') && revealed) {
        setDebriefOpen(false);
        setThreeWays(false);
        setRevealed(false);
        setHoldoutViirs(true);
      } else openModel();
    } else if (command === 'record:pick') recordView.browse();
    else if (command === 'record:default_fire') recordView.pick(null);
    else if (command === 'record:accuracy') recordView.showAsCounted(true);
    else if (command === 'record:csv') {
      // The picked month's detections as a CSV file, through the page's client.
      const path = recordView.picked?.csvPath;
      if (path)
        void assetUrl(path).then((url) => {
          if (!url) return;
          const a = document.createElement('a');
          a.href = url;
          a.download = '';
          a.click();
        });
    } else if (command === 'place:draw') {
      goStep('record');
      setPlacesDraw(true);
      setPlacesOpen(true);
    }
    else if (command === 'go:play') goStep('look');
    else if (command === 'play:look') {
      if (rnd.canPick) playCue('look');
      rnd.pickMarked();
    }
    else if (command === 'play:skip') {
      if (round && !round.done && !round.awaitingNext) nextLook();
    } else if (command === 'play:next') {
      if (round?.awaitingNext) nextLook();
    } else if (command === 'play:end') rnd.finish();
    else if (command === 'play:players') {
      // After the one look a recorded page scores, the players' picture shows their recorded plays of this fire.
      if (rnd.oneLook?.taken) rnd.leave(true);
      goStep('agent');
    }
    else if (command === 'play:again') {
      setFinishOpen(false);
      if (step === 'agent') setStep('look');
      if (round?.done) nextLook();
      else startRound();
    } else if (command === 'play:watch') playersView.watch();
    else if (command === 'play:players_reveal') playersView.reveal();
    else if (command === 'play:resume') setStep('look');
    else if (command === 'say:more') {
      // What the state says on demand beyond what stands, in the guide for this state.
      if (guide.more.length > 0) setSaid({ key: guideKey, lines: guide.more });
    }
    else if (command === 'marks:key') setMarksOpen((o) => !o);
    else if (command === 'estimate:chance') setChanceOn((o) => !o);
    else if (command === 'record:as_counted') recordView.showAsCounted(!recordView.correction.asCounted);
    else if (command === 'record:now') recordView.askNow();
    else if (command === 'record:now_caveats') {
      // Why this month's figure is rough, in the sentences the route serves, said in the guide for this state.
      if (recordView.now.caveats.length > 0) setSaid({ key: guideKey, lines: recordView.now.caveats });
    }
    else if (command === 'go:finish') setFinishOpen(true);
    else if (command === 'go:record') goStep('record');
    else if (command === 'place:open') {
      goStep('record');
      setPlacesOpen(true);
    } else if (command === 'passes:play') setPlaying((p) => !p);
    else if (command === 'passes:hidden_next') {
      const fs = (activeRun as unknown as { observer_passes?: { frames?: Array<{ held_out?: boolean }> } } | null)?.observer_passes?.frames ?? [];
      const next = fs.findIndex((f, k) => k > activeEpoch && f.held_out === true);
      if (next >= 0) {
        setPlaying(false);
        setTimeProgress(next);
      }
    } else if (command === 'test:side_by_side') setThreeWays(true);
    else if (command === 'test:scores') setDebriefOpen(true);
    else if (command === 'tests:record') {
      // Every test on record takes the scores sheet's place rather than stacking over it: one sheet, one Esc.
      setDebriefOpen(false);
      setEvidenceOpen(true);
    }
    else if (command === 'method:open') setReading('method');
    else if (command === 'close') {
      if (finishOpen) setFinishOpen(false);
      else if (debriefOpen) setDebriefOpen(false);
      else if (threeWays) setThreeWays(false);
      else if (step === 'agent') setStep('look');
      else if (step === 'look') openModel();
    } else if (command === 'retry' && step === 'look') {
      startRound();
    } else if (command === 'retry' && step === 'record') {
      setRecordTry((n) => n + 1);
    } else if (command === 'retry' && realFailed) {
      // The request that did not load, again: a place's run, or the reveal of the run on show.
      if (realFailed.reveal) {
        setRevealing(true);
        void executeWorldModel({ ...realFailed.params, enterWorkspace: false }).finally(() => setRevealing(false));
      } else void executeWorldModel({ ...realFailed.params, enterWorkspace: false, theaterId: undefined, queryText: undefined });
    }
  };
  runCommandRef.current = runCommand;
  /** A word of the trail: its step (from a picture of the world too, which closes first). */
  const onTrailWord = (w: TrailWord) => {
    if (w === 'Record') {
      if (inWorkspace) goStep('record');
      else enterRecord();
    } else if (w === 'Estimate') runCommand('go:estimate');
    else if (w === 'Test') runCommand('go:test');
    else goStep('look');
  };
  const store: WorkspaceStore = { ...storeBase, guide, runCommand };
  // The agents' walk (walk/agentWalk.ts) reads the store as it is at each of its steps.
  const storeRef = useRef(store);
  storeRef.current = store;
  // The identity's top bar (identity/LocatorBar.tsx) in place of the four words: the path from the world to what is
  // in view, its coordinates, and the bar's few words; and the story line along the bottom (identity/StoryLine.tsx).
  const fireStep = step === 'fire' || step === 'test' || step === 'look' || step === 'agent';
  const fireShown = activeRun && realStart ? fireOfStart(placesState.places, activeRun.region.id, realStart) : null;
  const fireTitle = fireStep && fireShown ? (fireShown.name ? `${fireShown.name}, ${fireShown.label}` : fireShown.label) : null;
  const barLat = runMatchesRegion && activeRun ? activeRun.region.center_lat : registryBox.length === 4 ? (registryBox[1] + registryBox[3]) / 2 : null;
  const barLon = runMatchesRegion && activeRun ? activeRun.region.center_lon : registryBox.length === 4 ? (registryBox[0] + registryBox[2]) / 2 : null;
  const barLinks = [
    { label: WORDS.links.search, onClick: () => setAskOpen(true) },
    { label: WORDS.links.method, onClick: () => setReading('method') },
    { label: WORDS.links.sources, onClick: () => setReading('sources') },
  ];
  // The visitor's own round (and the players beside it) is the story's last part, their turn.
  const storyPart: StoryPart = step === 'record' ? 'place' : step === 'look' || step === 'agent' ? 'turn' : 'fire';
  const storyNumber = (v: unknown) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/,/g, '')) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const goStory = (part: StoryPart) => {
    if (part === 'world' || part === 'jump') openWorldScreen('years');
    else if (part === 'place') goStep('record');
    else if (part === 'fire') onTrailWord('Estimate');
    else if (part === 'tested') openWorldScreen('test');
    else if (part === 'live') openWorldScreen('sealed');
    else onTrailWord('Play');
  };
  // Play (identity/Entry.tsx's Play): the story by itself in the ux lane's order (MOUNT.md section 7), with the stage's
  // own moves (`filmMove: 'auto'`); any key, click or wheel hands it back where it is. It never plays the game.
  const worldIs = (name: string) => worldScreenOnShow()?.name === name;
  const sceneIs = (s: string) => document.querySelector(`.wm-scene[data-scene="${s}"]`) !== null;
  const yearsDone = (view: string) =>
    worldIs('years') &&
    new URLSearchParams(window.location.search).get('view') === view &&
    document.querySelector('.world-screen[data-name="years"]')?.getAttribute('data-pass') === 'done';
  const playShots = (): PlayShot[] => [
    // The years as counted from 2010 to 2012, held on 2012 while its caption stands (as the film does), then the same
    // years on one scale; each waits for the pass to reach its last year (`data-pass` on the picture), and the second
    // opens afresh so it plays its own pass.
    { part: 'world', start: () => openWorldScreen('years', YEARS_COUNTED), ready: () => yearsDone('counted'), hold: 6000, wait: 60000 },
    {
      part: 'jump',
      start: () => {
        closeWorldScreen();
        requestAnimationFrame(() => openWorldScreen('years', YEARS_ONE_SCALE));
      },
      ready: () => yearsDone('onescale'),
      hold: 5000,
      wait: 60000,
    },
    {
      part: 'place',
      start: () => {
        closeWorldScreen();
        enterRecord();
      },
      ready: () => document.querySelector('.rec__grid') !== null,
      hold: 7000,
      wait: 60000,
    },
    { part: 'fire', start: () => onTrailWord('Estimate'), ready: () => sceneIs('blind'), hold: 7000, wait: 60000 },
    {
      part: 'fire',
      start: () => {
        const next = guideRef.current?.actions[0]?.command;
        if (next) runCommand(next);
      },
      ready: () => sceneIs('revealed'),
      hold: 7000,
    },
    { part: 'tested', start: () => openWorldScreen('test'), ready: () => worldIs('test'), hold: 9000 },
    { part: 'live', start: () => openWorldScreen('sealed'), ready: () => worldIs('sealed'), hold: 8000 },
    // Back on the fire just revealed, the agents take their looks in time and the walk ends on the visitor's own turn
    // in a round there (the judge lane's walk, WALK-MOUNT.md); Play ends with it.
    {
      part: 'turn',
      start: () => {
        closeWorldScreen();
        startAgentWalk(() => storeRef.current);
      },
      ready: () => agentWalkDone(),
      hold: 0,
      wait: 90000,
    },
  ];
  // The pictures of the world read the film presentation from the root's class when they open: it is set before Play's
  // first picture opens, and a picture on show when Play ends opens again in the page's own presentation.
  const endPlay = () => {
    stopAgentWalk();
    setFilmMode(filmByAddress);
    if (filmByAddress) return;
    document.documentElement.classList.remove('iso-film');
    const on = worldScreenOnShow();
    if (on) {
      closeWorldScreen();
      requestAnimationFrame(() => openWorldScreen(on.name));
    }
  };
  const play = usePlay(playShots, endPlay);
  const startPlay = () => {
    document.documentElement.classList.add('iso-film');
    setFilmMode(true);
    play.start();
  };
  /** World model on a real run: in place on the terrain (beats/world-model/WorldModelScene.tsx), no column. */
  const modelScene = inWorkspace && (step === 'fire' || step === 'test') && runIsReal && !round && !debriefOpen;
  // The day's photograph is put away when Estimate and Test are left or another run comes in.
  const dayRunId = activeRun?.run_id ?? null;
  useEffect(() => {
    if (!modelScene) setDayPicture(null);
  }, [modelScene, dayRunId]);

  // What search offers: the registry's places with a real fire to open, under the registry's names.
  // Kept between redraws (the stage redraws the shell several times a second), so search's focus on a place stays put.
  const palettePlaces = useMemo(() => placesState.places.places
    .filter((p) => p.featured_fires.some((f) => f.default_start))
    .map((p) => {
      const fires = p.featured_fires.filter((f) => f.default_start).map((f) => f.label);
      const box = p.box as readonly number[];
      // Which of them choosing the place opens (the registry's opening start), said once beside the months.
      const start = openingStart(placesState.places, p.id);
      const opens = start ? fireOfStart(placesState.places, p.id, start) : null;
      return {
        id: p.id,
        title: p.name,
        sub: fires.join(', '),
        note: opens ? `Choosing it opens the fire of ${opens.label}${opens.name ? `, the ${opens.name}` : ''}.` : '',
        lat: box.length === 4 ? (box[1] + box[3]) / 2 : null,
        lon: box.length === 4 ? (box[0] + box[2]) / 2 : null,
      };
    }), [placesState.places]);

  // The landing's words: the script's start step for the fire on show (its place, its month, its name where an agency
  // list names it), loading and failure as the script says them. They follow the pass on show: on a pass the model
  // was given, the sentence about the lights; on a hidden pass, the white frames named as the model's estimate while
  // the sharp satellite is hidden (Estimate's own words for them).
  const landingHidden = !inWorkspace && runIsReal && stageTelemetry?.passOnShow?.hidden === true;
  const landingLines = (() => {
    const fire = activeRun && realStart ? fireOfStart(placesState.places, activeRun.region.id, realStart) : null;
    const id = realFailed && !runIsReal ? 'failed' : runIsReal && fire ? 'ready' : 'loading';
    const st = stateOf('start', id);
    const fields = { place: regionTitle || null, fire_month: fire?.label ?? null, fire_name: fire?.name ?? null };
    const lines = says(st, fields, { fire_is_named: fire ? Boolean(fire.name) : null }).slice(0, 2);
    if (id !== 'ready' || !landingHidden) return lines;
    const frames = says(stateOf('estimate', 'hidden'), {}, {})[0];
    return frames ? [lines[0], frames] : lines;
  })();

  // A page of recorded answers says so on the landing, with the commit the recording names and the day it was made.
  // The first screen's words wait for the stage's first whole picture (stage/stageReady.ts); a stage that cannot draw
  // never says so, and the words come after 12 s all the same.
  const [stageIn, setStageIn] = useState(() => document.documentElement.dataset.stage === 'ready');
  useEffect(() => {
    if (stageIn) return;
    let live = true;
    void stageReady().then(() => live && setStageIn(true));
    const timer = window.setTimeout(() => live && setStageIn(true), 12000);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [stageIn]);
  const [recordedLine, setRecordedLine] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    // The line says what answered the fire on show: the model in this browser, or the recording (and why).
    let provenance: string | null = null;
    let answered: AnswerSource | null = null;
    const show = () => {
      if (live && provenance !== null) setRecordedLine(answerSourceLine(answered, provenance));
    };
    const off = onAnswerSource((s) => {
      answered = s;
      show();
    });
    void recordedProvenance().then((p) => {
      if (!live || !p) return;
      const d = p.recordedUtc ? new Date(p.recordedUtc) : null;
      const day = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;
      const at = p.commit ? ` at commit ${p.commit.slice(0, 7)}` : '';
      provenance = `${at}${day ? `, on ${day}` : ''}`;
      show();
    });
    return () => {
      live = false;
      off();
    };
  }, []);
  // In the film presentation the start state's film caption stands in the landing's headline's place.
  const landingCaption = (() => {
    if (!filmMode) return null;
    const fire = activeRun && realStart ? fireOfStart(placesState.places, activeRun.region.id, realStart) : null;
    const st = stateOf('start', realFailed && !runIsReal ? 'failed' : runIsReal && fire ? 'ready' : 'loading');
    const fields = { place: regionTitle || null, fire_month: fire?.label ?? null, fire_name: fire?.name ?? null };
    return st?.film ? (says({ ...st, says: st.film.map((l) => ({ ...l, place: 'guide' })) }, fields, {})[0] ?? null) : null;
  })();
  // The root says when the landing's fire is in (its real run loaded and a pass of it drawn), for the film's driver.
  const fireIn = !inWorkspace && runIsReal && !isExecuting && stageTelemetry?.realPass != null;
  // A fire that did not load is said as such (`failed`), so the film's dark start does not hide the failure's words.
  const landingFailed = !inWorkspace && Boolean(realFailed) && !runIsReal;
  useEffect(() => {
    document.documentElement.setAttribute('data-fire', fireIn ? 'in' : inWorkspace ? 'workspace' : landingFailed ? 'failed' : 'loading');
  }, [fireIn, inWorkspace, landingFailed]);

  return (
    <WorkspaceProvider value={store}>
    <div className="iso-app" data-workspace={inWorkspace ? 'true' : 'false'} data-sel={selStyle}>
      <AgentWalkLine />
      {/* The first screen: the identity's Entry (Play or Explore). The film's address keeps the recorder's landing. */}
      {!inWorkspace &&
        (filmByAddress ? (
          <LandingComposition
            imageryCredit={credit}
            parts={landingParts}
            onOpenPart={openPart}
            realPass={stageTelemetry?.realPass ?? null}
            lines={landingLines}
            passHidden={landingHidden}
            caption={landingCaption}
            recorded={recordedLine}
            onOpenSearch={() => setAskOpen(true)}
            onOpenSensor={() => setReading('sensors')}
            onOpenMethod={() => setReading('method')}
            onEnter={enterRecord}
          />
        ) : (
          !worldScreen && !play.playing && (
            <>
              <Entry
                ready={stageIn}
                firstYear={worldYears?.first ?? null}
                lastYear={worldYears?.last ?? null}
                onPlay={startPlay}
                onExplore={() => openWorldScreen('years')}
                links={barLinks}
              />
              <div className="iso-entry-foot iso-land__foot">
                {recordedLine && <p className="iso-land__recorded">{recordedLine}</p>}
                <p className="iso-land__credit">Imagery: {credit}</p>
              </div>
            </>
          )
        ))}
      {play.playing && <p className="iso-play-stop">{WORDS.stop}</p>}

      {inWorkspace && (
        <>
          {cleanHud && (
            <button type="button" className="iso-restore" onClick={() => setCleanHud(false)}>
              <kbd>H</kbd>
              <span>Show the interface</span>
            </button>
          )}

          <div
            className="iso-ws"
            data-clean={cleanHud ? 'true' : 'false'}
            data-step={step}
            data-debrief={debriefOpen ? 'true' : 'false'}
            data-scene={modelScene ? 'model' : step === 'look' ? 'world' : undefined}
            data-guide={guide.step ? 'true' : undefined}
            style={guideRoom !== null ? ({ '--guide-room': `${guideRoom}px` } as React.CSSProperties) : undefined}
          >
            <div className="iso-ws__scrim iso-ws__scrim--top" aria-hidden="true" />
            <div className="iso-ws__scrim iso-ws__scrim--right" aria-hidden="true" />
            <div className="iso-ws__scrim iso-ws__scrim--bottom" aria-hidden="true" />

            <LocatorBar
              path={['World', regionTitle, fireTitle].filter((s): s is string => Boolean(s))}
              lat={barLat}
              lon={barLon}
              onTrail={(i) => (i === 0 ? openWorldScreen('years') : goStep('record'))}
              links={barLinks}
            />
            <RevealSweep run={revealRun} />
            <StoryLine
              current={play.part ?? storyPart}
              progress={play.playing ? play.progress : null}
              jumpYear={storyNumber(guide.fields.sharp_since)}
              testedFires={storyNumber(guide.fields.test_b_fires_n)}
              onPart={filmMode || play.playing ? undefined : goStory}
            />

            {/* Wide screens: no box (display: contents). Under 960 px: the scrolling bottom half. */}
            {step === 'record' && <CalendarBeat key={recordTry} guideSpeaks={guide.step === 'record'} />}
            {modelScene && <WorldModelScene />}
            {step === 'agent' && <AgentBeat guideSpeaks={guide.step === 'play'} />}
            {step === 'look' && <PlayScene />}
            {(guide.step === 'estimate' || guide.step === 'test') && (
              <PassStrip
                passes={stripPasses}
                current={activeEpoch}
                visible={playing || nearFoot || stripOpen}
                onPick={(i) => {
                  setPlaying(false);
                  setTimeProgress(i);
                }}
              />
            )}
            {/* Under a sheet (the scores, every test on record, a reading) the guide steps aside: nothing of it lies under
                the sheet's scrim; its keys still work. */}
            {guide.step && !(debriefOpen || evidenceOpen || reading !== null || areaOpen) && (
              <>
                <div className="guide-scrim" aria-hidden="true" />
                <GuideStrip
                  title={filmMode && guide.film ? guide.film : guide.objective}
                  lines={filmMode ? [] : said && said.key === guideKey ? said.lines : guide.lines}
                  more={filmMode || (said && said.key === guideKey) ? [] : guide.more}
                  // In the film only the step's strong action stands, so nothing else competes with the caption.
                  // Where the next step stands on a thing (the fire, the round's square), the guide holds no action:
                  // it is on the thing; the other actions keep their keys.
                  actions={play.playing || guide.besideFire || guide.besideSquare ? [] : filmMode ? guide.actions.slice(0, 1) : guide.actions}
                  onAction={runCommand}
                  results={guide.results}
                />
              </>
            )}
            {/* Under 960 px the dock is the lower half of the screen: it stands only when it holds something, so an empty
                one never covers the board or dims the stage. */}
            <div className="iso-ws__dock" hidden={step === 'record' || step === 'agent' || !((debriefOpen && blindTest) || (!round && !guide.step))}>
              {debriefOpen && blindTest ? (
                <Suspense fallback={null}>
                  <Debrief
                    score={blindTest}
                    model={blindModel}
                    place={regionTitle}
                    onBack={() => setDebriefOpen(false)}
                    onNext={stepBlocked.look ? null : () => goStep('look')}
                    onEvidence={() => {
                      setDebriefOpen(false);
                      setEvidenceOpen(true);
                    }}
                    terra={null}
                    terraOpen={terraOpen}
                    onToggleTerra={() => setTerraOpen((o) => !o)}
                  />
                </Suspense>
              ) : null}

              {!round && !guide.step && (
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

          <button type="button" className="iso-credit" onClick={() => setReading('credits')} title="Imagery credit and sources">
            Imagery: {credit}
          </button>
        </>
      )}

      {/* The stage comes after the interface in DOM order so Tab reaches the triggers first;
          stacking is by z-index, not order. */}
      <div className="iso-stage-clip" data-workspace={inWorkspace ? 'true' : 'false'}>
        {stageOn && (
          <StageBoundary>
            <Suspense fallback={<div style={{ width: '100%', height: '100%', backgroundColor: '#080b11' }} />}>
              <EarthCutawayStage
                apiBase={API_BASE}
                resolveAsset={assetUrlNow}
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
                // On a narrow screen the close view would crop the fire off the sides: Estimate and Test show the whole box,
                // fitted into the part the words leave free (modelFrame).
                cameraPreset={viewportWidth < 960 && modelScene && cameraPreset === 'canyon' ? 'region' : cameraPreset}
                cinemaActive={cinemaActive}
            dayPicture={modelScene ? dayPicture : null}
                cleanHud={cleanHud}
                slewRequest={slewRequest}
                selectedFindingId={selectedFinding?.id ?? null}
                onSelectFinding={runIsReal ? undefined : setSelectedFinding}
                onEnterWorkspace={() => enterWorkspace('cutaway')}
                onCinemaStepTheater={handleCinemaStepTheater}
                onTelemetry={handleTelemetry}
                landingView="world"
                landingTour
                // Behind the Record and the choice of a place the stage rests: dark and calm, no estimate, no film move.
                backdrop={inWorkspace && step === 'record'}
                landingSubjectFrame={narrowViewport ? LANDING_CALM_BAND_NARROW : LANDING_CALM_BAND}
                workspaceSubjectFrame={
                  round
                    ? endFrameBottom !== null
                      ? { ...roundFrame(viewportWidth), bottom: Math.min(roundFrame(viewportWidth).bottom, endFrameBottom) }
                      : roundFrame(viewportWidth)
                    : modelScene
                      ? modelFrame(viewportWidth)
                      : workspaceFrame(viewportWidth)
                }
                filmMove={play.playing ? 'auto' : undefined}
                regionGridDivisions={modelScene || step === 'look' ? 16 : undefined}
                chanceSquares={chanceOn}
                onFireAnchor={modelScene || step === 'look' ? emitAnchor : undefined}
                tileBoard={rnd.board}
                onTilePick={(tile) => {
                  // A tap marks a square first (a touch screen has no pointer that hovers to mark it); a tap on the
                  // marked square looks. With a mouse the square under it is marked, so a click looks as before.
                  if (touchRef.current && tile !== rnd.focus) {
                    rnd.mark(tile);
                    return;
                  }
                  if (rnd.canPick) playCue('look');
                  rnd.pick(tile);
                }}
                things={stageThings}
                onThings={stageThings ? onThings : undefined}
                onTileHover={rnd.board ? rnd.onHover : undefined}
                onTileAnchors={rnd.board ? rnd.onAnchors : undefined}
              />
            </Suspense>
          </StageBoundary>
        )}
      </div>

      {(openedSheetsRef.current.ask ||= askOpen) && (
        <Suspense fallback={null}>
          <CommandAskPalette
            open={askOpen}
            onClose={() => setAskOpen(false)}
            activeTheaterId={activeTheaterId}
            activeRun={activeRun}
            holdoutViirs={holdoutViirs}
            cloudOverride={cloudOverride}
            isExecuting={isExecuting}
            errorMessage={execError}
            onExecute={handlePaletteExecute}
            places={palettePlaces}
          />
        </Suspense>
      )}

      {(openedSheetsRef.current.area ||= areaOpen) && (
        <Suspense fallback={null}>
          <AreaSheet
            open={areaOpen}
            onClose={() => setAreaOpen(false)}
            apiBase={API_BASE}
            centre={{ lat: calendarArea.lat, lon: calendarArea.lon }}
            onOpenMonth={openAreaMonth}
          />
        </Suspense>
      )}

      {(openedSheetsRef.current.evidence ||= evidenceOpen) && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {(openedSheetsRef.current.reading ||= reading !== null) && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {worldScreen && (
        <Suspense fallback={null}>
          <WorldScreens onWord={onTrailWord} links={barLinks} />
        </Suspense>
      )}
    </div>
    </WorkspaceProvider>
  );
}
