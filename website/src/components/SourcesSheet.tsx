import { useEffect, useState, type ReactNode } from 'react';
import type { WorkspaceStore } from '../app/store';
import { THEATER_DISPLAY, THEATER_ORDER } from '../content/theaters';
import type { TheaterId } from '../stage/earthCutawayTypes';
import {
  ELEVATION_CREDIT,
  FIRMS_CREDIT,
  PRODUCT_ROWS,
  comparePlatforms,
  datedEvents,
  fetchCalendarSources,
  fetchHealthCounts,
  formatCount,
  linkText,
  plain,
  type CalendarSources,
  type HealthCounts,
  type SourceRow,
} from '../content/sources';
import { Loader } from '../ui/Loader';
import { AlignedNumber, SideSheet, useOptionalWorkspace } from './BlindScoreTable';
import '../styles/sources.css';

export interface SourcesSheetProps {
  open: boolean;
  onClose: () => void;
  apiBase: string;
  /** The region whose real calendar says what is left out; its row in the counts is drawn brighter. */
  regionId: string;
  regionName: string;
  /** Imagery credit from the active run (ui/attribution.ts). */
  imageryCredit: string;
  /** The body only, inside the reading sheet; credits can also be included or scrolled to. */
  embedded?: boolean;
  /** Include Credits at the foot of the embedded body as well. */
  includeCredits?: boolean;
}

type Load<T> =
  | { key: string; state: 'loading' }
  | { key: string; state: 'ready'; data: T }
  | { key: string; state: 'missing' }
  | { key: string; state: 'failed' };

const isTheater = (id: string): id is TheaterId => Object.prototype.hasOwnProperty.call(THEATER_DISPLAY, id);

const CANONICAL_PLACE_NAMES: Record<string, string> = {
  plumas_ca: 'Feather River & Plumas, CA',
  lytton_bc: 'Lytton & Thompson Canyon, BC',
  evia_gr: 'Northern Evia Island, Greece',
  evia_greece: 'Northern Evia Island, Greece',
  blue_mountains_au: 'Grose Valley & Blue Mountains, NSW',
  novo_progresso_br: 'Serra do Cachimbo, Amazonia',
  ventura_ca: 'Ojai & Ventura River, CA',
  kakisa_nt: 'Kakisa & Enterprise, NT',
  okefenokee_ga: 'Okefenokee Swamp, GA and FL',
  evros_greece: 'Dadia Forest & Soufli, Evros',
  serra_acor_pt: 'Serra do Açor & Covilhã, Portugal',
  maule_cl: 'Empedrado & Maule Coast Range, Chile',
  ljusdal_se: 'Kårböle & Ljusdal, Sweden',
  semey_kz: 'Semey Ormany, Kazakhstan',
  manavgat_tr: 'Manavgat & the Taurus Foothills, Turkey',
  fort_mcmurray_ab: 'Fort McMurray, AB',
  jur_river_ss: 'Jur River, South Sudan',
  wollemi_au: 'Wollemi & Gospers Mountain, NSW',
};

