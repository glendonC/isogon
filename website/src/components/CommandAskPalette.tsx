import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWorkspace } from '../app/store';
import { type TheaterId } from '../stage/earthCutawayTypes';
import { formatLat, formatLon } from '../content/theaters';
import type { DynamicRegionRun } from '../stage/types';
import { Locator } from '../ui/Locator';
import { plainText } from '../ui/plainText';
import { useDialogFocus } from '../ui/useDialogFocus';
import '../styles/finder.css';
import { Control } from '../identity/Control';

const API_BASE: string = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8788';

const PIPELINE_STEPS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'terrain_ingest', label: 'Elevation and satellite imagery' },
  { id: 'sensor_operator', label: 'MODIS and VIIRS footprints for each pass' },
  { id: 'hurdle_quantile', label: 'The fire from the satellites\' passes' },
  { id: 'kalman_smoother', label: 'Smoother across the passes' },
  { id: 'conformal_gate', label: 'Uncertainty' },
];

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
  cloudOverride: number | null;
  isExecuting: boolean;
  errorMessage: string | null;
  onExecute: (params: ReconstructRequestParams) => Promise<boolean>;
  /** The places the registry serves with a real fire to open: the only places search offers. */
  places: readonly PalettePlace[];
}

/** A place search offers: the registry's name and what is on record there, and where it is. */
export interface PalettePlace {
  id: string;
  title: string;
  sub: string;
  note: string;
  lat: number | null;
  lon: number | null;
}

/** Search offers only places with a real fire record: no searched place and no simulated fire. */
type Option = { kind: 'region'; id: TheaterId };

/** The list's last row, always in view at its foot: anywhere else on Earth, where a visitor draws an area. */
const ANYWHERE = { id: 'anywhere', title: 'Anywhere else on Earth', sub: 'Draw an area on the Earth and read its fire record' };

/** The list's head, from the data: how many places there are, what each has, and the order. */
function listHead(shown: number, all: number): string {
  const what = `${all === 1 ? 'place' : 'places'}, each with a fire to walk through pass by pass, newest fire first`;
  return shown === all ? `${all} ${what}` : `${shown} of ${all} ${what}`;
}

function optionKey(o: Option): string {
  return o.id;
}

function placeMatches(p: PalettePlace, q: string): boolean {
  return [p.title, p.sub, p.note, p.id].some((v) => v.toLowerCase().includes(q));
}

/**
 * Search as a region select: a large field, the registry's places with a real fire record one per line, every row
 * alike, newest fire first under a head that says how many there are, and a last row always in view for anywhere else
 * on Earth; a preview of the place in focus on a Blue Marble locator, and a key legend. The list scrolls inside its
 * panel and ends on a whole row. Every name and date is the regions route's.
 * Keys: up and down move, Enter opens, typing filters, Esc closes.
 */
