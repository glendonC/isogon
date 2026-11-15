import * as THREE from 'three';
import { SLAB_D, SLAB_W, THEATER_ORDER } from './earthCutawayShaders';
import type { InspectorCameraPreset, TheaterId } from './earthCutawayTypes';
import type { WorkspaceMode } from './types';

export interface OrbitSphericalState {
  azimuth: number;
  polar: number;
  distance: number;
  target: THREE.Vector3;
}

export interface CameraPresetSpec {
  azimuth: number;
  polar: number;
  distance: number;
  target: [number, number, number];
}

// Presets are tuned for the region-true slab (about 13 x 12.5 units, relief up to about 2 units).
export const LANDING_HERO_POSE: CameraPresetSpec = {
  azimuth: 0.50,
  polar: 0.98,
  distance: 17.2,
  target: [0.1, 0.3, 0.2],
};

export const INSPECTOR_CAMERA_PRESETS: Record<InspectorCameraPreset, CameraPresetSpec> = {
  overview: {
    azimuth: 0.48,
    polar: 0.97,
    distance: 17.0,
    target: [-0.6, 0.3, 0.3],
  },
  // Canyon and ridge are close obliques. The stage re-centers them on the fire found in the
  // solver field (see EarthCutawayStage), these targets are the fallback.
  canyon: {
    azimuth: -0.34,
    polar: 1.24,
    distance: 5.6,
    target: [-0.42, 0.45, -0.22],
  },
  ridge: {
    azimuth: 0.86,
    polar: 1.12,
    distance: 7.4,
    target: [0.32, 0.6, -0.14],
  },
  nadir: {
    azimuth: 0.0,
    polar: 0.14,
    distance: 18.5,
    target: [0.0, 0.3, 0.0],
  },
  // The whole box from higher, with the land around it (the stage draws no block there). Steep
  // enough that a board of tiles over the box reads as a grid and its far tiles are not squeezed
  region: {
    azimuth: 0.48,
    polar: 0.75,
    distance: 17.0,
    target: [-0.3, 0.3, 0.2],
  },
};

export function resolvePresetForContext(
  preset: InspectorCameraPreset,
  inWorkspace: boolean,
  mode: WorkspaceMode,
  theaterId: TheaterId,
): CameraPresetSpec {
  if (!inWorkspace) {
    return LANDING_HERO_POSE;
  }
  const base = INSPECTOR_CAMERA_PRESETS[preset] ?? INSPECTOR_CAMERA_PRESETS.overview;
  // Every place gets the same presets: nothing here is keyed on which place it is
  void theaterId;

  if (mode === 'observer' && preset === 'overview') {
    return {
      azimuth: base.azimuth,
      polar: 0.98,
      distance: 18.4,
      target: [0.0, 0.7, 0.2],
    };
  }

  return {
    azimuth: base.azimuth,
    polar: base.polar,
    distance: base.distance,
    target: [base.target[0], base.target[1], base.target[2]],
  };
}

/**
 * Smooth cubic-bezier S-curve (approx cubic-bezier(0.33, 0.0, 0.2, 1.0))
 * used for 950ms GPU elevation + ortho morphs and sub-orbital slews.
 */
export function easeSubOrbitalMorph(t: number): number {
  const x = Math.min(1.0, Math.max(0.0, t));
  return x < 0.5 ? 4.0 * x * x * x : 1.0 - Math.pow(-2.0 * x + 2.0, 3.0) * 0.5;
}

export const SUB_ORBITAL_MORPH_DURATION_SEC = 0.95;

export class SubOrbitalSlewController {
  private active = false;
  private elapsedSec = 0;
  private durationSec = SUB_ORBITAL_MORPH_DURATION_SEC;
  private startAzimuth = LANDING_HERO_POSE.azimuth;
  private endAzimuth = LANDING_HERO_POSE.azimuth;
  private startPolar = LANDING_HERO_POSE.polar;
  private endPolar = LANDING_HERO_POSE.polar;
  private startDistance = LANDING_HERO_POSE.distance;
  private endDistance = LANDING_HERO_POSE.distance;
  private startTarget = new THREE.Vector3(...LANDING_HERO_POSE.target);
  private endTarget = new THREE.Vector3(...LANDING_HERO_POSE.target);
  private hopHeightDist = 2.15;

