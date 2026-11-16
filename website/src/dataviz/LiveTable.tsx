import type { LiveTable as LiveTableData } from './liveRows';

export interface LiveTableProps {
  table: LiveTableData;
  width?: number;
  /** Column heads; the product lane's words. */
  heads?: { fire: string; locked: string; data: string; fingerprint: string };
  /** Each row's number on the map beside the table, by fire, in a first column; absent, no such column. */
  nums?: ReadonlyMap<string, number>;
  /** Each row's result in place of the state of VIIRS's data, by fire, where there is one. */
  results?: ReadonlyMap<string, string>;
  /** False leaves the fingerprint out of the table (the opened row shows it whole). */
  fingerprint?: boolean;
}

const HEADS = { fire: 'Fire', locked: 'Locked', data: 'VIIRS data', fingerprint: 'Fingerprint' };

/**
 * Predictions locked before NASA publishes the data: one row a fire, when its latest prediction was locked, whether
 * VIIRS's data has arrived and been checked, and the fingerprint the prediction was sealed under.
 */
export function LiveTable({ table, width = 860, heads = HEADS, nums, results, fingerprint = true }: LiveTableProps) {
  const cell = { padding: '10px 16px 10px 0', borderTop: '1px solid var(--dv-line)', fontSize: 16, textAlign: 'left' as const };
  const head = { ...cell, borderTop: 'none', color: 'var(--dv-ink-2)', fontWeight: 400 };
  return (
    <table className="dv-figure" style={{ width, maxWidth: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {nums && <th style={{ ...head, width: 32 }} aria-label="Number on the map" />}
          <th style={head}>{heads.fire}</th>
          <th style={head}>{heads.locked}</th>
          <th style={head}>{heads.data}</th>
          {fingerprint && <th style={head}>{heads.fingerprint}</th>}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((r) => (
          <tr key={r.fireId} style={{ cursor: 'pointer' }}>
            {nums && <td style={{ ...cell, fontFamily: 'var(--dv-mono)', color: 'var(--id-signal, var(--dv-ink))' }}>{nums.get(r.fireId) ?? ''}</td>}
            <td style={{ ...cell, color: 'var(--dv-ink)' }}>{r.place}</td>
            <td style={{ ...cell, color: 'var(--dv-ink)' }}>{r.locked}</td>
            <td style={{ ...cell, color: r.checked || results?.has(r.fireId) ? 'var(--dv-ink)' : 'var(--dv-ink-2)' }}>{results?.get(r.fireId) ?? r.data}</td>
            {fingerprint && <td style={{ ...cell, fontFamily: 'var(--dv-mono)', color: 'var(--dv-ink-2)' }}>{r.fingerprint}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