function humanizeRegionId(id: string): string {
  const parts = id.split('_').filter(Boolean);
  if (parts.length === 0) return id;
  if (parts.length >= 2 && parts[parts.length - 1].length === 2) {
    const code = parts[parts.length - 1].toUpperCase();
    const words = parts
      .slice(0, -1)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return `${words}, ${code}`;
  }
  return parts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function regionLabel(id: string, store: WorkspaceStore | null): string {
  const fromStore = store?.places.places.find((p) => p.id === id)?.name;
  if (fromStore) return fromStore;
  if (CANONICAL_PLACE_NAMES[id]) return CANONICAL_PLACE_NAMES[id];
  return isTheater(id) ? THEATER_DISPLAY[id].name : humanizeRegionId(id);
}

function plainRule(t: string): string {
  return plain(t)
    .replace(/\bstatic rows left out\b/gi, 'static detections left out')
    .replace(/\bFIRMS area API\b/gi, "NASA's public fire archive feed")
    .replace(/\barea API\b/gi, 'public fire archive feed')
    .replace(/\bstandard processing\b/gi, 'final-review archive')
    .replace(/\bnear real time\b/gi, 'preliminary passes');
}

function plainProductRow(row: SourceRow): SourceRow {
  const label = row.label === 'One row' ? 'One detection' : row.label;
  const value = row.value === 'standard processing' ? 'final-review archive' : row.value;
  const context = row.context
    .replace(
      '2026 rows come from the area API and turn near real time where standard processing ends',
      "2026 detections come from NASA's public fire archive feed and use preliminary passes where final review ends",
    )
    .replace('FIRMS area API, from 2023-03', "NASA's public fire archive feed, from March 2023")
    .replace(/\bFIRMS country files\b/g, 'NASA FIRMS country archives')
    .replace(/\brows labelled\b/g, 'detections labelled');
  return { label, value, context };
}

const cachedHealthPromises = new Map<string, Promise<HealthCounts>>();
const cachedCalSourcesPromises = new Map<string, Promise<CalendarSources | null>>();

function getCachedHealthCounts(key: string): Promise<HealthCounts> {
  const existing = cachedHealthPromises.get(key);
  if (existing) return existing;
  const req = fetchHealthCounts(new AbortController().signal).catch((err) => {
    cachedHealthPromises.delete(key);
    throw err;
  });
  cachedHealthPromises.set(key, req);
  return req;
}

function getCachedCalendarSources(key: string, regionId: string): Promise<CalendarSources | null> {
  const existing = cachedCalSourcesPromises.get(key);
  if (existing) return existing;
  const req = fetchCalendarSources(regionId, new AbortController().signal).catch((err) => {
    cachedCalSourcesPromises.delete(key);
    throw err;
  });
  cachedCalSourcesPromises.set(key, req);
  return req;
}

function regionRank(id: string): number {
  const i = isTheater(id) ? THEATER_ORDER.indexOf(id) : -1;
  return i === -1 ? THEATER_ORDER.length : i;
}

function listOr(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

function ExternalLink({ url }: { url: string }) {
  return (
    <a className="iso-sources__link" href={url} target="_blank" rel="noreferrer">
      {linkText(url)}
    </a>
  );
}

function DocSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="iso-doc-section">
      <h3 className="iso-doc-section__title">{title}</h3>
      {children}
    </section>
  );
}

const isCoarsePlatform = (p: string) => p === 'Terra' || p === 'Aqua';