  public trigger(
    current: OrbitSphericalState,
    destination: CameraPresetSpec,
    hopHeightDist = 2.15,
    durationSec = SUB_ORBITAL_MORPH_DURATION_SEC,
  ): void {
    this.active = true;
    this.elapsedSec = 0;
    this.durationSec = Math.max(0.25, durationSec);

    this.startAzimuth = current.azimuth;
    // Shortest angular delta around [-PI, PI]
    let deltaAz = destination.azimuth - current.azimuth;
    while (deltaAz > Math.PI) deltaAz -= Math.PI * 2;
    while (deltaAz < -Math.PI) deltaAz += Math.PI * 2;
    this.endAzimuth = current.azimuth + deltaAz;

    this.startPolar = current.polar;
    this.endPolar = destination.polar;
    this.startDistance = current.distance;
    this.endDistance = destination.distance;
    this.startTarget.copy(current.target);
    this.endTarget.set(destination.target[0], destination.target[1], destination.target[2]);
    this.hopHeightDist = hopHeightDist;
  }

  public cancel(): void {
    this.active = false;
  }

  public isActive(): boolean {
    return this.active;
  }

  public step(dtSec: number, outTarget: OrbitSphericalState): {
    slewActive: boolean;
    rawProgress: number;
    easedProgress: number;
  } {
    if (!this.active) {
      return { slewActive: false, rawProgress: 1.0, easedProgress: 1.0 };
    }

    this.elapsedSec += Math.min(0.08, Math.max(0.0, dtSec));
    const raw = Math.min(1.0, this.elapsedSec / this.durationSec);
    const e = easeSubOrbitalMorph(raw);
    const subOrbitalArc = Math.sin(raw * Math.PI);

    outTarget.azimuth = THREE.MathUtils.lerp(this.startAzimuth, this.endAzimuth, e);
    outTarget.polar = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(this.startPolar, this.endPolar, e) - subOrbitalArc * 0.085,
      0.10,
      1.38,
    );
    outTarget.distance =
      THREE.MathUtils.lerp(this.startDistance, this.endDistance, e) +
      subOrbitalArc * this.hopHeightDist;
    outTarget.target.lerpVectors(this.startTarget, this.endTarget, e);

    if (raw >= 1.0) {
      this.active = false;
    }

    return {
      slewActive: this.active,
      rawProgress: raw,
      easedProgress: e,
    };
  }
}

export interface CinemaFramePose {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  up: THREE.Vector3;
  fov: number;
  syntheticTimeProgress: number;
  cycleProgress: number;
  legProgress: number;
  activeLegTheater: TheaterId;
}

interface CinemaSplineRig {
  eyeCurve: THREE.CatmullRomCurve3;
  lookCurve: THREE.CatmullRomCurve3;
}

