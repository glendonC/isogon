import * as THREE from 'three';

/** Viewport rectangle in fractions 0..1 with the origin at the top-left corner. */
export interface SubjectFrame {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * A sub-window of the camera image expressed the way `PerspectiveCamera.setViewOffset` wants it:
 * the subject is magnified by `scale` and the magnified image is shifted by the offsets
 * (viewport fractions, x to the right, y downward).
 */
export interface ViewWindow {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const IDENTITY_VIEW_WINDOW: Readonly<ViewWindow> = { scale: 1, offsetX: 0, offsetY: 0 };

const MIN_FRAME_SPAN = 0.08;
const MIN_SCALE = 0.3;
const MAX_SCALE = 3.0;

/** Returns a clamped copy of the frame, or null when the input is missing or degenerate. */
export function sanitizeSubjectFrame(frame: SubjectFrame | null | undefined): SubjectFrame | null {
  if (!frame) return null;
  const { left, top, right, bottom } = frame;
  if (![left, top, right, bottom].every((n) => Number.isFinite(n))) return null;
  const l = Math.min(1, Math.max(0, Math.min(left, right)));
  const r = Math.min(1, Math.max(0, Math.max(left, right)));
  const t = Math.min(1, Math.max(0, Math.min(top, bottom)));
  const b = Math.min(1, Math.max(0, Math.max(top, bottom)));
  if (r - l < MIN_FRAME_SPAN || b - t < MIN_FRAME_SPAN) return null;
  return { left: l, top: t, right: r, bottom: b };
}

export function subjectFramesEqual(a: SubjectFrame | null, b: SubjectFrame | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.left - b.left) < 1e-5 &&
    Math.abs(a.top - b.top) < 1e-5 &&
    Math.abs(a.right - b.right) < 1e-5 &&
    Math.abs(a.bottom - b.bottom) < 1e-5
  );
}

export interface OrbitPoseLike {
  azimuth: number;
  polar: number;
  distance: number;
  target: readonly [number, number, number];
}

const scratchCamera = new THREE.PerspectiveCamera();
const scratchTarget = new THREE.Vector3();
const scratchPoint = new THREE.Vector3();
const scratchEye = new THREE.Vector3();
const scratchNormal = new THREE.Vector3();

/**
 * Finds the view window that places the projected bounds of `points` inside `frame` (contain fit,
 * centered), for an orbit camera at `pose`. `azimuthSwing` widens the bounds over the idle drift
 * so the subject stays inside the frame at both ends of the swing.
 */
export function fitSubjectToFrame(
  points: Float32Array,
  pointCount: number,
  pose: OrbitPoseLike,
  azimuthSwing: number,
  fovDeg: number,
  aspect: number,
  frame: SubjectFrame,
  out: ViewWindow,
): ViewWindow {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  scratchCamera.fov = fovDeg;
  scratchCamera.aspect = aspect;
  scratchCamera.near = 0.1;
  scratchCamera.far = 200;
  scratchCamera.clearViewOffset();
  scratchCamera.updateProjectionMatrix();
  scratchTarget.set(pose.target[0], pose.target[1], pose.target[2]);

  const swings = azimuthSwing > 1e-4 ? [-azimuthSwing, 0, azimuthSwing] : [0];
  for (const swing of swings) {
    const az = pose.azimuth + swing;
    const sinP = Math.sin(pose.polar);
    scratchCamera.position.set(
      scratchTarget.x + pose.distance * sinP * Math.sin(az),
      scratchTarget.y + pose.distance * Math.cos(pose.polar),
      scratchTarget.z + pose.distance * sinP * Math.cos(az),
    );
    scratchCamera.up.set(0, 1, 0);
    scratchCamera.lookAt(scratchTarget);
    scratchCamera.updateMatrixWorld(true);

    for (let i = 0; i < pointCount; i++) {
      scratchPoint.set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]).project(scratchCamera);
      if (scratchPoint.z >= 1 || scratchPoint.z <= -1) continue;
      if (scratchPoint.x < minX) minX = scratchPoint.x;
      if (scratchPoint.x > maxX) maxX = scratchPoint.x;
      if (scratchPoint.y < minY) minY = scratchPoint.y;
      if (scratchPoint.y > maxY) maxY = scratchPoint.y;
    }
  }

  if (!(maxX > minX) || !(maxY > minY)) {
    out.scale = 1;
    out.offsetX = 0;
    out.offsetY = 0;
    return out;
  }

  // Subject bounds as viewport fractions of the unmodified camera image (origin top-left).
  const boundsW = (maxX - minX) * 0.5;
  const boundsH = (maxY - minY) * 0.5;
  const centerX = (minX + maxX) * 0.25 + 0.5;
  const centerY = 0.5 - (minY + maxY) * 0.25;

  const frameW = frame.right - frame.left;
  const frameH = frame.bottom - frame.top;
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(frameW / boundsW, frameH / boundsH)));

  out.scale = scale;
  out.offsetX = centerX * scale - (frame.left + frame.right) * 0.5;
  out.offsetY = centerY * scale - (frame.top + frame.bottom) * 0.5;
  return out;
}

