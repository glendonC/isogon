import { createContext, useContext, type ReactNode } from 'react';
import type { DynamicRegionRun } from '../stage/types';
import type { CalendarState } from '../ui/useCalendar';
import type { CalendarArea } from '../components/BurningCalendar';
import type { BlindTest, IntensityLegend, ModelStatus } from '../content/realRuns';
import type { RoundState } from '../beats/test-world/round';
import type { NextLookEnd, NextLookStart } from '../content/demo/nextLook';
import type { Step } from '../components/WorkspaceBar';
import type { Box, FeaturedFire, Place, Places } from './places';
import type { FireRecord, RecordPlace } from '../beats/calendar/record';
import type { EarthStageTelemetry, StageFireAnchor } from '../stage/earthCutawayTypes';
import type { EvidenceDoc } from '../content/evidence';

/**
 * The workspace's shared state, read by every beat: the place, the run on the terrain, the time on show, and the
 * actions that change them. The shell (App.tsx) owns the state and the requests and provides this value; a beat
 * reads it with `useWorkspace()` and renders its own panel. A beat never fetches the run itself.
 */
export interface WorkspaceStore {
  /** The places registry (`GET /api/regions`). */
  places: Places;
  /** The featured fire of the run on the terrain, if it is one. */
  currentFire: string | null;
  place: {
    /** The region whose record and runs are open. */
    regionId: string;
    title: string;
    area: CalendarArea;
  };
  calendar: {
    /** The place or box whose record the Calendar shows. */
    place: RecordPlace;
    /** The place screen is open over the Calendar. */
    placesOpen: boolean;
    openPlaces: () => void;
    closePlaces: () => void;
    chooseFire: (place: Place, fire: FeaturedFire) => void;
    chooseBox: (box: Box) => void;
    /** A month of the record that opens a real run, and opening it in World model. */
    canOpen: (ym: string, rec: FireRecord) => boolean;
    openMonth: (ym: string, rec: FireRecord) => void;
    state: CalendarState;
    selectedMonth: string | null;
    /** The month of the run on the terrain ("2012-08"). */
    stageMonth: string | null;
    selectMonth: (ym: string) => void;
    openArea: () => void;
  };
  run: {
    active: DynamicRegionRun | null;
    isReal: boolean;
    /** The start of the real run on the terrain, the one being requested, and the last failure. */
    realStart: string | null;
    pendingStart: string | null;
    failed: { start: string; message: string } | null;
    /** "10 to 13 August 2012". */
    span: string | null;
    /** No VIIRS flew before 2012: nothing to hide. */
    beforeSharp: boolean;
    model: ModelStatus | null;
    intensity: IntensityLegend | null;
    /** "firms" or "simulated". */
    source: string;
  };
  test: {
    hidden: boolean;
    revealed: boolean;
    revealing: boolean;
    loading: boolean;
    score: BlindTest | null;
    /** Hide VIIRS, reveal it, or open the score, as the test stands. */
    act: () => void;
    openScore: () => void;
  };
  model: {
    /**
     * The run on the terrain is a window of a recorded test fire: World model shows the record and the run with every
     * satellite, and never hides, reveals or scores it again.
     */
    closed: boolean;
    /** VIIRS can be hidden on this run (a real run from 2012 on, not a recorded test fire). */
    canHide: boolean;
    /** The region's box on screen, as the stage projects it (`telemetry.regionGrid`). */
    grid: EarthStageTelemetry['regionGrid'];
    /**
     * Where the fire on show sits on screen, from the stage every frame (`onFireAnchor`): a subscription, so the shell
     * does not redraw for it.
     */
    subscribeAnchor: (fn: (anchor: StageFireAnchor | null) => void) => () => void;
    /** After the reveal: one fire three ways in the stage's place (compare/ThreeWaysPlane.tsx), and its toggle. */
    threeWays: boolean;
    toggleThreeWays: () => void;
    /** On a hidden pass: the earlier pass whose detections the stage draws as an afterglow (`telemetry.lastSeen`). */
    lastSeen: EarthStageTelemetry['lastSeen'] | null;
    /** The evidence route's answer, for the record beside a window's own count. */
    evidence: EvidenceDoc | null;
    openEvidence: () => void;
    /** After the reveal: the hidden detections now shown at the pass on show, and over the window. */
    revealedHere: number | null;
    revealedTotal: { detections: number; passes: number } | null;
  };
  time: {
    /** The pass on show, 0 based. */
    pass: number;
    /** Estimated fire power at that pass, MW; null until the run reports. */
    powerMw: number | null;
  };
  round: {
    /** The round on the open fire (beats/test-world/useRound.ts); null when none is under way. */
    state: RoundState | null;
    /** The round's start as the server answered it; null until it has. */
    start: NextLookStart | null;
    end: NextLookEnd | null;
    /** Why the round could not start, in the server's words where it gave some. */
    error: string | null;
    /** Why the round's held-out run did not load. */
    runError: string | null;
    next: () => void;
    /** The tile under keyboard focus, whether a tile can be picked now, and a look at the focused tile. */
    focus: number | null;
    canPick: boolean;
    pickFocused: () => void;
  };
  step: Step;
  goStep: (s: Step) => void;
  /** Why a step cannot be opened here (null: it can). */
  blocked: Partial<Record<Step, string | null>>;
}

const WorkspaceContext = createContext<WorkspaceStore | null>(null);

export function WorkspaceProvider({ value, children }: { value: WorkspaceStore; children: ReactNode }) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceStore {
  const s = useContext(WorkspaceContext);
  if (!s) throw new Error('useWorkspace outside the workspace');
  return s;
}
