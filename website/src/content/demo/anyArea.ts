/**
 * Demo data for any area's calendar.
 *
 * The backend serves a real calendar per region (`GET /api/calendar?region_id=&source=firms`) and none for an
 * arbitrary box. A box inside one of the three context boxes gets that region's real calendar (live), and a box
 * anywhere else gets a stand-in: the real Feather River calendar, named as such on screen, so the page shows what
 * a box's calendar looks like. No number is invented: the stand-in is another place's real record, said plainly.
 *
 * The context boxes are the real calendar responses' own `bbox` (west, south, east, north).
 */

export interface ContextBox {
  region_id: string;
  name: string;
  bbox: [number, number, number, number];
}

export const CONTEXT_BOXES: ContextBox[] = [
  { region_id: 'plumas_ca', name: 'Feather River', bbox: [-122.48, 39.1, -119.88, 41.0] },
  { region_id: 'lytton_bc', name: 'Lytton', bbox: [-122.93, 49.28, -120.23, 51.18] },
  { region_id: 'evia_greece', name: 'Northern Evia', bbox: [22.05, 37.96, 24.55, 39.76] },
];

/** The region whose real calendar stands in for a box no route serves. */
export const STAND_IN_REGION = 'plumas_ca';

/** The context box holding a box's centre, if any: its calendar is live. */
export function contextBoxOf(box: readonly number[]): ContextBox | null {
  const lon = (box[0] + box[2]) / 2;
  const lat = (box[1] + box[3]) / 2;
  return CONTEXT_BOXES.find((c) => lon >= c.bbox[0] && lon <= c.bbox[2] && lat >= c.bbox[1] && lat <= c.bbox[3]) ?? null;
}
