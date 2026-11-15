import { fill, holds, SCRIPT, type Conditions, type Fields, type ScriptLine } from './script';

/**
 * Asking, matched to the script's written answers (`script.json`, "questions"): no language model. A typed question is
 * matched on each question's words and phrases; the one with the most matched, longest first, wins, and its answer is
 * said in the guide's line, its command carried out as well. With no match the script's own "no answer" is said, with
 * the questions it offers instead.
 */

export interface ScriptQuestion {
  id: string;
  ask: string;
  match: string[];
  answer: Array<string | ScriptLine>;
  command?: string;
  where?: string[];
}

export interface Answer {
  /** The matched question, or null for the script's "no answer". */
  id: string | null;
  lines: string[];
  command: string | null;
  /** With no answer: the questions offered instead, as the picker shows them. */
  offers: ScriptQuestion[];
}

const QUESTIONS = (SCRIPT as unknown as { questions?: ScriptQuestion[] }).questions ?? [];
const NO_ANSWER = (SCRIPT as unknown as { no_answer?: { says: string; offers: string[] } }).no_answer ?? null;

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
/** A phrase is found at the start of a word, so "satellite" finds "satellites". */
const phrase = (s: string) => norm(s).trimEnd();

/** The questions a step offers in its picker (`where`). */
export function questionsFor(step: string | null): ScriptQuestion[] {
  return step ? QUESTIONS.filter((q) => q.where?.includes(step)) : [];
}

export function questionById(id: string): ScriptQuestion | null {
  return QUESTIONS.find((q) => q.id === id) ?? null;
}

/** The question a typed text matches best: most phrases found, then the longest phrase; null when none is found. */
export function match(text: string, step: string | null = null): ScriptQuestion | null {
  const t = norm(text);
  if (t.trim() === '') return null;
  let best: { q: ScriptQuestion; hits: number; longest: number; here: boolean } | null = null;
  for (const q of QUESTIONS) {
    let hits = 0;
    let longest = 0;
    for (const m of q.match) {
      const p = phrase(m);
      if (p.trim() !== '' && t.includes(p)) {
        hits += 1;
        longest = Math.max(longest, p.length);
      }
    }
    if (hits === 0) continue;
    const here = Boolean(step && q.where?.includes(step));
    if (!best || hits > best.hits || (hits === best.hits && (longest > best.longest || (longest === best.longest && here && !best.here)))) {
      best = { q, hits, longest, here };
    }
  }
  return best?.q ?? null;
}

/** What the guide says for a question: its answer's lines with their fields filled (a line naming a missing field is left out). */
export function answerOf(q: ScriptQuestion | null, fields: Fields, conds: Conditions): Answer {
  if (!q) {
    return {
      id: null,
      lines: NO_ANSWER ? [NO_ANSWER.says] : [],
      command: null,
      offers: (NO_ANSWER?.offers ?? []).map(questionById).filter((x): x is ScriptQuestion => x !== null),
    };
  }
  const lines = q.answer
    .map((l) => (typeof l === 'string' ? { line: l } : l))
    .filter((l) => holds(l, conds))
    .map((l) => fill(l.line, fields))
    .filter((l): l is string => l !== null);
  return { id: q.id, lines, command: q.command ?? null, offers: [] };
}
