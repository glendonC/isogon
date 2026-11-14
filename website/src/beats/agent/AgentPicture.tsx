import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspace } from '../../app/store';
import { ComparePlane } from '../../compare/ComparePlane';
import { groundOfRun, playBlocks, readPlay, sameLooks, seenRows, shareOfCeiling, signed, type PlaySummary } from '../../compare/blocks';
import type { CompareAnchor } from '../../compare/types';
import { platformName } from '../../content/realRuns';
import { usePlays } from './usePlays';
import './agent.css';

/**
 * The Agent part's picture: the round on the open fire, one block per player. A block says which player, where it
 * looked (its tiles stay lit, numbered in order, with what its looks found) and what it gained against the
 * ceiling. It fills its parent. It reads the place and the run from the workspace and asks for the plays itself;
 * the shell only has to mount it where the stage is.
 */

/** Time between two looks while a play is watched, ms. */
const LOOK_MS = 1100;
/** Room kept under the row of blocks: the label, then the picked player's card. Pixels. */
const UNDER_BLOCKS = 364;
/** Where the card starts under a block's lowest corner, below the label. Pixels. */
const CARD_BELOW = 112;
const CARD_WIDTH = 400;

/** Under a block: the player, its gain, and the gain as a share of the ceiling's on a bar. */
function PlayerLabel({ play, ceiling, shown, twin }: { play: PlaySummary; ceiling: number | null; shown: number | null; twin: string | undefined }) {
  // While a play is watched, the gain so far: the rewards of the looks on show
  const looks = shown === null ? play.looks : play.looks.slice(0, shown);
  const whole = shown === null || shown >= play.looks.length;
  const gain = whole ? play.gain : looks.every((l) => l.reward !== null) ? looks.reduce((a, l) => a + (l.reward ?? 0), 0) : null;
  const share = shareOfCeiling(gain, ceiling);
  return (
    <div className="agent-label sys-plate">
      <div className="sys-title">{play.name}</div>
      <div className="agent-label__gain">
        {gain !== null && <span className="sys-value">{signed(gain)}</span>}
        {share !== null && <span className="sys-label">{share >= 0 ? `${share}% of the Ceiling` : 'below where it started'}</span>}
      </div>
      {share !== null && (
        <div className="sys-readout__bar" style={{ ['--fill' as string]: `${Math.min(100, Math.max(0, share))}%` }}>
          <span />
        </div>
      )}
      <div className="sys-fine">{whole && twin ? `the same looks as ${twin}` : '\u00a0'}</div>
    </div>
  );
}

