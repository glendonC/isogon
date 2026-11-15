import { useRef } from 'react';
import type { WorkspaceBase } from '../app/store';
import { guideFields } from './fields';
import { missingLine } from './missing';
import { contextOf, labelOn, objectiveOf, promptBeside, says, stateOf, type ScriptAction, type ScriptState } from './script';

export interface Guide {
  /** The script's step and state on show; null where the guide does not speak yet (the Record, Play). */
  step: 'estimate' | 'test' | null;
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
}

/** How many of a state's lines stand together in the guide. */
const STANDING = 2;

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
};

/**
 * Which step and state of the script the workspace is in, and what the guide says there. A state's own pass is the one
 * on show when the state began; moving to another pass moves the guide to the script's "on another pass" states.
 */
export function useGuide(ws: WorkspaceBase, open: { scores: boolean; sideBySide: boolean }): Guide {
  const entry = useRef<{ key: string; pass: number }>({ key: '', pass: -1 });
  const model = ws.step === 'fire' || ws.step === 'test';
  const { fields, conds } = guideFields(ws);
  if (!model) {
    // Where the guide does not speak yet, the corner still says the step's objective and context.
    entry.current = { key: '', pass: -1 };
    const s = ws.step === 'record' ? 'record' : 'play';
    return { ...NONE, objective: objectiveOf(s, null, fields), context: contextOf(s, fields) };
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
  const actions = (state?.actions ?? []).slice(0, 3);
  // A file that did not load is said first, while the run it belongs to is on show. Then the state's standing
  // sentences: its first two lines, shown together.
  const missing = id === 'loading' || id === 'failed' ? null : missingLine(ws.model.missingFiles);
  return {
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
