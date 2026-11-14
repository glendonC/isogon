/**
 * One switch per surface: `demo` reads the stand-in response in this folder, `live` calls the route.
 * A surface marked "Demo data" on screen is `demo` here.
 */
export type SurfaceSource = 'demo' | 'live';

export const SURFACE_SOURCE = {
  /** A round of next look: POST /api/env/next_look/reset and /step, GET /api/env/next_look/state. */
  nextLookRound: 'live',
  /** The passes that looked and saw nothing: GET /api/passes. */
  passes: 'demo',
} as const satisfies Record<string, SurfaceSource>;
