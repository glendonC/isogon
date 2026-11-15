import type { LiveTable as LiveTableData } from './liveRows';

export interface LiveTableProps {
  table: LiveTableData;
  width?: number;
  /** Column heads; the product lane's words. */
  heads?: { fire: string; locked: string; data: string; fingerprint: string };
}

const HEADS = { fire: 'Fire', locked: 'Prediction locked', data: 'VIIRS data', fingerprint: 'Fingerprint' };

/**
 * Predictions locked before NASA publishes the data: one row a fire, when its latest prediction was locked, whether
 * VIIRS's data has arrived and been checked, and the fingerprint the prediction was sealed under.
 */
export function LiveTable({ table, width = 860, heads = HEADS }: LiveTableProps) {
  const cell = { padding: '10px 16px 10px 0', borderTop: '1px solid var(--dv-line)', fontSize: 16, textAlign: 'left' as const };
  const head = { ...cell, borderTop: 'none', color: 'var(--dv-ink-2)', fontWeight: 400 };
  return (
    <table className="dv-figure" style={{ width, maxWidth: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={head}>{heads.fire}</th>
          <th style={head}>{heads.locked}</th>
          <th style={head}>{heads.data}</th>
          <th style={head}>{heads.fingerprint}</th>
        </tr>
      </thead>
      <tbody>
        {table.rows.map((r) => (
          <tr key={r.fireId}>
            <td style={{ ...cell, color: 'var(--dv-ink)' }}>{r.place}</td>
            <td style={{ ...cell, color: 'var(--dv-ink)' }}>{r.locked}</td>
            <td style={{ ...cell, color: r.checked ? 'var(--dv-ink)' : 'var(--dv-ink-2)' }}>{r.data}</td>
            <td style={{ ...cell, fontFamily: 'var(--dv-mono)', color: 'var(--dv-ink-2)' }}>{r.fingerprint}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
