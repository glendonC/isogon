/**
 * Errors the stage throws by name, for the page's boundary around it to recognise without loading
 * the stage itself (this module imports nothing of three.js, so a page can import it eagerly while
 * the stage is loaded later).
 */

/** Why the stage could not draw: no WebGL2 in this browser, or WebGL2 there but the renderer failed. */
export type StageWebGLReason = 'unavailable' | 'failed';

export const STAGE_WEBGL_ERROR = 'StageWebGLError';

/** The browser cannot draw the 3D picture: WebGL2 is off, missing, or failed to start. */
export class StageWebGLError extends Error {
  readonly reason: StageWebGLReason;

  constructor(reason: StageWebGLReason, cause?: unknown) {
    super(
      reason === 'unavailable'
        ? 'This browser has no WebGL2, so the 3D picture cannot be drawn.'
        : 'WebGL2 is there but the 3D picture could not start.',
      cause === undefined ? undefined : { cause },
    );
    this.name = STAGE_WEBGL_ERROR;
    this.reason = reason;
  }
}

/** True for the stage's WebGL error, by name, so it holds across separately loaded chunks. */
export function isStageWebGLError(error: unknown): error is StageWebGLError {
  return error instanceof Error && error.name === STAGE_WEBGL_ERROR;
}

/** Whether this browser can give a WebGL2 context at all (a throwaway canvas, released at once). */
export function hasWebGL2(doc: Pick<Document, 'createElement'> = document): boolean {
  try {
    const canvas = doc.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