function buildTheaterSplineRig(theaterIdx: number): CinemaSplineRig {
  const dirSign = theaterIdx % 2 === 0 ? 1.0 : -1.0;
  const zFlip = theaterIdx >= 2 ? -1.0 : 1.0;

  // Closed Catmull-Rom spline sweeping from sub-orbital overlook down through the canyon gorge,
  // banking past rising smoke plumes, climbing the sunlit ridge, and ascending for theater handoff.
  const eyePoints = [
    new THREE.Vector3(6.6 * dirSign, 7.6, 7.8 * zFlip),
    new THREE.Vector3(4.2 * dirSign, 3.3, 5.1 * zFlip),
    new THREE.Vector3(1.1 * dirSign, 1.85, 2.5 * zFlip),
    new THREE.Vector3(-2.3 * dirSign, 1.72, 0.15 * zFlip),
    new THREE.Vector3(-4.6 * dirSign, 2.65, -2.4 * zFlip),
    new THREE.Vector3(-1.8 * dirSign, 4.45, -4.6 * zFlip),
    new THREE.Vector3(3.6 * dirSign, 6.45, -2.2 * zFlip),
    new THREE.Vector3(6.8 * dirSign, 7.9, 3.8 * zFlip),
  ];

  const lookPoints = [
    new THREE.Vector3(0.0, 0.65, 0.0),
    new THREE.Vector3(-0.35 * dirSign, 0.85, 0.45 * zFlip),
    new THREE.Vector3(-1.35 * dirSign, 1.05, -0.55 * zFlip),
    new THREE.Vector3(-1.85 * dirSign, 1.12, -1.35 * zFlip),
    new THREE.Vector3(-0.65 * dirSign, 1.02, -0.85 * zFlip),
    new THREE.Vector3(0.25 * dirSign, 0.88, -0.15 * zFlip),
    new THREE.Vector3(0.10 * dirSign, 0.72, 0.15 * zFlip),
    new THREE.Vector3(0.0, 0.65, 0.0),
  ];

  return {
    eyeCurve: new THREE.CatmullRomCurve3(eyePoints, true, 'catmullrom', 0.5),
    lookCurve: new THREE.CatmullRomCurve3(lookPoints, true, 'catmullrom', 0.5),
  };
}

const LEG_DURATION_SEC = 13.5;

export class CinemaDirector {
  private rigs: CinemaSplineRig[];
  private elapsedSec = 0;
  private currentLegIndex = 0;

