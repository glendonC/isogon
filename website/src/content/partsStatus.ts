import type { EvidenceDoc } from './evidence';
import { PART_NAMES } from '../app/names';

/**
 * The three parts under the landing's hero, each with one line of what it does and one line of its real status,
 * read from GET /api/evidence (in the shape of content/evidence.ts). No figure is typed here; a negative result
 * stays negative. When the route does not answer, or answers in a shape this cannot read, the parts show what they
 * do and no status.
 */
export type PartId = 'model' | 'environment' | 'agent';

export interface PartStatus {
  id: PartId;
  name: string;
  does: string;
  /** Null when the evidence route has not answered: no figure is shown rather than a stale one. */
  status: string | null;
  /** The step it opens, in words. */
  open: string;
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const words = (n: number) => NUMBER_WORDS[n] ?? String(n);

/** "6, 7 and 3" */
function listOf(values: number[]): string {
  if (values.length <= 1) return values.join('');
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

const PARTS: ReadonlyArray<Omit<PartStatus, 'status'>> = [
  { id: 'model', name: PART_NAMES.model, does: 'Rebuilds a real fire from the coarse satellite alone.', open: 'Open the fire and its test' },
  { id: 'environment', name: PART_NAMES.environment, does: 'Real fires with the sharp satellite hidden as the answer key.', open: 'Play a round' },
  { id: 'agent', name: PART_NAMES.agent, does: 'Chooses where to look next.', open: "See the agents' table" },
];

export function partsStatus(doc: EvidenceDoc | null): PartStatus[] {
  let statuses: Record<PartId, string> | null = null;
  try {
    statuses = doc ? statusesOf(doc) : null;
  } catch {
    statuses = null;
  }
  return PARTS.map((p) => ({ ...p, status: statuses?.[p.id] ?? null }));
}

function statusesOf(doc: EvidenceDoc): Record<PartId, string> {
  // World model: the blind test on the test fires under the current protocol, and the model's own status.
  const fires = doc.test_fires.fires;
  const ahead = fires.map((f) => f.new.ahead_of_both_on);
  const judged = doc.test_fires.scores.length;
  const baselines = fires[0] ? Object.keys(fires[0].new.scores).filter((m) => m !== 'reconstruction').length : 0;
  const modelStatus = doc.validation.parts.every((p) => p.status === 'on')
    ? 'on'
    : doc.validation.parts.some((p) => p.status !== 'off')
      ? 'experimental'
      : 'off';

  // Agent: a simple rule against chance, and the learned agent against the best simple rule.
  const agents = doc.next_look.agents;
  const gain = (id: string) => agents.find((a) => a.id === id)?.new.mean_gain ?? null;
  const random = gain('random');
  const learned = gain('learned');
  const simple = agents
    .filter((a) => !['random', 'learned', 'oracle'].includes(a.id))
    .reduce<number | null>((best, a) => (best === null || a.new.mean_gain > best ? a.new.mean_gain : best), null);
  const ruleBeatsChance = simple !== null && random !== null && simple > random;
  const learnedBeatsRule = simple !== null && learned !== null && learned > simple;

  if (fires.length === 0 || !judged || ahead.some((n) => typeof n !== 'number')) throw new Error('no test fires');
  return {
    model: `Ahead of ${words(baselines)} simple methods on ${listOf(ahead)} of ${judged} scores on the ${words(fires.length)} test fires; ${modelStatus}.`,
    environment:
      doc.next_look.test_episodes.new > 0
        ? `Built, on ${doc.next_look.test_episodes.new} test episodes; a round can be played.`
        : 'Not built yet.',
    agent: `${ruleBeatsChance ? 'A simple rule beats chance' : 'No simple rule beats chance yet'}; ${
      learnedBeatsRule ? 'the learned agent beats that rule' : 'the learned agent does not beat that rule yet'
    }.`,
  };
}
