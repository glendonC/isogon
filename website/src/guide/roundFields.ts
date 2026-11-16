import type { WorkspaceBase } from '../app/store';
import { fireOfStart } from '../app/places';
import type { Conditions, Fields } from './script';
import { count, countNo, countWord, length, lengthDigits, localDayTime, meanPoints, midLon, ordinal, percent1, points } from './formats';

/**
 * The values Play's lines name, from the round's own answers (reset, each look, the end) and the evidence route, in the
 * script's formats. A value not served is null, and a line or a results row that names it is not shown.
 */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A count of looks with its noun: "one look", "three looks"; null when the count is not served. */
const lookCount = (said: string | null, n: number) => (said === null ? null : `${said} ${n === 1 ? 'look' : 'looks'}`);

const sameList =(a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => JSON.stringify(x) === JSON.stringify(b[i]));

export function roundFields(ws: WorkspaceBase): { fields: Fields; conds: Conditions; gains: Record<string, number | null> } {
  const st = ws.round.state;
  const start = ws.round.start;
  const end = ws.round.end;
  const ep = start?.episode ?? null;
  const looks = start?.looks ?? null;
  const decision = st ? Math.min(st.decision, Math.max(0, (looks?.length ?? 1) - 1)) : null;
  const slot = looks && decision !== null ? looks[decision] ?? null : null;
  const spent = st ? st.picks.filter((p) => p.tile !== null).length : null;
  // The look on show: the one just taken, while its result stands.
  const taken = st?.awaitingNext ? st.picks.find((p) => p.decision === st.decision && p.tile !== null) ?? null : null;
  const ref = obj(end?.reference ?? null);
  const gain = (k: string) => num(obj(ref?.[k])?.gain);
  const randomGains = Array.isArray(obj(ref?.random)?.gains) ? (obj(ref?.random)?.gains as number[]) : null;
  const randomFinals = Array.isArray(obj(ref?.random)?.finals) ? (obj(ref?.random)?.finals as number[]) : null;
  const final = (k: string) => num(obj(ref?.[k])?.final);
  const meanOf = (xs: number[] | null) => (xs && xs.length > 0 ? xs.reduce((a, g) => a + g, 0) / xs.length : null);
  // The score now: after the last look that has one, else the round's start.
  const lastScored = st ? [...st.picks].reverse().find((p) => typeof p.score === 'number') : undefined;
  const scoreSoFar = num(lastScored?.score ?? null) ?? num(start?.score_start ?? null);
  // The scores at the end as they are written (one decimal), so a comparison in words agrees with the figures shown.
  const youEnd = percent1(end?.player.final ?? null);
  const ruleEnd = percent1(final('least_sure'));
  const chanceEnd = percent1(meanOf(randomFinals));
  const cmp = (a: string | null, b: string | null) => (a === null || b === null ? null : Math.sign(Number(a) - Number(b)));
  const vsRule = cmp(youEnd, ruleEnd);
  const vsChance = cmp(youEnd, chanceEnd);
  const known = vsRule !== null && vsChance !== null;
  // A look's own move, as it is written (one decimal of a point): up, level or down.
  const moved = taken && typeof taken.reward === 'number' && taken.pixels > 0 ? Math.sign(Math.round(taken.reward * 1000)) : null;
  const learnedLooks = obj(ref?.learned)?.actions;
  const ruleLooks = obj(ref?.least_sure)?.actions;
  const revealed = end ? end.reveal.overpasses.reduce((a, o) => a + o.footprints.length, 0) : null;

  const val = obj(obj(obj(ws.model.evidence as unknown)?.next_look)?.on_validation);
  const diffs = obj(val?.differences);
  const ruleVsChance = obj(diffs?.least_sure_minus_random);
  const learnedVsRule = obj(diffs?.learned_minus_least_sure);
  const fire = ws.run.active ? fireOfStart(ws.places, ws.run.active.region.id, ws.run.realStart) : null;

  const fields: Fields = {
    round_passes: length(looks),
    round_passes_n: lengthDigits(looks),
    looks_to_spend: countWord(ep?.budget ?? null),
    looks_left: ep && spent !== null ? countWord(ep.budget - spent) : null,
    looks_left_n: ep && spent !== null ? count(ep.budget - spent) : null,
    looks_left_no: ep && spent !== null ? countNo(ep.budget - spent) : null,
    // The looks left with their noun, one look or several: "one look", "three looks", "no looks", "1 LOOK".
    looks_left_count: ep && spent !== null ? lookCount(countWord(ep.budget - spent), ep.budget - spent) : null,
    looks_left_no_count: ep && spent !== null ? lookCount(countNo(ep.budget - spent), ep.budget - spent) : null,
    looks_left_caps: ep && spent !== null ? lookCount(count(ep.budget - spent), ep.budget - spent)?.toUpperCase() ?? null : null,
    look_number: ordinal(slot?.index ?? null),
    look_when: localDayTime(slot?.time_utc, midLon(ep?.box)),
    look_found: taken ? count(taken.pixels) : null,
    look_gain: taken ? points(taken.reward) : null,
    score_now: taken ? percent1(taken.score) : null,
    round_start: percent1(start?.score_start ?? null),
    round_end: percent1(end?.player.final ?? null),
    your_gain: points(end?.player.gain ?? null),
    chance_gain: meanPoints(randomGains),
    chance_tries: length(randomGains),
    coarse_rule_gain: points(gain('latest_modis')),
    unsure_rule_gain: points(gain('least_sure')),
    learned_gain: points(gain('learned')),
    answer_gain: points(gain('oracle')),
    rounds_n: count(num(val?.episodes)),
    rule_ahead_rounds: count(num(ruleVsChance?.episodes_a_ahead)),
    learned_minus_rule: points(num(learnedVsRule?.mean_difference)),
    round_sharp_detections: count(revealed),
    score_so_far: percent1(scoreSoFar),
    rule_end: ruleEnd,
    chance_end: chanceEnd,
    // The rows of the round's end: each player's score at the end, in percent.
    end_you: youEnd === null ? null : `${youEnd}%`,
    end_rule: ruleEnd === null ? null : `${ruleEnd}%`,
    end_chance: chanceEnd === null ? null : `${chanceEnd}%`,
    end_start: end && percent1(start?.score_start ?? null) !== null ? `${percent1(start?.score_start ?? null)}%` : null,
  };
  const conds: Conditions = {
    first_pass_of_round: st ? st.decision === 0 && st.picks.length === 0 : null,
    no_looks_left: ep && spent !== null ? ep.budget - spent <= 0 : null,
    look_found_nothing: taken ? taken.pixels === 0 : null,
    look_raised: moved === null ? (taken ? false : null) : moved > 0,
    look_level: moved === null ? (taken ? false : null) : moved === 0,
    look_lowered: moved === null ? (taken ? false : null) : moved < 0,
    end_beat_both: known ? vsRule! > 0 && vsChance! > 0 : null,
    end_beat_chance_only: known ? vsChance! > 0 && vsRule! < 0 : null,
    end_beat_rule_only: known ? vsRule! > 0 && vsChance! < 0 : null,
    end_beat_neither: known ? vsRule! < 0 && vsChance! < 0 : null,
    end_level: known ? vsRule === 0 || vsChance === 0 : null,
    learned_beats_rule: num(learnedVsRule?.p05) === null ? null : (num(learnedVsRule?.p05) as number) > 0,
    learned_same_looks_as_rule: Array.isArray(learnedLooks) && Array.isArray(ruleLooks) ? sameList(learnedLooks, ruleLooks) : null,
    learned_trained_here: fire?.to_the_learned_agent ? fire.to_the_learned_agent === 'fitted on' : null,
  };
  // The gains as numbers, for the results rows' bars, under the names of their fields: a bar is how far that player
  // moved the score from the round's start.
  const mean = meanOf(randomGains);
  const gains: Record<string, number | null> = {
    end_you: end?.player.gain ?? null,
    end_rule: gain('least_sure'),
    end_chance: mean,
    end_start: end ? 0 : null,
    your_gain: end?.player.gain ?? null,
    chance_gain: mean,
    coarse_rule_gain: gain('latest_modis'),
    unsure_rule_gain: gain('least_sure'),
    learned_gain: gain('learned'),
    answer_gain: gain('oracle'),
  };
  return { fields, conds, gains };
}