export function CommandAskPalette({
  open,
  onClose,
  activeTheaterId,
  activeRun,
  holdoutViirs,
  cloudOverride,
  isExecuting,
  errorMessage,
  onExecute,
  places,
}: CommandAskPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [runningStepIdx, setRunningStepIdx] = useState<number>(-1);
  const [pending, setPending] = useState<Option | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const headRef = useRef<HTMLParagraphElement | null>(null);
  const lastRef = useRef<HTMLDivElement | null>(null);
  const [listMax, setListMax] = useState<number | null>(null);
  useDialogFocus(open, sheetRef, inputRef);
  const ws = useWorkspace();

  // Newest fire first: each place by the last day of its newest fire that opens, as the regions route gives it
  const newest = useMemo(() => {
    const out = new Map<string, string>();
    for (const p of ws.places.places) {
      const days = p.featured_fires.filter((f) => f.default_start).map((f) => f.last_day || f.default_start || '');
      out.set(p.id, days.sort().at(-1) ?? '');
    }
    return out;
  }, [ws.places]);
  const sorted = useMemo(
    () => [...places].sort((a, b) => (newest.get(b.id) ?? '').localeCompare(newest.get(a.id) ?? '')),
    [places, newest],
  );

  const options = useMemo<Option[]>(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((p) => !q || placeMatches(p, q)).map((p) => ({ kind: 'region' as const, id: p.id as TheaterId }));
  }, [query, sorted]);

  useEffect(() => {
    if (!open) return;
    const currentIdx = sorted.findIndex((p) => p.id === activeTheaterId);
    setActiveIndex(currentIdx >= 0 ? currentIdx : 0);
    setPending(null);
  }, [open, activeTheaterId, sorted]);

  // The list ends on a whole row: its height is the most whole rows the panel's height leaves it, worked out from the
  // panel's own limit (not from the list, whose height would feed back on itself)
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const sheet = sheetRef.current;
      const list = listRef.current;
      const row = list?.querySelector<HTMLElement>('.iso-finder__item');
      if (!sheet || !list || !row) return setListMax(null);
      const cap = Number.parseFloat(getComputedStyle(sheet).maxHeight);
      const field = sheet.querySelector<HTMLElement>('.iso-finder__field')?.offsetHeight ?? 0;
      const legend = sheet.querySelector<HTMLElement>('.iso-finder__legend')?.offsetHeight ?? 0;
      const around = (headRef.current?.offsetHeight ?? 0) + (lastRef.current?.offsetHeight ?? 0);
      const pad = Number.parseFloat(getComputedStyle(list).paddingTop) + Number.parseFloat(getComputedStyle(list).paddingBottom);
      const room = cap - field - legend - around - pad;
      const rows = Math.max(1, Math.floor(room / row.offsetHeight));
      setListMax(rows * row.offsetHeight + pad);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, options.length]);

  // The row in focus is kept in view as the arrows move
  useEffect(() => {
    if (!open) return;
    const o = options[activeIndex];
    if (o) document.getElementById(`iso-finder-${optionKey(o)}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, options]);

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

  // The rows are the places, then anywhere else on Earth, which is always there
  const safeIndex = Math.min(activeIndex, options.length);
  const onAnywhere = safeIndex === options.length && !pending;
  const focused: Option | undefined = pending ?? options[safeIndex];
  const anywhere = () => {
    if (isExecuting) return;
    setQuery('');
    onClose();
    ws.runCommand('place:draw');
  };

  const run = async (o: Option) => {
    if (isExecuting) return;
    setPending(o);
    const ok = await onExecute({
      theaterId: o.id,
      regionId: o.id,
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
    if (onAnywhere) anywhere();
    else if (focused) void run(focused);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setPending(null);
      setActiveIndex((prev) => {
        const cur = Math.min(prev, options.length);
        return e.key === 'ArrowDown' ? Math.min(options.length, cur + 1) : Math.max(0, cur - 1);
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  // Preview content for the option in focus.
  let title = '';
  let setting = '';
  let note = '';
  let lat: number | null = null;
  let lon: number | null = null;
  const placeOf = (id: string) => places.find((p) => p.id === id) ?? null;
  if (onAnywhere) {
    title = ANYWHERE.title;
    note = ANYWHERE.sub;
  } else if (focused) {
    const t = placeOf(focused.id);
    title = t?.title ?? focused.id;
    setting = t?.sub ?? '';
    note = t?.note ?? '';
    lat = t?.lat ?? null;
    lon = t?.lon ?? null;
  }
  const caption = lat !== null && lon !== null ? `${formatLat(lat)}  ${formatLon(lon)}` : '';

  const unreachable = Boolean(errorMessage && /fetch|network|unreachable|refused/i.test(errorMessage));

  return (
    <>
      <div className="iso-backdrop iso-backdrop--soft iso-backdrop--read" onClick={onClose} role="presentation" />
      <div
        ref={sheetRef}
        className="iso-glass iso-finder iso-finder--read"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a place with a real fire record"
        onKeyDown={handleKeyDown}
      >
        <button type="button" className="iso-finder__close" onMouseDown={(e) => e.preventDefault()} onClick={onClose}>
          Close
        </button>
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
            placeholder="A place with a real fire record"
            className="iso-finder__input"
            aria-label="Place name"
            aria-controls="iso-finder-list"
            aria-activedescendant={onAnywhere ? `iso-finder-${ANYWHERE.id}` : focused ? `iso-finder-${optionKey(focused)}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="iso-finder__body">
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {places.length > 0 && (
            <p ref={headRef} className="iso-finder__sub iso-finder__count">
              {listHead(options.length, places.length)}
            </p>
          )}
          {options.length === 0 ? (
            <p className="iso-finder__list iso-finder__none" id="iso-finder-list">
              {query.trim() !== ''
                ? 'No place by that name has a real fire record here. Once a fire is open, the guide answers questions at the bottom right.'
                : 'The places with a real fire record are still loading.'}
            </p>
          ) : (
          <ul
            ref={listRef}
            className="iso-finder__list"
            id="iso-finder-list"
            role="listbox"
            aria-label="Places"
            // Scrolled by the arrows or the wheel, the list comes to rest on a whole row
            style={{ scrollSnapType: 'y mandatory', scrollPaddingTop: 10, ...(listMax !== null ? { maxHeight: listMax } : {}) }}
          >
            {options.map((o, idx) => {
              const isActive = idx === safeIndex && !pending && !onAnywhere;
              const isPending = pending !== null && optionKey(pending) === optionKey(o);
              const isOpenNow = activeRun?.region.id === o.id || (!activeRun && activeTheaterId === o.id);
              return (
                <li
                  key={optionKey(o)}
                  id={`iso-finder-${optionKey(o)}`}
                  role="option"
                  aria-selected={isActive || isPending}
                  className="iso-finder__item"
                  style={{ scrollSnapAlign: 'start' }}
                  data-active={isActive || isPending ? 'true' : 'false'}
                  onMouseEnter={() => {
                    if (!pending) setActiveIndex(idx);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void run(o)}
                >
                  {(isActive || isPending) && <span className="id-control__ticks iso-finder__ticks" aria-hidden="true" />}
                  <span className="iso-finder__main">
                    <span className="iso-finder__name">{placeOf(o.id)?.title ?? o.id}</span>
                    <span className="iso-finder__sub">{placeOf(o.id)?.sub ?? ''}</span>
                    {isOpenNow && <span className="iso-finder__tag">Open now</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          )}
          <div
            ref={lastRef}
            id={`iso-finder-${ANYWHERE.id}`}
            role="option"
            aria-selected={onAnywhere}
            className="iso-finder__item"
            data-active={onAnywhere ? 'true' : 'false'}
            style={{ margin: '0 10px 10px' }}
            onMouseEnter={() => {
              if (!pending) setActiveIndex(options.length);
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={anywhere}
          >
            {onAnywhere && <span className="id-control__ticks iso-finder__ticks" aria-hidden="true" />}
            <span className="iso-finder__main">
              <span className="iso-finder__name">{ANYWHERE.title}</span>
              <span className="iso-finder__sub">{ANYWHERE.sub}</span>
            </span>
          </div>
          </div>

          <aside className="iso-finder__preview" aria-live="polite">
            <Locator lat={onAnywhere ? null : lat} lon={onAnywhere ? null : lon} caption={onAnywhere ? '' : caption} />

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
                {(focused || onAnywhere) && (
                  <Control variant="primary" className="iso-finder__open" onClick={submit}>
                    {onAnywhere ? ANYWHERE.title : `Open ${title}`}
                  </Control>
                )}
              </>
            )}

          </aside>
        </div>

      </div>
    </>
  );
}
