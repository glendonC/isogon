import { useRef } from 'react';
import type { WorkspaceBase } from '../app/store';
import type { RecordView } from '../beats/calendar/recordView';
import type { PlayersView } from '../beats/agent/playersView';
import { guideFields } from './fields';
import { marksOnShow, type MarkRow } from './marks';
import { missingLine } from './missing';
import { playStateId } from './playState';
import { recordFields, recordStateId } from './recordFields';
import type { DayPictureKind } from './dayPicture';
import { SCRIPT } from './script';
import type { WorldYears } from './world';
import type { EarthStageTelemetry } from '../stage/earthCutawayTypes';
import { countWord, dayWords } from './formats';
import { resultRows, type ResultRow } from './Results';
import { roundFields } from './roundFields';
import { ONE_LOOK_WORDS, oneLookRows } from './oneLook';
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
  /** The state's film caption (the script's `film`), for the objective's place in the film presentation; null without one. */
  film: string | null;
  /** The values and conditions the state's lines were filled from, for the answers to questions asked there. */
  fields: Fields;
  conds: Conditions;
}

/** How many of a state's lines stand together in the guide. */
const STANDING = 2;

/**
 * The pictures of the world opened from Test, in the product's words for them until the script carries them:
 * step-wide on the reveal and on its other passes, and quiet at the end of the guide's row.
 */
const WORLD_ENTRIES: ScriptAction[] = [
  { label: 'See the test on fires across the world', command: 'world:test', key: 'A', quiet: true },
  { label: 'See predictions sealed before the pass', command: 'world:sealed', key: 'J', quiet: true },
];

