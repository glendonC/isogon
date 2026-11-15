import { ClearPin } from './ClearPin';
import type { MarkRow } from './marks';
import type { Box } from './place';
import '../styles/guide.css';

/**
 * The key of marks, on demand (`script.json`, "marks"): a short list joined to the fire by a leader, one row for each
 * mark now on show, each row its mark drawn small, then its name and its line. It stands where the fire's label stood,
 * clear of the fire's patches, and closes with the same key.
 */
export function MarksKey({ at, avoid, title, rows }: { at: { x: number; y: number }; avoid: Box[]; title: string; rows: MarkRow[] }) {
  if (rows.length === 0) return null;
  return (
    <ClearPin at={at} avoid={avoid} className="guide-marks" plateClass="guide-marks__plate" label={title}>
      <p className="guide-marks__title">{title}</p>
      {rows.map((r) => (
        <div key={r.id} className="guide-marks__row" data-mark={r.id}>
          <i className="guide-marks__swatch" data-mark={r.id} aria-hidden="true" />
          <span className="guide-marks__name">{r.name}</span>
          <span className="guide-marks__line">{r.line}</span>
        </div>
      ))}
    </ClearPin>
  );
}
