import raw from './script.json';

/**
 * The guide's words, read from one file: `script.json`, a committed copy of the product lane's GUIDE-script.json
 * (its `version` says which). Each step has an objective, a context line and states; each state has its own
 * objective, says lines in the guide (some only under a condition), offers actions (a label, a command, a key, the
 * places it is offered and the thing it acts on) and puts short labels on things of the stage. Text in braces is a
 * field whose value comes from the backend's answers (`fields.ts`); no figure is typed here.
 */

/** A condition on a line: shown only when `if` is true, or only when `unless` is false. */
interface When {
  if?: string;
  unless?: string;
}

export interface ScriptLine extends When {
  /** Where the line is said: "guide" for the strip at the bottom. */
  place?: string;
  line: string;
}

export interface ScriptAction {
  label: string;
  command: string;
  key?: string;
  /** Where the action is offered: the guide strip always, and a prompt beside `beside` when "prompt" is named. */
  places?: string[];
  /** The thing on the stage the action also stands beside, as a prompt, while the pointer or focus is near it. */
  beside?: string;
  /** What the action reads instead while a condition holds (after the last look: the way on to the round's end). */
  label_when?: Array<{ if?: string; unless?: string; label: string }>;
  /** What the action reads while what it started is running ("Pause the passes"). */
  label_while_on?: string;
  /** Shown quietly at the end of the guide's row (the day's photograph; the script's `quiet_fourth`). */
  quiet?: boolean;
  quiet_fourth?: boolean;
  /** Another key that does the same (Space beside Enter). */
  also_key?: string;
  /** The day's photograph: what the action reads while true colour, then false colour, is on. */
  label_when_true_color?: string;
  label_when_false_color?: string;
}

export interface ScriptLabel extends When {
  place?: string;
  on: string;
  line: string;
  /** The label while the passes play: readable in a second and a half. */
  short?: string;
  /** The film presentation's form (eight words at most); null: no label there. Absent: the line, as on the page. */
  film?: string | null;
  /** The live readout under the action that stands on the thing, in capitals: what the frame is on, exactly. */
  readout?: string;
}

export interface ScriptResultRow {
  name: string;
  field: string;
  strong?: boolean;
  note?: string;
  note_if?: string;
}

export interface ScriptResults {
  place: string;
  how: string;
  line: string;
  rows: ScriptResultRow[];
}

export interface ScriptState {
  id: string;
  objective?: string;
  says: Array<string | ScriptLine>;
  actions: ScriptAction[];
  labels?: ScriptLabel[];
  on_demand?: string[];
  results?: ScriptResults;
  /** What the guide says on demand beyond what stands. */
  more?: Array<string | ScriptLine>;
  /** The film's caption for this state, in the objective's place in the film presentation. */
  film?: ScriptLine[];
}

export interface ScriptStartCard {
  place: string;
  at: string;
  do: string;
  done: string;
}

export interface ScriptStep {
  id: string;
  name: string | null;
  objective?: string;
  /** The fainter line that goes with the objective: the place and the days. Not a sentence. */
  context?: string | null;
  start_card?: ScriptStartCard;
  /** Actions that work in every state of the step, by their key and by asking; not in the strip unless a state lists them. */
  also?: ScriptAction[];
  /** The step the trail shows this one under (the Earth's years: the Record). */
  under?: string;
  /** While the day's photograph is on: its sentence, which takes the place of the state's first standing one. */
  photo?: { true_color?: ScriptLine[]; false_color?: ScriptLine[]; missing?: ScriptLine[] };
  states: ScriptState[];
}

export interface ScriptMarkRow {
  id: string;
  name: string;
  line: string;
  on_show: string;
  from?: string;
  drawing?: string;
}

/** The key of marks, on demand: a row for each mark on show, and the one action that shows the squares sized by chance. */
export interface ScriptMarks {
  name: string;
  open: ScriptAction;
  action: ScriptAction;
  rows: ScriptMarkRow[];
}

