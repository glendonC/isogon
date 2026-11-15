import { useRef } from 'react';
import type { WorkspaceBase } from '../app/store';
import type { RecordView } from '../beats/calendar/recordView';
import type { PlayersView } from '../beats/agent/playersView';
import { guideFields } from './fields';
import { marksOnShow, type MarkRow } from './marks';
import { missingLine } from './missing';
import { playStateId } from './playState';
import { recordFields, recordStateId } from './recordFields';
import { countWord } from './formats';
import { resultRows, type ResultRow } from './Results';
import { roundFields } from './roundFields';
import {
  contextOf,
  fill,
  labelOn,
  objectiveOf,
  promptBeside,
  says,
  stateOf,
  stepOf,
  type Conditions,
  type Fields,
  type ScriptAction,
  type ScriptState,
} from './script';

export interface Guide {
  /** The script's step and state on show; null where the guide does not speak (Choose a Place). */
  step: 'place' | 'record' | 'estimate' | 'test' | 'play' | 'finish' | null;
  stateId: string | null;
  state: ScriptState | null;
  /** Top left: what the visitor is doing now, and the fainter line of the place and the days. */
  objective: string | null;
  context: string | null;
  lines: string[];
  actions: ScriptAction[];
  /** The step's actions that work in every state by their key, not shown in the strip unless a state lists them. */
  also: ScriptAction[];
  /** The label on the fire, and the action that stands beside the fire as a prompt. */
  fireLabel: string | null;
  besideFire: ScriptAction | null;
  /** Play: the label on the square just looked at, and the action beside the marked square. */
  squareLabel: string | null;
  besideSquare: ScriptAction | null;
  /** A round's end: the results' line and rows, above the guide's sentences. */
  results: { line: string; rows: ResultRow[] } | null;
  /** The key of marks: a row for each mark now on show (Estimate and Test). */
  marks: MarkRow[];
  /** What the state says on demand beyond what stands (`more`), filled. */
  more: string[];
  /** The values and conditions the state's lines were filled from, for the answers to questions asked there. */
  fields: Fields;
  conds: Conditions;
}

/** How many of a state's lines stand together in the guide. */
const STANDING = 2;

/** What is running now, for the actions that read otherwise while it runs (`label_while_on`) and the short labels. */
export interface GuideLive {
  /** The passes are playing. */
  playing: boolean;
  /** The squares sized by chance are drawn. */
  chance: boolean;
  /** The key of marks is open. */
  marksOpen: boolean;
  /** The places registry's state, for the choice of a place. */
  places?: 'loading' | 'ready' | 'failed';
  /** The first year of the world's record (`GET /api/cube/countries`), null until it answers. */
  worldFirstYear?: string | null;
}

/** Which command's thing is running, by command. */
function onOf(live: GuideLive, record: RecordView): Record<string, boolean> {
  return {
    'passes:play': live.playing,
    'estimate:chance': live.chance,
    'marks:key': live.marksOpen,
    'record:as_counted': record.correction.asCounted,
  };
}

/** Actions with their labels' fields filled and their running words where their thing runs; one naming a field not served is left out. */
function actionsOf(list: ScriptAction[] | undefined, fields: Fields, on: Record<string, boolean>, most = 3): ScriptAction[] {
  return (list ?? [])
    .map((a) => {
      const label = fill(on[a.command] && a.label_while_on ? a.label_while_on : a.label, fields);
      return label ? { ...a, label } : null;
    })
    .filter((a): a is ScriptAction => a !== null)
    .slice(0, most);
}

/** The state's lines on demand (`more`), conditions applied and fields filled. */
function moreOf(state: ScriptState | null, fields: Fields, conds: Conditions): string[] {
  return state?.more ? says({ ...state, says: state.more }, fields, conds) : [];
}

const NONE: Guide = {
  step: null,
  stateId: null,
  state: null,
  objective: null,
  context: null,
  lines: [],
  actions: [],
  also: [],
  fireLabel: null,
  besideFire: null,
  squareLabel: null,
  besideSquare: null,
  results: null,
  marks: [],
  more: [],
  fields: {},
  conds: {},
};

/** The players' states over a round's end (or plays asked on the open fire), from what the picture publishes. */
function playersStateId(players: PlayersView): string {
  if (players.state === 'held') return 'players_held';
  if (players.state === 'loading') return 'players_coming';
  if (players.state === 'failed') return 'players_failed';
  return players.foundShown ? 'players_found' : 'players_open';
}

/**
 * Which step and state of the script the workspace is in, and what the guide says there. A state's own pass is the one
 * on show when the state began; moving to another pass moves the guide to the script's "on another pass" states.
 */
