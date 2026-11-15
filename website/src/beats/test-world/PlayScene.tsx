import { useWorkspace } from '../../app/store';
import type { StageFireAnchor, StageThingBox, StageTileAnchor } from '../../stage/earthCutawayTypes';
import { sameFireAnchor, sameTileAnchors, useStageValue, type Box } from '../../guide/StageWords';
import { ScenePrompt } from '../../identity/ScenePrompt';
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

const sameBox = (a: StageThingBox | null, b: StageThingBox | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.visible === b.visible &&
    Math.round(a.left) === Math.round(b.left) &&
    Math.round(a.top) === Math.round(b.top) &&
    Math.round(a.right) === Math.round(b.right) &&
    Math.round(a.bottom) === Math.round(b.bottom));

/**
 * Play on the stage: only what belongs to the scene. The pass being decided is the look's readout; the label on the
 * square just looked at, and beside the marked square the prompt to look there, shown only while the pointer is on it
 * or the keyboard has marked it. The tiles and their marks are the stage's; every word is the script's.
 */
export function PlayScene() {
  const ws = useWorkspace();
  const { guide, round } = ws;
  const fire = useStageValue<StageFireAnchor | null>(ws.model.subscribeAnchor, null, sameFireAnchor);
  const anchors = useStageValue<StageTileAnchor[]>(round.subscribeAnchors, [], sameTileAnchors);
  // The marked square as the stage boxes it (its things, G66): the ground of the square with its relief.
  const markedBox = useStageValue<StageThingBox | null>(round.subscribeMarkedBox, null, sameBox);
  // The labels stand clear of the fire's patches.
  const avoid = patchBoxes(fire);

  const cols = round.start?.episode.tiles[1] ?? 0;
  const looked = round.takenTile !== null ? tileBox(anchors, round.takenTile, cols) : null;
  const marked = round.marked !== null ? (markedBox?.visible ? markedBox : tileBox(anchors, round.marked, cols)) : null;
  // The keyboard marks a square with the arrows; the pointer marks the square it is over. The look stands on the marked
  // square itself (the identity's ScenePrompt), with the square's label as its readout.
  const act = guide.besideSquare;

  return (
    <div className="tw-scene" data-scene={guide.stateId ?? undefined}>
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
