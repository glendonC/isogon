import { useEffect, useRef, useState } from 'react';
import type { StageTileAnchor } from '../../stage/earthCutawayTypes';
import type { RoundState } from './round';
import { tileName } from '../../content/nextLook';
import '../../styles/test-world.css';

interface Props {
  round: RoundState;
  cols: number;
  focus: number | null;
  subscribe: (fn: (anchors: StageTileAnchor[]) => void) => () => void;
}

/**
 * The tiles' names and what each look found, at the corners the stage reports on the terrain. Only the tiles looked at
 * and the tile under focus carry a label. The anchors arrive every frame; this redraws at most once a frame and leaves
 * the shell alone.
 */
export function TileLabels({ round, cols, focus, subscribe }: Props) {
  const [anchors, setAnchors] = useState<StageTileAnchor[]>([]);
  const latest = useRef<StageTileAnchor[]>([]);
  const frame = useRef(0);
  useEffect(() => {
    const off = subscribe((a) => {
      latest.current = a;
      if (frame.current) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = 0;
        setAnchors(latest.current);
      });
    });
    return () => {
      off();
      if (frame.current) window.cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [subscribe]);

  const found = new Map<number, number>();
  for (const p of round.picks) if (p.tile !== null) found.set(p.tile, (found.get(p.tile) ?? 0) + p.pixels);

  return (
    <div className="tw-labels" aria-hidden="true">
      {anchors
        .filter((a) => a.visible && (found.has(a.tile) || a.tile === focus))
        .map((a) => (
          <span
            key={a.tile}
            className="tw-label sys-plate"
            data-focus={a.tile === focus ? 'true' : undefined}
            style={{ left: `${Math.round(a.x) + 6}px`, top: `${Math.round(a.y) + 6}px` }}
          >
            <span className="sys-label sys-strong">{tileName(a.tile, cols)}</span>
            {found.has(a.tile) && <span className="sys-value">{found.get(a.tile)!.toLocaleString('en-US')}</span>}
          </span>
        ))}
    </div>
  );
}
