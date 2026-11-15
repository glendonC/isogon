/**
 * The action dock as data: which row the light sits on, and where the arrow keys move it.
 * A screen's actions stand in one list; the light rests on the next step and follows the pointer or the keys.
 * Rows that cannot be used are skipped by the light and by the keys.
 */

export interface DockRow {
  disabled?: boolean;
}

/** The first usable row at or after `from`, wrapping; null when no row can be used. */
export function usableFrom(rows: DockRow[], from: number, step: 1 | -1 = 1): number | null {
  const n = rows.length;
  if (n === 0) return null;
  for (let k = 0; k < n; k++) {
    const i = (((from + k * step) % n) + n) % n;
    if (!rows[i].disabled) return i;
  }
  return null;
}

/** Where the light rests: the row pointed at or focused if usable, else the next step, else the first usable row. */
export function litRow(rows: DockRow[], next: number, active: number | null): number | null {
  if (active !== null && rows[active] && !rows[active].disabled) return active;
  if (rows[next] && !rows[next].disabled) return next;
  return usableFrom(rows, 0);
}

/** The row an arrow key moves to from `at`: down and up wrap, and pass over rows that cannot be used. */
export function moveRow(rows: DockRow[], at: number, key: string): number | null {
  if (key === 'ArrowDown') return usableFrom(rows, at + 1, 1);
  if (key === 'ArrowUp') return usableFrom(rows, at - 1, -1);
  if (key === 'Home') return usableFrom(rows, 0, 1);
  if (key === 'End') return usableFrom(rows, rows.length - 1, -1);
  return null;
}
