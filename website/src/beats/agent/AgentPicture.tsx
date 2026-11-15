import { useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '../../app/store';
import { ComparePlane } from '../../compare/ComparePlane';
import {
  CHANCE,
  chanceOf,
  countWord,
  gainScale,
  groundOfRun,
  playBlocks,
  points,
  readPlay,
  roundPlays,
  roundSeen,
  sameLooks,
  seenRows,
  SEES_THE_ANSWER,
  SEES_THE_ANSWER_LINE,
  twinLine,
  type PlaySummary,
} from '../../compare/blocks';
import { PLAYERS_CLOSED, publishPlayersView } from './playersView';
import { usePlays } from './usePlays';
import './agent.css';

/**
 * Every sentence the players' picture itself puts on screen: labels at a player's block, the legend and the actions
 * at the picture. What the picture is, is the guide's to say. A figure is passed in from the round or the plays.
 */
export const PLAYERS_WORDS = {
  name: 'The Players, Side by Side',
  held: 'Finish your round first. Where the other players looked would show you what is still hidden.',
  playing: 'The other players are playing this round.',
  noFire: 'The players play on a real fire. Choose a place with fires first.',
  otherGround: 'This round is on other ground than the fire on the land, so it cannot be drawn here.',
  points: 'points',
  chanceMean: (rounds: number, least: number, most: number) =>
    `The mean of ${countWord(rounds)} rounds of random looks, from ${points(least)} to ${points(most)}`,
  chanceDrawn: (rounds: number, gain: number | null) => `Drawn here: one of the ${countWord(rounds)}${gain !== null ? `, ${points(gain)} points` : ''}`,
  chanceOne: 'One round of random looks',
  /** What the fire is to the learned player, by the registry's word for it. */
  learned: {
    'fitted on': 'Trained on fires of these years around here: not a test of it',
    'never seen': 'It never saw this fire while it learned',
  } as Record<string, string>,
  reveal: 'Reveal what their looks found',
  watch: 'Watch them play',
  close: 'Close',
  legend: (found: boolean) =>
    `Lit squares: where a player looked, in order. ${found ? 'Filled marks: what its looks found. ' : ''}Outlines: what the coarse satellite showed every player.`,
};

/** Time between two looks while the plays are watched, ms. */
const LOOK_MS = 1100;
/** Room kept under a block for its label: the name, the gain on its bar, and up to three lines about the player. */
const UNDER_BLOCK = 132;

interface LabelProps {
  play: PlaySummary;
  /** The gain to show now, null for none yet; for Chance the mean of its rounds. */
  gain: number | null;
  /** Chance's least and most, when it stands for several rounds. */
  range: { least: number; most: number } | null;
  scale: number | null;
  notes: string[];
}

/** Under a block: the player, its gain in points on a bar of the picture's one scale, and what is to be said of it. */
function PlayerLabel({ play, gain, range, scale, notes }: LabelProps) {
  const share = (g: number) => (scale ? `${Math.min(100, Math.max(0, (g / scale) * 100))}%` : '0%');
  return (
    <div className="agent-label">
      <span className="agent-label__name">{play.name}</span>
      <span className="agent-label__gain">
        {gain !== null && (
          <>
            <span className="agent-label__points">{points(gain)}</span>
            <span className="sys-label">{PLAYERS_WORDS.points}</span>
          </>
        )}
      </span>
      <span className="agent-bar" aria-hidden="true">
        {gain !== null && scale !== null && <i style={{ width: share(gain) }} />}
        {range && scale !== null && <b style={{ left: share(range.least), right: `calc(100% - ${share(range.most)})` }} />}
      </span>
      {notes.map((n) => (
        <span key={n} className="sys-label agent-label__note">
          {n}
        </span>
      ))}
    </div>
  );
}

export interface AgentPictureProps {
  /** Back to where the picture was opened from; null when there is nowhere to go back to. */
  onClose?: (() => void) | null;
  /**
   * The guide speaks on this screen. The picture then draws neither its caption nor its row of actions: the guide
   * says what the marks are and offers to reveal, to watch and to close, through `playersView`.
   */
  guideSpeaks?: boolean;
}

/**
 * The players, side by side: one block of the fire's terrain per player of one round. A block says which player,
 * where it looked (its squares stay lit, numbered in order) and what it gained, on a bar that shares one scale
 * with the others. No player is the measure of another.
 *
 * After a round of the visitor's own, the blocks are that round: the visitor's looks first, then the page's five
 * players, from the round's end. With no round played they are plays asked for on the open fire. While a round is
 * under way nothing is drawn, so the round is not given away.
 *
 * What the looks found, which is the hidden satellite's, is drawn once the visitor has seen it or asks to: after
 * their own round, when the fire's test stands revealed, or on "Reveal what their looks found". Until then a block
 * shows where its player looked and what it gained.
 *
 * Chance stands for several rounds of random looks: its gain is their mean, its bar carries their range, and the
 * looks drawn are one of them, said so.
 */
export function AgentPicture({ onClose = null, guideSpeaks = false }: AgentPictureProps) {
  const ws = useWorkspace();
  const run = ws.run.active;
  const real = ws.run.isReal && !!ws.run.realStart;
  const round = ws.round;
  const underWay = round.state !== null && round.end === null;
  const ended = round.end !== null && round.start !== null;
  const fromRound = useMemo(() => (ended ? roundPlays(round.start, round.end) : []), [ended, round.start, round.end]);
  // The other players' plays of the visitor's round arrive with the round's end, a little after it
  const roundReady = fromRound.some((p) => p.id !== 'you');
  const plays = usePlays(real && !ended ? ws.place.regionId : null, real && !ended ? ws.run.realStart : null, underWay);

  const ground = useMemo(() => groundOfRun(run), [run]);
  const summaries = useMemo<PlaySummary[]>(() => {
    if (ended) return roundReady ? fromRound : [];
    if (plays.state !== 'plays') return [];
    return plays.plays
      .map(readPlay)
      .filter((p): p is PlaySummary => p !== null)
      .map((p) => (p.id === CHANCE ? { ...p, draws: plays.draws } : p));
  }, [ended, roundReady, fromRound, plays]);
  const seen = useMemo(() => (ended ? roundSeen(round.start) : seenRows(run)), [ended, round.start, run]);

  // What the looks found is the hidden satellite's: shown once the visitor has seen it or asks to
  const [asked, setAsked] = useState(false);
  useEffect(() => setAsked(false), [ws.place.regionId, ws.run.realStart]);
  const foundShown = ended || ws.test.revealed || asked;

  // How many looks are shown while the plays are watched; null shows all of them
  const [looks, setLooks] = useState<number | null>(null);
  const most = useMemo(() => Math.max(0, ...summaries.map((p) => p.looks.length)), [summaries]);
  useEffect(() => {
    if (looks === null) return;
    if (looks >= most) {
      setLooks(null);
      return;
    }
    const id = window.setTimeout(() => setLooks(looks + 1), LOOK_MS);
    return () => window.clearTimeout(id);
  }, [looks, most]);
  const watch = () => {
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setLooks(0);
  };

  const blocks = useMemo(
    () => playBlocks(ground, summaries, { seen, looks: looks ?? undefined, found: foundShown }),
    [ground, summaries, seen, looks, foundShown],
  );

  const line = !real
    ? PLAYERS_WORDS.noFire
    : underWay
      ? PLAYERS_WORDS.held
      : (ended && !roundReady) || plays.state === 'loading'
        ? PLAYERS_WORDS.playing
        : plays.state === 'closed' || plays.state === 'unserved' || plays.state === 'failed'
          ? plays.line
          : summaries.length > 0 && blocks.length === 0
            ? PLAYERS_WORDS.otherGround
            : null;

  const twins = useMemo(() => sameLooks(summaries), [summaries]);
  const whole = looks === null;
  const shownGain = (play: PlaySummary): { gain: number | null; range: { least: number; most: number } | null } => {
    const chance = chanceOf(play.draws);
    if (whole) return chance && chance.rounds > 1 ? { gain: chance.mean, range: chance } : { gain: play.gain, range: null };
    // While the plays are watched: the looks so far, where the play gives each look's own move
    const so = play.looks.slice(0, looks ?? 0);
    return { gain: so.length > 0 && so.every((l) => l.reward !== null) ? so.reduce((a, l) => a + (l.reward ?? 0), 0) : null, range: null };
  };
  const scale = useMemo(
    () => gainScale(summaries.flatMap((p) => [p.gain, chanceOf(p.draws)?.most ?? null])),
    [summaries],
  );
  // What the fire is to the learned player, as the registry says it
  const fire = useMemo(() => ws.places.places.flatMap((p) => p.featured_fires).find((f) => f.id === ws.currentFire) ?? null, [ws.places, ws.currentFire]);
  const notesOf = (play: PlaySummary): string[] => {
    if (!whole) return [];
    const notes: string[] = [];
    const chance = chanceOf(play.draws);
    if (play.id === CHANCE) {
      if (chance && chance.rounds > 1) notes.push(PLAYERS_WORDS.chanceMean(chance.rounds, chance.least, chance.most), PLAYERS_WORDS.chanceDrawn(chance.rounds, play.gain));
      else notes.push(PLAYERS_WORDS.chanceOne);
    }
    const twin = twins.get(play.id);
    if (twin) notes.push(twinLine(twin));
    if (play.id === 'learned' && fire?.to_the_learned_agent && PLAYERS_WORDS.learned[fire.to_the_learned_agent]) notes.push(PLAYERS_WORDS.learned[fire.to_the_learned_agent]);
    if (play.id === SEES_THE_ANSWER) notes.push(SEES_THE_ANSWER_LINE);
    return notes;
  };

  // What the guide reads: the players and their gains, whether what the looks found is drawn, and the two commands.
  const canReveal = !line && !foundShown;
  useEffect(() => {
    publishPlayersView({
      state: line === null ? 'ready' : underWay ? 'held' : line === PLAYERS_WORDS.playing ? 'loading' : 'failed',
      line,
      from: line !== null ? null : ended ? 'round' : 'plays',
      players: summaries.map((p) => {
        const chance = chanceOf(p.draws);
        return {
          id: p.id,
          name: p.name,
          gain: chance && chance.rounds > 1 ? chance.mean : p.gain,
          ...(chance ? { rounds: chance.rounds, least: chance.least, most: chance.most } : {}),
          sameLooksAs: twins.get(p.id) ?? null,
        };
      }),
      foundShown,
      canReveal,
      watching: !whole,
      reveal: () => setAsked(true),
      watch,
    });
  }, [line, underWay, ended, summaries, twins, foundShown, canReveal, whole]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => publishPlayersView(PLAYERS_CLOSED), []);

  return (
    <div className="agent-picture">
      {line ? (
        <p className="agent-picture__line sys-body" role="status">
          {line}
        </p>
      ) : (
        <ComparePlane
          blocks={blocks}
          labelSpace={UNDER_BLOCK}
          perRow={blocks.length > 3 ? 3 : blocks.length}
          ariaLabel={PLAYERS_WORDS.name}
          renderLabel={(block) => {
            const play = summaries.find((p) => p.id === block.id);
            return play ? <PlayerLabel play={play} {...shownGain(play)} scale={scale} notes={notesOf(play)} /> : null;
          }}
        />
      )}
      {!guideSpeaks && (
        <div className="agent-picture__foot">
          {!line && <span className="sys-fine agent-picture__legend">{PLAYERS_WORDS.legend(foundShown)}</span>}
          <span className="agent-picture__acts">
            {canReveal && (
              <button type="button" className="agent-act" onClick={() => setAsked(true)}>
                {PLAYERS_WORDS.reveal}
              </button>
            )}
            {!line && (
              <button type="button" className="agent-act" onClick={watch} disabled={!whole}>
                {PLAYERS_WORDS.watch}
              </button>
            )}
            {onClose && (
              <button type="button" className="agent-act" onClick={onClose}>
                <span className="agent-key">Esc</span>
                {PLAYERS_WORDS.close}
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
