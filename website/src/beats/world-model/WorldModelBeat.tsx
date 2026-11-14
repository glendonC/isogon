import type { ReactNode } from 'react';
import { useWorkspace } from '../../app/store';
import { Action } from '../Action';

/** The estimated fire power at the pass on show. */
function FirePower({ powerMw, caption }: { powerMw: number | null; caption: string }) {
  return (
    <div className="iso-readout__power">
      <span className={`iso-readout__mw${powerMw === null ? ' iso-readout__mw--pending' : ''}`}>
        {powerMw === null ? 'Waiting for the run' : powerMw.toLocaleString()}
      </span>
      {powerMw !== null && <span className="iso-readout__unit">MW</span>}
      <span className="iso-readout__caption">{caption}</span>
    </div>
  );
}

/** The intensity scale: the real run's own encoding, or the simulated run's fixed linear key. */
function Legend() {
  const { run } = useWorkspace();
  const intensity = run.intensity;
  if (!intensity) {
    return (
      <div className="iso-scale">
        <div className="iso-scale__bar" aria-hidden="true" />
        <div className="iso-scale__ticks">
          <span>0</span>
          <span>40</span>
          <span>80+ MW/km²</span>
        </div>
        <p className="iso-scale__caption">Simulated intensity, linear scale</p>
      </div>
    );
  }
  return (
    <div className="iso-scale">
      <div className="iso-scale__bar" aria-hidden="true" />
      <div className="iso-scale__ticks iso-scale__ticks--placed">
        {intensity.ticks
          .filter((_, i, all) => all.length <= 4 || i % 2 === 0)
          .map((t, i, shown) => (
            <span key={t.mwKm2} style={{ left: `${t.at * 100}%` }} data-edge={i === 0 ? 'start' : i === shown.length - 1 ? 'end' : undefined}>
              {t.mwKm2.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              {i === shown.length - 1 ? ` ${intensity.unit}` : ''}
            </span>
          ))}
      </div>
      <p className="iso-scale__caption">Estimated fire power, {intensity.scale === 'log10' ? 'log scale' : 'linear scale'}</p>
    </div>
  );
}

/**
 * World model: the fire pass by pass, then its test with VIIRS hidden and revealed. `children` is what the shell
 * adds below the fire (a simulated run's callout).
 */
export function WorldModelBeat({ children }: { children?: ReactNode }) {
  const ws = useWorkspace();
  const { run, test, time, blocked, step } = ws;
  const span = run.span;

  if (step === 'fire') {
    return (
      <>
        <h2 className="iso-step__title">{run.isReal ? `The fire, ${span ?? ''}` : 'A simulated fire'}</h2>
        <p className="iso-step__line" data-source={run.source}>
          {run.isReal
            ? 'Every NASA FIRMS detection, pass by pass, at its real time. Play the passes, or pick one on the track.'
            : 'Simulated satellite passes, with no score: the simulation would score itself against its own answer.'}
        </p>
        <FirePower powerMw={time.powerMw} caption={`Estimated fire power at pass ${time.pass + 1}`} />
        <Legend />
        {run.model && (
          <p className="iso-step__note" data-status={run.model.status}>
            Model <strong>{run.model.status}</strong>
            {run.model.reason && !run.beforeSharp ? `: ${run.model.reason.replace(/\s*\([a-z_]+(\.[a-z_]+)+\)/g, '')}.` : '.'}
          </p>
        )}
        {run.beforeSharp && (
          <p className="iso-step__note">
            Before 2012 no sharp satellite flew: VIIRS began in January 2012. This is the estimate from MODIS alone, with
            nothing hidden to reveal, so there is no blind test.
          </p>
        )}
        {children}
        <div className="iso-step__foot">
          <Action label="Hide VIIRS and test the estimate" onClick={() => ws.goStep('test')} disabled={Boolean(blocked.test)} />
        </div>
      </>
    );
  }

  if (test.loading) {
    return (
      <>
        <h2 className="iso-step__title">Hiding VIIRS</h2>
        <p className="iso-step__line">Running the estimate from MODIS alone.</p>
      </>
    );
  }
  if (test.hidden) {
    return (
      <>
        <h2 className="iso-step__title">Blind test</h2>
        <p className="iso-step__line">
          VIIRS is hidden. The terrain shows the estimate made from MODIS alone{span ? `, ${span}` : ''}. The track shows
          when VIIRS passed over, not what it saw.
        </p>
        <FirePower powerMw={time.powerMw} caption={`Estimated fire power at pass ${time.pass + 1}, from MODIS alone`} />
        <Legend />
        <div className="iso-step__foot">
          <Action label={test.revealing ? 'Opening the hidden detections' : 'Reveal VIIRS'} onClick={test.act} keyName="V" disabled={test.revealing} />
        </div>
      </>
    );
  }
  if (test.revealed) {
    return (
      <>
        <h2 className="iso-step__title">Revealed</h2>
        <p className="iso-step__line">
          The terrain shows the blind run: the estimate made from MODIS alone, with the hidden VIIRS detections now laid on
          it. Step through the passes to see where they fall.
        </p>
        <Legend />
        <div className="iso-step__foot">
          <Action label="See the score" onClick={test.openScore} disabled={!test.score} />
        </div>
        {!test.score && <p className="iso-step__note">The blind test run came back without a score.</p>}
      </>
    );
  }
  return (
    <>
      <h2 className="iso-step__title">Blind test</h2>
      <p className="iso-step__line">{blocked.test ?? 'Hide VIIRS, the sharp satellite, and see what the estimate makes of MODIS alone.'}</p>
      {!blocked.test && (
        <div className="iso-step__foot">
          <Action label="Hide VIIRS" onClick={test.act} keyName="V" />
        </div>
      )}
    </>
  );
}
