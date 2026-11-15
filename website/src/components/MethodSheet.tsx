import { useEffect, useState } from 'react';
import type { OverlapEvidence } from '../content/calendar';
import type { EvidenceDoc } from '../content/evidence';
import { parsePlaces } from '../app/places';
import { runWindow, utcSpan, type ModelStatus } from '../content/realRuns';
import { assetUrlNow, getJson, HttpError } from '../lib/api';
import {
  AlignedNumber,
  SideSheet,
  formatCountWord,
  formatListAnd,
  formatMetresFromKm,
  formatMonthYearOf,
  formatOneDecimal,
  formatPercentWhole,
  formatSheetCount,
  formatYearOf,
  useOptionalWorkspace,
} from './BlindScoreTable';
import '../styles/evidence.css';

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
  /** Optional handler to switch straight to Every Test on Record inside the viewer. */
  onOpenTests?: () => void;
}

interface LiveCalendarFields {
  regionId: string;
  placeName: string | null;
  storedDetections: number | null;
  firstMonth: string | null;
  lastMonth: string | null;
  sharpSinceYm: string | null;
  ratio: number | null;
  heldOutError: number | null;
  rawError: number | null;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const asStr = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

function parseLiveCalendarFields(regionId: string, raw: unknown): LiveCalendarFields | null {
  if (!isObj(raw) || raw.source !== 'firms') return null;
  const placeObj = isObj(raw.place) ? raw.place : null;
  const placeName = asStr(placeObj?.name) ?? asStr(raw.region_name);
  const storedDetections = asNum(raw.downloaded_firms_rows);
  const metrics = isObj(raw.summary_metrics) ? raw.summary_metrics : {};
  const firstMonth = asStr(metrics.first_month);
  const lastMonth = asStr(metrics.last_month);
  const ratio = asNum(metrics.viirs_to_modis_overlap_ratio);
  const heldOutError = asNum(metrics.held_out_median_abs_relative_error);
  const rawError = asNum(metrics.held_out_median_abs_relative_error_without_harmonization);

  let sharpSinceYm: string | null = null;
  if (Array.isArray(raw.regime_markers)) {
    for (const m of raw.regime_markers) {
      if (!isObj(m)) continue;
      const label = asStr(m.label);
      const ym = asStr(m.year_month);
      if (label && label.startsWith('VIIRS') && ym) {
        sharpSinceYm = ym;
        break;
      }
    }
  }

  return {
    regionId,
    placeName,
    storedDetections,
    firstMonth,
    lastMonth,
    sharpSinceYm,
    ratio,
    heldOutError,
    rawError,
  };
}

function readSharpSquareKm(activeRun: unknown): number | null {
  if (!isObj(activeRun)) return null;
  const bf = isObj(activeRun.belief_frames) ? activeRun.belief_frames : null;
  const grid = bf && isObj(bf.grid) ? bf.grid : null;
  return asNum(grid?.cell_km);
}

function readTerrainPackCredit(activeRun: unknown): string | null {
  if (!isObj(activeRun)) return null;
  const img = isObj(activeRun.imagery) ? activeRun.imagery : null;
  const tp = img && isObj(img.terrain_pack) ? img.terrain_pack : null;
  const ov = img && isObj(img.overview) ? img.overview : null;
  return asStr(tp?.credit) ?? asStr(ov?.credit);
}

/**
 * Document body for "Method and Data", following SHEETS-copy.json.
 * Every figure is read live from /api/calendar, /api/regions, /api/evidence and the active run; absent values stay absent.
 */
export function MethodDocument({
  evidence,
  imageryCredit,
  verticalExaggeration,
  onOpenTests,
}: {
  evidence: MethodEvidence;
  imageryCredit: string;
  verticalExaggeration?: number | null;
  onOpenTests?: () => void;
}) {
  const store = useOptionalWorkspace();
  const regionId = store?.place.regionId ?? 'plumas_ca';

  const [calFields, setCalFields] = useState<LiveCalendarFields | null>(null);
  const [fallbackEvidence, setFallbackEvidence] = useState<EvidenceDoc | null>(null);
  const [fallbackPlaces, setFallbackPlaces] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    getJson<unknown>('/api/calendar', { region_id: regionId, source: 'firms' }, { signal: controller.signal })
      .then((raw) => {
        if (controller.signal.aborted) return;
        setCalFields(parseLiveCalendarFields(regionId, raw));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof HttpError && err.status === 404) setCalFields(null);
      });
    return () => controller.abort();
  }, [regionId]);

  const liveEvidence = store?.model.evidence ?? fallbackEvidence;
  useEffect(() => {
    if (store?.model.evidence) return;
    const controller = new AbortController();
    getJson<unknown>('/api/evidence', undefined, { signal: controller.signal })
      .then((d) => {
        if (!controller.signal.aborted && isObj(d) && isObj(d.test_fires)) {
          setFallbackEvidence(d as unknown as EvidenceDoc);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [store?.model.evidence]);

  const storePlaceNames =
    store?.places.places.filter((p) => p.rows === 'firms').map((p) => p.name) ?? [];
  useEffect(() => {
    if (storePlaceNames.length > 0) return;
    const controller = new AbortController();
    getJson<unknown>('/api/regions', undefined, { signal: controller.signal })
      .then((raw) => {
        if (controller.signal.aborted) return;
        const parsed = parsePlaces(raw);
        setFallbackPlaces(parsed.places.filter((p) => p.rows === 'firms').map((p) => p.name));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [storePlaceNames.length]);

  const calForRegion = calFields?.regionId === regionId ? calFields : null;
  const storeCal = store?.calendar.state.cal && !store.calendar.state.cal.simulated ? store.calendar.state.cal : null;

  const placeName = calForRegion?.placeName ?? storeCal?.regionName ?? evidence.overlapPlace ?? store?.place.title ?? null;
  const storedDetections = formatSheetCount(calForRegion?.storedDetections);
  const recordFirstYear =
    formatYearOf(calForRegion?.firstMonth) ?? (storeCal ? String(storeCal.firstYear) : null);
  const recordLastMonth = formatMonthYearOf(calForRegion?.lastMonth);
  const sharpSince = formatYearOf(calForRegion?.sharpSinceYm) ?? (storeCal ? '2012' : null);

  const rawRatio = calForRegion?.ratio ?? evidence.overlap?.ratio ?? storeCal?.overlap?.ratio ?? null;
  const sharpToCoarse = formatOneDecimal(rawRatio);
  const recordErrorPct = formatPercentWhole(
    calForRegion?.heldOutError ?? evidence.overlap?.heldOutError ?? storeCal?.overlap?.heldOutError ?? null,
  );
  const recordErrorRawPct = formatPercentWhole(
    calForRegion?.rawError ?? evidence.overlap?.withoutError ?? storeCal?.overlap?.withoutError ?? null,
  );

  const sharpSquareM = formatMetresFromKm(readSharpSquareKm(store?.run.active));
  const otherYears = liveEvidence ? formatListAnd(liveEvidence.validation.years.map(String)) : '';
  const testFiresWord = liveEvidence ? formatCountWord(liveEvidence.test_fires.fires.length) : null;
  const testFiresCap = testFiresWord ? testFiresWord.charAt(0).toUpperCase() + testFiresWord.slice(1) : null;

  const placesList = storePlaceNames.length > 0 ? storePlaceNames : fallbackPlaces;
  const placesWithFires = formatListAnd(placesList);

  const creditText = readTerrainPackCredit(store?.run.active) ?? (imageryCredit.trim() || null);
  const triggerTests = onOpenTests ?? store?.model.openEvidence;

  return (
    <>
      <section className="iso-doc-lead" aria-label="Summary">
        <p className="iso-doc-lead__p iso-doc-lead__p--strong">
          Everything on this page is real: NASA&apos;s fire detections, the satellites&apos; real passes, real ground.
        </p>
        <p className="iso-doc-lead__p">
          The model that estimates a fire is experimental, and every test of it is under{' '}
          {triggerTests ? (
            <button type="button" className="iso-inline-trigger" onClick={triggerTests}>
              Every Test on Record
            </button>
          ) : (
            'Every Test on Record'
          )}
          .
        </p>
      </section>

      <figure className="iso-doc-media" aria-label="Satellite square scale and record error check">
        <div className="iso-method-media">
          <div className="iso-method-squares">
            <div className="iso-method-sq-item">
              <div className="iso-method-sq-coarse" aria-hidden="true">
                {Array.from({ length: 9 }).map((_, idx) => (
                  <span key={idx} />
                ))}
              </div>
              <span className="iso-method-sq-label">Coarse square, 1 km at nadir</span>
            </div>
            <div className="iso-method-sq-item">
              <div className="iso-method-sq-sharp" aria-hidden="true" />
              <span className="iso-method-sq-label">
                Sharp square{sharpSquareM ? `, ${sharpSquareM} m` : ''}
              </span>
            </div>
          </div>

          {recordErrorPct !== null && recordErrorRawPct !== null && (
            <div className="iso-method-bars">
              <div className="iso-method-bar-row">
                <div className="iso-method-bar-head">
                  <span>Held-out year miss, one scale</span>
                  <span className="iso-method-bar-val">{recordErrorPct}%</span>
                </div>
                <div className="iso-method-bar-track">
                  <div
                    className="iso-method-bar-fill"
                    style={{ width: `${Math.min(100, Math.max(4, recordErrorPct))}%` }}
                  />
                </div>
              </div>
              <div className="iso-method-bar-row">
                <div className="iso-method-bar-head">
                  <span>Without scaling earlier years</span>
                  <span className="iso-method-bar-val">{recordErrorRawPct}%</span>
                </div>
                <div className="iso-method-bar-track">
                  <div
                    className="iso-method-bar-fill iso-method-bar-fill--raw"
                    style={{ width: `${Math.min(100, Math.max(4, recordErrorRawPct))}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        <figcaption className="iso-doc-media__caption">
          <span>
            {sharpToCoarse && placeName
              ? `In ${placeName}, the sharp satellite flags about ${sharpToCoarse} times as many detections in overlap years`
              : 'Coarse 1 km footprint beside the sharp grid cell'}
          </span>
          {verticalExaggeration ? <span>Relief shown at {verticalExaggeration.toFixed(1)}x</span> : null}
        </figcaption>
      </figure>

      <section className="iso-doc-section">
        <h3 className="iso-doc-section__title">The Detections</h3>
        <p className="iso-doc-section__p">
          NASA FIRMS, the public record of fires seen from orbit.
          {placeName && storedDetections && recordFirstYear && recordLastMonth
            ? ` For ${placeName}, ${storedDetections} detections are stored here, from ${recordFirstYear} to ${recordLastMonth}.`
            : ''}
        </p>
      </section>

      <section className="iso-doc-section">
        <h3 className="iso-doc-section__title">Two Kinds of Satellite</h3>
        {recordFirstYear && (
          <p className="iso-doc-section__p">
            The coarse kind (the MODIS instrument, on the satellites Terra and Aqua) has been on record since{' '}
            {recordFirstYear}.
          </p>
        )}
        {(sharpSince || sharpSquareM) && (
          <p className="iso-doc-section__p">
            The sharp kind (VIIRS, first on the satellite Suomi NPP and later on others of the same design)
            {sharpSince ? ` since ${sharpSince}.` : '.'}
            {sharpSquareM ? ` It sees squares ${sharpSquareM} metres across.` : ''}
          </p>
        )}
      </section>

      <section className="iso-doc-section">
        <h3 className="iso-doc-section__title">One Record</h3>
        {sharpToCoarse && (
          <p className="iso-doc-section__p">
            In the years both kinds flew, the sharp one made about {sharpToCoarse} times as many detections here. The
            earlier years are multiplied by that, so every year is on the sharp satellite&apos;s scale.
          </p>
        )}
        {recordErrorPct !== null && recordErrorRawPct !== null && (
          <p className="iso-doc-section__p">
            Hide one year and predict it from the others: in a typical year the prediction is off by {recordErrorPct}{' '}
            percent. Without the correction it is off by {recordErrorRawPct} percent.
          </p>
        )}
      </section>

      <section className="iso-doc-section">
        <h3 className="iso-doc-section__title">The Estimate</h3>
        <p className="iso-doc-section__p">
          The model follows every square{sharpSquareM ? ` of ${sharpSquareM} metres` : ''} through the passes and keeps
          the chance that it is burning. A coarse detection raises the chance in the squares under it, and between
          passes the chance spreads and fades.
        </p>
        <p className="iso-doc-section__p">
          It runs forward and then backward through the passes, so each moment also uses what was seen later.
        </p>
      </section>

      <section className="iso-doc-section">
        <h3 className="iso-doc-section__title">The Test</h3>
        <p className="iso-doc-section__p">
          The sharp satellite&apos;s detections are set apart first. The estimate is made and states what it expects at
          each real pass of the sharp satellite, and only then are those detections opened and compared, beside simple
          methods that use the coarse satellite as it is.
        </p>
        <p className="iso-doc-section__p">
          Delete the hidden detections and the estimate comes out the same. A test checks that.
        </p>
      </section>

      {(otherYears || testFiresCap) && (
        <section className="iso-doc-section">
          <h3 className="iso-doc-section__title">What It Was Tuned On</h3>
          <p className="iso-doc-section__p">
            {otherYears
              ? `The model's values were tuned on other fires in the same places and checked on fires of ${otherYears}.`
              : "The model's values were tuned on other fires in the same places."}
            {testFiresCap ? ` ${testFiresCap} fires were kept out of all of it as the test.` : ''}
          </p>
        </section>
      )}

      <section className="iso-doc-section">
        <h3 className="iso-doc-section__title">Limits</h3>
        <p className="iso-doc-section__p">
          The record lists detections, not the places a satellite looked and saw nothing, and it carries no cloud. An
          empty pass may be cloud, so the model treats it as unknown.
        </p>
        <p className="iso-doc-section__p">
          The estimate is compared with another instrument, not with the fire itself.
        </p>
        {placesWithFires && (
          <p className="iso-doc-section__p">
            A fire can be shown pass by pass only where the satellites&apos; passes are stored: {placesWithFires}.
          </p>
        )}
      </section>

      <section className="iso-doc-section">
        <h3 className="iso-doc-section__title">Times</h3>
        <p className="iso-doc-section__p">
          On the terrain, pass times are local solar time at the fire&apos;s longitude with the part of the day, not the
          legal clock of its time zone. Dates and pass instants inside these documents are UTC.
        </p>
      </section>

      <section className="iso-doc-section">
        <h3 className="iso-doc-section__title">Ground and Credits</h3>
        <p className="iso-doc-section__p">
          Elevation: public elevation data.{creditText ? ` Imagery on this fire: ${creditText}.` : ''}
        </p>
      </section>
    </>
  );
}

/**
 * Document body for "This Fire" inside the unified document viewer.
 * Never reads hidden detections before reveal.
 */
export function ThisFireDocument({
  onSelectScores,
  onSelectTests,
}: {
  onSelectScores?: () => void;
  onSelectTests?: () => void;
}) {
  const store = useOptionalWorkspace();
  const run = store?.run.active ?? null;
  const win = runWindow(run);

  if (!store || !run) {
    return (
      <section className="iso-doc-lead">
        <p className="iso-doc-lead__p">
          Open a fire from the record to inspect its satellite passes, terrain box, and exported files here.
        </p>
      </section>
    );
  }

  const epochs = Array.isArray(run.epoch_summaries) ? run.epoch_summaries : [];
  const totalPasses = win?.overpasses ?? epochs.length;
  const span = store.run.span ?? (win ? utcSpan(win.first, win.last) : null);
  const blindActive = store.test.hidden && !store.test.revealed;
  const sharpSquareM = formatMetresFromKm(readSharpSquareKm(run));

  const maxHeat = Math.max(
    1,
    ...epochs.map((ep) => {
      const isSharp = /viirs|snpp|noaa/i.test(ep.primary_sensor);
      if (isSharp && blindActive) return ep.reconstructed_total_mw;
      return Math.max(ep.reconstructed_total_mw, ep.raw_modis_total_mw, isSharp ? ep.raw_viirs_total_mw : 0);
    }),
  );

  const coarsePasses = epochs.filter((ep) => !/viirs|snpp|noaa/i.test(ep.primary_sensor)).length;
  const sharpPasses = epochs.length - coarsePasses;

  const statusLine = store.model.closed
    ? 'This window belongs to a closed test fire, so every satellite pass is shown and the window is not scored again.'
    : store.run.beforeSharp
      ? 'This fire burned before 2012, when only the coarse satellite was in orbit.'
      : blindActive
        ? 'The sharp satellite is currently withheld from the model and hidden on the terrain until you reveal it.'
        : store.test.revealed
          ? 'The sharp satellite passes have been revealed over the estimate and scored.'
          : 'Every stored pass over this fire is shown on the terrain.';

  return (
    <>
      <section className="iso-doc-lead" aria-label="This fire summary">
        <div className="iso-doc-lead__hero">
          <span className="iso-doc-lead__figure">{totalPasses}</span>
          <span className="iso-doc-lead__unit">
            satellite passes over {store.place.title}
            {span ? `, ${span}` : ''}
          </span>
        </div>
        <p className="iso-doc-lead__p iso-doc-lead__p--strong">{statusLine}</p>
      </section>

      {epochs.length > 0 && (
        <figure className="iso-doc-media" aria-label="Pass timeline across this fire window">
          <div className="iso-pass-strip">
            <div className="iso-pass-strip__ticks">
              {epochs.map((ep, idx) => {
                const isSharp = /viirs|snpp|noaa/i.test(ep.primary_sensor);
                const withheld = isSharp && blindActive;
                const val = withheld
                  ? 0
                  : isSharp
                    ? Math.max(ep.raw_viirs_total_mw, ep.reconstructed_total_mw)
                    : Math.max(ep.raw_modis_total_mw, ep.reconstructed_total_mw);
                const heightPct = withheld ? 62 : Math.max(10, Math.round((val / maxHeat) * 100));
                const cls = withheld
                  ? 'iso-pass-strip__bar iso-pass-strip__bar--hidden'
                  : isSharp
                    ? 'iso-pass-strip__bar iso-pass-strip__bar--viirs'
                    : 'iso-pass-strip__bar iso-pass-strip__bar--modis';
                return (
                  <span
                    key={ep.frame ?? idx}
                    className={cls}
                    style={{ height: `${heightPct}%` }}
                    title={`Pass ${idx + 1}: ${withheld ? 'sharp satellite withheld' : ep.primary_sensor}`}
                  />
                );
              })}
            </div>
          </div>
          <figcaption className="iso-doc-media__caption">
            <span className="iso-doc-legend">
              <span className="iso-doc-legend__item">
                <span className="iso-doc-swatch iso-doc-swatch--modis" />
                Coarse pass ({coarsePasses})
              </span>
              <span className="iso-doc-legend__item">
                <span className="iso-doc-swatch iso-doc-swatch--detection" />
                {blindActive ? `Sharp pass withheld (${sharpPasses})` : `Sharp pass (${sharpPasses})`}
              </span>
            </span>
            <span>Pass {store.time.pass + 1} of {epochs.length} on stage</span>
          </figcaption>
        </figure>
      )}

      <div className="iso-doc-table-wrap">
        <table className="iso-doc-table">
          <thead>
            <tr>
              <th scope="col">Fire readout</th>
              <th scope="col" className="is-num">
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">
                <span className="iso-doc-table__row-name">Ground box</span>
                <span className="iso-doc-table__row-desc">{run.region.subtitle}</span>
              </th>
              <td className="is-num">
                {run.region.width_km.toFixed(1)} by {run.region.depth_km.toFixed(1)} km
              </td>
            </tr>
            <tr>
              <th scope="row">
                <span className="iso-doc-table__row-name">Elevation span</span>
                <span className="iso-doc-table__row-desc">Lowest to highest ground in the box</span>
              </th>
              <td className="is-num">
                {Math.round(run.region.min_elev_m).toLocaleString('en-US')} to{' '}
                {Math.round(run.region.max_elev_m).toLocaleString('en-US')} m
              </td>
            </tr>
            {sharpSquareM && (
              <tr>
                <th scope="row">
                  <span className="iso-doc-table__row-name">Estimate grid square</span>
                  <span className="iso-doc-table__row-desc">Each square tracked forward and backward across passes</span>
                </th>
                <td className="is-num">
                  <AlignedNumber intPart={sharpSquareM} unit="m" />
                </td>
              </tr>
            )}
            {store.time.powerMw !== null && (
              <tr>
                <th scope="row">
                  <span className="iso-doc-table__row-name">Estimated heat at pass {store.time.pass + 1}</span>
                  <span className="iso-doc-table__row-desc">Total fire power stated by the estimate at this moment</span>
                </th>
                <td className="is-num">
                  <AlignedNumber intPart={Math.round(store.time.powerMw).toLocaleString('en-US')} unit="MW" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {store.run.isReal && (
        <section className="iso-doc-section" aria-label="Actions and exports">
          <div className="iso-plain-actions">
            {store.test.score && onSelectScores && (
              <button type="button" className="iso-plain-action" data-primary="true" onClick={onSelectScores}>
                <span>Open The Scores</span>
              </button>
            )}
            {onSelectTests && (
              <button type="button" className="iso-plain-action" onClick={onSelectTests}>
                <span>Every Test on Record</span>
              </button>
            )}
            <a
              className="iso-plain-action"
              href={assetUrlNow(run.assets.export_geojson_url)}
              target="_blank"
              rel="noreferrer"
            >
              <span>Download GeoJSON</span>
            </a>
            <a
              className="iso-plain-action"
              href={assetUrlNow(run.assets.export_csv_url)}
              target="_blank"
              rel="noreferrer"
            >
              <span>Download CSV</span>
            </a>
          </div>
        </section>
      )}
    </>
  );
}

export function MethodSheet({
  open,
  onClose,
  evidence,
  imageryCredit,
  verticalExaggeration,
  embedded = false,
  onOpenTests,
}: MethodSheetProps) {
  if (!open) return null;

  const content = (
    <MethodDocument
      evidence={evidence}
      imageryCredit={imageryCredit}
      verticalExaggeration={verticalExaggeration}
      onOpenTests={onOpenTests}
    />
  );

  if (embedded) return <div className="iso-method">{content}</div>;

  return (
    <SideSheet open={open} title="Method and Data" onClose={onClose}>
      {content}
    </SideSheet>
  );
}
