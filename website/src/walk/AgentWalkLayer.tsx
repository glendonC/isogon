import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useWorkspace } from '../app/store';
import type { StageTileAnchor } from '../stage/earthCutawayTypes';
import { sameTileAnchors, useStageValue } from '../guide/StageWords';
import { ScenePrompt } from '../identity/ScenePrompt';
import { AGENT_FRAME, AGENT_WALK_WORDS, agentWalkState, stopAgentWalk, subscribeAgentWalk } from './agentWalk';
import { insetQuad, mixQuad, passTime, quadBox, squareName, squareQuad, type Quad } from './boardFrame';
import './walk.css';

/** How long the frame takes to move from one square to the next, ms: the walk's own, so the tick lands as it locks. */
const MOVE_MS = AGENT_FRAME.moveMs;
/** How far inside the square's own lines the frame stands, as a share of the way to its centre. */
const INSET = 0.12;
/** The reticle pads the box it is given by this much (identity/scene.ts `reticleBox`); the walk gives it less. */
const RETICLE_PAD = 24;
const ease = (t: number) => 1 - (1 - t) ** 3;
const sameQuad = (a: Quad, b: Quad) =>
  Math.abs(a.nw.x - b.nw.x) + Math.abs(a.nw.y - b.nw.y) + Math.abs(a.se.x - b.se.x) + Math.abs(a.se.y - b.se.y) < 6;

/**
 * What the agent's walk shows over the scene: the identity's reticle (`ScenePrompt`, closed) on the square the agent
 * chose, moving to each next one, with its action in words and one readout of what it is on; and, at the foot, the
 * walk's one line in plain words (`walk`). The square's place on screen is the stage's, reported every frame through
 * the round's anchors. A click on the reticle hands over, as any other input does.
 */
export function AgentWalkLayer() {
  const s = useSyncExternalStore(subscribeAgentWalk, agentWalkState, agentWalkState);
  const ws = useWorkspace();
  const anchors = useStageValue<StageTileAnchor[]>(ws.round.subscribeAnchors, [], sameTileAnchors);
  const square = s.look ? squareQuad(anchors, s.look.tile, s.cols) : null;
  const target = square ? insetQuad(square, INSET) : null;

  // The move from the last square drawn to the new one, redrawn each animation frame while it runs.
  const drawnRef = useRef<Quad | null>(null);
  const moveRef = useRef<{ from: Quad | null; t0: number }>({ from: null, t0: 0 });
  const [, setTick] = useState(0);
  const lookKey = s.look ? `${s.look.index}:${s.look.tile}` : null;
  useEffect(() => {
    if (!lookKey) {
      drawnRef.current = null;
      return;
    }
    // A look on the square the frame is already on closes it in and opens it again, so each look reads as one.
    const from = drawnRef.current;
    moveRef.current = { from: from && target && sameQuad(from, target) ? insetQuad(from, 0.35) : from, t0: performance.now() };
    let raf = 0;
    const step = () => {
      setTick((n) => n + 1);
      if (performance.now() - moveRef.current.t0 < MOVE_MS) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [lookKey]); // eslint-disable-line react-hooks/exhaustive-deps

  let drawn: Quad | null = null;
  if (target) {
    const { from, t0 } = moveRef.current;
    const t = Math.min(1, (performance.now() - t0) / MOVE_MS);
    drawn = from && t < 1 ? mixQuad(from, target, ease(t)) : target;
  }
  drawnRef.current = drawn ?? drawnRef.current;

  const readout = s.look
    ? [`LOOK ${s.look.index} OF ${s.look.of}`, `SQUARE ${squareName(s.look.tile, s.cols)}`, passTime(s.look.timeUtc)]
        .filter(Boolean)
        .join('   ')
    : '';

  return (
    <>
      {drawn && s.look && (
        <div className="walk-frame">
          <ScenePrompt box={quadBox(drawn, RETICLE_PAD)} label={AGENT_WALK_WORDS.beside} readout={readout} onSelect={stopAgentWalk} invite />
        </div>
      )}
      {s.line && (
        <div className="walk" data-place="foot" role="status" aria-live="polite" data-beat={s.beat ?? 'off'}>
          <p>{s.line}</p>
        </div>
      )}
    </>
  );
}
