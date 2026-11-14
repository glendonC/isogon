import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { NextLookEnd, NextLookRevealed, NextLookStart } from '../content/demo/nextLook';
import { pixelsPerLookAndTile } from '../content/nextLookEnv';
import { platformWords, tileName } from '../content/nextLook';
import { utcDay, utcSpan } from '../content/realRuns';
import '../styles/nextlook.css';

/** One decision of the round: the look's slot, the tile chosen (null: passed) and what it revealed. */
export interface RoundPick {
  decision: number;
  tile: number | null;
  pixels: number;
  /** What the look's answer revealed: the hidden detections of its slot inside the tile. */
  revealed: NextLookRevealed[];
  /** The change in the score this look made, when the round runs on the server; null in the demo. */
  reward?: number | null;
}

export interface RoundState {
  decision: number;
  picks: RoundPick[];
  /** The current look has been spent; the result shows until the player moves on. */
  awaitingNext: boolean;
  /** The look the last answer said comes next; null when the round is over. */
  next: number | null;
  done: boolean;
}

export const NEW_ROUND: RoundState = { decision: 0, picks: [], awaitingNext: false, next: 0, done: false };

const time = (iso: string) => `${utcDay(iso)}, ${iso.slice(11, 16)} UTC`;
const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(4)}`;

interface ReadoutProps {
  start: NextLookStart;
  /** The answer of /end, once the round is over: the reveal and the reference agents. */
  end: NextLookEnd | null;
  round: RoundState;
  runError: string | null;
  onNext: () => void;
  onAgain: () => void;
  onLeave: () => void;
}

/**
 * The round's readout, in the inspector's place: where the round stands, then the reveal and the scores. The
 * interaction itself is on the terrain (TileOverlay).
 */
export function RoundReadout({ start, end, round, runError, onNext, onAgain, onLeave }: ReadoutProps) {
  const ep = start.episode;
  const cols = ep.tiles[1];
  const slot = start.looks[Math.min(round.decision, start.looks.length - 1)];
  const spent = round.picks.filter((p) => p.tile !== null).length;
  const left = ep.budget - spent;
  const current = round.picks.find((p) => p.decision === round.decision);
  const pixels = end ? pixelsPerLookAndTile(end, start) : null;

  return (
    <div className="iso-round">
      <div className="iso-round__head">
        <h2 className="iso-readout__title">Next look</h2>
        <button type="button" className="iso-key" onClick={onLeave}>
          <kbd>Esc</kbd>
          <span>Leave</span>
        </button>
      </div>
      <p className="iso-round__source">
        {start.data
          ? 'The round runs on the server: each look is scored as you take it, and the reference players play the same episode. The detections a look shows are NASA FIRMS.'
          : "Demo data: the turns follow the published schedule and the reference players' scores are from the model's own test of this episode. The detections a look shows are NASA FIRMS."}
      </p>
      <p className="iso-round__episode">
        Dixie fire, {utcSpan(ep.first_overpass_utc, ep.last_overpass_utc)}. You see {ep.modis_overpasses} MODIS passes;
        VIIRS is hidden. Spend {ep.budget} looks where you think it matters.
      </p>

      {runError && <p className="iso-round__line">The blind run did not load: {runError}.</p>}

      {!round.done ? (
        <div className="iso-round__turn" aria-live="polite">
          <p className="iso-round__count">
            Look {round.decision + 1} of {start.looks.length}
          </p>
          <p className="iso-round__slot">
            {platformWords(slot.platform)}, {time(slot.time_utc)}, {slot.is_day ? 'day' : 'night'}
          </p>
          <p className="iso-round__line">
            {left} of {ep.budget} looks left
          </p>
          {round.awaitingNext && current && current.tile !== null ? (
            <p className="iso-round__result">
              {current.pixels.toLocaleString('en-US')} hidden {current.pixels === 1 ? 'pixel' : 'pixels'} in tile{' '}
              {tileName(current.tile, cols)}
              {current.pixels === 0 ? ': none detected, which may also mean cloud.' : ', now on the terrain.'}
              {current.reward !== null && current.reward !== undefined
                ? ` The score moved by ${current.reward >= 0 ? '+' : ''}${current.reward.toFixed(4)}.`
                : ''}
            </p>
          ) : (
            <p className="iso-round__line">
              {left > 0 ? 'Pick a tile on the terrain to point VIIRS at it, or pass.' : 'No looks left.'}
            </p>
          )}
          <button type="button" className="iso-key" onClick={onNext}>
            <kbd>Enter</kbd>
            <span>{round.awaitingNext || left === 0 ? 'Next pass' : 'Pass'}</span>
          </button>
        </div>
      ) : (
        <div className="iso-round__end" aria-live="polite">
          <p className="iso-round__count">The reveal</p>
          {!end ? (
            <p className="iso-round__line">Opening the hidden detections.</p>
          ) : (
            <RoundEnd start={start} end={end} pixels={pixels} found={round.picks.reduce((a, p) => a + p.pixels, 0)} spent={round.picks.filter((p) => p.tile !== null)} />
          )}
          <div className="iso-round__keys">
            <button type="button" className="iso-key" onClick={onAgain}>
              <kbd>Enter</kbd>
              <span>Play again</span>
            </button>
          </div>
        </div>
      )}

      {round.picks.some((p) => p.tile !== null) && (
        <table className="iso-table iso-round__picks">
          <thead>
            <tr>
              <th scope="col">Your looks</th>
              <th scope="col">Tile</th>
              <th scope="col">Hidden pixels</th>
            </tr>
          </thead>
          <tbody>
            {round.picks
              .filter((p) => p.tile !== null)
              .map((p) => (
                <tr key={p.decision}>
                  <th scope="row">
                    {platformWords(start.looks[p.decision].platform)}, {start.looks[p.decision].time_utc.slice(8, 10)}{' '}
                    July {start.looks[p.decision].time_utc.slice(11, 16)}
                  </th>
                  <td>{tileName(p.tile as number, cols)}</td>
                  <td>{p.pixels.toLocaleString('en-US')}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RoundEnd({
  start,
  end,
  pixels,
  found,
  spent,
}: {
  start: NextLookStart;
  end: NextLookEnd;
  pixels: number[][] | null;
  found: number;
  spent: RoundPick[];
}) {
  const ref = end.reference;
  const randomGains = ref?.random.gains ?? [];
  const randomMean = randomGains.length ? randomGains.reduce((a, b) => a + b, 0) / randomGains.length : 0;
  const bestOnLooked = pixels ? spent.reduce((a, p) => a + Math.max(...pixels[p.decision]), 0) : null;
  const total = end.reveal.overpasses.filter((o) => o.look !== null).reduce((a, o) => a + o.footprints.length, 0);
  const t = end.test_episodes;
  return (
    <>
      <p className="iso-round__line">
        Every hidden VIIRS detection of the round is now on the terrain: {total.toLocaleString('en-US')} pixels over{' '}
        {start.looks.length} passes.
      </p>
      <p className="iso-round__line">
        The score is the share of burning cells the estimate and the hidden detections agree on, out of all cells
        either one marks. A look helps when it lifts that share.
      </p>
      <table className="iso-table iso-round__scores">
        <thead>
          <tr>
            <th scope="col">Gain on this episode, from {start.score_start.toFixed(3)}</th>
            <th scope="col" aria-label="Gain" />
          </tr>
        </thead>
        <tbody>
          <tr data-you="true">
            <th scope="row">You</th>
            <td>{end.player.gain === null ? 'not measured yet' : signed(end.player.gain)}</td>
          </tr>
          <tr>
            <th scope="row">Sees the answer</th>
            <td>{ref ? signed(ref.oracle.gain) : 'computing'}</td>
          </tr>
          <tr>
            <th scope="row">Latest MODIS</th>
            <td>{ref ? signed(ref.latest_modis.gain) : 'computing'}</td>
          </tr>
          <tr>
            <th scope="row">Least sure</th>
            <td>{ref ? signed(ref.least_sure.gain) : 'computing'}</td>
          </tr>
          <tr>
            <th scope="row">
              Random, mean of 10 tries
              {randomGains.length > 0 && (
                <span className="iso-round__range">
                  {Math.min(...randomGains).toFixed(4)} to {Math.max(...randomGains).toFixed(4)}
                </span>
              )}
            </th>
            <td>{randomGains.length ? signed(randomMean) : 'computing'}</td>
          </tr>
        </tbody>
      </table>
      <p className="iso-round__line">
        {end.player.gain === null ? 'Your gain is measured once the round runs on the server. ' : ''}Your looks found{' '}
        {found.toLocaleString('en-US')} hidden pixels
        {bestOnLooked !== null && spent.length > 0
          ? `; on the passes you looked at, the busiest tiles held ${bestOnLooked.toLocaleString('en-US')}.`
          : '.'}{' '}
        &quot;Sees the answer&quot; knows where the hidden detections are and marks the ceiling; the others see what you
        saw.
      </p>
      <p className="iso-round__note">
        Over the {t.episodes} test episodes: sees the answer {signed(t.mean_gain.oracle)}, least sure{' '}
        {signed(t.mean_gain.least_sure)}, latest MODIS {signed(t.mean_gain.latest_modis)}, random{' '}
        {signed(t.mean_gain.random)}.
      </p>
      <p className="iso-round__note">
        FIRMS lists detections, not where a satellite looked and saw nothing: a tile with none may have been cloudy.
        The looks are scheduled half-day slots; a real pass can come up to about 90 minutes from its slot.
      </p>
    </>
  );
}

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface OverlayProps {
  rect: ScreenRect;
  rows: number;
  cols: number;
  round: RoundState;
  /** Can a tile be picked now. */
  canPick: boolean;
  onPick: (tile: number) => void;
}

/**
 * The 4 by 4 tiles drawn over the terrain, seen from straight above. Hairlines only; the tile under the pointer and
 * the tiles already looked at are outlined, each looked-at tile with its name and what it revealed.
 */
export function TileOverlay({ rect, rows, cols, round, canPick, onPick }: OverlayProps) {
  const tw = rect.w / cols;
  const th = rect.h / rows;
  const looked = new Map(round.picks.filter((p) => p.tile !== null).map((p) => [p.tile as number, p]));
  const onKey = (e: ReactKeyboardEvent<SVGRectElement>, t: number) => {
    if ((e.key === 'Enter' || e.key === ' ') && canPick) {
      e.preventDefault();
      e.stopPropagation();
      onPick(t);
    }
  };
  return (
    <svg
      className="iso-tiles"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      viewBox={`0 0 ${rect.w} ${rect.h}`}
      data-can-pick={canPick ? 'true' : 'false'}
      aria-label="Tiles of the region, 4 by 4"
    >
      {Array.from({ length: rows * cols }, (_, t) => {
        const x = (t % cols) * tw;
        const y = Math.floor(t / cols) * th;
        const pick = looked.get(t);
        return (
          <g key={t}>
            <rect
              className="iso-tiles__tile"
              data-looked={pick ? 'true' : undefined}
              x={x + 0.5}
              y={y + 0.5}
              width={tw - 1}
              height={th - 1}
              tabIndex={canPick ? 0 : -1}
              role="button"
              aria-label={`Tile ${tileName(t, cols)}${pick ? `, looked at, ${pick.pixels} hidden pixels` : ''}`}
              onClick={() => canPick && onPick(t)}
              // A click picks without taking focus, so Enter afterwards means the next pass, not this tile again
              onMouseDown={(e) => e.preventDefault()}
              onKeyDown={(e) => onKey(e, t)}
            />
            {pick && (
              <text className="iso-tiles__label" x={x + 8} y={y + 18}>
                {tileName(t, cols)} {pick.pixels.toLocaleString('en-US')}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
