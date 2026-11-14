import { useEffect, useRef, useState } from 'react';
import type { RecordEraJumpId } from '../stage/earthCutawayTypes';
import type { EpochSummary } from '../stage/types';

interface CalendarPoint {
  year: number;
  modisRaw: number;
  viirsRaw: number | null;
  harmonized: number;
}

const FALLBACK_CALENDAR_2000_2026: CalendarPoint[] = Array.from({ length: 27 }, (_, idx) => {
  const year = 2000 + idx;
  const trend = 100 + idx * 1.45 + Math.sin(idx * 1.35) * 16;
  const modisDecay = year >= 2022 ? (year - 2021) * 5.2 : 0;
  const modisRaw = Math.round(trend - modisDecay);
  const viirsRaw = year >= 2012 ? Math.round(trend * 3.65 + (year >= 2018 ? 28 : 0)) : null;
  const harmonized = Math.round(trend * 1.18);
  return { year, modisRaw, viirsRaw, harmonized };
});

const DEFAULT_REGIME_BY_EPOCH: ReadonlyArray<{ ts: string; tag: string }> = Array.from(
  { length: 24 },
  (_, f) => {
    const day = 18 + Math.floor(f / 2);
    const isAfternoon = f % 2 === 0;
    const hhmm = [3, 9, 15, 20].includes(f) ? '18:30' : isAfternoon ? '21:35' : '09:35';
    if ([7, 8, 14, 19].includes(f)) {
      return { ts: `2026-08-${day} ${hhmm}Z`, tag: 'Cloud cover · wider 90% CI' };
    }
    if ([3, 9, 15, 20].includes(f)) {
      return { ts: `2026-08-${day} ${hhmm}Z`, tag: 'Terra 10:30 LST · overpass gap' };
    }
    if ([6, 13, 18].includes(f)) {
      return { ts: `2026-08-${day} ${hhmm}Z`, tag: '53° scan edge · 1 km MODIS smear' };
    }
    return { ts: `2026-08-${day} ${hhmm}Z`, tag: '13:30 LST · MODIS + VIIRS clear' };
  },
);

const SENSOR_LABEL_MAP: Record<string, string> = {
  VIIRS_NOAA20: 'VIIRS NOAA-20',
  VIIRS_SNPP: 'VIIRS S-NPP',
  MODIS_AQUA: 'MODIS Aqua',
  MODIS_TERRA: 'MODIS Terra',
  AQUA_SNPP_PAIR: 'Aqua + S-NPP',
};

function formatRegimeLabel(sensorRaw: string, regimeRaw: string): string {
  const sensor = SENSOR_LABEL_MAP[sensorRaw] ?? sensorRaw.replace(/_/g, ' ');
  const clean = regimeRaw
    .replace(/^CO_OBSERVED/i, 'Co-observed')
    .replace(/_/g, ' ')
    .toLowerCase();
  const pretty = (clean.charAt(0).toUpperCase() + clean.slice(1)).replace(
    /^Co observed/,
    'Co-observed',
  );
  return `${sensor} · ${pretty}`;
}