interface Script {
  version: number;
  trail: string[];
  names: Record<string, string>;
  steps: ScriptStep[];
  marks?: ScriptMarks;
  /** The plain phrase for each score, by its id (format score_names_ahead and score_names_behind). */
  score_names?: Record<string, string>;
  /** Where each field is read from; the photograph's satellite is said by its `said_as` table. */
  fields?: Record<string, { said_as?: Record<string, string> }>;
}

export const SCRIPT = raw as unknown as Script;

/** Field values already in their written form ("9 to 12 August 2012", "three", "+4.1"); null when not served. */
export type Fields = Record<string, string | null | undefined>;
export type Conditions = Record<string, boolean | null | undefined>;

export function stepOf(step: string): ScriptStep | null {
  return SCRIPT.steps.find((s) => s.id === step) ?? null;
}

export function stateOf(step: string, state: string): ScriptState | null {
  return stepOf(step)?.states.find((x) => x.id === state) ?? null;
}

/** A template with its fields filled; null when a field it names has no value, so no line is shown half made. */
export function fill(template: string, fields: Fields): string | null {
  let missing = false;
  const out = template.replace(/\{([a-z0-9_]+)\}/g, (_, name: string) => {
    const v = fields[name];
    if (v === null || v === undefined || v === '') {
      missing = true;
      return '';
    }
    return v;
  });
  return missing ? null : out;
}

export const holds = (c: When, conds: Conditions) =>
  (c.if === undefined || conds[c.if] === true) && (c.unless === undefined || conds[c.unless] === false);

/** The lines a state says in the guide, in order, conditions applied and fields filled. */
export function says(state: ScriptState | null, fields: Fields, conds: Conditions): string[] {
  if (!state) return [];
  return state.says
    .map((l) => (typeof l === 'string' ? { line: l } : l))
    .filter((l) => (l.place ?? 'guide') === 'guide' && holds(l, conds))
    .map((l) => fill(l.line, fields))
    .filter((l): l is string => l !== null);
}

/** The objective on show: the state's own, else its step's, filled. */
export function objectiveOf(step: string, state: ScriptState | null, fields: Fields): string | null {
  const t = state?.objective ?? stepOf(step)?.objective;
  return t ? fill(t, fields) : null;
}

/** The step's context line (the place and the days), filled; null where the step has none. */
export function contextOf(step: string, fields: Fields): string | null {
  const t = stepOf(step)?.context;
  return t ? fill(t, fields) : null;
}

/**
 * The label a state puts on one thing of the stage; its short form while the passes play, where it has one; in the
 * film presentation its film form where it has one (`film: null`: no label in the film).
 */
export function labelOn(state: ScriptState | null, thing: string, fields: Fields, conds: Conditions, short = false, film = false): string | null {
  for (const l of state?.labels ?? []) {
    if (l.on !== thing || !holds(l, conds)) continue;
    if (film && l.film !== undefined) {
      if (l.film === null) return null;
      const said = fill(l.film, fields);
      if (said) return said;
      continue;
    }
    const text = fill(short && l.short ? l.short : l.line, fields);
    if (text) return text;
  }
  return null;
}

/** The action a state offers as a prompt beside one thing of the stage. */
export function promptBeside(state: ScriptState | null, thing: string): ScriptAction | null {
  return state?.actions.find((a) => a.beside === thing && (a.places === undefined || a.places.includes('prompt'))) ?? null;
}

/** The readout a state gives one thing (the first of its labels there whose conditions hold and that has one), filled. */
export function readoutOn(state: ScriptState | null, thing: string, fields: Fields, conds: Conditions): string | null {
  for (const l of state?.labels ?? []) {
    if (l.on !== thing || !l.readout || !holds(l, conds)) continue;
    const said = fill(l.readout, fields);
    if (said) return said;
  }
  return null;
}

/** The key as the keyboard names it, for matching a key press against an action's key. */
export function keyMatches(key: string | undefined, e: KeyboardEvent): boolean {
  if (!key) return false;
  if (key === 'Space') return e.key === ' ';
  if (key === 'Esc') return e.key === 'Escape';
  if (key === 'Enter') return e.key === 'Enter';
  return e.key.toLowerCase() === key.toLowerCase();
}