/** What is running now, for the actions that read otherwise while it runs (`label_while_on`) and the short labels. */
export interface GuideLive {
  /** The passes are playing. */
  playing: boolean;
  /** The film presentation: the labels on the stage take their short form. */
  film?: boolean;
  /** The squares sized by chance are drawn. */
  chance: boolean;
  /** The key of marks is open. */
  marksOpen: boolean;
  /** The places registry's state, for the choice of a place. */
  places?: 'loading' | 'ready' | 'failed';
  /** The first year of the world's record (`GET /api/cube/countries`), null until it answers. */
  worldFirstYear?: string | null;
  /**
   * On a page of recorded answers: the day this month so far's recorded answer stood at for the Record's place, or false
   * when the recording does not hold it (the action is then left out). Absent on the live page.
   */
  recordedNow?: string | false;
  /** The day's photograph on Estimate and Test (guide/dayPicture.ts): what is asked for and what the stage shows. */
  day?: { asked: DayPictureKind | null; shown: EarthStageTelemetry['dayPicture'] | null; pixelKm: number | null };
  /** The Earth's yearly figures (GET /api/cube/years), for the first year the world's record names. */
  worldYears?: WorldYears | null;
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

/**
 * The day's photograph's sentence, in the step's words (`photo`): by the pass on show (by day, at night, or hidden, so
 * the coarse satellite's), with the photograph's satellite and pixel from its manifest; that it is not stored, plainly.
 * Null while it loads, or when none is asked for.
 */
function photoLine(step: string, day: NonNullable<GuideLive['day']>, ws: WorkspaceBase, fields: Fields): string | null {
  const t = day.shown;
  const words = stepOf(step)?.photo;
  if (!t || !words || t.state === 'loading') return null;
  if (t.state === 'missing') return says({ id: 'photo', says: words.missing ?? [], actions: [] }, fields, {})[0] ?? null;
  const fs = ((ws.run.active as unknown as { observer_passes?: { frames?: Array<{ is_day?: boolean }> } } | null)?.observer_passes?.frames) ?? [];
  const isDay = fs[Math.min(ws.time.pass, Math.max(0, fs.length - 1))]?.is_day;
  const c: Conditions = {
    photo_instead_of_hidden: t.insteadOfHidden,
    photo_day_pass: !t.insteadOfHidden && isDay === true,
    photo_night_pass: !t.insteadOfHidden && isDay === false,
  };
  const f: Fields = {
    ...fields,
    photo_satellite: SCRIPT.fields?.photo_satellite?.said_as?.[t.platform] ?? null,
    photo_pixel_m: day.pixelKm !== null ? String(Math.round((day.pixelKm * 1000) / 10) * 10) : null,
  };
  return says({ id: 'photo', says: (t.kind === 'true_color' ? words.true_color : words.false_color) ?? [], actions: [] }, f, c)[0] ?? null;
}

/** The state's film caption (`film`): the first that holds, its fields filled; null where the state has none. */
function filmOf(state: ScriptState | null, fields: Fields, conds: Conditions): string | null {
  // (its lines stand in the objective's place, so they are read here as lines to say)
  return state?.film ? says({ ...state, says: state.film.map((l) => ({ ...l, place: 'guide' })) }, fields, conds)[0] ?? null : null;
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
  film: null,
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
    const pf: Fields = { world_first_year: live.worldFirstYear ?? (live.worldYears?.first != null ? String(live.worldYears.first) : null), places_followed_n: live.places === 'ready' ? countWord(followed) : null };
    return {
      ...NONE,
      step: 'place',
      stateId: id,
      state,
      objective: objectiveOf('place', state, pf),
      context: null,
      lines: says(state, pf, conds).slice(0, STANDING),
      more: moreOf(state, pf, conds),
      film: filmOf(state, { ...fields, ...pf }, conds),
      fields: { ...fields, ...pf },
      conds,
      // The Earth's years, the one action of the guide's own here (the step's `also`); the screen's own keys do the rest.
      actions: id === 'ready' ? actionsOf(stepOf('place')?.also?.filter((a) => a.command === 'years:open'), { ...fields, ...pf }, on) : [],
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
      film: filmOf(state, { ...fields, ...r.fields, world_first_year: live.worldFirstYear ?? (live.worldYears?.first != null ? String(live.worldYears.first) : null) }, r.conds),
      fields: { ...fields, ...r.fields },
      conds: { ...conds, ...r.conds },
      // On a recorded page this month so far is the recording's: its action says the day it stood at, or is left out.
      actions: actionsOf(state?.actions, r.fields, on).flatMap((a) =>
        a.command !== 'record:now' || live.recordedNow === undefined
          ? [a]
          : live.recordedNow === false
            ? []
            : [{ ...a, label: `See this month so far, as it stood on ${dayWords(live.recordedNow) ?? live.recordedNow}` }],
      ),
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
    const one = ws.round.oneLook;
    // A page of recorded answers, in the page's words until the script carries them: its one look's end (with the
    // round's end's actions) and a fire on which it scores none (with the actions of a fire that cannot be played).
    if (step === 'play' && ((id === 'one_look_end' && one?.taken) || id === 'no_look_here')) {
      const end = id === 'one_look_end' && one;
      const like = stateOf('play', end ? 'round_end' : 'no_sharp_satellite');
      return {
        ...NONE,
        step,
        stateId: id,
        state: null,
        objective: end ? ONE_LOOK_WORDS.endObjective : ONE_LOOK_WORDS.noneObjective,
        context: contextOf(step, f),
        lines: end ? [ONE_LOOK_WORDS.end(one), ONE_LOOK_WORDS.whole] : [ONE_LOOK_WORDS.none, ONE_LOOK_WORDS.noneWhole],
        fields: f,
        conds: c,
        actions: actionsOf(like?.actions, f, on),
        also: actionsOf(stepOf(step)?.also, f, on, 9),
        results: end ? { line: ONE_LOOK_WORDS.resultsLine, rows: oneLookRows(one) } : null,
      };
    }
    const state = stateOf(step, id);
    const missing = step === 'play' && id !== 'loading' && id !== 'failed' ? missingLine(ws.model.missingFiles) : null;
    // While the one look is chosen, the page says it scores one look in place of the looks left.
    const said = says(state, f, c).slice(0, STANDING);
    const standing = one && id === 'choose' ? [ONE_LOOK_WORDS.choose, ...said.slice(1)] : said;
    return {
      ...NONE,
      step,
      stateId: id,
      state,
      objective: objectiveOf(step, state, f),
      context: contextOf(step, f),
      lines: [...(missing ? [missing] : []), ...standing],
      more: moreOf(state, f, c),
      film: filmOf(state, f, c),
      fields: f,
      conds: c,
      actions: actionsOf(state?.actions, f, on).filter((a) => a.command !== 'play:players_reveal' || players.canReveal),
      also: actionsOf(stepOf(step)?.also, f, on, 9),
      fireLabel: labelOn(state, 'fire', f, c, live.playing || Boolean(live.film)),
      squareLabel: labelOn(state, 'looked_square', f, c),
      besideSquare: promptBeside(state, 'marked_square'),
      results: state?.results ? { line: state.results.line, rows: resultRows(state.results, f, r.gains, c) } : null,
    };
  }

  // A run asked for that did not load: a place's run (Estimate's failed state) while no run is on show, or another
  // place's or start's run is; the reveal of the run on show (Test's), while it is still hidden.
  const f = ws.run.failed;
  const onShow = ws.run.active?.region.id ?? null;
  const failed = Boolean(f && !f.reveal && !ws.run.pendingStart && (!ws.run.isReal || f.start !== ws.run.realStart || f.regionId !== onShow));
  const revealFailed = Boolean(f && f.reveal && ws.run.isReal && f.start === ws.run.realStart && f.regionId === onShow && !ws.test.revealed && !ws.test.revealing);
  let step: 'estimate' | 'test' = 'estimate';
  let id: string;
  if (failed) id = 'failed';
  else if (revealFailed) {
    step = 'test';
    id = 'failed';
  }
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
  const dayOffered = Boolean(live.day) && ws.run.isReal && id !== 'loading' && id !== 'failed' && id !== 'revealing';
  // The day's photograph, in the step's own words (`photo`): its sentence takes the place of the first standing one.
  const photo = dayOffered && live.day?.asked ? photoLine(step, live.day, ws, fields) : null;
  const standing = [...(missing ? [missing] : []), ...says(state, fields, conds).slice(0, STANDING)];
  const photoAct = dayOffered ? stepOf(step)?.also?.find((a) => a.command === 'photo:next') : undefined;
  const world = step === 'test' && (id === 'revealed' || id === 'on_another_pass') ? WORLD_ENTRIES : [];
  const settled = id !== 'loading' && id !== 'failed' && id !== 'revealing';
  return {
    ...NONE,
    step,
    stateId: id,
    state,
    objective: objectiveOf(step, state, fields),
    context: contextOf(step, fields),
    // While a photograph of the day is on, its sentence stands first; the label keeps saying the pass.
    lines: photo ? [photo, ...standing.slice(1)] : standing,
    more: moreOf(state, fields, conds),
    // Another pass of the same kind shows the same picture: it takes its state's caption (hidden, or revealed).
    film: filmOf(state, fields, conds) ?? filmOf(stateOf(step, step === 'test' ? 'revealed' : 'hidden'), fields, conds),
    fields,
    conds,
    // The pictures of the world on the reveal, then the day's photograph: quiet, at the end of the row.
    actions: [
      ...actionsOf(state?.actions, fields, on),
      ...world,
      ...(photoAct
        ? [{ ...photoAct, quiet: true, label: (live.day?.asked === 'true_color' ? photoAct.label_when_true_color : live.day?.asked === 'false_color' ? photoAct.label_when_false_color : null) ?? photoAct.label }]
        : []),
    ],
    also: [...actionsOf(stepOf(step)?.also, fields, on, 9), ...world],
    fireLabel: labelOn(state, 'fire', fields, conds, live.playing || Boolean(live.film)),
    besideFire: promptBeside(state, 'fire'),
    marks: settled ? marksOnShow(ws, fields, conds, { chance: live.chance, revealed: step === 'test' }) : [],
  };
}
