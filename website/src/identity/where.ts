/**
 * Where the visitor is, as words: the path from the world to the thing in view, and its coordinates.
 * Pure, so the top bar's text is tested without a browser.
 */

export interface Where {
  /** From the widest to the one in view, for example ['World', 'Feather River, California', 'Chips Fire, August 2012']. */
  path: string[];
  lat?: number | null;
  lon?: number | null;
}

function hemisphere(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(2)} ${value >= 0 ? positive : negative}`;
}

/** "40.05 N  121.18 W", two spaces between the two; null when either is unknown. */
export function formatCoord(lat?: number | null, lon?: number | null): string | null {
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return `${hemisphere(lat, 'N', 'S')}  ${hemisphere(lon, 'E', 'W')}`;
}

/** The name in view is the last step of the path; the steps before it are the trail back. */
export function splitPath(path: string[]): { trail: string[]; here: string } {
  const clean = path.map((p) => p.trim()).filter(Boolean);
  if (clean.length === 0) return { trail: [], here: '' };
  return { trail: clean.slice(0, -1), here: clean[clean.length - 1] };
}