function PlayCard({ play, anchor, width }: { play: PlaySummary; anchor: CompareAnchor; width: number }) {
  // Under its own block, so that it covers no other; kept inside the picture at the sides
  const left = Math.min(Math.max(anchor.x - CARD_WIDTH / 2, 8), Math.max(8, width - CARD_WIDTH - 8));
  const why = [...new Set(play.looks.map((l) => l.why).filter((w): w is string => !!w))];
  return (
    <div className="agent-card sys-card sys-plate" style={{ left, top: anchor.y + CARD_BELOW, width: CARD_WIDTH }}>
      <div className="sys-label sys-strong">{play.name}</div>
      <table className="sys-table">
        <thead>
          <tr>
            <th>Look</th>
            <th>Pass</th>
            <th>Found</th>
            <th>Reward</th>
          </tr>
        </thead>
        <tbody>
          {play.looks.map((l, i) => (
            <tr key={l.decision}>
              <td className="sys-num">{i + 1}</td>
              <td>
                {l.platform ? platformName(l.platform) : ''} {l.timeUtc ? `${l.timeUtc.slice(0, 10)} ${l.timeUtc.slice(11, 16)} UTC` : ''}
              </td>
              <td className="sys-num">{l.found.length}</td>
              <td className="sys-num">{l.reward !== null ? signed(l.reward) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {why.map((w) => (
        <div key={w} className="sys-fine">
          {w}
        </div>
      ))}
    </div>
  );
}

export function AgentPicture() {
  const ws = useWorkspace();
  const run = ws.run.active;
  const real = ws.run.isReal && !!ws.run.realStart;
  // A person's own round on this fire that is not over: the players' looks would show them what is still hidden
  const roundUnderWay = ws.round.state !== null && ws.round.end === null;
  const plays = usePlays(real ? ws.place.regionId : null, real ? ws.run.realStart : null, roundUnderWay);

  const ground = useMemo(() => groundOfRun(run), [run]);
  const seen = useMemo(() => seenRows(run), [run]);
  const [picked, setPicked] = useState<string | null>(null);
  // How many looks are shown while a play is watched; null shows all of them
  const [looks, setLooks] = useState<number | null>(null);
  const [anchors, setAnchors] = useState<CompareAnchor[]>([]);
  const hostRef = useRef<HTMLDivElement>(null);

  const summaries = useMemo(
    () => (plays.state === 'plays' ? plays.plays.map(readPlay).filter((p): p is PlaySummary => p !== null) : []),
    [plays],
  );
  const most = useMemo(() => Math.max(0, ...summaries.map((p) => p.looks.length)), [summaries]);

  const blocks = useMemo(() => {
    const made = plays.state === 'plays' ? playBlocks(ground, plays.plays, { seen, looks: looks ?? undefined }) : [];
    return made.map((b) => (b.id === picked ? { ...b, state: 'selected' as const } : b));
  }, [plays, ground, seen, looks, picked]);

  // Watching: the looks arrive one after another, then every look stands
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
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!still) setLooks(0);
  };

  const line =
    plays.state === 'held'
      ? 'Finish your round in Test world first. The players show what their looks found, which your round has not seen yet.'
      : plays.state === 'loading'
        ? 'Each player is playing this round.'
        : plays.state === 'closed' || plays.state === 'unserved' || plays.state === 'failed'
          ? plays.line
          : plays.state === 'idle'
            ? 'The players play on a real fire. Open a place with NASA FIRMS rows.'
            : blocks.length === 0
              ? 'This round is on other ground than the run on show, so it cannot be drawn here.'
              : null;

  const ceiling = useMemo(() => (plays.state === 'plays' && plays.ceiling ? readPlay(plays.ceiling) : null), [plays]);
  const twins = useMemo(() => sameLooks(summaries), [summaries]);
  const pickedPlay = summaries.find((p) => p.id === picked);
  const pickedAnchor = anchors.find((a) => a.id === picked);
  const start = summaries[0]?.scoreStart ?? null;

  return (
    <div className="agent-picture" ref={hostRef}>
      {line ? (
        <p className="agent-picture__line sys-body">{line}</p>
      ) : (
        <ComparePlane
          blocks={blocks}
          labelSpace={UNDER_BLOCKS}
          ariaLabel="The players of this round"
          onPick={(id) => setPicked((was) => (was === id ? null : id))}
          onAnchors={setAnchors}
          renderLabel={(block) => {
            const play = summaries.find((p) => p.id === block.id);
            return play ? <PlayerLabel play={play} ceiling={ceiling?.gain ?? null} shown={looks} twin={twins.get(play.id)} /> : null;
          }}
        />
      )}
      {!line && pickedPlay && pickedAnchor && looks === null && (
        <PlayCard play={pickedPlay} anchor={pickedAnchor} width={hostRef.current?.clientWidth ?? 0} />
      )}
      {!line && (
        <div className="agent-picture__foot">
          <button type="button" className="sys-ctl" onClick={watch} disabled={looks !== null}>
            Watch it play
          </button>
          <span className="sys-label">
            Lit tiles: where a player looked, in order. Filled marks: the VIIRS detections its looks found. Outlines: the MODIS detections every
            player could see.
            {ceiling?.gain != null ? ` The Ceiling sees the answer and gains ${signed(ceiling.gain)}` : ''}
            {typeof start === 'number' ? `${ceiling?.gain != null ? ',' : ' The round starts'} from a score of ${start.toFixed(3)}.` : ceiling?.gain != null ? '.' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
