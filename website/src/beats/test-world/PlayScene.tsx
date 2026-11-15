import { useWorkspace } from '../../app/store';
import type { StageFireAnchor, StageTileAnchor } from '../../stage/earthCutawayTypes';
import { sameFireAnchor, sameTileAnchors, useStageValue, type Box } from '../../guide/StageWords';
import { ScenePrompt } from '../../identity/ScenePrompt';
import { labelPoint } from '../../guide/anchor';
import { ClearPin, patchBoxes } from '../../guide/ClearPin';
import '../../styles/test-world.css';

/** A tile's box on screen, from the north-west corners the stage reports for it and its neighbours. */
function tileBox(anchors: StageTileAnchor[], tile: number, cols: number): Box | null {
  const at = (t: number) => anchors.find((a) => a.tile === t && a.visible) ?? null;
  const a = at(tile);
  if (!a || cols < 1) return null;
  const col = tile % cols;
  const east = col < cols - 1 ? at(tile + 1) : null;
  const west = col > 0 ? at(tile - 1) : null;
  const south = at(tile + cols);
  const north = at(tile - cols);
  const w = east ? east.x - a.x : west ? a.x - west.x : null;
  const h = south ? south.y - a.y : north ? a.y - north.y : null;
  if (w === null || h === null) return null;
  const xs = [a.x, a.x + w];
  const ys = [a.y, a.y + h];
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

const centre = (b: Box) => ({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 });

/**
 * Play on the stage: only what belongs to the scene. The label on the fire (the pass being decided), the label on the
 * square just looked at, and beside the marked square the prompt to look there, shown only while the pointer is on it
 * or the keyboard has marked it. The tiles and their marks are the stage's; every word is the script's.
 */
export function PlayScene() {
  const ws = useWorkspace();
  const { guide, round } = ws;
  const fire = useStageValue<StageFireAnchor | null>(ws.model.subscribeAnchor, null, sameFireAnchor);
  const anchors = useStageValue<StageTileAnchor[]>(round.subscribeAnchors, [], sameTileAnchors);
  // The fire's label hangs on its larger patch.
  const fireAt = labelPoint(fire);
  // The labels stand clear of the fire's patches.
  const avoid = patchBoxes(fire);

  const cols = round.start?.episode.tiles[1] ?? 0;
  const looked = round.takenTile !== null ? tileBox(anchors, round.takenTile, cols) : null;
  const marked = round.marked !== null ? tileBox(anchors, round.marked, cols) : null;
  // The keyboard marks a square with the arrows; the pointer marks the square it is over. The look stands on the marked
  // square itself (the identity's ScenePrompt), with the square's label as its readout.
  const act = guide.besideSquare;

  return (
    <div className="tw-scene" data-scene={guide.stateId ?? undefined}>
      {fireAt && guide.fireLabel && !guide.squareLabel && (
        <ClearPin at={fireAt} avoid={avoid} className="tw-pin" label={guide.fireLabel}>
          <span className="guide-label">{guide.fireLabel}</span>
        </ClearPin>
      )}
      {looked && guide.squareLabel && (
        <ClearPin at={centre(looked)} avoid={[looked, ...avoid]} className="tw-pin tw-pin--square" label={guide.squareLabel} focusable>
          <span className="guide-label">{guide.squareLabel}</span>
        </ClearPin>
      )}
      {act && marked && (
        <ScenePrompt
          box={marked}
          label={act.label}
          readout={guide.squareReadout ?? guide.squareLabel ?? undefined}
          onSelect={() => ws.runCommand(act.command)}
          shortcut={act.key ?? undefined}
        />
      )}
    </div>
  );
}