export function Credits({ imageryCredit }: { imageryCredit: string }) {
  const imagery = imageryCredit.trim();
  return (
    <DocSection id="iso-sources-credits" title="Credits">
      <div className="iso-doc-table-wrap">
        <table className="iso-doc-table">
          <thead>
            <tr>
              <th scope="col">Layer</th>
              <th scope="col">Source</th>
              <th scope="col">Reference</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">
                <span className="iso-doc-table__row-name">Fire detections</span>
              </th>
              <td>{FIRMS_CREDIT.value}</td>
              <td>
                <ExternalLink url={FIRMS_CREDIT.url} />
              </td>
            </tr>
            <tr>
              <th scope="row">
                <span className="iso-doc-table__row-name">Elevation</span>
              </th>
              <td>{ELEVATION_CREDIT.value}</td>
              <td>
                <ExternalLink url={ELEVATION_CREDIT.url} />
              </td>
            </tr>
            <tr>
              <th scope="row">
                <span className="iso-doc-table__row-name">Ground imagery (United States)</span>
              </th>
              <td>USDA NAIP, USGS The National Map: Orthoimagery</td>
              <td>
                <ExternalLink url="https://www.usgs.gov/centers/eros/science/usgs-eros-archive-aerial-photography-national-agriculture-imagery-program-naip" />
              </td>
            </tr>
            <tr>
              <th scope="row">
                <span className="iso-doc-table__row-name">Ground imagery (outside the US)</span>
              </th>
              <td>
                EOxCloudless{' '}
                <a className="iso-sources__link" href="https://cloudless.eox.at" target="_blank" rel="noreferrer">
                  https://cloudless.eox.at
                </a>{' '}
                by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)
              </td>
              <td>
                <a
                  className="iso-sources__link"
                  href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
                  target="_blank"
                  rel="noreferrer"
                >
                  CC BY-NC-SA 4.0
                </a>
              </td>
            </tr>
            {imagery !== '' && (
              <tr>
                <th scope="row">
                  <span className="iso-doc-table__row-name">Imagery on this fire</span>
                </th>
                <td colSpan={2}>{imagery}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="iso-doc-section__p">
        Pictures of the ground made from EOxCloudless are under the same licence
        (Creative Commons Attribution-NonCommercial-ShareAlike 4.0) and are not covered by any other licence the
        repository may take. Endorsement by the European Commission or ESA is not implied.
      </p>
    </DocSection>
  );
}

function SourcesMediaPane({
  counts,
  regionId,
  regionName,
  store,
}: {
  counts: HealthCounts;
  regionId: string;
  regionName: string;
  store: WorkspaceStore | null;
}) {
  const current = counts.regions.find((r) => r.regionId === regionId) ?? counts.regions[0] ?? null;
  if (!current || current.total <= 0) return null;

  const sortedRows = [...current.rows].sort((a, b) => comparePlatforms(a.platform, b.platform));
  const label = current.regionId === regionId ? regionName : regionLabel(current.regionId, store);

  return (
    <figure className="iso-doc-media" aria-label={`Stored detections by satellite in ${label}`}>
      <div className="iso-sources-bar" aria-hidden="true">
        {sortedRows.map((row) => {
          const pct = Math.max(2, (row.value / current.total) * 100);
          const coarse = isCoarsePlatform(row.platform);
          return (
            <span
              key={row.platform}
              className={`iso-sources-bar__seg ${
                coarse ? 'iso-sources-bar__seg--modis' : 'iso-sources-bar__seg--viirs'
              }`}
              style={{ width: `${pct.toFixed(2)}%` }}
            />
          );
        })}
      </div>

      <div className="iso-sources-sat-grid">
        {sortedRows.map((row) => (
          <div key={row.platform} className="iso-sources-sat">
            <span>{row.platform}</span>
            <span className="iso-sources-sat__val">{formatCount(row.value)}</span>
          </div>
        ))}
      </div>

      <figcaption className="iso-doc-media__caption">
        <span className="iso-doc-legend">
          <span className="iso-doc-legend__item">
            <span className="iso-doc-swatch iso-doc-swatch--modis" />
            MODIS, the coarser instrument (on Terra and Aqua)
          </span>
          <span className="iso-doc-legend__item">
            <span className="iso-doc-swatch iso-doc-swatch--detection" />
            VIIRS, the sharper instrument (on Suomi NPP, NOAA-20 and NOAA-21)
          </span>
        </span>
        <span>
          {formatCount(current.total)} detections inside {label}
        </span>
      </figcaption>
    </figure>
  );
}

function RowCountsSection({
  counts,
  regionId,
  store,
}: {
  counts: HealthCounts;
  regionId: string;
  store: WorkspaceStore | null;
}) {
  const regions = [...counts.regions].sort(
    (a, b) => regionRank(a.regionId) - regionRank(b.regionId) || a.regionId.localeCompare(b.regionId),
  );
  const platforms = [...new Set(regions.flatMap((r) => r.rows.map((x) => x.platform)))].sort(comparePlatforms);

  if (regions.length === 0) return null;

  return (
    <DocSection title="Stored Detections by Place and Satellite">
      <p className="iso-doc-section__p">
        Every detection inside each place&apos;s surrounding area, across all stored years including 2026.
      </p>
      <div className="iso-doc-table-wrap">
        <table className="iso-doc-table">
          <thead>
            <tr>
              <th scope="col">Place</th>
              {platforms.map((p) => (
                <th key={p} scope="col" className="is-num">
                  {p}
                </th>
              ))}
              <th scope="col" className="is-num">
                All satellites
              </th>
            </tr>
          </thead>
          <tbody>
            {regions.map((r) => {
              const active = r.regionId === regionId;
              return (
                <tr key={r.regionId} className={active ? 'iso-sources__row-active' : undefined}>
                  <th scope="row">
                    <span className="iso-doc-table__row-name">{regionLabel(r.regionId, store)}</span>
                  </th>
                  {platforms.map((p) => {
                    const v = r.rows.find((x) => x.platform === p)?.value;
                    return (
                      <td key={p} className="is-num">
                        {v === undefined ? null : <AlignedNumber intPart={formatCount(v)} integerOnly />}
                      </td>
                    );
                  })}
                  <td className={`is-num${active ? ' is-best' : ''}`}>
                    <AlignedNumber intPart={formatCount(r.total)} integerOnly />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </DocSection>
  );
}

function ProductsSection() {
  return (
    <DocSection title="Satellite Products">
      <div className="iso-doc-table-wrap">
        <table className="iso-doc-table">
          <thead>
            <tr>
              <th scope="col">Instrument or rule</th>
              <th scope="col">Product</th>
              <th scope="col">Where the detections come from</th>
            </tr>
          </thead>
          <tbody>
            {PRODUCT_ROWS.map((rawRow) => {
              const row = plainProductRow(rawRow);
              return (
                <tr key={rawRow.label}>
                  <th scope="row">
                    <span className="iso-doc-table__row-name">{row.label}</span>
                  </th>
                  <td>{row.value}</td>
                  <td>{row.context}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </DocSection>
  );
}

function CalendarSourcesSection({
  load,
  regionName,
}: {
  load: Load<CalendarSources>;
  regionName: string;
}) {
  const title = `What Is Left Out in ${regionName}`;
  if (load.state === 'loading') {
    return (
      <DocSection title={title}>
        <Loader surface="inline" line={`Loading the ${regionName} record rules`} />
      </DocSection>
    );
  }
  if (load.state === 'missing') {
    return (
      <DocSection title={title}>
        <p className="iso-doc-section__p">No stored NASA FIRMS calendar covers {regionName}.</p>
      </DocSection>
    );
  }
  if (load.state === 'failed') {
    return (
      <DocSection title={title}>
        <p className="iso-doc-section__p">The {regionName} calendar rules did not load.</p>
      </DocSection>
    );
  }

  const cal = load.data;
  const staticTotal = cal.staticExcluded.reduce((s, x) => s + x.value, 0);
  const months = cal.monthsOutForOutages;
  const platforms = [
    ...new Set([
      ...cal.outageDays.map((o) => o.platform),
      ...cal.platformsInFit,
      ...cal.countedNotFitted.map((n) => n.platform),
    ]),
  ].sort(comparePlatforms);
  const events = datedEvents(cal);

  return (
    <>
      <DocSection title={title}>
        {cal.countingRule && <p className="iso-doc-section__p">{plainRule(cal.countingRule)}</p>}
        <div className="iso-doc-table-wrap">
          <table className="iso-doc-table">
            <thead>
              <tr>
                <th scope="col">Excluded or unscaled</th>
                <th scope="col" className="is-num">
                  Count
                </th>
                <th scope="col">Why</th>
              </tr>
            </thead>
            <tbody>
              {cal.staticExcluded.length > 0 && (
                <tr>
                  <th scope="row">
                    <span className="iso-doc-table__row-name">Static land sources</span>
                  </th>
                  <td className="is-num">
                    {formatCount(staticTotal)} {staticTotal === 1 ? 'detection' : 'detections'}
                  </td>
                  <td>{cal.staticExcluded.map((s) => `${s.platform} ${formatCount(s.value)}`).join(', ')}</td>
                </tr>
              )}
              {months.length > 0 && (
                <tr>
                  <th scope="row">
                    <span className="iso-doc-table__row-name">Outage months left out of scale fit</span>
                  </th>
                  <td className="is-num">
                    {months.length} {months.length === 1 ? 'month' : 'months'}
                  </td>
                  <td>
                    {cal.platformsInFit.length > 0 ? `Outage day on ${listOr(cal.platformsInFit)}: ` : ''}
                    {months.join(', ')}
                  </td>
                </tr>
              )}
              {cal.countedNotFitted.map((n) => (
                <tr key={n.platform}>
                  <th scope="row">
                    <span className="iso-doc-table__row-name">{n.platform}</span>
                  </th>
                  <td className="is-num">Counted only</td>
                  <td>{plainRule(n.why)}</td>
                </tr>
              ))}
              {cal.notInCalendar && (
                <tr>
                  <th scope="row">
                    <span className="iso-doc-table__row-name">{cal.notInCalendar.what}</span>
                  </th>
                  <td className="is-num">Omitted</td>
                  <td>{plainRule(cal.notInCalendar.why)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DocSection>

      <DocSection title="Known Outages and Orbit Milestones">
        {cal.outageRule && <p className="iso-doc-section__p">{plainRule(cal.outageRule)}</p>}
        {platforms.length > 0 && (
          <div className="iso-doc-table-wrap">
            <table className="iso-doc-table">
              <thead>
                <tr>
                  <th scope="col">Satellite</th>
                  <th scope="col" className="is-num">
                    Outage days
                  </th>
                  <th scope="col">Role in scale fit</th>
                </tr>
              </thead>
              <tbody>
                {platforms.map((p) => {
                  const days = cal.outageDays.find((o) => o.platform === p)?.value;
                  return (
                    <tr key={p}>
                      <th scope="row">
                        <span className="iso-doc-table__row-name">{p}</span>
                      </th>
                      <td className="is-num">
                        {days === undefined ? 'Not checked' : `${formatCount(days)} ${days === 1 ? 'day' : 'days'}`}
                      </td>
                      <td>
                        {cal.platformsInFit.includes(p)
                          ? 'Used to put both eras on one scale'
                          : 'Counted, not used to set the scale'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {events.length > 0 && (
          <div className="iso-doc-table-wrap">
            <table className="iso-doc-table">
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Event</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={`${e.yearMonth} ${e.label}`}>
                    <th scope="row">
                      <span className="iso-doc-table__row-name">{e.yearMonth}</span>
                    </th>
                    <td>{e.label}</td>
                    <td>{e.url ? <ExternalLink url={e.url} /> : e.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DocSection>
    </>
  );
}

export function SourcesSheet({
  open,
  onClose,
  apiBase,
  regionId,
  regionName,
  imageryCredit,
  embedded = false,
  includeCredits = true,
}: SourcesSheetProps) {
  const store = useOptionalWorkspace();
  const healthKey = apiBase;
  const calendarKey = `${apiBase} ${regionId}`;
  const [health, setHealth] = useState<Load<HealthCounts>>({ key: '', state: 'loading' });
  const [calendar, setCalendar] = useState<Load<CalendarSources>>({ key: '', state: 'loading' });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setHealth({ key: healthKey, state: 'loading' });
    getCachedHealthCounts(healthKey).then(
      (data) => {
        if (!cancelled) setHealth({ key: healthKey, state: 'ready', data });
      },
      () => {
        if (!cancelled) setHealth({ key: healthKey, state: 'failed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, healthKey]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCalendar({ key: calendarKey, state: 'loading' });
    getCachedCalendarSources(calendarKey, regionId).then(
      (data) => {
        if (cancelled) return;
        setCalendar(data ? { key: calendarKey, state: 'ready', data } : { key: calendarKey, state: 'missing' });
      },
      () => {
        if (!cancelled) setCalendar({ key: calendarKey, state: 'failed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, apiBase, regionId, calendarKey]);

  if (!open) return null;

  const healthNow: Load<HealthCounts> = health.key === healthKey ? health : { key: healthKey, state: 'loading' };
  const calendarNow: Load<CalendarSources> =
    calendar.key === calendarKey ? calendar : { key: calendarKey, state: 'loading' };

  const readyHealth = healthNow.state === 'ready' ? healthNow.data : null;

  const content = (
    <>
      <section className="iso-doc-lead" aria-label="Sources summary">
        {readyHealth && readyHealth.downloadedRows !== null && (
          <div className="iso-doc-lead__hero">
            <span className="iso-doc-lead__figure">{formatCount(readyHealth.downloadedRows)}</span>
            <span className="iso-doc-lead__unit">
              fire detections from NASA's public record (FIRMS) stored here
              {readyHealth.downloadedFiles !== null
                ? ` across ${formatCount(readyHealth.downloadedFiles)} ${
                    readyHealth.downloadedFiles === 1 ? 'file' : 'files'
                  }`
                : ''}
            </span>
          </div>
        )}
        <p className="iso-doc-lead__p iso-doc-lead__p--strong">
          A detection is one spot a satellite flagged as burning. Every count on this sheet is read live from NASA&apos;s
          files stored here and from the open place&apos;s fire record.
        </p>
      </section>

      {healthNow.state === 'loading' && <Loader surface="inline" line="Loading stored detection counts" />}
      {healthNow.state === 'failed' && (
        <p className="iso-doc-section__p">The stored detection counts did not answer, so no count is shown.</p>
      )}

      {readyHealth && (
        <SourcesMediaPane counts={readyHealth} regionId={regionId} regionName={regionName} store={store} />
      )}
      {readyHealth && <RowCountsSection counts={readyHealth} regionId={regionId} store={store} />}
      <ProductsSection />
      <CalendarSourcesSection load={calendarNow} regionName={regionName} />
      {includeCredits && <Credits imageryCredit={imageryCredit} />}
    </>
  );

  if (embedded) return <div className="iso-sources">{content}</div>;

  return (
    <SideSheet open={open} title="Sources" onClose={onClose}>
      {content}
    </SideSheet>
  );
}
