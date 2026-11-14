import { useEffect, useRef } from 'react';
import { useDialogFocus } from '../ui/useDialogFocus';
import type { OverlapEvidence } from '../content/calendar';
import type { ModelStatus } from '../content/realRuns';

export type DocTabId = 'architecture' | 'sensors' | 'validation';

/** What the sheet can state from real data. Simulated scores are never passed in. */
export interface MethodEvidence {
  /** Whether the run on screen is a real NASA FIRMS run. */
  real: boolean;
  /** The real run's model block: status, method, what it was fitted and validated on. */
  model: ModelStatus | null;
  /** The real calendar's overlap ratio and its held-out check, for the place named. */
  overlap: OverlapEvidence | null;
  overlapPlace: string | null;
  /** The reconstruction's interval in this run's blind test, once one has run. */
  interval: { covered: number; n: number; level: number | null } | null;
}

interface MethodSheetProps {
  open: boolean;
  initialTab?: DocTabId;
  onClose: () => void;
  evidence: MethodEvidence;
  /** Imagery credit from the active run (ui/attribution.ts). */
  imageryCredit: string;
  /** Vertical exaggeration factor of the terrain, once the stage reports one. */
  verticalExaggeration?: number | null;
  /** The body only, inside the reading sheet. */
  embedded?: boolean;
}

/** Backend wording made readable: no source-file note, region ids as names, a capital first letter. */
function clean(t: string): string {
  const out = t
    .replace(/\s*\(backend\/[^)]*\)\s*$/, '')
    .replace(/plumas_ca/g, 'Feather River')
    .replace(/lytton_bc/g, 'Lytton')
    .replace(/evia_greece/g, 'Evia');
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** The steps, true for the real model; the run's own words replace the fallbacks when a real run is on screen. */
function stepsFor(model: ModelStatus | null) {
  return [
    {
      title: 'Each detection as the satellite saw it',
      body:
        'Every NASA FIRMS detection is drawn with its own scan and track footprint. A MODIS pixel grows from 1 km at nadir to about 4.8 by 2.0 km at the 55° scan edge; VIIRS stays near 375 m.',
    },
    {
      title: 'Fitted on other fires',
      body: model?.fittedOn
        ? `Fitted on ${clean(model.fittedOn).replace(/^./, (c) => c.toLowerCase())}.${model.validatedOn ? ` Checked on ${clean(model.validatedOn).replace(/^./, (c) => c.toLowerCase())}.` : ''}`
        : 'Fitted on real fires in the three regions with the 2021 test fires left out, and checked on later years.',
    },
    {
      title: 'One estimate on a 375 m grid, then a blind test',
      body: `${model?.method ? `${clean(model.method)}.` : 'A forward and backward filter on the 375 m grid.'} The blind test hides VIIRS, estimates from MODIS alone, and scores the estimate against the hidden detections beside two baselines.`,
    },
  ];
}

export function MethodSheet({
  open,
  onClose,
  evidence,
  imageryCredit,
  verticalExaggeration,
  embedded = false,
}: MethodSheetProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus(open && !embedded, sheetRef, closeRef);

  useEffect(() => {
    if (!open || embedded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, embedded, onClose]);

  if (!open) return null;

  const body = (
    <>

        <p className="iso-sheet__lede">
          A raw fire detection mixes the fire itself with how the satellite looked at it: off-nadir pixel
          growth, the smallest fire each sensor can detect, cloud, and gaps between passes. Isogon models
          each sensor&apos;s view, separates it from the fire, and lays the calibrated 375 m record on
          real terrain.
        </p>

        <p className="iso-sheet__lede iso-method__status">
          Every number says where it comes from. The calendar and runs marked NASA FIRMS read real
          detections. A simulated run is shown without scores: a simulation can only be scored against its
          own answer.
        </p>

        <ol className="iso-method__steps">
          {stepsFor(evidence.model).map((step, i) => (
            <li key={step.title} className="iso-method__step">
              <span className="iso-method__num">{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>

        <table className="iso-table iso-table--sheet">
          <tbody>
            <tr>
              <th scope="row">2012 continuity</th>
              <td>
                {evidence.overlap
                  ? `Suomi NPP flags ${evidence.overlap.ratio.toFixed(2)} times the pixels of Terra and Aqua`
                  : 'measured on the real calendar'}
              </td>
              <td>
                {evidence.overlap
                  ? `${evidence.overlapPlace ?? 'this box'}, 2012 to 2025${
                      evidence.overlap.heldOutError !== null && evidence.overlap.withoutError !== null
                        ? `. Held-out year off by ${Math.round(evidence.overlap.heldOutError * 100)}%, ${Math.round(evidence.overlap.withoutError * 100)}% without the ratio`
                        : ''
                    }`
                  : ''}
              </td>
            </tr>
            <tr>
              <th scope="row">Interval</th>
              <td>
                {evidence.interval
                  ? `${evidence.interval.covered} of ${evidence.interval.n} overpasses inside`
                  : 'counted by the blind test'}
              </td>
              <td>
                {evidence.interval
                  ? `the stated ${evidence.interval.level !== null ? `${Math.round(evidence.interval.level * 100)}% ` : ''}interval, on the run on screen`
                  : 'press V on a real run'}
              </td>
            </tr>
            {evidence.model && (
              <tr data-status={evidence.model.status}>
                <th scope="row">Model</th>
                <td>{evidence.model.status}</td>
                <td>as the run on screen states it</td>
              </tr>
            )}
            <tr>
              <th scope="row">Blind test</th>
              <td>V hides 375 m VIIRS</td>
              <td>scores the MODIS-only estimate against it, beside two baselines</td>
            </tr>
            <tr>
              <th scope="row">Elevation</th>
              <td>AWS Terrarium, about 30 m</td>
              <td>meshed per region</td>
            </tr>
            <tr>
              <th scope="row">Imagery</th>
              <td>Esri World Imagery</td>
              <td>{imageryCredit}</td>
            </tr>
            {verticalExaggeration ? (
              <tr>
                <th scope="row">Relief</th>
                <td>{verticalExaggeration.toFixed(1)}x vertical exaggeration</td>
                <td>same factor for every region</td>
              </tr>
            ) : null}
            <tr>
              <th scope="row">Fire texture</th>
              <td>drawn from the run&apos;s field</td>
              <td>a rendering treatment, not a retrieved product</td>
            </tr>
            <tr>
              <th scope="row">Smoke</th>
              <td>drawn from the run&apos;s detections</td>
              <td>a rendering treatment, not a retrieved product</td>
            </tr>
            <tr>
              <th scope="row">Exports</th>
              <td>GeoJSON (RFC 7946) and CSV</td>
              <td>with 90% intervals</td>
            </tr>
          </tbody>
        </table>
    </>
  );

  if (embedded) return <div className="iso-method">{body}</div>;

  return (
    <div className="iso-backdrop iso-backdrop--center" onClick={onClose} role="presentation">
      <div
        ref={sheetRef}
        className="iso-sheet iso-method"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="iso-method-title"
      >
        <div className="iso-sheet__head">
          <h2 id="iso-method-title" className="iso-sheet__title">
            Method
          </h2>
          <button ref={closeRef} type="button" className="iso-key" onClick={onClose}>
            <kbd>Esc</kbd>
            <span>Close</span>
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}