  private readonly tmpEye = new THREE.Vector3();
  private readonly tmpEyeAhead = new THREE.Vector3();
  private readonly tmpEyeBehind = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();
  private readonly tmpVelA = new THREE.Vector3();
  private readonly tmpVelB = new THREE.Vector3();
  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3(0, 1, 0);
  private readonly worldUp = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.rigs = [0, 1, 2, 3].map((idx) => buildTheaterSplineRig(idx));
  }

  public startAtTheater(theaterId: TheaterId): void {
    const idx = Math.max(0, THEATER_ORDER.indexOf(theaterId));
    this.currentLegIndex = idx;
    this.elapsedSec = idx * LEG_DURATION_SEC;
  }

  public update(
    dtSec: number,
    sampleTerrainWorldY: (u: number, v: number) => number,
    onStepTheater?: (nextId: TheaterId) => void,
    slabWidth: number = SLAB_W,
    slabDepth: number = SLAB_D,
  ): CinemaFramePose {
    const clampedDt = Math.min(0.08, Math.max(0.0, dtSec));
    this.elapsedSec += clampedDt;

    const totalCycleSec = LEG_DURATION_SEC * THEATER_ORDER.length;
    const wrappedSec = ((this.elapsedSec % totalCycleSec) + totalCycleSec) % totalCycleSec;
    const legIdx = Math.min(
      THEATER_ORDER.length - 1,
      Math.floor(wrappedSec / LEG_DURATION_SEC),
    );
    const legProgress = (wrappedSec - legIdx * LEG_DURATION_SEC) / LEG_DURATION_SEC;

    if (legIdx !== this.currentLegIndex) {
      this.currentLegIndex = legIdx;
      onStepTheater?.(THEATER_ORDER[legIdx]);
    }

    const rig = this.rigs[legIdx];
    const eps = 0.008;
    const tPrev = (legProgress - eps + 1.0) % 1.0;
    const tNext = (legProgress + eps) % 1.0;

    rig.eyeCurve.getPointAt(legProgress, this.tmpEye);
    rig.eyeCurve.getPointAt(tPrev, this.tmpEyeBehind);
    rig.eyeCurve.getPointAt(tNext, this.tmpEyeAhead);
    rig.lookCurve.getPointAt(legProgress, this.tmpLook);

    // Terrain clearance guard so low canyon banking skims never clip high mountain ridges
    const uEye = this.tmpEye.x / slabWidth + 0.5;
    const vEye = 0.5 - this.tmpEye.z / slabDepth;
    if (uEye >= -0.02 && uEye <= 1.02 && vEye >= -0.02 && vEye <= 1.02) {
      const groundY = sampleTerrainWorldY(
        Math.min(1, Math.max(0, uEye)),
        Math.min(1, Math.max(0, vEye)),
      );
      const minClearance = groundY + 0.78;
      if (this.tmpEye.y < minClearance) {
        this.tmpEye.y = minClearance;
      }
    }

    const uLook = this.tmpLook.x / slabWidth + 0.5;
    const vLook = 0.5 - this.tmpLook.z / slabDepth;
    const lookGroundY = sampleTerrainWorldY(
      Math.min(1, Math.max(0, uLook)),
      Math.min(1, Math.max(0, vLook)),
    );
    this.tmpLook.y = Math.max(this.tmpLook.y, lookGroundY + 0.18);

    // Subtle aviation bank roll proportional to horizontal turn curvature
    this.tmpVelA.subVectors(this.tmpEye, this.tmpEyeBehind).setY(0);
    this.tmpVelB.subVectors(this.tmpEyeAhead, this.tmpEye).setY(0);
    let bankAngle = 0.0;
    if (this.tmpVelA.lengthSq() > 1e-6 && this.tmpVelB.lengthSq() > 1e-6) {
      this.tmpVelA.normalize();
      this.tmpVelB.normalize();
      const crossY = this.tmpVelA.x * this.tmpVelB.z - this.tmpVelA.z * this.tmpVelB.x;
      bankAngle = THREE.MathUtils.clamp(crossY * 1.45, -0.11, 0.11);
    }

    this.tmpForward.subVectors(this.tmpLook, this.tmpEye).normalize();
    this.tmpRight.crossVectors(this.tmpForward, this.worldUp).normalize();
    this.tmpUp
      .copy(this.worldUp)
      .applyAxisAngle(this.tmpForward, bankAngle)
      .normalize();

    // Advance diurnal fire reconstruction epoch smoothly from morning ignition through peak afternoon burn
    const syntheticTimeProgress = 0.18 + 0.68 * (0.5 - 0.5 * Math.cos(legProgress * Math.PI * 2.0));

    // Subtle focal-length breathing: slightly wider in low canyon gorge, tighter telephoto on ridge pull-up
    const canyonProximity = Math.sin(legProgress * Math.PI);
    const fov = 39.0 + canyonProximity * 3.2;

    return {
      position: this.tmpEye,
      lookAt: this.tmpLook,
      up: this.tmpUp,
      fov,
      syntheticTimeProgress,
      cycleProgress: wrappedSec / totalCycleSec,
      legProgress,
      activeLegTheater: THEATER_ORDER[legIdx],
    };
  }
}

/**
 * Decomposes an arbitrary world camera eye + lookAt point back into OrbitSphericalState
 * so exiting Cinema Director or finishing a sub-orbital slew hands back to damped orbit controls with zero jump.
 */
export function decomposePoseToOrbit(
  eye: THREE.Vector3,
  lookAt: THREE.Vector3,
  outState: OrbitSphericalState,
): void {
  outState.target.copy(lookAt);
  outState.target.x = THREE.MathUtils.clamp(outState.target.x, -SLAB_W * 0.45, SLAB_W * 0.45);
  outState.target.z = THREE.MathUtils.clamp(outState.target.z, -SLAB_D * 0.45, SLAB_D * 0.45);
  outState.target.y = THREE.MathUtils.clamp(outState.target.y, -0.1, 2.2);

  const offset = new THREE.Vector3().subVectors(eye, outState.target);
  const dist = THREE.MathUtils.clamp(offset.length(), 4.2, 26.0);
  const polar = THREE.MathUtils.clamp(Math.acos(THREE.MathUtils.clamp(offset.y / dist, -0.99, 0.99)), 0.10, 1.38);
  const azimuth = Math.atan2(offset.x, offset.z);

  outState.distance = dist;
  outState.polar = polar;
  outState.azimuth = azimuth;
}
