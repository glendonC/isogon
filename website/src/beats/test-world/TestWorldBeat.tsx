import { useEffect, useState } from 'react';
import { useWorkspace } from '../../app/store';
import { beatOf } from '../../app/names';
import { platformWords, tileName } from '../../content/nextLook';
import { utcDay, utcSpan } from '../../content/realRuns';
import { pixelsPerLookAndTile } from './env';
import '../../styles/test-world.css';

const time = (iso: string) => `${utcDay(iso)}, ${iso.slice(11, 16)} UTC`;
const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(4)}`;

/**
 * Test world in place on the terrain: the part's name as a banner when it opens, what the round is (the place, what is
 * hidden, the looks to spend) at the top left, the look on show and the looks left as a readout low left, the keys low
 * right, and at the end the reveal beside the board. The tiles are the stage's; their labels are `TileLabels`.
 */
export function TestWorldBeat() {
  const ws = useWorkspace();
  const { round, blocked, place } = ws;
  const b = beatOf('world');
  const [banner, setBanner] = useState(false);
  const settled = Boolean(round.state && round.start);
  useEffect(() => {
    if (settled) setBanner(true);
  }, [settled]);

  if (!round.state || !round.start) {
    return (
      <div className="tw-scene">
        <div className="tw-head sys-plate">
          <span className="sys-label sys-strong">{b.name.replace(/^\d+\s*/, '')}</span>
          <span className="sys-label">
            {round.error ? `The round did not start: ${round.error}.` : blocked.look ?? 'Starting a round on the server.'}
          </span>
        </div>
      </div>
    );
  }

  const st = round.state;
  const start = round.start;
  const ep = start.episode;
  const [rows, cols] = ep.tiles;
  const slot = start.looks[Math.min(st.decision, start.looks.length - 1)];
  const spent = st.picks.filter((p) => p.tile !== null).length;
  const left = ep.budget - spent;
  const current = st.picks.find((p) => p.decision === st.decision);
  const error = round.error ?? round.runError;

  return (
    <div className="tw-scene" data-done={st.done ? 'true' : 'false'}>
      {banner && (
        <div className="wm-banner sys-plate">
          <span className="sys-title">{b.name.replace(/^\d+\s*/, '')}</span>
          <span className="sys-label">{b.line}</span>
        </div>
      )}

      <div className="tw-head sys-plate">
        <span className="sys-label sys-strong">
          {place.title}, {utcSpan(ep.first_overpass_utc, ep.last_overpass_utc)}
        </span>
        <span className="sys-label tw-wrap">
          VIIRS is hidden. You see {ep.modis_overpasses} MODIS passes. Spend {ep.budget} looks on the {rows} by {cols} tiles
          where you think it matters.
        </span>
        {error && <span className="sys-label tw-fail tw-wrap">{error}.</span>}
      </div>

      {!st.done && (
        <div className="tw-readout sys-readout sys-plate" aria-live="polite">
          <span className="sys-readout__delta">
            Look {st.decision + 1} of {start.looks.length}: {platformWords(slot.platform)}, {time(slot.time_utc)},{' '}
            {slot.is_day ? 'day' : 'night'}
          </span>
          <span className="sys-display">{left}</span>
          <span className="sys-readout__label">
            of {ep.budget} looks left
            {st.awaitingNext && current && current.tile !== null
              ? `. ${current.pixels.toLocaleString('en-US')} hidden ${current.pixels === 1 ? 'detection' : 'detections'} in tile ${tileName(current.tile, cols)}${
                  current.pixels === 0 ? ': none, which may also mean cloud' : ', now on the terrain'
                }${current.reward !== null && current.reward !== undefined ? `. The score moved by ${signed(current.reward)}` : ''}.`
              : left > 0
                ? '. Pick a tile on the terrain to point VIIRS at it, or pass.'
                : '.'}
          </span>
        </div>
      )}

      {st.done && <RoundEnd />}

      <div className="tw-keys">
        {!st.done && round.canPick && round.focus !== null && (
          <button type="button" className="sys-ctl sys-plate" onClick={round.pickFocused}>
            <span className="sys-key">Space</span> Look at {tileName(round.focus, cols)}
          </button>
        )}
        <button type="button" className="sys-ctl sys-plate" onClick={round.next}>
          <span className="sys-key">Enter</span> {st.done ? 'Play again' : st.awaitingNext || left === 0 ? 'Next pass' : 'Pass'}
        </button>
        <button type="button" className="sys-ctl sys-plate" onClick={ws.openModel}>
          <span className="sys-key">Esc</span> Leave
        </button>
      </div>
    </div>
  );
}

/** The reveal at the end of a round, beside the board: what was hidden, then each player's gain on this episode. */
function RoundEnd() {
  const { round } = useWorkspace();
  const st = round.state!;
  const start = round.start!;
  const end = round.end;
  if (!end) {
    return (
      <div className="tw-end sys-plate">
        <span className="sys-title">The reveal</span>
        <span className="sys-label">Opening the hidden detections.</span>
      </div>
    );
  }
  const ref = end.reference;
  const randomGains = ref?.random.gains ?? [];
  const randomMean = randomGains.length ? randomGains.reduce((a, g) => a + g, 0) / randomGains.length : null;
  const found = st.picks.reduce((a, p) => a + p.pixels, 0);
  const spent = st.picks.filter((p) => p.tile !== null);
  const pixels = pixelsPerLookAndTile(end, start);
  const busiest = spent.reduce((a, p) => a + Math.max(0, ...(pixels[p.decision] ?? [0])), 0);
  const total = end.reveal.overpasses.filter((o) => o.look !== null).reduce((a, o) => a + o.footprints.length, 0);
  const rows: Array<[string, number | null, string?]> = [
    ['You', end.player.gain],
    ['Latest MODIS', ref ? ref.latest_modis.gain : null],
    ['Least sure', ref ? ref.least_sure.gain : null],
    [`Chance, mean of ${randomGains.length} draws`, randomMean],
    ['Sees the answer', ref ? ref.oracle.gain : null, 'reads the hidden detections and chooses where at the evenly spread looks'],
  ];
  return (
    <div className="tw-end sys-plate">
      <span className="sys-title">The reveal</span>
      <span className="sys-label tw-wrap">
        Every hidden VIIRS detection of the round is now on the terrain: {total.toLocaleString('en-US')} over{' '}
        {start.looks.length} passes. Your looks found {found.toLocaleString('en-US')}
        {spent.length > 0 ? `; the busiest tiles of the passes you looked at held ${busiest.toLocaleString('en-US')}` : ''}.
      </span>
      <div className="sys-table tw-gains" role="table" aria-label={`Gain in the score on this episode, from ${start.score_start.toFixed(3)}`}>
        <div className="sys-row tw-gains__head" role="row">
          <span className="sys-label" role="columnheader">
            Gain on this episode, from {start.score_start.toFixed(3)}
          </span>
          <span role="columnheader" />
        </div>
        {rows.map(([name, gain, note]) => (
          <div key={name} className="sys-row" role="row" data-you={name === 'You' ? 'true' : undefined}>
            <span className="sys-label" role="cell">
              {name}
              {note && <span className="sys-fine tw-note">{note}</span>}
            </span>
            <span className="sys-value" role="cell">
              {gain === null ? (ref ? 'not measured' : 'computing') : signed(gain)}
            </span>
          </div>
        ))}
      </div>
      <span className="sys-fine tw-wrap">
        The score is the share of burning cells the estimate and the hidden detections agree on, out of all cells either
        one marks. A look helps when it lifts that share.
      </span>
      {start.known_limits && <span className="sys-fine tw-wrap">{start.known_limits}</span>}
    </div>
  );
}
