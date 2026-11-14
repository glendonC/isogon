import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useDialogFocus } from '../ui/useDialogFocus';
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
} from '../content/sources';
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
  /** The body only, inside the reading sheet; credits are its own section there. */
  embedded?: boolean;
}

/** A request's state, tagged with what it was made for so a new region never shows the previous one's answer. */
type Load<T> =
  | { key: string; state: 'loading' }
  | { key: string; state: 'ready'; data: T }
  | { key: string; state: 'missing' }
  | { key: string; state: 'failed' };

const isTheater = (id: string): id is TheaterId => Object.prototype.hasOwnProperty.call(THEATER_DISPLAY, id);

function regionLabel(id: string): string {
  return isTheater(id) ? THEATER_DISPLAY[id].name : id;
}

function regionRank(id: string): number {
  const i = isTheater(id) ? THEATER_ORDER.indexOf(id) : -1;
  return i === -1 ? THEATER_ORDER.length : i;
}

/** "a, b or c". */
function listOr(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

function ExternalLink({ url }: { url: string }) {
  return (
    <a className="iso-link iso-sources__link" href={url} target="_blank" rel="noreferrer">
      {linkText(url)}
    </a>
  );
}

/** Label, value, context: the Method sheet's table. */
function Facts({ children, events = false }: { children: ReactNode; events?: boolean }) {
  return (
    <table className={`iso-table iso-table--sheet iso-sources__facts${events ? ' iso-sources__events' : ''}`}>
      <tbody>{children}</tbody>
    </table>
  );
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section className="iso-sources__section" aria-labelledby={id}>
      <h3 id={id} className="iso-sources__title">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A list joined by commas, each item kept on one line so "2012-03" or "NOAA-21 179" never breaks at its hyphen. */
function Items({ items }: { items: readonly string[] }) {
  return (
    <>
      {items.map((item, i) => (
        <span key={item}>
          {i > 0 ? ', ' : ''}
          <span className="iso-sources__item">{item}</span>
        </span>
      ))}
    </>
  );
}

function Line({ children }: { children: ReactNode }) {
  return <p className="iso-sources__line">{children}</p>;
}

function Products() {
  return (
    <Section title="Products">
      <Facts>
        {PRODUCT_ROWS.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{row.value}</td>
            <td>{row.context}</td>
          </tr>
        ))}
      </Facts>
    </Section>
  );
}

