import type { Box } from '../../app/places';

const lat = (v: number) => `${Math.abs(v).toFixed(2)} ${v < 0 ? 'S' : 'N'}`;
const lon = (v: number) => `${Math.abs(v).toFixed(2)} ${v < 0 ? 'W' : 'E'}`;
/** "39.31 N to 40.31 N, 121.55 W to 120.55 W", as the box calendar labels a box. */
export const boxWords = (b: Box) => `${lat(b[1])} to ${lat(b[3])}, ${lon(b[0])} to ${lon(b[2])}`;
