import { createContext, useContext, type ReactNode } from 'react';
import type { DynamicRegionRun } from '../stage/types';
import type { CalendarState } from '../ui/useCalendar';
import type { CalendarArea } from '../components/BurningCalendar';
import type { BlindTest, IntensityLegend, ModelStatus } from '../content/realRuns';
import type { RoundState } from '../components/NextLookRound';
import type { NextLookEnd, NextLookStart } from '../content/demo/nextLook';
import type { Step } from '../components/WorkspaceBar';

/**
 * The workspace's shared state, read by every beat: the place, the run on the terrain, the time on show, and the
 * actions that change them. The shell (App.tsx) owns the state and the requests and provides this value; a beat
 * reads it with `useWorkspace()` and renders its own panel. A beat never fetches the run itself.
 */
export interface WorkspaceStore {
  place: {
    /** The region whose record and runs are open. */
    regionId: string;
    title: string;
    area: CalendarArea;
  };
  calendar: {
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
  time: {
    /** The pass on show, 0 based. */
    pass: number;
    /** Estimated fire power at that pass, MW; null until the run reports. */
    powerMw: number | null;
  };
  round: {
    state: RoundState | null;
    start: NextLookStart;
    end: NextLookEnd | null;
    runError: string | null;
    next: () => void;
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
