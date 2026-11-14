import { useEffect, useMemo, useRef, useState } from 'react';
import { type TheaterId } from '../stage/earthCutawayTypes';
import {
  EXAMPLE_PLACES,
  THEATER_DISPLAY,
  THEATER_ORDER,
  formatLat,
  formatLon,
  parseLatLon,
} from '../content/theaters';
import type { DynamicRegionRun, PipelineStageRecord } from '../stage/types';
import { Locator } from '../ui/Locator';
import { beforeSharpSatellite, isRealRun } from '../content/realRuns';
import { plainText } from '../ui/plainText';
import { useDialogFocus } from '../ui/useDialogFocus';

const API_BASE: string = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8788';

const PIPELINE_STEPS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'terrain_ingest', label: 'Elevation and satellite imagery' },
  { id: 'sensor_operator', label: 'MODIS and VIIRS footprints for each pass' },
  { id: 'hurdle_quantile', label: 'Simulated fire and passes' },
  { id: 'kalman_smoother', label: 'Smoother across the passes' },
  { id: 'conformal_gate', label: 'Uncertainty' },
];

/** Searched places get real terrain and a simulated fire, and the page says so. */
const SEARCH_FIRE = 'The fire there is simulated; real NASA FIRMS runs cover Feather River, Lytton and Evia.';
const SEARCH_NOTE = `Isogon downloads 30 m elevation and imagery for this place. ${SEARCH_FIRE}`;

export interface ReconstructRequestParams {
  theaterId?: TheaterId;
  regionId?: string;
  queryText?: string;
  holdoutViirs: boolean;
  cloudOverride: number | null;
  enterWorkspace?: boolean;
  /** Real runs: a run on NASA FIRMS rows from this UTC start date. */
  source?: 'firms';
  start?: string;
  /**
   * A held-out run's first response holds nothing the scorer wrote; the same body with `reveal: true` returns the
   * whole run, `blind_test` included, from the server's cache.
   */
  reveal?: boolean;
}

interface CommandAskPaletteProps {
  open: boolean;
  onClose: () => void;
  activeTheaterId: TheaterId;
  activeRun: DynamicRegionRun | null;
  holdoutViirs: boolean;
  onToggleHoldoutViirs: () => void;
  cloudOverride: number | null;
  onToggleCloudOverride: () => void;
  isExecuting: boolean;
  errorMessage: string | null;
  onExecute: (params: ReconstructRequestParams) => Promise<boolean>;
}

type Option =
  | { kind: 'region'; id: TheaterId }
  | { kind: 'place'; label: string; query: string; lat: number; lon: number }
  | { kind: 'custom'; query: string };

function optionKey(o: Option): string {
  return o.kind === 'region' ? o.id : o.kind === 'place' ? `place-${o.label}` : `custom-${o.query}`;
}

function regionMatches(id: TheaterId, q: string): boolean {
  const t = THEATER_DISPLAY[id];
  return [t.name, t.title, t.setting, t.season, t.note, t.lat, t.lon, t.area, id].some((v) =>
    v.toLowerCase().includes(q),
  );
}

/**
 * Search as a region select: a large field, the four calibrated regions and a few example places one
 * per line with bracketed number keys, a preview of the place in focus on a Blue Marble locator, and a
 * key legend. Smoked glass over the scene, square corners.
 * Keys: up and down move, Enter opens, 1 to 9 pick from an empty field, Esc closes.
 */
