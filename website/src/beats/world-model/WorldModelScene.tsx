import { useEffect, useState } from 'react';
import { useWorkspace } from '../../app/store';
import { fireNameWords, fireOfStart } from '../../app/places';
import { utcDay } from '../../content/realRuns';
import { beatOf } from '../../app/names';
import type { StageFireAnchor } from '../../stage/earthCutawayTypes';
import { fireAt, fireExtent, hoursWords, looksOf, onScreen, passFacts, recordLine, runBox, satelliteName, windowCounts, type ScreenBox } from './fire';
import '../../styles/world-model.css';

const list = (xs: number[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : String(xs[0] ?? ''));

/** The stage's fire anchor, at most once a frame, without redrawing the shell. */
function useFireAnchor(subscribe: (fn: (a: StageFireAnchor | null) => void) => () => void): StageFireAnchor | null {
  const [anchor, setAnchor] = useState<StageFireAnchor | null>(null);
  useEffect(() => {
    let latest: StageFireAnchor | null = null;
    let frame = 0;
    const off = subscribe((a) => {
      latest = a;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setAnchor((was) =>
          was && latest && Math.abs(was.x - latest.x) < 0.5 && Math.abs(was.y - latest.y) < 0.5 && was.right === latest.right && was.visible === latest.visible
            ? was
            : latest,
        );
      });
    });
    return () => {
      off();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [subscribe]);
  return anchor;
}

const PLATE_W = 440;
const GAP = 40;
const EDGE = 24;

/**
 * World model on a real run, in place on the terrain: the part's name as a banner when it opens, one label on the fire
 * for the pass on show while VIIRS is hidden, the verdict after the reveal (or the record on a recorded test fire)
 * beside the fire's extent with a leader to it, what was hidden low left, and the one action above the track. Nothing
 * is stacked in a column, and nothing repeats what the track says.
 */
/** The stage's box of the fire on show, with a margin for the glow, held inside the screen; null when off screen. */
function anchorBox(a: StageFireAnchor | null): ScreenBox | null {
  if (!a || !(a.right > a.left) || !(a.bottom > a.top)) return null;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const m = 14;
  const box = { left: Math.max(0, a.left - m), top: Math.max(0, a.top - m), right: Math.min(W, a.right + m), bottom: Math.min(H, a.bottom + m) };
  return box.right - box.left > 8 && box.bottom - box.top > 8 ? box : null;
}

export function WorldModelScene() {
  const ws = useWorkspace();
  const { run, test, time, model } = ws;
  const b = beatOf('model');
  const facts = passFacts(run.active, time.pass);
  const counts = windowCounts(run.active);
  const box = runBox(run.active);
  const fire = fireAt(run.active, time.pass);
  // Where the fire is on screen: the stage's own anchor when it has one in view, else the centroid through the grid.
  const anchor = useFireAnchor(model.subscribeAnchor);
  const at = anchor?.visible ? { x: anchor.x, y: anchor.y } : fire && box ? onScreen(fire.lon, fire.lat, box, model.grid) : null;
  const scene = model.closed ? 'record' : test.loading ? 'hiding' : test.hidden ? 'blind' : test.revealed ? 'revealed' : 'open';
  const ahead = test.score ? test.score.verdict.filter((v) => v.ahead).length : null;
  const judged = test.score ? test.score.verdict.length : null;
  const iso = test.score?.methods.find((m) => m.id === 'reconstruction') ?? null;
  const record = recordLine(model.evidence);
  const looks = looksOf(model.evidence, run.active?.region.id ?? '');
  const registryFire = run.active ? fireOfStart(ws.places, run.active.region.id, run.realStart) : null;
  const nameWords = registryFire ? fireNameWords(registryFire) : null;
  // A recorded test fire may open on another window than the one on record: the record says which.
  const otherWindow = looks && run.realStart && looks.firstUtc.slice(0, 10) !== run.realStart.slice(0, 10) ? looks.firstUtc : null;
  // The banner shows once each time the part opens, when its run is in (not while a run is being asked for).
  const settled = scene !== 'hiding' && !run.pendingStart;
  const [banner, setBanner] = useState(false);
  useEffect(() => {
    if (settled) setBanner(true);
  }, [settled]);

  let plate: React.ReactNode = null;
  let hidden = false;
  if (scene === 'blind' && facts) {
    hidden = facts.held;
    plate = (
      <>
        <span className="sys-label sys-strong">
          {facts.satellite}
          {facts.held ? ', hidden' : ''}
        </span>
        <span className="sys-value">
          {facts.utc} <span className="sys-unit">{facts.local}</span>
        </span>
        <span className="sys-fine">
          {facts.held
            ? 'What it saw comes back with the reveal.'
            : `${(facts.detections ?? 0).toLocaleString('en-US')} detections, given to the estimate.`}
        </span>
        {facts.held && model.lastSeen && (
          <span className="sys-fine">
            The glow is the fire as {satelliteName(model.lastSeen.sensor)} last saw it, {hoursWords(model.lastSeen.hoursBefore)} before.
          </span>
        )}
      </>
    );
  } else if (scene === 'revealed' && ahead !== null && judged !== null) {
    plate = (
      <>
        <span className="sys-label">On this window, by plain comparison</span>
        <span className="sys-display">
          {ahead} of {judged}
        </span>
        <span className="sys-label wm-ink">scores ahead of both simple methods</span>
        {iso && iso.intervalCovered !== null && iso.intervalN !== null && (
          <span className="sys-label">
            The stated range held on {iso.intervalCovered} of {iso.intervalN} hidden passes.
          </span>
        )}
        {record && <span className="sys-fine wm-wrap">{record}</span>}
        <span className="wm-actions">
          <button type="button" className="sys-ctl" onClick={test.openScore}>
            <span className="sys-key">Enter</span> The seven scores
          </button>
          <button type="button" className="sys-ctl" onClick={model.openEvidence}>
            <span className="sys-key">E</span> Every test on record
          </button>
        </span>
      </>
    );
  } else if (scene === 'record') {
    plate = (
      <>
        <span className="sys-label sys-strong">A recorded test fire</span>
        {nameWords && <span className="sys-fine wm-wrap">{nameWords}.</span>}
        {looks && (
          <span className="sys-label wm-wrap">
            On its {looks.ahead.length} looks, ahead of both simple methods on {list(looks.ahead)} of {looks.judged} scores, by plain
            comparison. It is not hidden or scored again; the terrain shows every satellite.
          </span>
        )}
        {otherWindow && run.realStart && (
          <span className="sys-fine wm-wrap">
            The record is of the window from {utcDay(otherWindow)}; the terrain shows the run from {utcDay(run.realStart)}.
          </span>
        )}
        <span className="wm-actions">
          <button type="button" className="sys-ctl" onClick={model.openEvidence}>
            <span className="sys-key">E</span> Every test on record
          </button>
        </span>
      </>
    );
  } else if (scene === 'hiding') {
    plate = <span className="sys-label">Hiding VIIRS: the estimate is made again from MODIS alone.</span>;
  } else if (facts) {
    plate = (
      <>
        <span className="sys-label sys-strong">{facts.satellite}</span>
        <span className="sys-value">
          {facts.utc} <span className="sys-unit">{facts.local}</span>
        </span>
        <span className="sys-fine wm-wrap">
          {run.beforeSharp
            ? 'Before 2012 no VIIRS flew: the estimate from MODIS alone, with nothing hidden to reveal.'
            : `${(facts.detections ?? 0).toLocaleString('en-US')} detections.`}
        </span>
      </>
    );
  }

  // Low left: what was hidden and, after the reveal, what it held. The pass and its count are the track's.
  let readout: React.ReactNode = null;
  if (scene === 'blind' && counts) {
    readout = (
      <>
        <span className="sys-display">{counts.hiddenPasses}</span>
        <span className="sys-readout__label">
          VIIRS passes hidden. The estimate has {counts.modisPasses} MODIS passes, {counts.modisDetections.toLocaleString('en-US')}{' '}
          detections.
        </span>
      </>
    );
  } else if (scene === 'revealed' && facts?.held) {
    readout = (
      <>
        <span className="sys-readout__delta">
          {facts.satellite}, {facts.utc}
        </span>
        <span className="sys-display">{(model.revealedHere ?? 0).toLocaleString('en-US')}</span>
        <span className="sys-readout__label">
          hidden detections on this pass, now shown
          {model.revealedTotal
            ? `. ${model.revealedTotal.detections.toLocaleString('en-US')} over the ${counts?.hiddenPasses ?? model.revealedTotal.passes} hidden passes.`
            : ''}
        </span>
      </>
    );
  } else if (scene === 'revealed' && model.revealedTotal) {
    readout = (
      <>
        <span className="sys-display">{model.revealedTotal.detections.toLocaleString('en-US')}</span>
        <span className="sys-readout__label">
          hidden detections over the {counts?.hiddenPasses ?? model.revealedTotal.passes} hidden passes, now shown
        </span>
      </>
    );
  }

  // The plate hangs below an anchor near the top and opens to the left of one near the right edge.
  // The verdict and the record are about the whole window: beside the fire's extent, never over it.
  const ext = scene === 'revealed' || scene === 'record' ? anchorBox(anchor) ?? fireExtent(run.active, box, model.grid) : null;
  let beside: React.ReactNode = null;
  if (ext && plate) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const roomRight = W - EDGE - (ext.right + GAP);
    const roomLeft = ext.left - GAP - EDGE;
    const right = roomRight >= PLATE_W || (roomLeft < PLATE_W && roomRight >= roomLeft);
    const plateLeft = right ? Math.min(ext.right + GAP, W - EDGE - PLATE_W) : Math.max(EDGE, ext.left - GAP - PLATE_W);
    const cy = Math.max(190, Math.min(H - 330, (ext.top + ext.bottom) / 2));
    const leadY = Math.max(ext.top, Math.min(ext.bottom, cy));
    const leadFrom = right ? ext.right : plateLeft + PLATE_W;
    const leadTo = right ? plateLeft : ext.left;
    beside = (
      <>
        <span className="wm-extent" style={{ left: ext.left, top: ext.top, width: ext.right - ext.left, height: ext.bottom - ext.top }} />
        {leadTo - leadFrom > 4 && <span className="wm-beside__leader" style={{ left: leadFrom, top: leadY, width: leadTo - leadFrom }} />}
        <div className={`wm-beside sys-plate${hidden ? ' sys-hidden' : ''}`} style={{ left: plateLeft, top: cy, width: PLATE_W }}>
          {plate}
        </div>
      </>
    );
  }

  const hang = at && at.y < 300 ? 'below' : 'above';
  const side = at && at.x > window.innerWidth - 460 ? 'left' : 'right';
  const label = plate && (
    <div
      className="sys-pin wm-pin"
      data-hang={hang}
      data-side={side}
      style={{ ['--x' as string]: `${at?.x ?? 0}px`, ['--y' as string]: `${at?.y ?? 0}px`, ['--lead' as string]: hang === 'below' ? (scene === 'revealed' ? '56px' : '80px') : scene === 'revealed' ? '150px' : '110px' }}
    >
      <span className="sys-pin__leader" />
      <span className="sys-pin__anchor" />
      <div className={`sys-pin__plate sys-plate${hidden ? ' sys-hidden' : ''}`}>{plate}</div>
    </div>
  );

  return (
    <div className="wm-scene" data-scene={scene}>
      {banner && (
        <div className="wm-banner sys-plate">
          <span className="sys-title">World model</span>
          <span className="sys-label">{(scene === 'record' && b.recordLine) || (run.beforeSharp && b.earlyLine) || b.line}</span>
        </div>
      )}

      {beside ?? (at ? label : plate && <div className="wm-corner sys-plate">{plate}</div>)}

      {readout && <div className="wm-readout sys-readout sys-plate">{readout}</div>}

      {scene === 'blind' && (
        <button type="button" className="sys-ctl sys-plate wm-act" onClick={test.act} disabled={test.revealing}>
          <span className="sys-key">V</span> {test.revealing ? 'Opening the hidden detections' : 'Reveal VIIRS'}
        </button>
      )}
      {scene === 'open' && model.canHide && (
        <button type="button" className="sys-ctl sys-plate wm-act" onClick={() => ws.goStep('test')}>
          <span className="sys-key">V</span> Hide VIIRS and test the estimate
        </button>
      )}
    </div>
  );
}
