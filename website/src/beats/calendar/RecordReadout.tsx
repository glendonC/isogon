import type { ReactNode } from 'react';
import { monthWords, type RecordMonth } from './record';
import { BAND_UNIT, exactRate, READOUT_WORDS as R } from './recordWords';

/**
 * The pointed month, read out exactly and always in one place beside the grid, as the pointer or the arrow keys move:
 * the month, what each instrument counted on each satellite, the value on one scale and its range. It is the Record's
 * counterpart of the search's side view, whose window onto the Earth (the shared locator) stands at its head once it
 * is given (`locator`). Every figure is the answer's, as it came; a satellite the answer gives no count for says so.
 */
export function RecordReadout({
  month,
  level,
  asCounted,
  locator,
}: {
  month: RecordMonth;
  level: number | null;
  asCounted: boolean;
  locator?: ReactNode;
}) {
  const count = (platform: string) => month.counts.find((c) => c.platform === platform)?.total ?? null;
  return (
    <div className="rec-readout">
      {locator && <div className="rec-readout__locator">{locator}</div>}
      <span className="sys-label rec-readout__month">{monthWords(month.ym)}</span>
      <span className="sys-fine rec-readout__head">{R.counted}</span>
      <dl className="rec-readout__rows">
        {R.instruments.map(([platform, name]) => {
          const n = count(platform);
          return (
            <div className="rec-readout__row" key={platform} data-none={n === null ? 'true' : undefined}>
              <dt className="sys-fine">{name}</dt>
              <dd className={n === null ? 'sys-fine' : 'sys-value'}>{n === null ? R.noCount : R.count(n)}</dd>
            </div>
          );
        })}
        {asCounted && (
          <div className="rec-readout__row rec-readout__row--first">
            <dt className="sys-fine">{R.asCounted}</dt>
            <dd className="sys-value">{month.asCounted !== null ? exactRate(month.asCounted) : R.noValue}</dd>
          </div>
        )}
        <div className={asCounted ? 'rec-readout__row' : 'rec-readout__row rec-readout__row--first'}>
          <dt className="sys-fine">{R.oneScale}</dt>
          <dd className="sys-value">{month.value !== null ? exactRate(month.value) : R.noValue}</dd>
        </div>
        {month.p10 !== null && month.p90 !== null && (
          <div className="rec-readout__row">
            <dt className="sys-fine">{R.range(level)}</dt>
            <dd className="sys-value">
              {exactRate(month.p10)} to {exactRate(month.p90)}
            </dd>
          </div>
        )}
      </dl>
      <span className="sys-unit rec-readout__unit">{BAND_UNIT}</span>
    </div>
  );
}