/** World view: where the skyline may be put, as a fraction of the viewport height from the top. */
const SKYLINE_HIGHEST = 0.24;
const SKYLINE_LOWEST = 0.46;
/** Clear band kept between the calm rectangle and the terrain under it. */
const SKYLINE_MARGIN = 0.03;

/** The row the top of the terrain is put on: just under the calm rectangle, within the allowed band. */
function skylineRow(frame: SubjectFrame): number {
  return Math.min(SKYLINE_LOWEST, Math.max(SKYLINE_HIGHEST, frame.bottom + SKYLINE_MARGIN));
}

function aimScratchCamera(pose: OrbitPoseLike, az: number, fovDeg: number, aspect: number): void {
  scratchCamera.fov = fovDeg;
  scratchCamera.aspect = aspect;
  scratchCamera.near = 0.1;
  scratchCamera.far = 200;
  scratchCamera.clearViewOffset();
  scratchCamera.updateProjectionMatrix();
  scratchTarget.set(pose.target[0], pose.target[1], pose.target[2]);
  const sinP = Math.sin(pose.polar);
  scratchCamera.position.set(
    scratchTarget.x + pose.distance * sinP * Math.sin(az),
    scratchTarget.y + pose.distance * Math.cos(pose.polar),
    scratchTarget.z + pose.distance * sinP * Math.cos(az),
  );
  scratchCamera.up.set(0, 1, 0);
  scratchCamera.lookAt(scratchTarget);
  scratchCamera.updateMatrixWorld(true);
}

/**
 * Landing world view. Finds the vertical shift of the image that keeps the terrain `points` below
 * the bottom edge of the calm rectangle `frame`, across the rectangle's width and over the idle
 * drift, so the rectangle holds only sky and haze. Size and horizontal position are left alone.
 */
export function fitSkylineToFrame(
  points: Float32Array,
  pointCount: number,
  pose: OrbitPoseLike,
  azimuthSwing: number,
  fovDeg: number,
  aspect: number,
  frame: SubjectFrame,
  out: ViewWindow,
): ViewWindow {
  let top = Number.POSITIVE_INFINITY;
  const swings = azimuthSwing > 1e-4 ? [-azimuthSwing, 0, azimuthSwing] : [0];
  for (const swing of swings) {
    aimScratchCamera(pose, pose.azimuth + swing, fovDeg, aspect);
    for (let i = 0; i < pointCount; i++) {
      scratchPoint.set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]).project(scratchCamera);
      if (scratchPoint.z >= 1 || scratchPoint.z <= -1) continue;
      const x = scratchPoint.x * 0.5 + 0.5;
      if (x < frame.left - 0.04 || x > frame.right + 0.04) continue;
      const y = 0.5 - scratchPoint.y * 0.5;
      if (y < top) top = y;
    }
  }
  out.scale = 1;
  out.offsetX = 0;
  if (!Number.isFinite(top)) {
    out.offsetY = 0;
    return out;
  }
  const want = skylineRow(frame);
  // A point at image height y lands at y - offsetY on screen
  out.offsetY = Math.min(0.1, Math.max(-0.42, top - want));
  return out;
}

/**
 * Landing world view. The screen row (fraction of the viewport height from the top) that smoke and
 * the sensor curtain stay under: the bottom edge of the calm rectangle, and never lower than just
 * above the row the terrain is fitted to, whatever rectangle the page names.
 */
export function calmRow(frame: SubjectFrame): number {
  return Math.min(frame.bottom, skylineRow(frame) - SKYLINE_MARGIN);
}

/**
 * The plane through the eye of `camera` and the screen row `row`, as (normal, offset) with the
 * normal pointing up: a point p is below the row on screen when dot(normal, p) + offset < 0.
 * The camera must have its view window and world matrix up to date.
 */
export function planeUnderRow(camera: THREE.PerspectiveCamera, row: number, out: THREE.Vector4): THREE.Vector4 {
  const yNdc = 1 - 2 * row;
  scratchPoint.set(-1, yNdc, 0.5).unproject(camera);
  scratchTarget.set(1, yNdc, 0.5).unproject(camera);
  scratchEye.setFromMatrixPosition(camera.matrixWorld);
  scratchPoint.sub(scratchEye);
  scratchTarget.sub(scratchEye);
  scratchNormal.crossVectors(scratchTarget, scratchPoint).normalize();
  if (scratchNormal.y < 0) scratchNormal.negate();
  return out.set(scratchNormal.x, scratchNormal.y, scratchNormal.z, -scratchNormal.dot(scratchEye));
}

/** Applies a view window to a camera. Clears the offset when the window is the identity. */
export function applyViewWindow(
  camera: THREE.PerspectiveCamera,
  viewportW: number,
  viewportH: number,
  win: ViewWindow,
): void {
  const identity =
    Math.abs(win.scale - 1) < 4e-4 && Math.abs(win.offsetX) < 4e-4 && Math.abs(win.offsetY) < 4e-4;
  if (identity) {
    if (camera.view !== null && camera.view.enabled) camera.clearViewOffset();
    return;
  }
  camera.setViewOffset(
    viewportW * win.scale,
    viewportH * win.scale,
    win.offsetX * viewportW,
    win.offsetY * viewportH,
    viewportW,
    viewportH,
  );
}