export function useGuide(
  ws: WorkspaceBase,
  open: { scores: boolean; sideBySide: boolean; finish: boolean },
  record: RecordView,
  players: PlayersView,
  live: GuideLive,
): Guide {
  const entry = useRef<{ key: string; pass: number }>({ key: '', pass: -1 });
  const model = ws.step === 'fire' || ws.step === 'test';
  const { fields, conds } = guideFields(ws);
  const on = onOf(live, record);

  if (ws.step === 'record' && ws.calendar.placesOpen) {
    // The choice of a place: what the map shows and what can be opened. Its keys are the screen's own (the list, the
    // card's Enter, Back), so the guide adds none of its own there.
    entry.current = { key: '', pass: -1 };
    const id = live.places === 'failed' ? 'failed' : live.places === 'ready' ? 'ready' : 'loading';
    const state = stateOf('place', id);
    const followed = ws.places.places.filter((p) => p.featured_fires.some((x) => x.default_start)).length;
    const pf: Fields = { world_first_year: live.worldFirstYear ?? null, places_followed_n: live.places === 'ready' ? countWord(followed) : null };
    return {
      ...NONE,
      step: 'place',
      stateId: id,
      state,
      objective: objectiveOf('place', state, pf),
      context: null,
      lines: says(state, pf, conds).slice(0, STANDING),
      more: moreOf(state, pf, conds),
      fields: { ...fields, ...pf },
      conds,
    };
  }

  if (ws.step === 'record') {
    // The Record speaks from what it publishes.
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
      context: contextOf('record', r.fields),
      lines: says(state, r.fields, r.conds).slice(0, STANDING),
      more: moreOf(state, r.fields, r.conds),
      fields: { ...fields, ...r.fields },
      conds: { ...conds, ...r.conds },
      actions: actionsOf(state?.actions, r.fields, on),
      also: actionsOf(stepOf('record')?.also, r.fields, on, 9),
    };
  }

  if (!model) {
    // Play, and Finish after a round: the round's own answers, the players' picture and the evidence route.
    entry.current = { key: '', pass: -1 };
    const r = roundFields(ws);
    const f: Fields = { ...fields, ...r.fields };
    const c: Conditions = { ...conds, ...r.conds, players_from_round: players.state === 'closed' ? null : players.from === 'round' };
    const step = open.finish ? 'finish' : 'play';
    let id = open.finish ? 'ready' : playStateId(ws);
    if (id === 'players_open') id = playersStateId(players);
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
      more: moreOf(state, f, c),
      fields: f,
      conds: c,
      actions: actionsOf(state?.actions, f, on).filter((a) => a.command !== 'play:players_reveal' || players.canReveal),
      also: actionsOf(stepOf(step)?.also, f, on, 9),
      fireLabel: labelOn(state, 'fire', f, c, live.playing),
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

  // The state's own pass: moving away from it is "another pass". Estimate's sentence is always the one for the kind
  // of pass on show: on a pass of the coarse satellite there are no white frames to name, from the first moment.
  const key = `${step}:${id}:${ws.run.realStart}`;
  if (entry.current.key !== key) entry.current = { key, pass: ws.time.pass };
  if (id === 'hidden' && conds.pass_is_sharp === false) id = 'on_a_coarse_pass';
  else if (ws.time.pass !== entry.current.pass) {
    if (id === 'hidden') id = conds.pass_is_sharp ? 'on_a_hidden_pass' : 'on_a_coarse_pass';
    else if (id === 'revealed') id = 'on_another_pass';
  }

  const state = stateOf(step, id);
  // A file that did not load is said first, while the run it belongs to is on show. Then the state's standing
  // sentences: its first two lines, shown together.
  const missing = id === 'loading' || id === 'failed' ? null : missingLine(ws.model.missingFiles);
  const settled = id !== 'loading' && id !== 'failed' && id !== 'revealing';
  return {
    ...NONE,
    step,
    stateId: id,
    state,
    objective: objectiveOf(step, state, fields),
    context: contextOf(step, fields),
    lines: [...(missing ? [missing] : []), ...says(state, fields, conds).slice(0, STANDING)],
    more: moreOf(state, fields, conds),
    fields,
    conds,
    actions: actionsOf(state?.actions, fields, on),
    also: actionsOf(stepOf(step)?.also, fields, on, 9),
    fireLabel: labelOn(state, 'fire', fields, conds, live.playing),
    besideFire: promptBeside(state, 'fire'),
    marks: settled ? marksOnShow(ws, fields, conds, { chance: live.chance, revealed: step === 'test' }) : [],
  };
}
