import raw from './script.json';

/**
 * The guide's words, read from one file: `script.json`, a committed copy of the product lane's GUIDE-script.json
 * (its `version` says which). Each step has states; each state says lines (some only under a condition), offers
 * actions (a label, a command, a key, and the thing it acts on) and puts short labels on things of the stage. Text in
 * braces is a field whose value comes from the backend's answers (`fields.ts`); no figure is typed here.
 */

export type ScriptLine = string | { if?: string; unless?: string; line: string };

export interface ScriptAction {
  label: string;
  command: string;
  key?: string;
  /** The thing on the stage the action also stands beside, as a prompt, while the pointer or focus is near it. */
  beside?: string;
}

export interface ScriptLabel {
  on: string;
  if?: string;
  unless?: string;
  line: string;
}

export interface ScriptState {
  id: string;
  says: ScriptLine[];
  actions: ScriptAction[];
  labels?: ScriptLabel[];
  on_demand?: string[];
}

export interface ScriptStep {
  id: string;
  name: string;
  states: ScriptState[];
}

interface Script {
  version: number;
  trail: string[];
  names: Record<string, string>;
  steps: ScriptStep[];
}

export const SCRIPT = raw as unknown as Script;

/** Field values already in their written form ("10 to 13 August 2012", "three", "1:10"); null when not served. */
export type Fields = Record<string, string | null | undefined>;
export type Conditions = Record<string, boolean | null | undefined>;

export function stateOf(step: string, state: string): ScriptState | null {
  return SCRIPT.steps.find((s) => s.id === step)?.states.find((x) => x.id === state) ?? null;
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

const holds = (c: { if?: string; unless?: string }, conds: Conditions) =>
  (c.if === undefined || conds[c.if] === true) && (c.unless === undefined || conds[c.unless] === false);

/** The lines a state says, in order, conditions applied and fields filled. */
export function says(state: ScriptState | null, fields: Fields, conds: Conditions): string[] {
  if (!state) return [];
  return state.says
    .map((l) => (typeof l === 'string' ? l : holds(l, conds) ? l.line : null))
    .map((l) => (l === null ? null : fill(l, fields)))
    .filter((l): l is string => l !== null);
}

/** The label a state puts on one thing of the stage. */
export function labelOn(state: ScriptState | null, thing: string, fields: Fields, conds: Conditions): string | null {
  for (const l of state?.labels ?? []) {
    if (l.on !== thing || !holds(l, conds)) continue;
    const text = fill(l.line, fields);
    if (text) return text;
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
