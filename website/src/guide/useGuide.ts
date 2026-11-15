import { useRef } from 'react';
import type { WorkspaceBase } from '../app/store';
import type { RecordView } from '../beats/calendar/recordView';
import type { PlayersView } from '../beats/agent/playersView';
import { PLAYERS_WORDS } from '../beats/agent/AgentPicture';
import { guideFields } from './fields';
import { missingLine } from './missing';
import { playStateId } from './playState';
import { recordFields, recordStateId } from './recordFields';
import { resultRows, type ResultRow } from './Results';
import { roundFields } from './roundFields';
import { contextOf, fill, labelOn, objectiveOf, promptBeside, says, stateOf, type Fields, type ScriptAction, type ScriptState } from './script';

export interface Guide {
  /** The script's step and state on show; null where the guide does not speak (Choose a Place). */
  step: 'record' | 'estimate' | 'test' | 'play' | 'finish' | null;
  stateId: string | null;
  state: ScriptState | null;
  /** Top left: what the visitor is doing now, and the fainter line of the place and the days. */
  objective: string | null;
  context: string | null;
  lines: string[];
  actions: ScriptAction[];
  /** The label on the fire, and the action that stands beside the fire as a prompt. */
  fireLabel: string | null;
  besideFire: ScriptAction | null;
  /** Play: the label on the square just looked at, and the action beside the marked square. */
  squareLabel: string | null;
  besideSquare: ScriptAction | null;
  /** A round's end: the results' line and rows, above the guide's sentences. */
  results: { line: string; rows: ResultRow[] } | null;
}

/** How many of a state's lines stand together in the guide. */
const STANDING = 2;

/**
 * With the players open and what their looks found not drawn yet, the guide offers it first, in the picture's own
 * words (the script's players_open has no such action, since there the picture opens after the visitor's round).
 */
const REVEAL: ScriptAction = { label: PLAYERS_WORDS.reveal, command: 'players:reveal', key: 'Enter', places: ['guide'] };

/** A state's actions with their labels' fields filled; an action whose label names a field not served is left out. */
function actionsOf(state: ScriptState | null, fields: Fields): ScriptAction[] {
  return (state?.actions ?? [])
    .map((a) => {
      const label = fill(a.label, fields);
      return label ? { ...a, label } : null;
    })
    .filter((a): a is ScriptAction => a !== null)
    .slice(0, 3);
}

const NONE: Guide = {
  step: null,
  stateId: null,
  state: null,
  objective: null,
  context: null,
  lines: [],
  actions: [],
  fireLabel: null,
  besideFire: null,
  squareLabel: null,
  besideSquare: null,
  results: null,
};

/**
 * Which step and state of the script the workspace is in, and what the guide says there. A state's own pass is the one
 * on show when the state began; moving to another pass moves the guide to the script's "on another pass" states.
 */
export function useGuide(
  ws: WorkspaceBase,
  open: { scores: boolean; sideBySide: boolean; finish: boolean },
  record: RecordView,
  players: PlayersView,
): Guide {
  const entry = useRef<{ key: string; pass: number }>({ key: '', pass: -1 });
  const model = ws.step === 'fire' || ws.step === 'test';
  const { fields, conds } = guideFields(ws);
  if (ws.step === 'record') {
    // The Record speaks from what it publishes. Beside the trail its span, not the place a second time; nothing while
    // Choose a Place is open over it.
    entry.current = { key: '', pass: -1 };
    const r = recordFields(ws, record);
    const id = recordStateId(ws, record);
    if (!id) return NONE;
    const state = stateOf('record', id);
    return {
      ...NONE,
      step: 'record',
      stateId: id,
      state,
      objective: objectiveOf('record', state, r.fields),
      context: r.fields.record_span ?? null,
      lines: says(state, r.fields, r.conds).slice(0, STANDING),
      actions: actionsOf(state, r.fields),
    };
  }
  if (!model) {
    // Play, and Finish after a round: the round's own answers and the evidence route.
    entry.current = { key: '', pass: -1 };
    const r = roundFields(ws);
    const f = { ...fields, ...r.fields };
    const c = { ...conds, ...r.conds };
    const step = open.finish ? 'finish' : 'play';
    const id = open.finish ? 'ready' : playStateId(ws);
    const state = stateOf(step, id);
    const missing = step === 'play' && id !== 'loading' && id !== 'failed' ? missingLine(ws.model.missingFiles) : null;
    return {
      ...NONE,
      step,
      stateId: id,
      state,
      objective: objectiveOf(step, state, f),
      context: contextOf(step, f),
      lines: [...(missing ? [missing] : []), ...says(state, f, c).slice(0, STANDING)],
      actions: id === 'players_open' && players.canReveal ? [REVEAL, ...actionsOf(state, f)].slice(0, 3) : actionsOf(state, f),
      fireLabel: labelOn(state, 'fire', f, c),
      squareLabel: labelOn(state, 'looked_square', f, c),
      besideSquare: promptBeside(state, 'marked_square'),
      results: state?.results ? { line: state.results.line, rows: resultRows(state.results, f, r.gains, c) } : null,
    };
  }
  const failed = Boolean(ws.run.failed && (ws.run.failed.start === ws.run.pendingStart || !ws.run.isReal));
  let step: 'estimate' | 'test' = 'estimate';
  let id: string;
  if (failed) id = 'failed';
  else if (ws.run.pendingStart || !ws.run.isReal) id = 'loading';
  else if (ws.test.revealing) id = 'revealing';
  else if (ws.model.closed) id = 'recorded_test_fire';
  else if (ws.run.beforeSharp) id = 'no_sharp_satellite';
  else if (ws.test.revealed) {
    step = 'test';
    id = open.scores ? 'scores_open' : open.sideBySide ? 'side_by_side_open' : 'revealed';
  } else if (ws.test.hidden && !ws.test.loading) id = 'hidden';
  else id = 'loading';

  // The state's own pass: moving away from it is "another pass".
  const key = `${step}:${id}:${ws.run.realStart}`;
  if (entry.current.key !== key) entry.current = { key, pass: ws.time.pass };
  if (ws.time.pass !== entry.current.pass) {
    if (id === 'hidden') id = conds.pass_is_sharp ? 'on_a_hidden_pass' : 'on_a_coarse_pass';
    else if (id === 'revealed') id = 'on_another_pass';
  }

  const state = stateOf(step, id);
  const actions = actionsOf(state, fields);
  // A file that did not load is said first, while the run it belongs to is on show. Then the state's standing
  // sentences: its first two lines, shown together.
  const missing = id === 'loading' || id === 'failed' ? null : missingLine(ws.model.missingFiles);
  return {
    ...NONE,
    step,
    stateId: id,
    state,
    objective: objectiveOf(step, state, fields),
    context: contextOf(step, fields),
    lines: [...(missing ? [missing] : []), ...says(state, fields, conds).slice(0, STANDING)],
    actions,
    fireLabel: labelOn(state, 'fire', fields, conds),
    besideFire: promptBeside(state, 'fire'),
  };
}