export function CommandAskPalette({
  open,
  onClose,
  activeTheaterId,
  activeRun,
  holdoutViirs,
  onToggleHoldoutViirs,
  cloudOverride,
  onToggleCloudOverride,
  isExecuting,
  errorMessage,
  onExecute,
}: CommandAskPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [runningStepIdx, setRunningStepIdx] = useState<number>(-1);
  const [pending, setPending] = useState<Option | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus(open, sheetRef, inputRef);

  const options = useMemo<Option[]>(() => {
    const q = query.trim().toLowerCase();
    const regions: Option[] = THEATER_ORDER.filter((id) => !q || regionMatches(id, q)).map((id) => ({
      kind: 'region',
      id,
    }));
    const places: Option[] = EXAMPLE_PLACES.filter(
      (p) => !q || p.label.toLowerCase().includes(q),
    ).map((p) => ({ kind: 'place', ...p }));
    const list = [...regions, ...places];
    if (q && (list.length === 0 || parseLatLon(query))) {
      list.unshift({ kind: 'custom', query: query.trim() });
    }
    return list;
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const currentIdx = THEATER_ORDER.indexOf(activeTheaterId);
    setActiveIndex(currentIdx >= 0 ? currentIdx : 0);
    setPending(null);
  }, [open, activeTheaterId]);

  useEffect(() => {
    if (!isExecuting) {
      setRunningStepIdx(-1);
      return;
    }
    setRunningStepIdx(0);
    const timer = window.setInterval(() => {
      setRunningStepIdx((prev) => (prev < PIPELINE_STEPS.length - 1 ? prev + 1 : prev));
    }, 420);
    return () => window.clearInterval(timer);
  }, [isExecuting]);

  if (!open) return null;

  const safeIndex = Math.min(activeIndex, Math.max(0, options.length - 1));
  const focused: Option | undefined = pending ?? options[safeIndex];

  const run = async (o: Option) => {
    if (isExecuting) return;
    setPending(o);
    const ok =
      o.kind === 'region'
        ? await onExecute({
            theaterId: o.id,
            regionId: o.id,
            holdoutViirs,
            cloudOverride,
            enterWorkspace: true,
          })
        : await onExecute({
            queryText: o.query,
            holdoutViirs,
            cloudOverride,
            enterWorkspace: true,
          });
    if (ok) {
      setQuery('');
      setPending(null);
      onClose();
    }
  };

  const submit = () => {
    if (focused) void run(focused);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setPending(null);
      if (options.length === 0) return;
      setActiveIndex((prev) => {
        const cur = Math.min(prev, options.length - 1);
        return e.key === 'ArrowDown'
          ? Math.min(options.length - 1, cur + 1)
          : Math.max(0, cur - 1);
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (query === '' && /^[1-9]$/.test(e.key) && e.target === inputRef.current) {
      const o = options[Number(e.key) - 1];
      if (o) {
        e.preventDefault();
        setActiveIndex(Number(e.key) - 1);
        void run(o);
      }
    }
  };

  // Preview content for the option in focus.
  let title = '';
  let setting = '';
  let note = '';
  let lat: number | null = null;
  let lon: number | null = null;
  let approximate = false;
  if (focused?.kind === 'region') {
    const t = THEATER_DISPLAY[focused.id];
    title = t.title;
    setting = t.setting;
    note = t.note;
    lat = t.centerLat;
    lon = t.centerLon;
  } else if (focused?.kind === 'place') {
    title = focused.label;
    setting = 'Live terrain, fetched when you open it';
    note = SEARCH_NOTE;
    lat = focused.lat;
    lon = focused.lon;
    approximate = true;
  } else if (focused?.kind === 'custom') {
    const coords = parseLatLon(focused.query);
    title = coords ? `${formatLat(coords.lat)}  ${formatLon(coords.lon)}` : focused.query;
    setting = coords ? 'Coordinates' : 'Place name';
    note = coords
      ? `Isogon downloads 30 m elevation and imagery around this point. ${SEARCH_FIRE}`
      : `The backend looks the name up and downloads 30 m elevation and imagery. ${SEARCH_FIRE}`;
    lat = coords?.lat ?? null;
    lon = coords?.lon ?? null;
  }
  const caption =
    lat !== null && lon !== null
      ? `${approximate ? 'about ' : ''}${formatLat(lat)}  ${formatLon(lon)}`
      : 'located when you open it';

  const unreachable = Boolean(errorMessage && /fetch|network|unreachable|refused/i.test(errorMessage));
  const runStages: readonly PipelineStageRecord[] = activeRun?.pipeline_stages ?? [];

  return (
    <>
      <div className="iso-backdrop iso-backdrop--soft" onClick={onClose} role="presentation" />
      <div
        ref={sheetRef}
        className="iso-glass iso-finder"
        role="dialog"
        aria-modal="true"
        aria-label="Search a place or choose a calibrated region"
        onKeyDown={handleKeyDown}
      >
        <div className="iso-finder__field">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
              setPending(null);
            }}
            placeholder="Search a place, or type latitude, longitude"
            className="iso-finder__input"
            aria-label="Place name, or latitude and longitude"
            aria-controls="iso-finder-list"
            aria-activedescendant={focused ? `iso-finder-${optionKey(focused)}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="iso-finder__body">
          <ul className="iso-finder__list" id="iso-finder-list" role="listbox" aria-label="Places">
            {options.map((o, idx) => {
              const isActive = idx === safeIndex && !pending;
              const isPending = pending !== null && optionKey(pending) === optionKey(o);
              const isOpenNow =
                o.kind === 'region' &&
                (activeRun?.region.id === o.id || (!activeRun && activeTheaterId === o.id));
              const firstPlace =
                o.kind === 'place' && idx > 0 && options[idx - 1].kind !== 'place';
              return (
                <li
                  key={optionKey(o)}
                  id={`iso-finder-${optionKey(o)}`}
                  role="option"
                  aria-selected={isActive || isPending}
                  className="iso-finder__item"
                  data-active={isActive || isPending ? 'true' : 'false'}
                  data-gap={firstPlace ? 'true' : 'false'}
                  onMouseEnter={() => {
                    if (!pending) setActiveIndex(idx);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void run(o)}
                >
                  <span className="iso-finder__num" aria-hidden="true">
                    {idx < 9 ? `[${idx + 1}]` : ''}
                  </span>
                  <span className="iso-finder__main">
                    <span className="iso-finder__name">
                      {o.kind === 'region'
                        ? THEATER_DISPLAY[o.id].title
                        : o.kind === 'place'
                          ? o.label
                          : `Open “${o.query}”`}
                    </span>
                    <span className="iso-finder__sub">
                      {o.kind === 'region'
                        ? THEATER_DISPLAY[o.id].season
                        : o.kind === 'place'
                          ? 'Live terrain'
                          : 'Live terrain from your search'}
                    </span>
                  </span>
                  {isOpenNow && <span className="iso-finder__tag">open now</span>}
                </li>
              );
            })}
          </ul>

          <aside className="iso-finder__preview" aria-live="polite">
            <Locator lat={lat} lon={lon} caption={caption} />

            {isExecuting ? (
              <div className="iso-finder__progress">
                <p className="iso-finder__title">Opening {title}</p>
                <ol className="iso-finder__steps">
                  {PIPELINE_STEPS.map((st, i) => (
                    <li
                      key={st.id}
                      data-status={
                        i < runningStepIdx ? 'done' : i === runningStepIdx ? 'running' : 'waiting'
                      }
                    >
                      <span className="iso-check__box" aria-hidden="true" />
                      <span>{st.label}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : errorMessage && pending ? (
              <div className="iso-finder__error" role="alert">
                <p className="iso-finder__title">
                  {unreachable ? 'The backend is not answering' : 'That did not open'}
                </p>
                <p className="iso-finder__note">
                  {unreachable
                    ? `Isogon could not reach its backend at ${API_BASE}. Start the backend, then press Enter to try again.`
                    : plainText(errorMessage)}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <p className="iso-finder__title">{title}</p>
                  <p className="iso-finder__setting">{setting}</p>
                </div>
                <p className="iso-finder__note">{note}</p>
                {focused?.kind === 'region' && (
                  <table className="iso-table iso-finder__facts">
                    <tbody>
                      <tr>
                        <th scope="row">Record</th>
                        <td>{THEATER_DISPLAY[focused.id].season}</td>
                      </tr>
                      <tr>
                        <th scope="row">Elevation</th>
                        <td>{THEATER_DISPLAY[focused.id].elevation}</td>
                      </tr>
                      {runStages.length > 0 && activeRun?.region.id === focused.id && (
                        <tr>
                          <th scope="row">Last solve</th>
                          <td>
                            {Math.round(
                              runStages.reduce((acc, st) => acc + (st.duration_ms || 0), 0),
                            ).toLocaleString()}{' '}
                            ms
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </>
            )}

            <div className="iso-finder__options" role="group" aria-label="Validation">
              {/* Before 2012 no VIIRS flew, so there is nothing to hide. */}
              {!beforeSharpSatellite(activeRun) && (
                <button
                  type="button"
                  className="iso-check"
                  data-active={holdoutViirs ? 'true' : 'false'}
                  aria-pressed={holdoutViirs}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onToggleHoldoutViirs}
                >
                  <span className="iso-check__box" aria-hidden="true" />
                  <span>Blind test, hide VIIRS</span>
                </button>
              )}
              {/* A synthetic cloud deck is a simulation setting: a real run keeps the clouds the satellites saw. */}
              {!isRealRun(activeRun) && (
                <button
                  type="button"
                  className="iso-check"
                  data-active={cloudOverride !== null ? 'true' : 'false'}
                  aria-pressed={cloudOverride !== null}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onToggleCloudOverride}
                >
                  <span className="iso-check__box" aria-hidden="true" />
                  <span>55% cloud</span>
                </button>
              )}
            </div>
          </aside>
        </div>

        <div className="iso-finder__legend">
          <span className="iso-finder__legend-lead">
            Choose <kbd>&uarr;</kbd>
            <kbd>&darr;</kbd>
          </span>
          <span className="iso-finder__legend-lead">
            Pick <kbd>1</kbd> to <kbd>{Math.max(1, Math.min(9, options.length))}</kbd>
          </span>
          <button
            type="button"
            className="iso-finder__action"
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
            disabled={isExecuting || !focused}
          >
            {isExecuting ? 'Opening' : 'Open'} <kbd>&crarr;</kbd>
          </button>
          <button
            type="button"
            className="iso-finder__action"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClose}
          >
            Close <kbd>Esc</kbd>
          </button>
        </div>
      </div>
    </>
  );
}
