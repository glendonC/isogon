/**
 * One switch per surface (CONTRACT 12): `demo` reads the stand-in response in this folder, `live` calls the route.
 * A surface marked "Demo data" on screen is `demo` here; flip one entry when its route ships.
 */
export type SurfaceSource = 'demo' | 'live';

export const SURFACE_SOURCE = {
  /** S1, a round of next look: POST /api/env/next_look/reset and /step (terrain-assets over fire-model's env). */
  nextLookRound: 'demo',
  /** S2, the evidence sheet: GET /api/evidence (fire-model publishes one JSON). */
  evidence: 'demo',
  /** S3, the passes that looked and saw nothing: GET /api/passes (terrain-assets, from its CMR reader). */
  passes: 'demo',
} as const satisfies Record<string, SurfaceSource>;
