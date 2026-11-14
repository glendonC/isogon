import { useMemo, useRef, useState } from 'react';
import type { DynamicRegionRun } from '../stage/types';
import type { PassList } from '../content/demo/passes';
import {
  localSolarHours,
  passTrack,
  platformLabel,
  timeAtProgress,
  type RevealedPass,
  type TrackMark,
  type TrackState,
} from '../content/passTrack';
import '../styles/track.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const two = (n: number) => String(n).padStart(2, '0');
const utcClock = (t: number) => {
  const d = new Date(t * 1000);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
};
const utcDayName = (t: number) => {
  const d = new Date(t * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const localClock = (t: number, lon: number) => {
  const h = localSolarHours(t, lon);
  const hh = Math.floor(h);
  return `${two(hh)}:${two(Math.floor((h - hh) * 60))}`;
};
/** The local day a local midnight starts, for the axis. */
const localDayName = (t: number, lon: number) => {
  const d = new Date((t + (lon / 15) * 3600 + 60) * 1000);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const hoursWords = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${h < 10 ? h.toFixed(1) : Math.round(h)} h`);

export interface PassTrackProps {
  run: DynamicRegionRun | null;
  passLists: readonly PassList[] | null;
  state: TrackState;
  revealed: readonly RevealedPass[];
  timeProgress: number;
  onChangeTime: (frame: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
}

const STATE_WORDS: Record<TrackState, string> = {
  normal: 'NASA FIRMS passes',
  hidden: 'Blind: VIIRS hidden',
  revealed: 'Revealed',
  simulated: 'Simulated passes',
};

/**
 * The pass track (W1): every pass at its real time, VIIRS above the axis and MODIS below, night shaded, the pass on
 * the stage under the playhead with its time, satellite and the gap since the look before it. A mark's detail opens
 * beside it on hover; a click shows that pass on the terrain.
 */
export function PassTrack({ run, passLists, state, revealed, timeProgress, onChangeTime, playing, onTogglePlay }: PassTrackProps) {
  const data = useMemo(() => passTrack(run, passLists, state, revealed), [run, passLists, state, revealed]);
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<TrackMark | null>(null);

  if (!data) {
    return (
      <div className="iso-track" data-state={state}>
        <p className="iso-track__wait">Waiting for the run</p>
      </div>
    );
  }

  const span = data.t1 - data.t0;
  const x = (t: number) => ((t - data.t0) / span) * 100;
  const last = data.frames.length - 1;
  const current = Math.max(0, Math.min(last, Math.round(timeProgress)));
  const frame = data.frames[current];
  const tNow = timeAtProgress(data.frames, timeProgress);
  const prev = current > 0 ? data.frames[current - 1] : null;
  const gapH = prev ? (frame.t - prev.t) / 3600 : null;
  const height = (pixels: number | null) =>
    pixels === null || pixels <= 0 ? 0 : 0.18 + 0.82 * (Math.log10(1 + pixels) / Math.log10(1 + data.maxPixels));
  const bubbleLeft = Math.max(9, Math.min(91, x(tNow)));

  const jumpAt = (clientX: number) => {
    const el = laneRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const t = data.t0 + ((clientX - r.left) / r.width) * span;
    let best = 0;
    data.frames.forEach((f, i) => {
      if (Math.abs(f.t - t) < Math.abs(data.frames[best].t - t)) best = i;
    });
    onChangeTime(best);
  };

  return (
    <div className="iso-track" data-state={state}>
      <div className="iso-track__ctl">
        <button type="button" className="iso-track__btn" onClick={() => onChangeTime(Math.max(0, current - 1))} aria-label="Previous pass" disabled={current === 0}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M8 2 4 6l4 4" /></svg>
        </button>
        <button type="button" className="iso-track__btn iso-track__play" onClick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play the passes'} data-active={playing ? 'true' : 'false'}>
          {playing ? (
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5v7M8 2.5v7" /></svg>
          ) : (
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2 9.5 6l-6 4z" data-fill="true" /></svg>
          )}
        </button>
        <button type="button" className="iso-track__btn" onClick={() => onChangeTime(Math.min(last, current + 1))} aria-label="Next pass" disabled={current === last}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m4 2 4 4-4 4" /></svg>
        </button>
        <div className="iso-track__count">
          <span>
            Pass {current + 1} of {data.frames.length}
          </span>
          <span className="iso-track__state">{STATE_WORDS[state]}</span>
        </div>
      </div>

      <div className="iso-track__body">
        <div className="iso-track__rows" aria-hidden="true">
          <span>VIIRS 375 m</span>
          <span>MODIS 1 km</span>
        </div>
        <div
          ref={laneRef}
          className="iso-track__lane"
          role="slider"
          tabIndex={0}
          aria-label="Satellite pass"
          aria-valuemin={1}
          aria-valuemax={data.frames.length}
          aria-valuenow={current + 1}
          aria-valuetext={`Pass ${current + 1} of ${data.frames.length}, ${platformLabel(frame.platform)}, ${utcDayName(frame.t)} ${utcClock(frame.t)} UTC`}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('.iso-track__mark')) return;
            jumpAt(e.clientX);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              onChangeTime(Math.min(last, current + 1));
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              onChangeTime(Math.max(0, current - 1));
            }
          }}
        >
          {data.nights.map(([a, b]) => (
            <span key={a} className="iso-track__night" style={{ left: `${x(a)}%`, width: `${x(b) - x(a)}%` }} />
          ))}
          {data.midnights.map((m) => (
            <span key={m} className="iso-track__day" style={{ left: `${x(m)}%` }}>
              {localDayName(m, data.lon)}
            </span>
          ))}
          <span className="iso-track__axis" />

          {data.marks.map((m) => {
            const h = height(m.pixels);
            const isCurrent = m.isFrame && m.frame === current;
            return (
              <button
                key={m.key}
                type="button"
                tabIndex={-1}
                className="iso-track__mark"
                data-row={m.row}
                data-kind={m.kind}
                data-current={isCurrent ? 'true' : undefined}
                style={{ left: `${x(m.t)}%`, ['--h' as string]: h }}
                aria-label={`${platformLabel(m.platform)} ${utcDayName(m.t)} ${utcClock(m.t)} UTC`}
                onPointerEnter={() => setHover(m)}
                onPointerLeave={() => setHover((cur) => (cur?.key === m.key ? null : cur))}
                onFocus={() => setHover(m)}
                onClick={() => onChangeTime(m.frame)}
              />
            );
          })}

          <span className="iso-track__head" style={{ left: `${x(tNow)}%` }} />
          <div className="iso-track__bubble" style={{ left: `${bubbleLeft}%` }} aria-live="polite">
            <strong>
              {utcDayName(frame.t)}, {utcClock(frame.t)} UTC
            </strong>
            <span>
              {localClock(frame.t, data.lon)} local, {frame.isDay === false ? 'night' : frame.isDay ? 'day' : ''}
            </span>
            <span>
              {platformLabel(frame.platform)}, {frame.pixels.toLocaleString('en-US')} {frame.pixels === 1 ? 'pixel' : 'pixels'}
              {gapH !== null ? `, ${hoursWords(gapH)} after the pass before` : ''}
            </span>
          </div>

          {hover && (
            <div className="iso-track__card" style={{ left: `${Math.max(8, Math.min(92, x(hover.t)))}%` }} data-row={hover.row} role="tooltip">
              <strong>{platformLabel(hover.platform)}</strong>
              <span>
                {utcDayName(hover.t)}, {utcClock(hover.t)} UTC, {localClock(hover.t, data.lon)} local
              </span>
              {hover.kind === 'seen' && hover.pixels !== null && (
                <span>
                  {hover.pixels.toLocaleString('en-US')} {hover.pixels === 1 ? 'pixel' : 'pixels'} flagged fire in the box
                  {hover.isFrame ? '' : ' (laid on the nearest pass after the reveal)'}
                </span>
              )}
              {hover.kind === 'nothing' && (
                <span>
                  Looked and flagged no fire in the box. FIRMS cannot say whether cloud hid one
                  {hover.cloudPct !== null && hover.row === 'modis' ? `; the granule was ${Math.round(hover.cloudPct)}% cloud.` : '.'}
                </span>
              )}
              {hover.kind === 'hidden' && <span>Passed over the box. What it saw is hidden in this test.</span>}
              <em>{hover.isFrame && hover.frame === current ? 'On the terrain now' : 'Click to show this pass'}</em>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
