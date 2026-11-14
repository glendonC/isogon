import { useMemo, useRef } from 'react';
import { passStrip } from '../content/passes';
import type { PassList } from '../content/demo/passes';
import { BurningCalendar, type CalendarArea, type CalendarRunState } from './BurningCalendar';
import type { EpochSummary } from '../stage/types';
import type { CalendarState } from '../ui/useCalendar';
import { plainText } from '../ui/plainText';

const SENSOR_LABELS: Record<string, string> = {
  VIIRS_NOAA20: 'VIIRS NOAA-20',
  VIIRS_SNPP: 'VIIRS S-NPP',
  MODIS_AQUA: 'MODIS Aqua',
  MODIS_TERRA: 'MODIS Terra',
  AQUA_SNPP_PAIR: 'Aqua and S-NPP',
};

function formatRegime(regimeRaw: string): string {
  const clean = regimeRaw
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^co observed/, 'co-observed')
    .replace(/\bviirs\b/g, 'VIIRS')
    .replace(/\bmodis\b/g, 'MODIS');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
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
  onExitOverview: () => void;
  /** Burning calendar: the backend, the active region, its calendar, the real run state and the selection. */
  apiBase: string;
  regionId: string;
  area: CalendarArea;
  calendar: CalendarState;
  calendarRun: CalendarRunState;
  selectedMonth: string | null;
  onSelectMonth: (ym: string) => void;
  /** Whether the passes on the stage are NASA FIRMS detections or simulated. */
  passSource: 'firms' | 'simulated';
  /** Every pass over the box from NASA CMR (demo data), and the instrument a blind run hides. */
  passList: readonly PassList[] | null;
  hiddenFamily: 'VIIRS' | null;
  /** False on a run before 2012, which has no VIIRS to hide. */
  blindAvailable: boolean;
  /** Open the sheet that gets any area's record. */
  onOpenArea: () => void;
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
  onExitOverview,
  apiBase,
  regionId,
  area,
  calendar,
  calendarRun,
  selectedMonth,
  onSelectMonth,
  passSource,
  passList,
  hiddenFamily,
  blindAvailable,
  onOpenArea,
}: StageTimelineTrackProps) {
  const strip = useMemo(
    () => (passSource === 'firms' ? passStrip(epochSummaries, passList, regionId, hiddenFamily) : null),
    [passSource, epochSummaries, passList, regionId, hiddenFamily],
  );
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const epochIdx = Math.min(23, Math.max(0, Math.round(timeProgress)));
  const liveEpoch = epochSummaries?.[epochIdx];
  const timestampLabel = liveEpoch ? liveEpoch.timestamp_utc.replace('T', ' ').replace(':00Z', 'Z') : '';
  const sensorLabel = liveEpoch
    ? (SENSOR_LABELS[liveEpoch.primary_sensor] ?? liveEpoch.primary_sensor.replace(/_/g, ' '))
    : '';
  const regimeLabel = liveEpoch ? plainText(formatRegime(liveEpoch.regime)) : 'Waiting for the backend run';

  const progressFrac = Math.min(1, Math.max(0, timeProgress / 23));
  const firstTs = epochSummaries?.[0]?.timestamp_utc;
  const stageMonth = firstTs && /^\d{4}-\d{2}/.test(firstTs) ? firstTs.slice(0, 7) : null;

  const scrubAtClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const u = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onChangeTime(u * 23);
  };


  return (
    <div className="iso-timeline-hud">
      <div className="iso-timeline">
        <BurningCalendar
          apiBase={apiBase}
          regionId={regionId}
          area={area}
          calendar={calendar}
          run={calendarRun}
          stageMonth={stageMonth}
          selectedMonth={selectedMonth}
          onSelectMonth={onSelectMonth}
          onOpenArea={onOpenArea}
        />

        <div className="iso-timeline__meta">
          <span className="iso-timeline__pass">
            {passSource === 'firms' ? 'FIRMS pass' : 'Simulated pass'} {String(epochIdx + 1).padStart(2, '0')}/24
          </span>
          <span>{timestampLabel}</span>
          <span>{sensorLabel}</span>
          <span className="iso-timeline__regime">
            {regimeLabel}
            {strip && strip.frameCloud[epochIdx] !== null ? `, cloud ${Math.round(strip.frameCloud[epochIdx] as number)}%` : ''}
          </span>
        </div>

        <div
          ref={trackRef}
          className="iso-vernier__hit"
          role="slider"
          tabIndex={0}
          aria-label="Satellite pass"
          aria-valuemin={1}
          aria-valuemax={24}
          aria-valuenow={epochIdx + 1}
          aria-valuetext={`Pass ${epochIdx + 1} of 24`}
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

        {strip && (
          <div className="iso-passes">
            <div className="iso-passes__rail" aria-hidden="true">
              {strip.marks.map((m) => (
                <span
                  key={`${m.platform}-${m.timeUtc}`}
                  className="iso-passes__tick"
                  data-fire={m.sawFire ? 'true' : 'false'}
                  style={{ left: `${m.at * 100}%` }}
                />
              ))}
            </div>
            <p className="iso-passes__legend">
              <span className="iso-passes__key" data-fire="true" aria-hidden="true" />
              saw fire
              <span className="iso-passes__key" data-fire="false" aria-hidden="true" />
              looked, saw nothing. {strip.looked} passes over the box, {strip.sawFire} saw fire
              {hiddenFamily ? `; ${hiddenFamily} passes are hidden` : ''}. Demo data: NASA CMR pass list.
            </p>
          </div>
        )}
      </div>

      <div className="iso-keys" role="toolbar" aria-label="Keyboard commands">
        <button type="button" className="iso-key" data-active={playing ? 'true' : 'false'} onClick={onTogglePlay}>
          <kbd>Space</kbd>
          <span>{playing ? 'Pause' : 'Play'}</span>
        </button>
        <button
          type="button"
          className="iso-key"
          data-active={cinemaActive ? 'true' : 'false'}
          onClick={onToggleCinema}
        >
          <kbd>C</kbd>
          <span>Cinema</span>
        </button>
        <button
          type="button"
          className="iso-key"
          data-active={cleanHud ? 'true' : 'false'}
          onClick={onToggleCleanHud}
        >
          <kbd>H</kbd>
          <span>Clean feed</span>
        </button>
        <button type="button" className="iso-key" onClick={onNextRegion}>
          <kbd>N</kbd>
          <span>Next region</span>
        </button>
        <button
          type="button"
          className="iso-key"
          data-active={holdoutViirs ? 'true' : 'false'}
          onClick={onToggleHoldout}
          disabled={!blindAvailable}
          title={blindAvailable ? undefined : 'No VIIRS flew before 2012, so there is nothing to hide'}
        >
          <kbd>V</kbd>
          <span>Blind test</span>
        </button>
        <button
          type="button"
          className="iso-key"
          data-active={showUncertainty ? 'true' : 'false'}
          onClick={onToggleUncertainty}
        >
          <kbd>U</kbd>
          <span>Uncertainty</span>
        </button>
        <button type="button" className="iso-key" onClick={onExitOverview}>
          <kbd>Esc</kbd>
          <span>Landing</span>
        </button>
      </div>
    </div>
  );
}