function RowCounts({ counts, regionId }: { counts: HealthCounts; regionId: string }) {
  const regions = [...counts.regions].sort(
    (a, b) => regionRank(a.regionId) - regionRank(b.regionId) || a.regionId.localeCompare(b.regionId),
  );
  const platforms = [...new Set(regions.flatMap((r) => r.rows.map((x) => x.platform)))].sort(comparePlatforms);
  const files = counts.downloadedFiles;

  return (
    <>
      {counts.downloadedRows !== null && (
        <Line>
          {formatCount(counts.downloadedRows)} rows downloaded
          {files !== null ? ` in ${formatCount(files)} ${files === 1 ? 'file' : 'files'}` : ''}.
          {regions.length > 0 ? ' The table counts the rows inside each region box, 2026 included.' : ''}
        </Line>
      )}
      {regions.length > 0 && (
        <div className="iso-sources__scroll" role="region" aria-label="Rows by region box and platform" tabIndex={0}>
          <table className="iso-table iso-table--sheet iso-sources__matrix">
            <thead>
              <tr>
                <th scope="col">Region box</th>
                {platforms.map((p) => (
                  <th key={p} scope="col">
                    {p}
                  </th>
                ))}
                <th scope="col">All</th>
              </tr>
            </thead>
            <tbody>
              {regions.map((r) => (
                <tr key={r.regionId} data-current={r.regionId === regionId}>
                  <th scope="row">{regionLabel(r.regionId)}</th>
                  {platforms.map((p) => {
                    const v = r.rows.find((x) => x.platform === p)?.value;
                    return <td key={p}>{v === undefined ? '' : formatCount(v)}</td>;
                  })}
                  <td>{formatCount(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Rows({ load, regionId }: { load: Load<HealthCounts>; regionId: string }) {
  return (
    <Section title="Rows">
      {load.state === 'ready' ? (
        <RowCounts counts={load.data} regionId={regionId} />
      ) : (
        <Line>{load.state === 'loading' ? 'Loading' : 'The row counts did not load.'}</Line>
      )}
    </Section>
  );
}

function LeftOut({ cal }: { cal: CalendarSources }) {
  const staticTotal = cal.staticExcluded.reduce((s, x) => s + x.value, 0);
  const months = cal.monthsOutForOutages;
  return (
    <Facts>
      {cal.countingRule && (
        <tr>
          <th scope="row">Counted</th>
          <td colSpan={2} data-cell="rule">
            {plain(cal.countingRule)}
          </td>
        </tr>
      )}
      {cal.staticExcluded.length > 0 && (
        <tr>
          <th scope="row">Static sources</th>
          <td>
            {formatCount(staticTotal)} {staticTotal === 1 ? 'row' : 'rows'}
          </td>
          <td>
            <Items items={cal.staticExcluded.map((s) => `${s.platform} ${formatCount(s.value)}`)} />
          </td>
        </tr>
      )}
      {months.length > 0 && (
        <tr>
          <th scope="row">Outage months</th>
          <td>
            {months.length} overlap {months.length === 1 ? 'month' : 'months'}
          </td>
          <td>
            {cal.platformsInFit.length > 0 ? `With an outage day on ${listOr(cal.platformsInFit)}: ` : ''}
            <Items items={months} />
          </td>
        </tr>
      )}
      {cal.countedNotFitted.map((n) => (
        <tr key={n.platform}>
          <th scope="row">{n.platform}</th>
          <td>not in the fit</td>
          <td>{plain(n.why)}</td>
        </tr>
      ))}
      {cal.notInCalendar && (
        <tr>
          <th scope="row">{cal.notInCalendar.what}</th>
          <td>not in the calendar</td>
          <td>{plain(cal.notInCalendar.why)}</td>
        </tr>
      )}
    </Facts>
  );
}

function Outages({ cal }: { cal: CalendarSources }) {
  const platforms = [
    ...new Set([
      ...cal.outageDays.map((o) => o.platform),
      ...cal.platformsInFit,
      ...cal.countedNotFitted.map((n) => n.platform),
    ]),
  ].sort(comparePlatforms);
  const events = datedEvents(cal);

  return (
    <Section title="Known outages">
      <Facts>
        {cal.outageRule && (
          <tr>
            <th scope="row">Outage day</th>
            <td colSpan={2} data-cell="rule">
              {plain(cal.outageRule)}
            </td>
          </tr>
        )}
        {platforms.map((p) => {
          const days = cal.outageDays.find((o) => o.platform === p)?.value;
          return (
            <tr key={p}>
              <th scope="row">{p}</th>
              <td>{days === undefined ? 'not checked' : `${formatCount(days)} ${days === 1 ? 'day' : 'days'}`}</td>
              <td>{cal.platformsInFit.includes(p) ? 'in the ratio fit' : 'not in the fit'}</td>
            </tr>
          );
        })}
      </Facts>
      {events.length > 0 && (
        <Facts events>
          {events.map((e) => (
            <tr key={`${e.yearMonth} ${e.label}`}>
              <th scope="row">{e.yearMonth}</th>
              <td>{e.label}</td>
              <td>{e.url ? <ExternalLink url={e.url} /> : e.source}</td>
            </tr>
          ))}
        </Facts>
      )}
    </Section>
  );
}

function CalendarParts({ load, regionName }: { load: Load<CalendarSources>; regionName: string }) {
  const title = `Left out in ${regionName}`;
  if (load.state !== 'ready') {
    return (
      <Section title={title}>
        <Line>
          {load.state === 'loading'
            ? 'Loading'
            : load.state === 'missing'
              ? `No NASA FIRMS calendar covers ${regionName}.`
              : `The ${regionName} calendar did not load.`}
        </Line>
      </Section>
    );
  }
  return (
    <>
      <Section title={title}>
        <LeftOut cal={load.data} />
      </Section>
      <Outages cal={load.data} />
    </>
  );
}

/**
 * The credits. Esri's attribution rules for an interactive map (developers.arcgis.com, "Esri and data
 * attribution"): "Powered by Esri" may sit in a window opened from a button, as here; the data source names must stay
 * visible on the map itself, so the stage keeps them as small corner text, which opens this section.
 */
export function Credits({ imageryCredit }: { imageryCredit: string }) {
  const imagery = imageryCredit.trim();
  return (
    <Section title="Credits">
      <Facts>
        <tr>
          <th scope="row">Basemap</th>
          <td>
            Powered by{' '}
            <a className="iso-link" href="https://www.esri.com" target="_blank" rel="noreferrer">
              Esri
            </a>
          </td>
          <td>World Imagery</td>
        </tr>
        <tr>
          <th scope="row">Fire detections</th>
          <td>{FIRMS_CREDIT.value}</td>
          <td>
            <ExternalLink url={FIRMS_CREDIT.url} />
          </td>
        </tr>
        <tr>
          <th scope="row">Elevation</th>
          <td>{ELEVATION_CREDIT.value}</td>
          <td>
            <ExternalLink url={ELEVATION_CREDIT.url} />
          </td>
        </tr>
        {imagery !== '' && (
          <tr>
            <th scope="row">Imagery</th>
            <td colSpan={2} data-cell="value">
              {imagery}
            </td>
          </tr>
        )}
      </Facts>
    </Section>
  );
}

/**
 * The data and sources sheet: the products the record is built from, the rows downloaded and inside each
 * region box, what the region's real calendar leaves out and why, known outages, and credits. Every count is read
 * live from `/api/health` and the region's real calendar when the sheet opens.
 */
export function SourcesSheet({ open, onClose, apiBase, regionId, regionName, imageryCredit, embedded = false }: SourcesSheetProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useDialogFocus(open && !embedded, sheetRef, closeRef);

  const healthKey = apiBase;
  const calendarKey = `${apiBase} ${regionId}`;
  const [health, setHealth] = useState<Load<HealthCounts>>({ key: '', state: 'loading' });
  const [calendar, setCalendar] = useState<Load<CalendarSources>>({ key: '', state: 'loading' });

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setHealth({ key: healthKey, state: 'loading' });
    fetchHealthCounts(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setHealth({ key: healthKey, state: 'ready', data });
      },
      () => {
        if (!controller.signal.aborted) setHealth({ key: healthKey, state: 'failed' });
      },
    );
    return () => controller.abort();
  }, [open, healthKey]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setCalendar({ key: calendarKey, state: 'loading' });
    fetchCalendarSources(regionId, controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        setCalendar(data ? { key: calendarKey, state: 'ready', data } : { key: calendarKey, state: 'missing' });
      },
      () => {
        if (!controller.signal.aborted) setCalendar({ key: calendarKey, state: 'failed' });
      },
    );
    return () => controller.abort();
  }, [open, apiBase, regionId, calendarKey]);

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

  const healthNow: Load<HealthCounts> = health.key === healthKey ? health : { key: healthKey, state: 'loading' };
  const calendarNow: Load<CalendarSources> =
    calendar.key === calendarKey ? calendar : { key: calendarKey, state: 'loading' };

  if (embedded) {
    return (
      <div className="iso-sources">
        <p className="iso-sheet__lede">Every count here is read live from the NASA FIRMS rows the backend has downloaded.</p>
        <Products />
        <Rows load={healthNow} regionId={regionId} />
        <CalendarParts load={calendarNow} regionName={regionName} />
      </div>
    );
  }

  return (
    <div className="iso-backdrop iso-backdrop--center" onClick={onClose} role="presentation">
      <div
        ref={sheetRef}
        className="iso-sheet iso-sources"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="iso-sheet__head">
          <div className="iso-sources__heading">
            <h2 id={titleId} className="iso-sheet__title">
              Sources
            </h2>
            <span className="iso-sources__tag">NASA FIRMS</span>
          </div>
          <button ref={closeRef} type="button" className="iso-key" onClick={onClose}>
            <kbd>Esc</kbd>
            <span>Close</span>
          </button>
        </div>

        <p className="iso-sheet__lede">
          Every count here is read live from the NASA FIRMS rows the backend has downloaded.
        </p>

        <Products />
        <Rows load={healthNow} regionId={regionId} />
        <CalendarParts load={calendarNow} regionName={regionName} />
        <Credits imageryCredit={imageryCredit} />
      </div>
    </div>
  );
}
