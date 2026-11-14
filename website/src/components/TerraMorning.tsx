import { BlindScoreTable } from './BlindScoreTable';
import { parseBlindBlock, utcSpan } from '../content/realRuns';
import type { TerraMorning } from '../content/demo/terraMorning';

/**
 * S6, after the satellites retire: what Terra's morning pass would flag, estimated from VIIRS alone (fire-model M4),
 * for the region's 2021 test fire. Experimental, demo data until the route ships, and not drawn on the terrain yet.
 */
export function TerraMorningPanel({ doc, regionId, onClose }: { doc: TerraMorning; regionId: string; onClose: () => void }) {
  const fire = doc.fires[regionId];
  if (!fire) return null;
  const score = parseBlindBlock(fire.blind_test, `terra:${regionId}`);
  const bt = fire.blind_test as { scored_overpasses?: number; window_utc?: string[] };
  const span = bt.window_utc && bt.window_utc.length === 2 ? utcSpan(bt.window_utc[0], bt.window_utc[1]) : null;
  const v = doc.validation;
  return (
    <div className="iso-terra">
      <div className="iso-round__head">
        <h3 className="iso-terra__title">After Terra</h3>
        <button type="button" className="iso-key" onClick={onClose}>
          <kbd>T</kbd>
          <span>Close</span>
        </button>
      </div>
      <p className="iso-round__source">
        Demo data: {doc.source.unit} (commit {doc.source.commit}), until the route ships. Experimental.
      </p>
      <p className="iso-round__line">
        {doc.terra_end}; after that no satellite looks in the morning. This is what Terra&apos;s morning pass would
        flag, estimated from VIIRS alone and scored against the real one. The terrain does not show it yet.
      </p>
      {score && (
        <BlindScoreTable
          score={score}
          model={null}
          corner={`Terra mornings, ${fire.fire}`}
          hiddenText={`Hidden: every MODIS detection; scored against Terra's ${bt.scored_overpasses ?? ''} morning overpasses${span ? `, ${span}` : ''}.`}
        />
      )}
      <p className="iso-round__note">
        Model {doc.status}: {doc.status_reason}. On validation ({v.episodes} episodes, {v.overpasses} Terra mornings) it is
        ahead on {v.ahead} scores, tied on {v.tied} and behind on {v.behind}; its 90% interval held for {v.interval_held} of{' '}
        {v.interval_n}.
      </p>
    </div>
  );
}