export interface StageTimelineTrackProps {
  timeProgress: number;
  onChangeTime: (next: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  epochSummaries?: readonly EpochSummary[];
  cinemaActive: boolean;
  onToggleCinema: () => void;
  cleanHud: boolean;
  onToggleCleanHud: () => void;
  onNextRegion: () => void;
  onToggleHoldout: () => void;
  holdoutViirs: boolean;
  showUncertainty: boolean;
  onToggleUncertainty: () => void;
  activeEra: RecordEraJumpId;
  onJumpEra: (era: RecordEraJumpId) => void;
  onExitOverview: () => void;
}

const EPOCH_TICKS = Array.from({ length: 24 }, (_, idx) => idx);

export function StageTimelineTrack({
  timeProgress,
  onChangeTime,
  playing,
  onTogglePlay,
  epochSummaries,
  cinemaActive,
  onToggleCinema,
  cleanHud,
  onToggleCleanHud,
  onNextRegion,
  onToggleHoldout,
  holdoutViirs,
  showUncertainty,
  onToggleUncertainty,
  activeEra,
  onJumpEra,
  onExitOverview,
}: StageTimelineTrackProps) {
  const [showRecord, setShowRecord] = useState(false);
  const [calendarSeries, setCalendarSeries] = useState<CalendarPoint[]>(FALLBACK_CALENDAR_2000_2026);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    let active = true;
    fetch('/generated/fields/calendar_2000_2026.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: unknown) => {
        if (!active || !raw || typeof raw !== 'object') return;
        const rec = raw as Record<string, unknown>;
        const list = Array.isArray(rec.annual_series)
          ? rec.annual_series
          : Array.isArray(rec.years)
            ? rec.years
            : null;
        if (!list || list.length < 10) return;
        const parsed: CalendarPoint[] = [];
        for (const item of list) {
          if (!item || typeof item !== 'object') continue;
          const row = item as Record<string, unknown>;
          const year = Number(row.year);
          const modisRaw = Number(row.raw_modis_index ?? row.modis_count ?? row.modis_raw ?? 100);
          const vRaw = row.raw_viirs_plus_modis_index ?? row.viirs_count ?? row.viirs_raw;
          const viirsRaw = year >= 2012 && Number.isFinite(Number(vRaw)) ? Number(vRaw) : null;
          const harmonized = Number(row.harmonized_activity_index ?? row.harmonized ?? 115);
          if (Number.isFinite(year) && Number.isFinite(harmonized)) {
            parsed.push({ year, modisRaw, viirsRaw, harmonized });
          }
        }
        if (parsed.length >= 10) {
          setCalendarSeries(parsed);
        }
      })
      .catch(() => {
        // Offline fallback series already populated
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShowRecord((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const epochIdx = Math.min(23, Math.max(0, Math.round(timeProgress)));
  const liveEpoch = epochSummaries?.[epochIdx];
  const fallbackMeta = DEFAULT_REGIME_BY_EPOCH[epochIdx] ?? DEFAULT_REGIME_BY_EPOCH[0];

  const timestampLabel = liveEpoch
    ? liveEpoch.timestamp_utc.replace('T', ' ').replace(':00Z', 'Z')
    : fallbackMeta.ts;
  const regimeLabel = liveEpoch
    ? formatRegimeLabel(liveEpoch.primary_sensor, liveEpoch.regime)
    : fallbackMeta.tag;

  const progressFrac = Math.min(1, Math.max(0, timeProgress / 23));

  const scrubAtClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const u = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onChangeTime(u * 23);
  };

  const w = 520;
  const h = 66;
  const maxY = Math.max(
    1,
    ...calendarSeries.map((d) => Math.max(d.modisRaw, d.viirsRaw ?? 0, d.harmonized)),
  );
  const xFor = (i: number) => (i / Math.max(1, calendarSeries.length - 1)) * (w - 12) + 6;
  const yFor = (val: number) => h - 6 - (val / maxY) * (h - 24);
  const harmPath = calendarSeries
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(d.harmonized).toFixed(1)}`)
    .join(' ');
  const modisPath = calendarSeries
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(d.modisRaw).toFixed(1)}`)
    .join(' ');
  const viirsPts = calendarSeries
    .map((d, i) => (d.viirsRaw !== null ? { x: xFor(i), y: yFor(d.viirsRaw) } : null))
    .filter((p): p is { x: number; y: number } => p !== null);
  const viirsPath = viirsPts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const idx2012 = calendarSeries.findIndex((d) => d.year === 2012);
  const x2012 = idx2012 >= 0 ? xFor(idx2012) : w * 0.46;

  return (
    <div className="iso-bottom-hud" aria-label="Overpass timeline and keyboard controls">
      <div className="iso-timeline">
        {showRecord && (
          <div className="iso-record-popover">
            <div className="iso-record-popover__head">
              <strong>2000-2026 Continuity Record</strong>
              <span>
                Removes the artificial 3.8x jump when 375 m VIIRS joined 1 km MODIS in 2012
              </span>
            </div>

            <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="66" aria-hidden="true">
              <line
                x1={x2012}
                y1={2}
                x2={x2012}
                y2={h - 2}
                stroke="rgba(245, 246, 250, 0.24)"
                strokeDasharray="2 3"
              />
              <text
                x={x2012 + 5}
                y={11}
                fill="rgba(245, 246, 250, 0.68)"
                fontSize="9.5"
                fontFamily="var(--font-mono)"
              >
                2012 S-NPP (+281% raw vs 1.03x calibrated)
              </text>
              <path
                d={modisPath}
                fill="none"
                stroke="rgba(245, 246, 250, 0.30)"
                strokeWidth="1.15"
              />
              {viirsPath && (
                <path
                  d={viirsPath}
                  fill="none"
                  stroke="#e87428"
                  strokeWidth="1.25"
                  strokeDasharray="3 2"
                />
              )}
              <path d={harmPath} fill="none" stroke="#f5f6fa" strokeWidth="1.8" />
            </svg>

            <div className="iso-record-eras">
              <span className="iso-record-eras__label">
                Inspect Historical Sensor Era
              </span>
              <div className="iso-cell-grid" role="group" aria-label="Historical sensor era">
                <button
                  type="button"
                  className="iso-ws-cell"
                  data-active={activeEra === '2006_modis' ? 'true' : 'false'}
                  onClick={() => onJumpEra('2006_modis')}
                >
                  2000-2011 MODIS Only (Blind Test)
                </button>
                <button
                  type="button"
                  className="iso-ws-cell"
                  data-active={activeEra === '2012_snpp' ? 'true' : 'false'}
                  onClick={() => onJumpEra('2012_snpp')}
                >
                  2012 S-NPP Launch
                </button>
                <button
                  type="button"
                  className="iso-ws-cell"
                  data-active={activeEra === '2026_fused' ? 'true' : 'false'}
                  onClick={() => onJumpEra('2026_fused')}
                >
                  2026 Fused Record
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="iso-timeline__meta">
          <span className="iso-timeline__epoch">
            PASS {String(epochIdx + 1).padStart(2, '0')}/24 · {timestampLabel}
          </span>
          <span className="iso-timeline__regime">{regimeLabel}</span>
        </div>

        <div
          ref={trackRef}
          className="iso-vernier__hit"
          role="slider"
          tabIndex={0}
          aria-label="24-pass satellite timeline scrubber"
          aria-valuemin={1}
          aria-valuemax={24}
          aria-valuenow={epochIdx + 1}
          onPointerDown={(e) => {
            draggingRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            scrubAtClientX(e.clientX);
          }}
          onPointerMove={(e) => {
            if (!draggingRef.current) return;
            scrubAtClientX(e.clientX);
          }}
          onPointerUp={(e) => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onPointerCancel={(e) => {
            draggingRef.current = false;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              onChangeTime(Math.min(23, Math.round(timeProgress) + 1));
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              onChangeTime(Math.max(0, Math.round(timeProgress) - 1));
            }
          }}
        >
          <div className="iso-vernier__rail">
            <div className="iso-vernier__fill" style={{ width: `${progressFrac * 100}%` }} />
            {EPOCH_TICKS.map((idx) => (
              <span
                key={idx}
                className={`iso-vernier__tick${idx % 6 === 0 || idx === 23 ? ' iso-vernier__tick--major' : ''}`}
                style={{ left: `${(idx / 23) * 100}%` }}
              />
            ))}
          </div>
          <div className="iso-vernier__needle" style={{ left: `${progressFrac * 100}%` }} />
        </div>
      </div>

      <div className="iso-cmd-bar" role="toolbar" aria-label="Workspace keyboard commands">
        <button
          type="button"
          className="iso-key-prompt"
          data-active={playing ? 'true' : 'false'}
          onClick={onTogglePlay}
        >
          <kbd>Space</kbd>
          <span>{playing ? 'Pause' : 'Play'}</span>
        </button>

        <button
          type="button"
          className="iso-key-prompt"
          data-active={cinemaActive ? 'true' : 'false'}
          onClick={onToggleCinema}
        >
          <kbd>C</kbd>
          <span>Cinema</span>
        </button>

        <button
          type="button"
          className="iso-key-prompt"
          data-active={cleanHud ? 'true' : 'false'}
          onClick={onToggleCleanHud}
        >
          <kbd>H</kbd>
          <span>Clean Feed</span>
        </button>

        <button type="button" className="iso-key-prompt" onClick={onNextRegion}>
          <kbd>N</kbd>
          <span>Next Region</span>
        </button>

        <button
          type="button"
          className="iso-key-prompt"
          data-active={holdoutViirs ? 'true' : 'false'}
          onClick={onToggleHoldout}
        >
          <kbd>V</kbd>
          <span>Blind Test</span>
        </button>

        <button
          type="button"
          className="iso-key-prompt"
          data-active={showUncertainty ? 'true' : 'false'}
          onClick={onToggleUncertainty}
        >
          <kbd>U</kbd>
          <span>90% Contours</span>
        </button>

        <button
          type="button"
          className="iso-key-prompt"
          data-active={showRecord ? 'true' : 'false'}
          onClick={() => setShowRecord((v) => !v)}
        >
          <kbd>R</kbd>
          <span>2000-2026</span>
        </button>

        <button type="button" className="iso-key-prompt" onClick={onExitOverview}>
          <kbd>Esc</kbd>
          <span>Sheet</span>
        </button>
      </div>
    </div>
  );
}
