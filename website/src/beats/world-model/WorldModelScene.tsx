import { useEffect, useState } from 'react';
import { useWorkspace } from '../../app/store';
import { beatOf } from '../../app/names';
import { fireAt, looksOf, onScreen, passFacts, recordLine, runBox, windowCounts } from './fire';
import '../../styles/world-model.css';

const list = (xs: number[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : String(xs[0] ?? ''));

/**
 * World model on a real run, in place on the terrain: the part's name as a banner when it opens, one label on the fire
 * (the pass on show while VIIRS is hidden; the verdict after the reveal; the record on a recorded test fire), the
 * pass count low left, and the one action above the track. Nothing is stacked in a column.
 */
export function WorldModelScene() {
  const ws = useWorkspace();
  const { run, test, time, model } = ws;
  const b = beatOf('model');
  const facts = passFacts(run.active, time.pass);
  const counts = windowCounts(run.active);
  const box = runBox(run.active);
  const fire = fireAt(run.active, time.pass);
  const at = fire && box ? onScreen(fire.lon, fire.lat, box, model.grid) : null;
  const scene = model.closed ? 'record' : test.loading ? 'hiding' : test.hidden ? 'blind' : test.revealed ? 'revealed' : 'open';
  const ahead = test.score ? test.score.verdict.filter((v) => v.ahead).length : null;
  const judged = test.score ? test.score.verdict.length : null;
  const iso = test.score?.methods.find((m) => m.id === 'reconstruction') ?? null;
  const record = recordLine(model.evidence);
  const looks = looksOf(model.evidence, run.active?.region.id ?? '');
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
        <span className="sys-label sys-strong">Recorded test fire{looks ? `: ${looks.name}` : ''}</span>
        {looks && (
          <span className="sys-label wm-wrap">
            On its {looks.ahead.length} looks, ahead of both simple methods on {list(looks.ahead)} of {looks.judged} scores, by plain
            comparison. It is not hidden or scored again; the terrain shows every satellite.
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

  // The plate hangs below an anchor near the top and opens to the left of one near the right edge.
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

      {at ? label : plate && <div className="wm-corner sys-plate">{plate}</div>}

      {facts && (
        <div className="wm-readout sys-readout sys-plate">
          {scene === 'revealed' && facts.held ? (
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
          ) : (
            <>
              <span className="sys-readout__delta">{facts.gap ? `${facts.gap} after the pass before` : 'the first pass'}</span>
              <span className="sys-display">
                {facts.index + 1}/{facts.count}
              </span>
              <span className="sys-readout__label">
                passes
                {counts && (scene === 'blind' || scene === 'revealed')
                  ? `. The estimate has ${counts.modisPasses} MODIS passes, ${counts.modisDetections.toLocaleString('en-US')} detections. ${counts.hiddenPasses} VIIRS passes are hidden.`
                  : ''}
              </span>
            </>
          )}
        </div>
      )}

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
