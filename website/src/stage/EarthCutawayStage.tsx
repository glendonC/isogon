import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  CLIFF_BASE_Y,
  FIELD_FRAME_COUNT,
  FIELD_GRID_SIZE,
  PEDESTAL_FRAGMENT_SHADER,
  PEDESTAL_VERTEX_SHADER,
  SIGMA_MAX_MW_KM2,
  SKIRT_FRAGMENT_SHADER,
  SKIRT_VERTEX_SHADER,
  SLAB_SEGMENTS,
  THEATER_ORDER,
  THEATER_PROFILES,
  Z_MAX_MW_KM2,
  alignReconstructionTensor,
  buildProceduralSatelliteTexture,
  buildProceduralTheaterDem,
  buildProceduralTheaterTensor,
  buildStratigraphicSkirtGeometry,
  createDemR32FTexture,
  createLipariLutTexture,
} from './earthCutawayShaders';
import { extractTerrainFindings } from './engine/terrainFindings';
import type { TerrainFindings } from './engine/terrainFindings';
import type {
  EarthCutawayStageProps,
  EarthStageTelemetry,
  LandingStandpointCheck,
  InspectorCameraPreset,
  StageFireAnchor,
  StageTileAnchor,
  TheaterId,
} from './earthCutawayTypes';
import {
  CinemaDirector,
  LANDING_HERO_POSE,
  SUB_ORBITAL_MORPH_DURATION_SEC,
  SubOrbitalSlewController,
  decomposePoseToOrbit,
  easeSubOrbitalMorph,
  resolvePresetForContext,
  type CameraPresetSpec,
  type OrbitSphericalState,
} from './orbitalDirector';
import {
  DEFAULT_FIELD_INTENSITY_SCALE,
  createFallbackObserverDataset,
  fieldScalePosition,
  fieldScaleValue,
  normalizeObserverDataset,
  parseFieldIntensityScale,
  type DynamicRegionRun,
  type FieldIntensityScale,
  type NormalizedFootprint,
  type NormalizedObserverDataset,
  type NormalizedSatellitePass,
  type TerrainFindingCallout,
  parseBeliefFrames,
  parseResidenceHours,
} from './types';
import {
  HAZE_STRENGTH,
  SKY_DOME_FRAGMENT_SHADER,
  SKY_DOME_VERTEX_SHADER,
  SKY_EXPOSURE_CLEAN,
  SKY_EXPOSURE_INTERFACE,
  SkyAtmosphere,
  sunLightColor,
  sunTransmittance,
} from './engine/atmosphere';
import {
  ContextTerrain,
  contextDropKm,
  loadTerrainContext,
  parseTerrainContext,
  sampleContextElevation,
  type LoadedTerrainContext,
} from './engine/contextTerrain';
import { FIRE_THRESHOLD_NORM, buildFireHistory, type FireHistory } from './engine/fireField';
import { FootprintField, LIGHT_TEX_SIZE, buildDetectionSource } from './engine/footprintField';
import { BeliefField } from './engine/beliefField';
import type { BeliefFrames } from './engine/beliefField';
import { HdrPipeline, resolveStagePixelRatio } from './engine/hdrPipeline';
import {
  MODIS_SCAN,
  NO_SCAN_PASS,
  VIIRS_SCAN,
  resolveScanPass,
  type ScanPassUniform,
} from './engine/scanGeometry';
import { SunShadowBaker } from './engine/shadowBake';
import { SpacecraftFleet, buildOrbitEnvironment, type FleetPass } from './engine/spacecraft';
import { SmokePass, buildSmokeHeightTexture } from './engine/smokeVolume';
import {
  VERTICAL_EXAGGERATION,
  computeSlabFrame,
  elevationToWorldY,
  type SlabFrame,
} from './engine/slabFrame';
import {
  loadPackImage,
  loadTerrainPack,
  parseTerrainPackManifest,
  scaleSunToStage,
  sunDirectionFromAngles,
  type LoadedTerrainPack,
  type TerrainPackManifest,
} from './engine/terrainPack';
import { TERRAIN_DEPTH_FRAGMENT_SHADER, TERRAIN_FRAGMENT_SHADER, TERRAIN_VERTEX_SHADER } from './engine/terrainShader';
import {
  applyViewWindow,
  calmRow,
  fitSkylineToFrame,
  fitSubjectToFrame,
  planeUnderRow,
  sanitizeSubjectFrame,
  subjectFramesEqual,
  type SubjectFrame,
  type ViewWindow,
} from './engine/landingFrame';

// The direction the shaders' curtain plane faces. No curtain is drawn (see NO_CURTAIN_PLANE);
// the close presets still keep clear of this direction, which is the landing's own view axis.
const CURTAIN_AZIMUTH = LANDING_HERO_POSE.azimuth;
/** Close presets: largest angle between the view axis and the sensor curtain, radians. */
const CLOSE_VIEW_CURTAIN_LIMIT = 0.62;
/**
 * Landing world view: lens, and how far the camera swings either way while it idles. The lens is
 * longer than the stage's 39 degrees so ridges stack behind one another.
 */
const LANDING_WORLD_FOV = 30.0;
const LANDING_WORLD_DRIFT = 0.055;
/** Standpoints tried: ground distance from the fire (world units), and height of the eye above the ground under it (metres). */
const LANDING_WORLD_DISTANCES = [3.6, 5.0, 6.5, 8.0] as const;
const LANDING_WORLD_LIFTS_M = [90, 180, 300, 450, 650, 900] as const;
/**
 * Ground nearer than the imagery can carry is kept out of the frame: at the nearest ground in view
 * one imagery texel may cover at most this many screen pixels (on a 1920 px wide 16:9 frame).
 */
const LANDING_WORLD_MAX_MAGNIFICATION = 2.0;
/** The carry distance is never asked to be larger than this, world units (regions without a pack). */
const LANDING_WORLD_CARRY_CAP = 2.5;
/** Share of the frame the fire on show should cover; the score rises up to this and no further. */
const LANDING_WORLD_FIRE_FRAME_SHARE = 0.05;
/**
 * A real fire sits in the middle distance of the landing, with terrain in front of it and the
 * horizon behind: no lower in the frame than this share of the way from the skyline to the bottom
 * edge (0.6 is about row 0.76 of the frame).
 */
const LANDING_WORLD_FIRE_LOWEST = 0.6;
/** Sight lines are followed this far in steps of this length, world units. */
const LANDING_WORLD_SIGHT_STEP = 0.14;
const LANDING_WORLD_SIGHT_STEPS = 150;
/** Clearance kept between the eye and the ground under it: the workspace, and the landing world view. */
const CAMERA_CLEARANCE = 0.3;
const CAMERA_CLEARANCE_WORLD = 0.03;
/** Screen columns checked for a standpoint, across the widest viewport (16:9) and the drift. */
const LANDING_WORLD_COLUMNS = 19;
/** Smoke nearer to the camera than this is not drawn, world units. */
const SMOKE_CLEAR_RADIUS = 1.7;
/** Sky exposure of the landing world view: daylight, a little deeper than clean feed so type holds. */
const SKY_EXPOSURE_LANDING = 0.6;
/** Calm rectangle used when the page names none: the upper third of the viewport. */
const DEFAULT_CALM_FRAME: SubjectFrame = { left: 0, top: 0, right: 1, bottom: 0.34 };
/** Grid of terrain samples for the skyline of the landing world view. */
/** Runs whose bundles are kept for an instant return (each holds 25 to 40 MB on the GPU). */
const RUN_CACHE_LIMIT = 4;
const SKYLINE_GRID = 33;
/** Samples per side of the context terrain for the same fit. */
const CONTEXT_SKYLINE_GRID = 48;
/** Close views in picture mode: air path over the floor, as a multiple of the physical one. */
const CLOSE_VIEW_FLOOR_HAZE = 3.2;
/** Close presets: preferred angle between the view axis and the sun azimuth (side light). */
const CLOSE_VIEW_SUN_ANGLE = 1.15;
// Landing only: keeps the projected seam within about 25 degrees of vertical
/**
 * No sensor curtain is drawn anywhere: it cut the ground the fire is on along a line that nothing
 * on screen explained. The shaders still read a curtain plane; it is parked this far out, beyond
 * the far terrain, so every point lies on the estimate's side.
 */
const NO_CURTAIN_PLANE = 6.0;

/** Cut direction in slab uv (unit length) for a seam aligned with a camera azimuth. */
function cutDirectionForAzimuth(
  azimuth: number,
  slabWidth: number,
  slabDepth: number,
  out: THREE.Vector2,
): THREE.Vector2 {
  // Screen-right of a camera at this azimuth is (cos a, -sin a) on the ground (x, z)
  return out.set(-slabWidth * Math.cos(azimuth), -slabDepth * Math.sin(azimuth)).normalize();
}
const MAX_ORBITAL_RIGS = 4;
/**
 * Directional light on the spacecraft. A white diffuse surface facing the sun comes out at about
 * 1.4 in scene-linear units, a little above the terrain's 1.3 because there is no air in the way.
 */
const SPACECRAFT_SUN_INTENSITY = 4.4;
/** Volume above the slab that holds every spacecraft position the fleet can take. */
const FLEET_SKY_TOP = 4.6;
const FLEET_SKY_SHOULDER = 3.5;
const FLEET_SKY_RADIUS = 3.2;
const KM_PER_DEG_LAT = 111.32;

/** North-south ground extent of a bbox, for bundles that carry no explicit depth. */
function bboxDepthKm(bbox: [number, number, number, number]): number {
  return Math.max(1.0, (bbox[3] - bbox[1]) * KM_PER_DEG_LAT);
}

// Landing composition. Without a subject frame the image is shifted down by 11% of the viewport
// height. With one, the slab is fitted inside the given rectangle.
const LEGACY_LANDING_OFFSET_Y = -0.11;
const LANDING_DRIFT_AZIMUTH = 0.065;
const SUBJECT_GRID = 13;
const SUBJECT_SKY_POINTS = 5;
const SUBJECT_POINT_COUNT = SUBJECT_GRID * SUBJECT_GRID + 4 + SUBJECT_SKY_POINTS;
const SUBJECT_REFIT_INTERVAL_FRAMES = 24;

interface CachedTheaterBundle {
  key: string;
  regionId: string;
  runId: string | null;
  demTex: THREE.DataTexture;
  alignedDem: Float32Array;
  demGridRes: number;
  minElevM: number;
  maxElevM: number;
  satTex: THREE.Texture;
  orthoLabel: string;
  demLabel: string;
  tensor: Uint8Array;
  frameCount: number;
  bbox: [number, number, number, number];
  widthKm: number;
  depthKm: number;
  windDirUv: [number, number];
  hasSeaCoast: boolean;
  observerDataset: NormalizedObserverDataset;
  /** Where the camera presets look (three places, always present). */
  findings: TerrainFindingCallout[];
  /** The callouts shown on the terrain: only places the field holds, with the values it holds. */
  callouts: TerrainFindingCallout[];
  /** Arrival, extinction, peak and burned mask derived from `tensor`. Built on first activation. */
  fireHistory: FireHistory | null;
  /** Map frame: slab size with the region's aspect ratio and the fixed vertical exaggeration. */
  frame: SlabFrame;
  /** Sun direction in stage space, toward the sun. */
  sunDir: THREE.Vector3;
  /** The same sun at true scale (x east, y up, z south), for the atmosphere. */
  sunTrue: THREE.Vector3;
  /** Ground size of one imagery texel, km. */
  orthoTexelKm: number;
  /** 1 for low-resolution imagery that benefits from sharpening, 0 for the pack ortho. */
  sharpen: number;
  /** Sun shadow baked for this DEM and sun. Built on first activation. */
  shadow: THREE.WebGLRenderTarget | null;
  /** Terrain pack manifest from the run, when the backend provides one. */
  packManifest: TerrainPackManifest | null;
  packState: 'none' | 'loading' | 'failed';
  /** Set on the bundle that owns loaded pack textures; `lite` is the bundle it upgrades. */
  pack: LoadedTerrainPack | null;
  lite: CachedTheaterBundle | null;
  /** Context terrain surrounding the pack. Loaded after the pack and owned by the pack bundle. */
  context: LoadedTerrainContext | null;
  contextState: 'none' | 'loading' | 'failed';
  auxTex: THREE.Texture | null;
  detailTex: THREE.Texture | null;
  detailRect: [number, number, number, number];
  detailTexelKm: number;
  attribution: string;
  /** Terrain height and upslope direction for the smoke march. Built on first activation. */
  smokeHeight?: THREE.DataTexture | null;
  /** Real runs: where the satellites detected fire, per frame (see buildDetectionSource). */
  detectionSource?: Uint8Array | null;
  /** How the field bytes map to MW/km2, from the run's payload. Absent: the simulated scale. */
  fieldScale?: FieldIntensityScale;
  /** Real runs: the overpass the landing shows (see landingFrameOf). Worked out once. */
  landingFrame?: number | null;
  /** Real runs: hours a burning cell stays lit in the run's model, from the payload. Absent: 12. */
  residenceHours?: number;
  /** Real runs: where the run's fire is in the region (u east, v north). Worked out once. */
  fireCentre?: [number, number] | null;
}

/**
 * A pass of which nothing is drawn: no footprint, no scan cell, no spacecraft. Either the run says
 * so (a real hold-out run marks its hidden passes), or the page has VIIRS switched off.
 */
function passIsHidden(pass: NormalizedSatellitePass, holdoutViirs: boolean): boolean {
  return pass.hidden === true || (holdoutViirs && pass.family === 'viirs');
}

/**
 * Callouts on the terrain. They read a simulated run's field on its linear scale, so a real run
 * shows none. The camera anchors stay on the bundle: the landing standpoint still looks at the
 * strongest fire.
 */
const NO_CALLOUTS: TerrainFindingCallout[] = [];
function calloutsFor(bundle: CachedTheaterBundle): TerrainFindingCallout[] {
  return bundle.observerDataset.dataSource === 'firms' ? NO_CALLOUTS : bundle.callouts;
}

/** What the intensity scale of a bundle shows along its length, for the page's legend. */
function intensityLegendOf(bundle: CachedTheaterBundle): NonNullable<EarthStageTelemetry['intensityLegend']> {
  const scale = bundle.fieldScale ?? DEFAULT_FIELD_INTENSITY_SCALE;
  return {
    scale: scale.kind === 'linear' ? 'linear' : 'log',
    ticks: scale.ticks ?? [0, 0.25, 0.5, 0.75, 1].map((at) => ({ at, mwPerKm2: fieldScaleValue(scale, at) })),
  };
}

/**
 * Seconds a pass takes to cross the region as a scan front. The satellites cross these regions in
 * six to nine seconds; the front is drawn about three times faster.
 */
const SCAN_SECONDS = 2.6;

/** Seconds the landing's own tour rests on its first pass, and holds each pass after it. */
const LANDING_TOUR_REST_SECONDS = 9;
const LANDING_TOUR_HOLD_SECONDS = 6;

/** The scale bar shows from this camera distance (the block views), starts this far along the near edge, and ticks the two pixel sizes. */
const SCALE_BAR_FROM_DISTANCE = 9.5;
const SCALE_BAR_INSET = 0.08;
const SCALE_VIIRS_KM = 0.375;
const SCALE_MODIS_KM = 1.0;

/** How much brighter the moonlit ground is drawn when the whole block is seen from far than in a close view. */
const MOON_LIFT_FAR = 1.9;

/** Where the smoke drifts, in region uv (east, north): the same for every place, since no payload holds a wind. */
const SMOKE_DRIFT_UV: readonly [number, number] = [0.64, 0.76];

/** Seconds the lights of a pass take to fade out and to come up when the page steps the landing's pass. */
const LIGHT_FADE_OUT_SECONDS = 0.7;
const LIGHT_FADE_IN_SECONDS = 1.2;

/** Hours a burning cell stays lit when the run's payload does not say (the model's prior). */
const DEFAULT_RESIDENCE_HOURS = 12;

/** A cell counts as part of the estimate's fire, for the page's label, from this probability (the dotted line's level). */
const FIRE_ANCHOR_PROBABILITY = 0.02;

/**
 * Share of the day's smoke opacity that a night overpass keeps: none. Smoke lit from below by the
 * detections was tried: its march cost the landing more than half its frame rate, and its glow in
 * the air read as more fire than the detections hold. By night the fire is its lights and the
 * light they cast on the ground.
 */
const NIGHT_SMOKE_OPACITY = 0.0;

/** The estimate's glow on a real run starts at this fire radiative power density, MW/km2. It is strongest at the top of the run's scale. */
const HEAT_FROM_MW_KM2 = 1;
/** Where the estimate's glow starts and where it is strongest, as positions on the run's intensity scale. */
function heatRangeOf(scale: FieldIntensityScale, out: THREE.Vector2): THREE.Vector2 {
  if (scale.kind === 'linear') return out.set(0.02, 1.0);
  return out.set(fieldScalePosition(scale, HEAT_FROM_MW_KM2), 1.0);
}

/**
 * A detection's light is dimmest at the first fire radiative power density and brightest at the
 * second, MW per km2 of its footprint. In the Dixie run a night VIIRS overpass has its median
 * detection near 26, a tenth above 118 and its strongest near 840; a day overpass runs to 2,800.
 */
const LIGHT_FROM_MW_KM2 = 4;
const LIGHT_FULL_MW_KM2 = 2500;
/** The same two as positions on the run's intensity scale. */
function lightRangeOf(scale: FieldIntensityScale, out: THREE.Vector2): THREE.Vector2 {
  if (scale.kind === 'linear') return out.set(0.02, 1.0);
  return out.set(fieldScalePosition(scale, LIGHT_FROM_MW_KM2), fieldScalePosition(scale, LIGHT_FULL_MW_KM2));
}

/**
 * A fire wider than this share of the region's shorter side cannot stand whole in the landing
 * frame from a standpoint inside the region (the lens is 30 degrees and the fire is to sit in the
 * middle distance). Measured between the 5th and 95th percentile of the detections, each way.
 */
const LANDING_FIRE_MAX_SPAN = 0.45;

/**
 * The overpass a real run shows on the landing: a night VIIRS overpass (about two thirds of the
 * VIIRS detections of these fires were made at night, and a fire at night is light on dark
 * ground), the one with the most detections among those whose fire fits the frame whole. When
 * none fits, the night VIIRS overpass with the most detections; when the run shows no night VIIRS
 * overpass (a run with VIIRS held out), a night overpass of the instrument it does show, by the same
 * two rules; when it shows no night overpass at all, the overpass with the most detections. Hidden
 * passes are never chosen. Null for a simulated run, which follows the page's time.
 */
function landingFrameOf(
  dataset: NormalizedObserverDataset,
  bbox: readonly [number, number, number, number],
  widthKm: number,
  depthKm: number,
): number | null {
  if (dataset.dataSource !== 'firms') return null;
  const [lonMin, latMin, lonMax, latMax] = bbox;
  const limitKm = LANDING_FIRE_MAX_SPAN * Math.min(widthKm, depthKm);
  let best = -1;
  let bestScore = -1;
  dataset.frames.forEach((passes, f) => {
    let count = 0;
    let nightViirs = false;
    let night = false;
    const east: number[] = [];
    const north: number[] = [];
    for (const sp of passes) {
      if (sp.hidden) continue;
      count += sp.footprints.length;
      if (sp.family === 'viirs' && sp.isDay === false) nightViirs = true;
      if (sp.isDay === false && sp.footprints.length > 0) night = true;
      for (const fp of sp.footprints) {
        east.push(((fp.lon - lonMin) / Math.max(1e-9, lonMax - lonMin)) * widthKm);
        north.push(((fp.lat - latMin) / Math.max(1e-9, latMax - latMin)) * depthKm);
      }
    }
    if (count === 0) return;
    east.sort((a, b) => a - b);
    north.sort((a, b) => a - b);
    const lo = Math.floor(0.05 * (count - 1));
    const hi = Math.ceil(0.95 * (count - 1));
    const spanKm = Math.hypot(east[hi] - east[lo], north[hi] - north[lo]);
    const fits = spanKm <= limitKm;
    const score =
      count + (night ? 1e5 : 0) + (night && fits ? 2e5 : 0) + (nightViirs ? 1e6 : 0) + (nightViirs && fits ? 1e7 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  });
  return best >= 0 ? best : null;
}

/** Imagery credit of a bundle: the pack's, plus the context imagery's where that names another source. */
function creditWithContext(bundle: CachedTheaterBundle): string {
  const own = bundle.attribution;
  const around = bundle.context?.manifest.ortho.attribution ?? '';
  return around && around !== own ? (own ? `${own}; ${around}` : around) : own;
}

function isKnownTheater(id: string): id is TheaterId {
  return (THEATER_ORDER as readonly string[]).includes(id);
}

/**
 * The address the stage fetches an asset of a run from: the page's own resolver when it gives one
 * (its client maps the address to a live one or to a recorded file), else the address joined to
 * the API base.
 */
function assetAddress(props: EarthCutawayStageProps, rawUrl: string): string {
  return props.resolveAsset ? props.resolveAsset(rawUrl) : resolveAssetUrl(props.apiBase, rawUrl);
}

/** A file the site serves beside its own pages. The site may sit under a path, so never from the root. */
function siteFile(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

function resolveAssetUrl(apiBase: string, rawUrl: string): string {
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('data:')) {
    return rawUrl;
  }
  const cleanBase = apiBase.replace(/\/+$/, '');
  return rawUrl.startsWith('/') ? `${cleanBase}${rawUrl}` : `${cleanBase}/${rawUrl}`;
}

function sampleAlignedDemBilinear(
  aligned: Float32Array,
  gridRes: number,
  u: number,
  v: number,
): number {
  const cu = Math.min(1, Math.max(0, u)) * (gridRes - 1);
  const cv = Math.min(1, Math.max(0, v)) * (gridRes - 1);
  const x0 = Math.floor(cu);
  const y0 = Math.floor(cv);
  const x1 = Math.min(gridRes - 1, x0 + 1);
  const y1 = Math.min(gridRes - 1, y0 + 1);
  const fx = cu - x0;
  const fy = cv - y0;

  const h00 = aligned[y0 * gridRes + x0];
  const h10 = aligned[y0 * gridRes + x1];
  const h01 = aligned[y1 * gridRes + x0];
  const h11 = aligned[y1 * gridRes + x1];

  const h0 = h00 + (h10 - h00) * fx;
  const h1 = h01 + (h11 - h01) * fx;
  return h0 + (h1 - h0) * fy;
}

// Floor around the slab in clean feed and cinema: distant ground instead of the dark studio floor
const FLOOR_COLOR_PICTURE = new THREE.Vector3(0.075, 0.098, 0.135);

// Sun used when a region has no terrain pack (stage space, toward the sun).
const DEFAULT_SUN_DIR = new THREE.Vector3(-0.56, 0.64, 0.52).normalize();

/**
 * Map frame, sun and pack manifest for a region. With a terrain pack the extent and the sun come
 * from the pack (the sun is fitted to the shading already present in the imagery).
 */
function resolveRegionShading(
  widthKm: number,
  depthKm: number,
  rawManifest: unknown,
): {
  widthKm: number;
  depthKm: number;
  frame: SlabFrame;
  sunDir: THREE.Vector3;
  sunTrue: THREE.Vector3;
  packManifest: TerrainPackManifest | null;
} {
  const packManifest = parseTerrainPackManifest(rawManifest);
  const w = packManifest ? packManifest.extent_km[0] : widthKm;
  const d = packManifest ? packManifest.extent_km[1] : depthKm;
  const frame = computeSlabFrame(w, d);
  const sunDir = DEFAULT_SUN_DIR.clone();
  const [ux, uy, uz] = frame.unitsPerMetre;
  // Without a pack the default stage sun is used; its true-scale direction follows from the frame
  const sunTrue = new THREE.Vector3(sunDir.x / ux, sunDir.y / uy, sunDir.z / uz).normalize();
  if (packManifest) {
    sunDirectionFromAngles(packManifest.sun.azimuth_deg, packManifest.sun.elevation_deg, sunTrue);
    scaleSunToStage(sunTrue, new THREE.Vector3(ux, uy, uz), sunDir);
  }
  return { widthKm: w, depthKm: d, frame, sunDir, sunTrue, packManifest };
}

// Credit for the 2K fallback imagery, which comes from the same source as the pack ortho but
// carries no attribution field of its own.
const FALLBACK_IMAGERY_ATTRIBUTION = 'Esri, Vantor, Earthstar Geographics, and the GIS User Community';

type BundleShadingFields = Pick<
  CachedTheaterBundle,
  | 'widthKm'
  | 'depthKm'
  | 'frame'
  | 'sunDir'
  | 'sunTrue'
  | 'orthoTexelKm'
  | 'sharpen'
  | 'shadow'
  | 'packManifest'
  | 'packState'
  | 'pack'
  | 'lite'
  | 'context'
  | 'contextState'
  | 'auxTex'
  | 'detailTex'
  | 'detailRect'
  | 'detailTexelKm'
  | 'attribution'
>;

/** Shading fields of a bundle that has no loaded pack textures (512 DEM, 2K or procedural image). */
function liteShadingFields(
  widthKm: number,
  depthKm: number,
  rawManifest: unknown,
  orthoPixels: number,
  attribution: string,
): BundleShadingFields {
  const s = resolveRegionShading(widthKm, depthKm, rawManifest);
  const texelKm = s.widthKm / Math.max(64, orthoPixels);
  return {
    widthKm: s.widthKm,
    depthKm: s.depthKm,
    frame: s.frame,
    sunDir: s.sunDir,
    sunTrue: s.sunTrue,
    orthoTexelKm: texelKm,
    sharpen: 1,
    shadow: null,
    packManifest: s.packManifest,
    packState: 'none',
    pack: null,
    lite: null,
    context: null,
    contextState: 'none',
    auxTex: null,
    detailTex: null,
    detailRect: [0, 0, 1, 1],
    detailTexelKm: texelKm,
    attribution,
  };
}

function bundleWorldY(elevM: number, b: CachedTheaterBundle): number {
  return elevationToWorldY(elevM, b.minElevM, b.maxElevM, b.frame);
}

/** The callouts and camera anchors of a field (see ./engine/terrainFindings.ts). */
function findingsOf(
  regionId: string,
  bbox: readonly [number, number, number, number],
  alignedDem: Float32Array,
  demRes: number,
  tensor: Uint8Array,
  frameCount: number,
): TerrainFindings {
  return extractTerrainFindings(
    regionId,
    bbox,
    tensor,
    frameCount,
    { gridSize: FIELD_GRID_SIZE, zMaxMwKm2: Z_MAX_MW_KM2, sigmaMaxMwKm2: SIGMA_MAX_MW_KM2 },
    (u, v) => sampleAlignedDemBilinear(alignedDem, demRes, u, v),
  );
}

export function EarthCutawayStage(props: EarthCutawayStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgLinesRef = useRef<(SVGPolylineElement | null)[]>([null, null, null]);
  const pinCrossRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const calloutCardRefs = useRef<(HTMLButtonElement | null)[]>([null, null, null]);
  // The scale bar on the block's near edge (see the render loop)
  const scaleGroupRef = useRef<SVGGElement | null>(null);
  const scaleBarRef = useRef<SVGPathElement | null>(null);
  const scaleTextRef = useRef<SVGTextElement | null>(null);

  const [renderedFindings, setRenderedFindings] = useState<TerrainFindingCallout[]>([]);

  // Real runs: the belief frames of the last few runs, by run id (about 3 MB each)
  const beliefStoreRef = useRef<Map<string, BeliefFrames>>(new Map());

  // Live prop mirror for zero-rebind 60fps render loop
  const propsRef = useRef<EarthCutawayStageProps>(props);
  propsRef.current = props;

  // Exposed imperative bridge between async bundle loaders and the WebGL2 render loop
  const engineBridgeRef = useRef<{
    activateBundle: (bundle: CachedTheaterBundle, animateMorph: boolean) => void;
    upgradeBundleInPlace: (bundle: CachedTheaterBundle) => void;
    bundleCache: Map<string, CachedTheaterBundle>;
    /** The bundle of a run that is still held, marked as just used; undefined when it is not. */
    takeRunBundle: (runId: string) => CachedTheaterBundle | undefined;
    /** Region of the terrain on screen (a custom search region keeps the page's theater id). */
    onScreenRegionId: () => string;
    /** Stores the bundle of a newly loaded run as its region's current one. */
    storeRunBundle: (regionId: string, runId: string, bundle: CachedTheaterBundle) => void;
    maxAnisotropy: number;
    texLoader: THREE.TextureLoader;
    triggerSlew: (targetTheaterId: TheaterId) => void;
    applyCameraPreset: () => void;
    syncCinemaStart: (active: boolean) => void;
  } | null>(null);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    let disposed = false;

    // 1. WebGL2 renderer. The scene is drawn into a half-float HDR buffer owned by the composer
    // (MSAA there), so the default framebuffer needs no multisampling, depth or stencil.
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      depth: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    let dpr = resolveStagePixelRatio();
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(new THREE.Color('#080b11'), 1.0);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    host.appendChild(renderer.domElement);

    const maxAnisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy() || 4);
    const texLoader = new THREE.TextureLoader();
    texLoader.setCrossOrigin('anonymous');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(39.0, 16 / 9, 0.12, 140.0);

    // HDR pipeline: scene-linear half-float buffers, mipmap bloom above 1.0, then one ACES Filmic
    // tone curve and one sRGB encode in the final pass.
    const pipeline = new HdrPipeline(renderer, scene, camera);

    // Volumetric smoke: raymarched against the scene depth in a pass between the scene render
    // and bloom, so it is tone mapped with everything else.
    const smokePass = new SmokePass();
    pipeline.insertScenePass(smokePass);
    const smokeHeightTextures = new Set<THREE.DataTexture>();
    const ensureSmokeHeight = (bundle: CachedTheaterBundle): THREE.DataTexture => {
      if (!bundle.smokeHeight) {
        bundle.smokeHeight = buildSmokeHeightTexture(
          bundle.alignedDem,
          bundle.demGridRes,
          (elevM) => bundleWorldY(elevM, bundle),
          bundle.frame.width,
          bundle.frame.depth,
        );
        smokeHeightTextures.add(bundle.smokeHeight);
      }
      return bundle.smokeHeight;
    };
    let smokeOpacity = 1.0;
    let pictureMix = 0.0;

    // One sun direction for terrain, shadows, spacecraft, smoke and sky. It follows the active region.
    // The directional light and the environment reach only the spacecraft (the only standard
    // materials in the scene): unfiltered sunlight, and Earth shine from below with black space above.
    const sunDir = DEFAULT_SUN_DIR.clone();
    const keyLight = new THREE.DirectionalLight(0xfffaf2, SPACECRAFT_SUN_INTENSITY);
    keyLight.position.copy(sunDir).multiplyScalar(20);
    scene.add(keyLight);
    const orbitEnvironment = buildOrbitEnvironment(renderer);
    scene.environment = orbitEnvironment.texture;

    // 2. Seed synchronous zero-latency theater bundles for all 4 wildfire theaters
    const bundleCache = new Map<string, CachedTheaterBundle>();
    const runCache = new Map<string, CachedTheaterBundle>();

    for (const tId of THEATER_ORDER) {
      const prof = THEATER_PROFILES[tId];
      const procDem = buildProceduralTheaterDem(tId, 256);
      const demPack = createDemR32FTexture(procDem, false);
      const satTex = buildProceduralSatelliteTexture(
        tId,
        demPack.aligned,
        demPack.gridRes,
        demPack.minElev,
        demPack.maxElev,
        maxAnisotropy,
      );
      const procTensor = buildProceduralTheaterTensor(tId);
      const found = findingsOf(
        tId,
        prof.bbox,
        demPack.aligned,
        demPack.gridRes,
        procTensor,
        FIELD_FRAME_COUNT,
      );
      bundleCache.set(tId, {
        key: `proc-${tId}`,
        regionId: tId,
        runId: null,
        demTex: demPack.texture,
        alignedDem: demPack.aligned,
        demGridRes: demPack.gridRes,
        minElevM: demPack.minElev,
        maxElevM: demPack.maxElev,
        satTex,
        orthoLabel: 'drawn stand-in',
        demLabel: '512²',
        tensor: procTensor,
        frameCount: FIELD_FRAME_COUNT,
        bbox: [...prof.bbox] as [number, number, number, number],
        windDirUv: [...prof.windDirUv] as [number, number],
        hasSeaCoast: prof.hasSeaCoast,
        observerDataset: createFallbackObserverDataset(prof.bbox),
        findings: found.anchors,
        callouts: found.callouts,
        fireHistory: null,
        ...liteShadingFields(prof.widthKm, bboxDepthKm(prof.bbox), null, 512, ''),
      });
    }

    // Fire history (arrival level set, burned area) is derived once per tensor, on first use.
    const floatLinearSupported = renderer.extensions.has('OES_texture_float_linear');
    const ensureFireHistory = (bundle: CachedTheaterBundle): FireHistory => {
      if (!bundle.fireHistory) {
        bundle.fireHistory = buildFireHistory(bundle.tensor, bundle.frameCount, floatLinearSupported);
      }
      return bundle.fireHistory;
    };

    const initialTheater = propsRef.current.activeTheaterId;
    let prevBundle = bundleCache.get(initialTheater) ?? bundleCache.get('plumas_ca')!;
    let nextBundle = prevBundle;

    // ---------------------------------------------------------------------------------------
    // Bundles that left both caches. A bundle holds 25 to 40 MB on the GPU (elevation, imagery,
    // fire history, baked shadow, smoke height), so one that nothing refers to any more is
    // released, but only once it is off screen, and only what no other bundle shares with it.
    // ---------------------------------------------------------------------------------------
    const retiredBundles: CachedTheaterBundle[] = [];
    const retireBundle = (bundle: CachedTheaterBundle | undefined) => {
      if (bundle && !retiredBundles.includes(bundle)) retiredBundles.push(bundle);
    };
    const heldBundles = (): Set<CachedTheaterBundle> => {
      const held = new Set<CachedTheaterBundle>();
      const add = (b: CachedTheaterBundle | null | undefined) => {
        if (!b) return;
        held.add(b);
        if (b.lite) held.add(b.lite);
      };
      add(prevBundle);
      add(nextBundle);
      for (const b of bundleCache.values()) add(b);
      for (const b of runCache.values()) add(b);
      for (const b of packBundles.values()) add(b);
      return held;
    };
    const sweepRetiredBundles = () => {
      if (retiredBundles.length === 0) return;
      const held = heldBundles();
      const inUse = new Set<unknown>();
      for (const b of held) {
        inUse.add(b.demTex);
        inUse.add(b.satTex);
        inUse.add(b.fireHistory?.texture);
        inUse.add(b.shadow);
        inUse.add(b.smokeHeight);
      }
      const release = (resource: { dispose: () => void } | null | undefined) => {
        if (!resource || inUse.has(resource)) return;
        inUse.add(resource);
        resource.dispose();
      };
      for (const b of retiredBundles) {
        // Back in a cache, or still on screen: it is not this sweep's to release
        if (held.has(b)) continue;
        release(b.demTex);
        release(b.satTex);
        release(b.fireHistory?.texture);
        release(b.shadow);
        if (b.smokeHeight) {
          smokeHeightTextures.delete(b.smokeHeight);
          release(b.smokeHeight);
        }
        b.fireHistory = null;
        b.shadow = null;
        b.smokeHeight = null;
        b.detectionSource = null;
      }
      // What is still on screen stays on the list for a later sweep
      for (let i = retiredBundles.length - 1; i >= 0; i--) {
        const b = retiredBundles[i];
        const onScreen = b === prevBundle || b === nextBundle || b === prevBundle.lite || b === nextBundle.lite;
        if (!onScreen) retiredBundles.splice(i, 1);
      }
    };
    /** Makes `bundle` the current one of its region; the one it replaces is retired unless a run still holds it. */
    const setRegionBundle = (regionId: string, bundle: CachedTheaterBundle) => {
      const old = bundleCache.get(regionId);
      bundleCache.set(regionId, bundle);
      if (old && old !== bundle) retireBundle(old);
    };
    const takeRunBundle = (runId: string): CachedTheaterBundle | undefined => {
      const bundle = runCache.get(runId);
      if (bundle) {
        // Most recently used last
        runCache.delete(runId);
        runCache.set(runId, bundle);
      }
      return bundle;
    };
    const storeRunBundle = (regionId: string, runId: string, bundle: CachedTheaterBundle) => {
      setRegionBundle(regionId, bundle);
      runCache.set(runId, bundle);
      // Every calendar date, hold-out switch and cloud setting is its own run: keep the last few
      while (runCache.size > RUN_CACHE_LIMIT) {
        const oldest = runCache.keys().next().value as string;
        const dropped = runCache.get(oldest);
        runCache.delete(oldest);
        retireBundle(dropped);
      }
    };
    setRenderedFindings(calloutsFor(nextBundle));

    // Persistent 256x256 RGBA epoch pair textures (zero per-frame allocation)
    const fieldBuf0 = new Uint8Array(FIELD_GRID_SIZE * FIELD_GRID_SIZE * 4);
    const fieldBuf1 = new Uint8Array(FIELD_GRID_SIZE * FIELD_GRID_SIZE * 4);
    const makeFieldTex = (buf: Uint8Array): THREE.DataTexture => {
      const t = new THREE.DataTexture(
        buf,
        FIELD_GRID_SIZE,
        FIELD_GRID_SIZE,
        THREE.RGBAFormat,
        THREE.UnsignedByteType,
      );
      // Mipmapped: the blurred levels are the light source for fire bounce light and, later, the
      // smoke source. Exact per-cell reads use textureLod(.., 0.0) in the shaders.
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.flipY = false;
      t.needsUpdate = true;
      return t;
    };
    const fieldTex0 = makeFieldTex(fieldBuf0);
    const fieldTex1 = makeFieldTex(fieldBuf1);
    const lipariTex = createLipariLutTexture();

    let uploadedFrame0 = -1;
    let uploadedFrame1 = -1;
    let uploadedTensorRef: Uint8Array | null = null;

    // Real runs: the detections of the two epochs, as the smoke source (red, one byte per cell)
    const detectionCells = FIELD_GRID_SIZE * FIELD_GRID_SIZE;
    const makeDetectionTex = (): THREE.DataTexture => {
      const tex = new THREE.DataTexture(
        new Uint8Array(detectionCells),
        FIELD_GRID_SIZE,
        FIELD_GRID_SIZE,
        THREE.RedFormat,
        THREE.UnsignedByteType,
      );
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.flipY = false;
      tex.needsUpdate = true;
      return tex;
    };
    const detectionTex0 = makeDetectionTex();
    const detectionTex1 = makeDetectionTex();
    let detectionKey0 = '';
    let detectionKey1 = '';
    const syncDetectionTextures = (bundle: CachedTheaterBundle, f0: number, f1: number): void => {
      const source = (bundle.detectionSource ??= buildDetectionSource(
        bundle.observerDataset.frames,
        bundle.frameCount,
        bundle.bbox,
        [bundle.widthKm, bundle.depthKm],
        FIELD_GRID_SIZE,
      ));
      const key0 = `${bundle.key}:${f0}`;
      if (key0 !== detectionKey0) {
        (detectionTex0.image.data as Uint8Array).set(source.subarray(f0 * detectionCells, (f0 + 1) * detectionCells));
        detectionTex0.needsUpdate = true;
        detectionKey0 = key0;
      }
      const key1 = `${bundle.key}:${f1}`;
      if (key1 !== detectionKey1) {
        (detectionTex1.image.data as Uint8Array).set(source.subarray(f1 * detectionCells, (f1 + 1) * detectionCells));
        detectionTex1.needsUpdate = true;
        detectionKey1 = key1;
      }
    };

    // Real runs: the footprints of the overpass on show, drawn on the ground by the terrain shader
    const footprintField = new FootprintField();
    // Real runs: what the model believes at the time on show (see ./engine/beliefField.ts)
    const beliefField = new BeliefField();
    const beliefStore = beliefStoreRef.current;
    const uBeliefMix = { value: 0.0 };
    const uHeldOut = { value: 0.0 };
    // The page's board of tiles (see tileMarks in the terrain shader)
    const uTileGrid = new THREE.Vector2(0, 0);
    const uTileState = Array.from({ length: 64 }, () => new THREE.Vector4(0, 0, 0, 0));
    const uTileHover = { value: -1.0 };
    let tileHoverSent: number | null = null;
    const tileAnchors: StageTileAnchor[] = [];
    // By night the smoke is lit from below only while the pass on show has detections of its own
    let smokeFireLight = 1.0;
    // A pass as a scan: (track east, track north, front along the track km, 1 while it crosses)
    const uScan = new THREE.Vector4(0, 1, 0, 0);
    let scanStartSec = -1e9;
    // Time of each frame of the run on show, ms since the epoch (NaN where the payload gives none)
    let frameTimesKey = '';
    let frameTimesMs: number[] = [];
    const uFootMix = new THREE.Vector2(0, 0);
    const uFieldScale = new THREE.Vector3(0, DEFAULT_FIELD_INTENSITY_SCALE.maxMwKm2, DEFAULT_FIELD_INTENSITY_SCALE.minMwKm2);
    const uHeatRange = new THREE.Vector2(0.02, 1.0);
    const lightRange = new THREE.Vector2(0.02, 1.0);
    const uLightModis = { value: 0.0 };
    const uRevealed = new THREE.Vector2(0, 0);
    // Real runs: 1 on a night overpass (see NIGHT_GLSL). Shared by every surface that is not emitted light.
    const uNight = { value: 0.0 };
    // The landing's own tour of the night passes (prop landingTour)
    let tourKey = '';
    let tourList: number[] = [];
    let tourAt = 0;
    let tourSince = 0;
    let tourRested = false;
    // The pass on show, for the page's words
    let passOnShowNow: EarthStageTelemetry['passOnShow'];
    // How far the eye is from the block, 0 in a close view and 1 when the whole block is in view
    const uFarView = { value: 0.0 };
    // By night the ground is drawn brighter when the whole block is seen from far (see NIGHT_GLSL)
    const uMoonLift = { value: 1.0 };
    // Real runs: the overpass on show, for the page's legend
    let realPassNow: EarthStageTelemetry['realPass'];
    let realPassKey = '';
    const footprintList: NormalizedFootprint[] = [];
    const revealedList: NormalizedFootprint[] = [];
    // A hidden pass: the detections of the last visible pass before it, drawn as an afterglow
    const afterglowList: NormalizedFootprint[] = [];
    const uAfterglow = { value: 0.0 };
    // Share of the lights drawn: 1, or less while the landing fades from one pass to the next
    const uLightGain = { value: 1.0 };
    // 1 when the run on show kept nothing from the model (its squares are then drawn quieter)
    const uBeliefQuiet = { value: 0.0 };
    let allSeenKey = '';
    let allSeen = false;
    let lastSeenNow: EarthStageTelemetry['lastSeen'];
    // The fire on show for the page's labels: points on the ground (u, v, weight) and where they came from
    let fireAnchorKey = '';
    let fireAnchorFrom: StageFireAnchor['from'] = 'detections';
    let fireAnchorPoints: Float32Array = new Float32Array(0);
    let fireAnchorSent = false;

    const syncEpochTextures = (tensor: Uint8Array, frameCount: number, timeProg: number): number => {
      const clampedT = Math.min(1, Math.max(0, timeProg));
      const exact = clampedT * Math.max(1, frameCount - 1);
      const f0 = Math.min(frameCount - 1, Math.floor(exact));
      const f1 = Math.min(frameCount - 1, f0 + 1);
      const mix = exact - f0;
      const stride = FIELD_GRID_SIZE * FIELD_GRID_SIZE * 4;

      if (uploadedTensorRef !== tensor || uploadedFrame0 !== f0) {
        fieldBuf0.set(tensor.subarray(f0 * stride, (f0 + 1) * stride));
        fieldTex0.needsUpdate = true;
        uploadedFrame0 = f0;
      }
      if (uploadedTensorRef !== tensor || uploadedFrame1 !== f1) {
        fieldBuf1.set(tensor.subarray(f1 * stride, (f1 + 1) * stride));
        fieldTex1.needsUpdate = true;
        uploadedFrame1 = f1;
      }
      uploadedTensorRef = tensor;
      return mix;
    };

    const initialFrameMix = syncEpochTextures(
      nextBundle.tensor,
      nextBundle.frameCount,
      propsRef.current.timeProgress,
    );

    // 3. Build Scene Hierarchy
    // 3a. Sky dome: Rayleigh and Mie sky above the horizon, the studio floor below it. The same
    // sun that lights the terrain drives it.
    const atmosphere = new SkyAtmosphere();
    const uSunTrue = nextBundle.sunTrue.clone();
    const uSunColor = new THREE.Vector3(1.4, 1.29, 1.17);
    const uSunTransmittance = new THREE.Vector3(0.9, 0.8, 0.66);
    // Sunlight color and the transmittance toward the sun at the region's mean elevation
    const syncSunLight = (bundle: CachedTheaterBundle) => {
      const meanElevKm = (bundle.minElevM + bundle.maxElevM) * 0.0005;
      uSunTrue.copy(bundle.sunTrue);
      sunLightColor(meanElevKm, bundle.sunTrue.y, uSunColor);
      uSunTransmittance.fromArray(sunTransmittance(meanElevKm, bundle.sunTrue.y));
    };
    syncSunLight(nextBundle);
    // The dome is built before the terrain uniforms; the terrain's night value is copied into this
    const domeNight = { value: 0.0 };
    const domeUniforms = {
      uNight: domeNight,
      uSkyView: { value: atmosphere.skyView.texture },
      uTransmittanceLut: { value: atmosphere.transmittance },
      uSunTrue: { value: uSunTrue },
      uCamAltKm: { value: 8.0 },
      uVerticalExaggeration: { value: VERTICAL_EXAGGERATION },
      uFloorColor: { value: new THREE.Vector3(0.044, 0.06, 0.094) },
      uFloorHaze: { value: 0.3 },
      uSkyExposure: { value: SKY_EXPOSURE_INTERFACE },
    };
    const domeGeom = new THREE.SphereGeometry(62.0, 48, 32);
    const domeMat = new THREE.ShaderMaterial({
      vertexShader: SKY_DOME_VERTEX_SHADER,
      fragmentShader: SKY_DOME_FRAGMENT_SHADER,
      uniforms: domeUniforms,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const domeMesh = new THREE.Mesh(domeGeom, domeMat);
    domeMesh.renderOrder = -10;
    scene.add(domeMesh);

    // Map frame uniforms shared by every material that places things on the slab
    const uSlabSize = new THREE.Vector2(nextBundle.frame.width, nextBundle.frame.depth);
    const uReliefScale = new THREE.Vector2(
      prevBundle.frame.unitsPerMetre[1],
      nextBundle.frame.unitsPerMetre[1],
    );

    // 3b. Grounded Contact-Shadow & Radial Geodetic Graticule Pedestal
    const pedestalGeom = new THREE.PlaneGeometry(34.0, 34.0, 1, 1);
    pedestalGeom.rotateX(-Math.PI / 2);
    const pedestalMat = new THREE.ShaderMaterial({
      vertexShader: PEDESTAL_VERTEX_SHADER,
      fragmentShader: PEDESTAL_FRAGMENT_SHADER,
      uniforms: { uSlabSize: { value: uSlabSize }, uShadowMix: { value: 1.0 } },
      transparent: true,
      depthWrite: false,
    });
    const pedestalMesh = new THREE.Mesh(pedestalGeom, pedestalMat);
    pedestalMesh.position.y = CLIFF_BASE_Y - 0.005;
    pedestalMesh.renderOrder = -2;
    scene.add(pedestalMesh);

    // The direction the shaders' curtain plane faces (the plane itself is parked off the block)
    const cutDir = cutDirectionForAzimuth(
      CURTAIN_AZIMUTH,
      nextBundle.frame.width,
      nextBundle.frame.depth,
      new THREE.Vector2(),
    );

    // 3c. Shared Heightfield Uniform Values
    const uDemRes = new THREE.Vector2(prevBundle.demGridRes, nextBundle.demGridRes);
    const uElevPrevRange = new THREE.Vector2(prevBundle.minElevM, prevBundle.maxElevM);
    const uElevNextRange = new THREE.Vector2(nextBundle.minElevM, nextBundle.maxElevM);
    const uExtentKm = new THREE.Vector2(nextBundle.widthKm, nextBundle.depthKm);
    // Scan geometry of the overpass shown for the current epoch: (axis east, axis north, nadir km, valid)
    const uModisPass = new THREE.Vector4(1, 0, 0, 0);
    const uViirsPass = new THREE.Vector4(1, 0, 0, 0);
    // Scan strip under each spacecraft: (MODIS along-track km, strength, VIIRS along-track km, strength)
    const uScanStrip = new THREE.Vector4(0, 0, 0, 0);
    const modisPassState: ScanPassUniform = { ...NO_SCAN_PASS };
    const viirsPassState: ScanPassUniform = { ...NO_SCAN_PASS };
    const uWindDirUv = new THREE.Vector2(nextBundle.windDirUv[0], nextBundle.windDirUv[1]);
    const uUnitsPerMetre = new THREE.Vector3(...nextBundle.frame.unitsPerMetre);
    const uDetailRect = new THREE.Vector4(0, 0, 1, 1);

    // Neutral stand-ins for the optional terrain pack textures
    const makeSolidTex = (r: number, g: number, b: number, a: number): THREE.DataTexture => {
      const tex = new THREE.DataTexture(
        new Uint8Array([r, g, b, a]),
        1,
        1,
        THREE.RGBAFormat,
        THREE.UnsignedByteType,
      );
      tex.needsUpdate = true;
      return tex;
    };
    const neutralAuxTex = makeSolidTex(128, 128, 255, 0);
    const whiteTex = makeSolidTex(255, 255, 255, 255);

    // Sun shadow of the terrain on itself, baked once per bundle (DEM and sun never change)
    const shadowBaker = new SunShadowBaker(renderer);
    const ensureShadow = (bundle: CachedTheaterBundle): THREE.Texture => {
      if (!bundle.shadow) {
        bundle.shadow = shadowBaker.bake(
          bundle.demTex,
          bundle.demGridRes,
          bundle.minElevM,
          bundle.maxElevM,
          bundle.frame.unitsPerMetre[1],
          bundle.frame.width,
          bundle.frame.depth,
          bundle.sunDir,
          bundle.demGridRes >= 1024 ? 2048 : 1024,
        );
      }
      return bundle.shadow.texture;
    };

    // 3d. Terrain surface mesh. The plane is unit-parameterised; the shader sizes it from the
    // map frame. 512 x 512 vertices by default, 1024 x 1024 once a terrain pack is active.
    const buildTerrainGeometry = (segments: number): THREE.PlaneGeometry => {
      const geom = new THREE.PlaneGeometry(1, 1, segments, segments);
      geom.rotateX(-Math.PI / 2);
      geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.0, 0), 15.0);
      return geom;
    };
    const terrainGeom = buildTerrainGeometry(SLAB_SEGMENTS);
    let hiResTerrainGeom: THREE.PlaneGeometry | null = null;
    let hiResSkirtGeom: THREE.BufferGeometry | null = null;

    const terrainUniforms = {
      uDemPrev: { value: prevBundle.demTex },
      uDemNext: { value: nextBundle.demTex },
      uDemRes: { value: uDemRes },
      uElevPrevRange: { value: uElevPrevRange },
      uElevNextRange: { value: uElevNextRange },
      uMorph: { value: 1.0 },
      uSatPrev: { value: prevBundle.satTex },
      uSatNext: { value: nextBundle.satTex },
      uFieldTex0: { value: fieldTex0 },
      uFieldTex1: { value: fieldTex1 },
      uLipariTex: { value: lipariTex },
      uFrameMix: { value: initialFrameMix },
      uSunDir: { value: sunDir },
      uTime: { value: 0.0 },
      uCutawayMix: { value: 1.0 },
      uCutawayPlane: { value: 0.0 },
      uCutawayDir: { value: cutDir },
      uReconMix: { value: 0.0 },
      uObserverMix: { value: 0.0 },
      uModisWeight: { value: 1.0 },
      uViirsWeight: { value: 1.0 },
      uUncertaintyMix: { value: propsRef.current.showUncertainty ? 1.0 : 0.0 },
      uSensitivity: { value: propsRef.current.sensitivityThreshold },
      uExtentKm: { value: uExtentKm },
      uModisPass: { value: uModisPass },
      uViirsPass: { value: uViirsPass },
      uScanStrip: { value: uScanStrip },
      uLatticeMix: { value: 1.0 },
      uHasSeaCoast: { value: nextBundle.hasSeaCoast ? 1.0 : 0.0 },
      uFireHist: { value: ensureFireHistory(nextBundle).texture },
      uFireTime: { value: 0.0 },
      uWindDirUv: { value: uWindDirUv },
      uReliefScale: { value: uReliefScale },
      uSlabSize: { value: uSlabSize },
      uAuxTex: { value: (nextBundle.auxTex ?? neutralAuxTex) as THREE.Texture },
      uAuxMix: { value: 0.0 },
      uShadowTex: { value: ensureShadow(nextBundle) },
      uUnitsPerMetre: { value: uUnitsPerMetre },
      uOrthoTexelKm: { value: nextBundle.orthoTexelKm },
      uSatSharpen: { value: nextBundle.sharpen },
      uDetailTex: { value: whiteTex as THREE.Texture },
      uDetailRect: { value: uDetailRect },
      uDetailMix: { value: 0.0 },
      uDetailTexelKm: { value: nextBundle.detailTexelKm },
      uSmokeShadowTex: { value: smokePass.shadowTarget.texture },
      uSunTrue: { value: uSunTrue },
      uSunColor: { value: uSunColor },
      uSunTransmittance: { value: uSunTransmittance },
      uHazeStrength: { value: HAZE_STRENGTH },
      uSkyView: { value: atmosphere.skyView.texture },
      uSkyExposure: { value: SKY_EXPOSURE_INTERFACE },
      uEdgeFade: { value: 0.0 },
      uContextDem: { value: null as THREE.Texture | null },
      uContextRes: { value: 1024.0 },
      uContextScale: { value: 5.0 },
      uContextMix: { value: 0.0 },
      uContextOrtho: { value: null as THREE.Texture | null },
      uFloorColor: domeUniforms.uFloorColor,
      uFloorHaze: domeUniforms.uFloorHaze,
      uSmokeShadowMix: { value: 0.0 },
      uFootTex: { value: footprintField.texture as THREE.Texture },
      uFootMix: { value: uFootMix },
      uFieldScale: { value: uFieldScale },
      uHeatRange: { value: uHeatRange },
      uBeliefGrid: { value: beliefField.grid },
      uBeliefBox: { value: beliefField.box },
      uTileGrid: { value: uTileGrid },
      uTileState: { value: uTileState },
      uTileHover,
      uScan: { value: uScan },
      uPixelOutline: { value: 0.0 },
      uBeliefMix,
      uHeldOut,
      uAfterglow,
      uLightGain,
      uFarView,
      uBeliefQuiet,
      uLightModis,
      uLightTexels: { value: LIGHT_TEX_SIZE },
      uRevealed: { value: uRevealed },
      uNight,
      uMoonLift,
    };

    const terrainMat = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_VERTEX_SHADER,
      fragmentShader: TERRAIN_FRAGMENT_SHADER,
      uniforms: terrainUniforms,
    });
    const terrainMesh = new THREE.Mesh(terrainGeom, terrainMat);
    terrainMesh.frustumCulled = false;
    scene.add(terrainMesh);

    // The terrain's depth is laid down first. Seen from inside the landscape many ridges overlap
    // in every pixel, and without this the surface shader runs for each hidden one. The offset
    // keeps this pass a hair behind the surface, so the surface always passes the depth test.
    const terrainDepthMat = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_VERTEX_SHADER,
      fragmentShader: TERRAIN_DEPTH_FRAGMENT_SHADER,
      uniforms: terrainUniforms,
      colorWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 2,
    });
    const terrainDepthMesh = new THREE.Mesh(terrainGeom, terrainDepthMat);
    terrainDepthMesh.frustumCulled = false;
    terrainDepthMesh.renderOrder = -10;
    scene.add(terrainDepthMesh);

    // 3d. Context terrain: land and sea around the pack, out to the horizon. Drawn in
    // the landing world view and the close presets; the block views keep the block.
    const contextTerrain = new ContextTerrain({
      uSlabSize: terrainUniforms.uSlabSize,
      uElevNextRange: terrainUniforms.uElevNextRange,
      uReliefScale: terrainUniforms.uReliefScale,
      uUnitsPerMetre: terrainUniforms.uUnitsPerMetre,
      uSunDir: terrainUniforms.uSunDir,
      uSunTrue: terrainUniforms.uSunTrue,
      uSunColor: terrainUniforms.uSunColor,
      uSunTransmittance: terrainUniforms.uSunTransmittance,
      uHazeStrength: terrainUniforms.uHazeStrength,
      uSkyView: terrainUniforms.uSkyView,
      uSkyExposure: terrainUniforms.uSkyExposure,
      uFloorColor: terrainUniforms.uFloorColor,
      uFloorHaze: terrainUniforms.uFloorHaze,
      uContextDem: terrainUniforms.uContextDem,
      uContextRes: terrainUniforms.uContextRes,
      uContextScale: terrainUniforms.uContextScale,
      uContextMix: terrainUniforms.uContextMix,
      uContextOrtho: terrainUniforms.uContextOrtho,
      uNight,
    });
    scene.add(contextTerrain.mesh);
    let contextMix = 0.0;

    // 3e. 3D Geological Cutaway Cliff Skirt (4 perimeter basalt-slate walls with 500 m datum lines)
    const skirtGeom = buildStratigraphicSkirtGeometry();
    const skirtUniforms = {
      uDemPrev: terrainUniforms.uDemPrev,
      uDemNext: terrainUniforms.uDemNext,
      uDemRes: terrainUniforms.uDemRes,
      uElevPrevRange: terrainUniforms.uElevPrevRange,
      uElevNextRange: terrainUniforms.uElevNextRange,
      uReliefScale: terrainUniforms.uReliefScale,
      uSlabSize: terrainUniforms.uSlabSize,
      uMorph: terrainUniforms.uMorph,
      uSunDir: terrainUniforms.uSunDir,
      uCutawayMix: terrainUniforms.uCutawayMix,
      uCutawayPlane: terrainUniforms.uCutawayPlane,
      uCutawayDir: terrainUniforms.uCutawayDir,
      uEdgeFade: terrainUniforms.uEdgeFade,
      uContextDem: terrainUniforms.uContextDem,
      uContextRes: terrainUniforms.uContextRes,
      uContextScale: terrainUniforms.uContextScale,
      uContextMix: terrainUniforms.uContextMix,
      uNight,
      uMoonLift,
    };
    const skirtMat = new THREE.ShaderMaterial({
      vertexShader: SKIRT_VERTEX_SHADER,
      fragmentShader: SKIRT_FRAGMENT_SHADER,
      uniforms: skirtUniforms,
      side: THREE.DoubleSide,
    });
    const skirtMesh = new THREE.Mesh(skirtGeom, skirtMat);
    skirtMesh.frustumCulled = false;
    scene.add(skirtMesh);

    // Landing world view: plane that smoke stays under (see planeUnderRow)
    const smokeLid = new THREE.Vector4(0, 1, 0, -1e4);

    // 3h. 3D Orbiting NASA Satellites (Terra, Aqua, Suomi NPP, NOAA-20). Ground footprints are not
    // meshes: the terrain shader draws the scan cells of each pass directly on the surface.
    const fleet = new SpacecraftFleet(MAX_ORBITAL_RIGS);
    scene.add(fleet.group);
    // The models (about 5.5 MB) are fetched on entering the workspace, not on the landing page
    let fleetModelsRequested = false;
    const fleetPasses: FleetPass[] = [];
    let fleetSkyMix = 0.0;

    // 4. Camera Framing, Damped Orbit, GPU Morph & Cinema Director State
    const orbitTarget: OrbitSphericalState = {
      azimuth: LANDING_HERO_POSE.azimuth,
      polar: LANDING_HERO_POSE.polar,
      distance: LANDING_HERO_POSE.distance,
      target: new THREE.Vector3(...LANDING_HERO_POSE.target),
    };
    const orbitCurrent: OrbitSphericalState = {
      azimuth: LANDING_HERO_POSE.azimuth,
      polar: LANDING_HERO_POSE.polar,
      distance: LANDING_HERO_POSE.distance,
      target: new THREE.Vector3(...LANDING_HERO_POSE.target),
    };

    const slewController = new SubOrbitalSlewController();
    const cinemaDirector = new CinemaDirector();
    let wasCinemaActive = false;

    // GPU Elevation + Satellite Ortho Morph state
    let morphActive = false;
    let morphElapsed = 0.0;
    let morphDuration = SUB_ORBITAL_MORPH_DURATION_SEC;
    let morphValue = 1.0;

    // Current slab size in world units. It blends between regions during a morph because each
    // region has its own aspect ratio.
    const slabNow = { width: nextBundle.frame.width, depth: nextBundle.frame.depth };
    const updateSlabNow = () => {
      slabNow.width = THREE.MathUtils.lerp(prevBundle.frame.width, nextBundle.frame.width, morphValue);
      slabNow.depth = THREE.MathUtils.lerp(prevBundle.frame.depth, nextBundle.frame.depth, morphValue);
      uSlabSize.set(slabNow.width, slabNow.depth);
    };
    const worldX = (u: number): number => (u - 0.5) * slabNow.width;
    const worldZ = (v: number): number => (0.5 - v) * slabNow.depth;
    const slabU = (x: number): number => x / slabNow.width + 0.5;
    const slabV = (z: number): number => 0.5 - z / slabNow.depth;

    const sampleCpuTerrainY = (u: number, v: number): number => {
      const eNext = sampleAlignedDemBilinear(nextBundle.alignedDem, nextBundle.demGridRes, u, v);
      const yNext = bundleWorldY(eNext, nextBundle);
      if (morphValue >= 0.999 || prevBundle === nextBundle) {
        return yNext;
      }
      const ePrev = sampleAlignedDemBilinear(prevBundle.alignedDem, prevBundle.demGridRes, u, v);
      const yPrev = bundleWorldY(ePrev, prevBundle);
      return yPrev + (yNext - yPrev) * morphValue;
    };

    const syncUniformsFromBundles = () => {
      terrainUniforms.uDemPrev.value = prevBundle.demTex;
      terrainUniforms.uDemNext.value = nextBundle.demTex;
      uDemRes.set(prevBundle.demGridRes, nextBundle.demGridRes);
      uElevPrevRange.set(prevBundle.minElevM, prevBundle.maxElevM);
      uElevNextRange.set(nextBundle.minElevM, nextBundle.maxElevM);
      terrainUniforms.uSatPrev.value = prevBundle.satTex;
      terrainUniforms.uSatNext.value = nextBundle.satTex;
      uExtentKm.set(nextBundle.widthKm, nextBundle.depthKm);
      terrainUniforms.uHasSeaCoast.value = nextBundle.hasSeaCoast ? 1.0 : 0.0;
      uWindDirUv.set(nextBundle.windDirUv[0], nextBundle.windDirUv[1]);
      terrainUniforms.uFireHist.value = ensureFireHistory(nextBundle).texture;

      // Map frame, sun and terrain pack shading inputs
      uReliefScale.set(prevBundle.frame.unitsPerMetre[1], nextBundle.frame.unitsPerMetre[1]);
      uUnitsPerMetre.set(...nextBundle.frame.unitsPerMetre);
      updateSlabNow();
      sunDir.copy(nextBundle.sunDir);
      syncSunLight(nextBundle);
      keyLight.position.copy(sunDir).multiplyScalar(20);
      terrainUniforms.uShadowTex.value = ensureShadow(nextBundle);
      terrainUniforms.uAuxTex.value = nextBundle.auxTex ?? neutralAuxTex;
      terrainUniforms.uOrthoTexelKm.value = nextBundle.orthoTexelKm;
      terrainUniforms.uSatSharpen.value = nextBundle.sharpen;
      terrainUniforms.uDetailTex.value = nextBundle.detailTex ?? whiteTex;
      uDetailRect.set(...nextBundle.detailRect);
      terrainUniforms.uDetailTexelKm.value = nextBundle.detailTexelKm;
      if (!nextBundle.auxTex) terrainUniforms.uAuxMix.value = 0.0;
      if (!nextBundle.detailTex) terrainUniforms.uDetailMix.value = 0.0;

      const context = nextBundle.context;
      terrainUniforms.uContextDem.value = context?.demTexture ?? null;
      terrainUniforms.uContextOrtho.value = context?.orthoTexture ?? null;
      terrainUniforms.uContextRes.value = context?.gridRes ?? 1024;
      terrainUniforms.uContextScale.value = context?.scale ?? 5;
      contextTerrain.setContext(context);
      if (!context) {
        contextMix = 0.0;
        terrainUniforms.uContextMix.value = 0.0;
      }
    };

    // ---------------------------------------------------------------------------------------
    // Terrain packs. An 8192 ortho is about 340 MB on the GPU with mipmaps, so only the pack of
    // the region on screen is kept. Other packs are released and loaded again on demand (the
    // browser HTTP cache makes that a decode, not a download).
    // ---------------------------------------------------------------------------------------
    const packBundles = new Map<string, CachedTheaterBundle>();
    const fullResPack =
      renderer.capabilities.maxTextureSize >= 8192 &&
      ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) >= 8;

    const ensureHiResGeometry = () => {
      if (hiResTerrainGeom) return;
      hiResTerrainGeom = buildTerrainGeometry(1023);
      hiResSkirtGeom = buildStratigraphicSkirtGeometry(1023);
      terrainMesh.geometry = hiResTerrainGeom;
      terrainDepthMesh.geometry = hiResTerrainGeom;
      skirtMesh.geometry = hiResSkirtGeom;
    };

    const composePackBundle = (
      lite: CachedTheaterBundle,
      pack: LoadedTerrainPack,
      donor: CachedTheaterBundle | null,
    ): CachedTheaterBundle => {
      const texelKm = pack.manifest.extent_km[0] / pack.orthoSize;
      return {
        ...lite,
        key: `pack-${lite.key}`,
        demTex: pack.demTexture,
        alignedDem: pack.alignedDem,
        demGridRes: pack.demGridRes,
        minElevM: pack.minElevM,
        maxElevM: pack.maxElevM,
        satTex: pack.orthoTexture,
        orthoLabel: pack.orthoSize >= 8192 ? 'Esri 8K' : 'Esri 4K',
        demLabel: `${pack.demGridRes}²`,
        orthoTexelKm: texelKm,
        sharpen: 0,
        shadow: donor?.shadow ?? null,
        pack,
        lite,
        auxTex: pack.auxTexture,
        detailTex: donor?.detailTex ?? null,
        detailRect: donor?.detailRect ?? [0, 0, 1, 1],
        detailTexelKm: donor?.detailTexelKm ?? texelKm,
        context: donor?.context ?? null,
        contextState: donor?.contextState ?? 'none',
        attribution: pack.attribution || lite.attribution,
      };
    };

    const releasePack = (packed: CachedTheaterBundle) => {
      packed.pack?.dispose();
      packed.detailTex?.dispose();
      packed.shadow?.dispose();
      packed.context?.dispose();
      // Built for the pack's own grid while it was on screen (the ones it took over from the
      // bundle it upgrades stay with that bundle)
      if (packed.fireHistory && packed.fireHistory !== packed.lite?.fireHistory) {
        packed.fireHistory.texture.dispose();
      }
      if (packed.smokeHeight && packed.smokeHeight !== packed.lite?.smokeHeight) {
        smokeHeightTextures.delete(packed.smokeHeight);
        packed.smokeHeight.dispose();
      }
      packed.fireHistory = null;
      packed.smokeHeight = null;
      packed.detectionSource = null;
      packed.context = null;
      packed.pack = null;
      packed.detailTex = null;
      packed.shadow = null;
    };

    const evictPacksExcept = (keepRegionId: string) => {
      for (const [regionId, packed] of packBundles) {
        if (regionId === keepRegionId || packed === prevBundle || packed === nextBundle) continue;
        releasePack(packed);
        packBundles.delete(regionId);
      }
    };

    // Returns the pack bundle for a lite bundle when its textures are already on the GPU. A new
    // run of the same region (blind test, cloud override) reuses the loaded textures.
    const resolveLoadedPack = (bundle: CachedTheaterBundle): CachedTheaterBundle => {
      if (bundle.pack || !bundle.packManifest) return bundle;
      const packed = packBundles.get(bundle.regionId);
      if (!packed?.pack) return bundle;
      if (packed.lite === bundle) return packed;
      const rebased = composePackBundle(bundle, packed.pack, packed);
      packBundles.set(bundle.regionId, rebased);
      // The pack textures, shadow, inset and context moved on to the new bundle. What was built
      // for the old one alone (its fire history, its smoke height) goes once it is off screen.
      retireBundle(packed);
      return rebased;
    };

    const loadDetailInset = (packed: CachedTheaterBundle) => {
      const pack = packed.pack;
      const inset = pack?.manifest.ortho_detail?.[0];
      if (!pack || !inset || !fullResPack || inset.size > renderer.capabilities.maxTextureSize) return;
      const rect = inset.uv_rect;
      if (!Array.isArray(rect) || rect.length !== 4 || !(rect[2] > rect[0]) || !(rect[3] > rect[1])) return;
      void loadPackImage(assetAddress(propsRef.current, inset.url), maxAnisotropy).then((tex) => {
        if (!tex) return;
        const owner = packBundles.get(packed.regionId);
        if (disposed || !owner || owner.pack !== pack) {
          tex.dispose();
          return;
        }
        owner.detailTex = tex;
        owner.detailRect = [rect[0], rect[1], rect[2], rect[3]];
        owner.detailTexelKm = (pack.manifest.extent_km[0] * (rect[2] - rect[0])) / inset.size;
        if (nextBundle === owner) syncUniformsFromBundles();
      });
    };

    // The terrain around the pack arrives after the pack itself: the region is on screen first,
    // then the world around it comes in. A region without one keeps the far-edge dissolve.
    const loadContext = (packed: CachedTheaterBundle) => {
      const pack = packed.pack;
      const manifest = parseTerrainContext(pack?.manifest.context);
      if (!pack || !manifest || packed.context || packed.contextState !== 'none') return;
      packed.contextState = 'loading';
      void loadTerrainContext(manifest, {
        resolveUrl: (raw) => assetAddress(propsRef.current, raw),
        maxTextureSize: renderer.capabilities.maxTextureSize,
        maxAnisotropy,
        isCancelled: () => disposed,
      }).then((context) => {
        const owner = packBundles.get(packed.regionId);
        if (disposed || !owner || owner.pack !== pack) {
          context?.dispose();
          return;
        }
        owner.contextState = context ? 'none' : 'failed';
        if (!context) return;
        owner.context = context;
        if (nextBundle === owner) syncUniformsFromBundles();
      });
    };

    const requestPack = (lite: CachedTheaterBundle) => {
      const manifest = lite.packManifest;
      if (!manifest || lite.pack || lite.packState !== 'none') return;
      lite.packState = 'loading';
      void loadTerrainPack(manifest, {
        resolveUrl: (raw) => assetAddress(propsRef.current, raw),
        maxTextureSize: fullResPack ? renderer.capabilities.maxTextureSize : 4096,
        maxAnisotropy,
        isCancelled: () => disposed,
      }).then((pack) => {
        if (disposed) {
          pack?.dispose();
          return;
        }
        if (!pack) {
          lite.packState = 'failed';
          return;
        }
        lite.packState = 'none';
        if (nextBundle !== lite) {
          // The view moved on while this was loading: do not hold memory for an off-screen region
          pack.dispose();
          return;
        }
        evictPacksExcept(lite.regionId);
        const packed = composePackBundle(lite, pack, null);
        packBundles.set(lite.regionId, packed);
        activateBundle(packed, true);
        morphDuration = 0.62;
        loadDetailInset(packed);
        loadContext(packed);
      });
    };

    const activateBundle = (requested: CachedTheaterBundle, animateMorph: boolean) => {
      if (disposed) return;
      const bundle = resolveLoadedPack(requested);
      if (bundle === nextBundle && animateMorph) {
        // Already on screen (for example the lite bundle of a region whose pack is active)
        return;
      }
      if (bundle.demGridRes >= 1024) ensureHiResGeometry();
      const crossRegion = nextBundle.regionId !== bundle.regionId;

      if (!animateMorph) {
        prevBundle = bundle;
        nextBundle = bundle;
        morphActive = false;
        morphValue = 1.0;
        terrainUniforms.uMorph.value = 1.0;
        evictPacksExcept(bundle.regionId);
        sweepRetiredBundles();
      } else {
        // Snapshot visually dominant bundle as previous so rapid switching never jumps
        prevBundle = morphValue < 0.5 ? prevBundle : nextBundle;
        nextBundle = bundle;
        morphActive = true;
        morphElapsed = 0.0;
        morphDuration = SUB_ORBITAL_MORPH_DURATION_SEC;
        morphValue = 0.0;
        terrainUniforms.uMorph.value = 0.0;
      }
      // Baked normals belong to the incoming terrain: hold them back until it is mostly in place
      if (crossRegion && animateMorph) terrainUniforms.uAuxMix.value = 0.0;
      syncUniformsFromBundles();
      uploadedTensorRef = null;
      setRenderedFindings(calloutsFor(bundle));
      presetDirty = true;
      if (!bundle.pack) requestPack(bundle);
    };

    const upgradeBundleInPlace = (bundle: CachedTheaterBundle) => {
      if (disposed) return;
      if (nextBundle.regionId === bundle.regionId) {
        // Smooth 620ms micro-sculpt from the procedural fallback into the real DEM and imagery
        activateBundle(bundle, true);
        morphDuration = 0.62;
      }
    };

    // The close presets look at the fire itself: Canyon centers on the fire the 1 km sensor
    // missed, Ridge on the strongest front. Both anchors come from the solver field of the active
    // region, so every region gets a meaningful close oblique.
    /** Where a real run's fire is in the region (u east, v north): null for a simulated run or a run that shows no detection. */
    const realFireCentre = (bundle: CachedTheaterBundle): [number, number] | null => {
      if (bundle.fireCentre !== undefined) return bundle.fireCentre;
      bundle.fireCentre = null;
      if (bundle.observerDataset.dataSource !== 'firms') return null;
      const [lonMin, latMin, lonMax, latMax] = bundle.bbox;
      let sumU = 0;
      let sumV = 0;
      let sumW = 0;
      for (const passes of bundle.observerDataset.frames) {
        for (const sp of passes) {
          if (sp.hidden || sp.revealed) continue;
          for (const fp of sp.footprints) {
            const w = Math.max(1, fp.frpMw);
            sumU += w * ((fp.lon - lonMin) / Math.max(1e-9, lonMax - lonMin));
            sumV += w * ((fp.lat - latMin) / Math.max(1e-9, latMax - latMin));
            sumW += w;
          }
        }
      }
      if (sumW > 0) bundle.fireCentre = [sumU / sumW, sumV / sumW];
      return bundle.fireCentre;
    };

    const resolveLivePreset = (
      preset: InspectorCameraPreset,
      inWorkspace: boolean,
      mode: EarthCutawayStageProps['mode'],
      theaterId: TheaterId,
    ): CameraPresetSpec => {
      const dest = resolvePresetForContext(preset, inWorkspace, mode, theaterId);
      if (!inWorkspace || (preset !== 'canyon' && preset !== 'ridge')) return dest;
      const wantedKind = preset === 'canyon' ? 'subpixel' : 'front';
      const anchor = nextBundle.findings.find((f) => f.kind === wantedKind);
      // A real run looks at its fire: the centre of every detection the run shows, weighted by
      // radiative power (the anchors above are read off a simulated run's field)
      const fire = realFireCentre(nextBundle);
      if (!anchor && !fire) return dest;
      const [lonMin, latMin, lonMax, latMax] = nextBundle.bbox;
      // Keep the anchor away from the cut faces of the slab (a real run's close views have the
      // context terrain behind them, so its fire may sit nearer the edge)
      const u = fire
        ? THREE.MathUtils.clamp(fire[0], 0.1, 0.9)
        : THREE.MathUtils.clamp((anchor!.lon - lonMin) / Math.max(1e-4, lonMax - lonMin), 0.2, 0.8);
      const v = fire
        ? THREE.MathUtils.clamp(fire[1], 0.1, 0.9)
        : THREE.MathUtils.clamp((anchor!.lat - latMin) / Math.max(1e-4, latMax - latMin), 0.2, 0.8);
      const ax = worldX(u);
      const az = worldZ(v);
      // Where to stand. Three wishes, scored over the compass:
      //   light      the sun about 65 degrees off the view axis, so slopes are side-lit and cast
      //              shadows show (every hero region has the sun in the south, and a camera
      //              that looks north sees only front-lit slopes)
      //   curtain    the view runs within about 35 degrees of the sensor curtain, so the split
      //              is a line into the distance with the calibrated side filling the frame
      //   backdrop   near an edge of the slab, look toward its middle and not at the cut wall
      const offCenter = Math.hypot(ax, az);
      const inward = Math.atan2(-ax, -az);
      const inwardWeight = THREE.MathUtils.smoothstep(offCenter, 0.8, 3.2);
      const sunAz = Math.atan2(nextBundle.sunDir.x, nextBundle.sunDir.z);
      let bestAz = dest.azimuth;
      let bestScore = -1e9;
      for (let k = 0; k < 72; k++) {
        const cand = (k / 72) * Math.PI * 2 - Math.PI;
        let alongCurtain = cand - CURTAIN_AZIMUTH;
        while (alongCurtain > Math.PI / 2) alongCurtain -= Math.PI;
        while (alongCurtain < -Math.PI / 2) alongCurtain += Math.PI;
        if (Math.abs(alongCurtain) > CLOSE_VIEW_CURTAIN_LIMIT) continue;
        let offSun = Math.abs(cand - sunAz) % (Math.PI * 2);
        if (offSun > Math.PI) offSun = Math.PI * 2 - offSun;
        const light = 1.0 - Math.min(1.0, Math.abs(offSun - CLOSE_VIEW_SUN_ANGLE) / CLOSE_VIEW_SUN_ANGLE);
        const score =
          light +
          0.9 * inwardWeight * Math.cos(cand - inward) +
          0.2 * Math.cos(cand - dest.azimuth);
        if (score > bestScore) {
          bestScore = score;
          bestAz = cand;
        }
      }
      return {
        ...dest,
        azimuth: bestAz,
        target: [ax, sampleCpuTerrainY(u, v) + 0.1, az],
      };
    };

    // Landing world view: where the camera stands. It stands low inside the landscape and looks at
    // the fire front, so that ground forms the skyline in every column of the frame and ridges
    // stand behind the fire. Standpoints are tried around the fire (four distances, 48 bearings,
    // six eye heights) and scored on the heightfield:
    //   skyline    in every screen column the ground must rise to eye level before the slab ends,
    //              so no column shows the backdrop below the horizon; the far edge of the slab is
    //              then hidden behind nearer ridges and nothing has to dissolve or sink
    //   frame      the fire sits in the upper two thirds of the ground, and the nearest ground in
    //              the frame is far enough away that the imagery still holds
    //   depth      ridge lines that come into view behind the fire (the more the better, up to 3)
    //   sight      the fire is in view (the point looked at, and as much of the burning ground of
    //              the moment on show as possible), on a slope that faces the camera
    //   light      the sun about 65 degrees off the view axis (side light)
    //   smoke      not downwind of the fire
    const resolveLandingWorldPose = (timeProg: number): CameraPresetSpec => {
      const bundle = nextBundle;
      const [lonMin, latMin, lonMax, latMax] = bundle.bbox;
      const anchor =
        bundle.findings.find((f) => f.kind === 'front') ??
        bundle.findings.find((f) => f.kind === 'subpixel') ??
        bundle.findings[0];
      let u = 0.5;
      let v = 0.5;
      if (anchor) {
        u = THREE.MathUtils.clamp((anchor.lon - lonMin) / Math.max(1e-4, lonMax - lonMin), 0.25, 0.75);
        v = THREE.MathUtils.clamp((anchor.lat - latMin) / Math.max(1e-4, latMax - latMin), 0.25, 0.75);
      }
      // A real run looks at the fire the overpass detected: the centre of its detections, weighted
      // by their radiative power (kept within the middle 70 percent of the region, so there is
      // room to stand back from it)
      const realFire = bundle.observerDataset.dataSource === 'firms';
      if (realFire) {
        const shown = Math.min(
          bundle.frameCount - 1,
          Math.max(0, Math.round(THREE.MathUtils.clamp(timeProg, 0, 1) * (bundle.frameCount - 1))),
        );
        let weight = 0;
        let sumU = 0;
        let sumV = 0;
        for (const sp of bundle.observerDataset.frames[shown] ?? []) {
          if (sp.hidden) continue;
          for (const fp of sp.footprints) {
            weight += fp.frpMw;
            sumU += (fp.frpMw * (fp.lon - lonMin)) / Math.max(1e-4, lonMax - lonMin);
            sumV += (fp.frpMw * (fp.lat - latMin)) / Math.max(1e-4, latMax - latMin);
          }
        }
        if (weight > 0) {
          u = THREE.MathUtils.clamp(sumU / weight, 0.15, 0.85);
          v = THREE.MathUtils.clamp(sumV / weight, 0.15, 0.85);
        }
      }
      // The terrain of this bundle as it will stand, not the morph toward it that is on screen now
      const slabW = bundle.frame.width;
      const slabD = bundle.frame.depth;
      const halfW = slabW * 0.5;
      const halfD = slabD * 0.5;
      const ground = (x: number, z: number): number =>
        bundleWorldY(
          sampleAlignedDemBilinear(bundle.alignedDem, bundle.demGridRes, x / slabW + 0.5, 0.5 - z / slabD),
          bundle,
        );
      // A region whose run announces context terrain has land or sea beyond the pack in every
      // direction, so a sight line that stays under eye level ends at a horizon, not at a floor.
      // The search still reads the pack relief only: the standpoint is settled before the context
      // files arrive and does not move when they do.
      const openHorizon =
        parseTerrainContext(bundle.packManifest?.context) !== null && bundle.contextState !== 'failed';
      const tx = (u - 0.5) * slabW;
      const tz = (0.5 - v) * slabD;
      const ty = ground(tx, tz) + 0.05;
      // Burning ground at the moment on show (a sample of the solver field cells above threshold)
      const fieldFrame = Math.min(
        bundle.frameCount - 1,
        Math.max(0, Math.round(THREE.MathUtils.clamp(timeProg, 0, 1) * (bundle.frameCount - 1))),
      );
      const fieldBase = fieldFrame * FIELD_GRID_SIZE * FIELD_GRID_SIZE * 4;
      // Burning ground on show. A real run: what the overpass detected (a sample of its footprint
      // centres). A simulated run: the solver field cells above the fire threshold. Per entry:
      // position, the slope of the ground there (east, south), and the ground area it stands for.
      const fires: number[] = [];
      const pushFire = (fx: number, fz: number, area: number) => {
        fires.push(
          fx,
          ground(fx, fz) + 0.03,
          fz,
          (ground(fx - 0.1, fz) - ground(fx + 0.1, fz)) / 0.2,
          (ground(fx, fz - 0.1) - ground(fx, fz + 0.1)) / 0.2,
          area,
        );
      };
      if (bundle.observerDataset.dataSource === 'firms') {
        const seen: NormalizedFootprint[] = [];
        for (const sp of bundle.observerDataset.frames[fieldFrame] ?? []) {
          if (!sp.hidden) for (const fp of sp.footprints) seen.push(fp);
        }
        const every = Math.max(1, Math.ceil(seen.length / 320));
        const perKm2 = bundle.frame.unitsPerMetre[0] * bundle.frame.unitsPerMetre[2] * 1e6;
        for (let i = 0; i < seen.length; i += every) {
          const fp = seen[i];
          const fx = ((fp.lon - lonMin) / Math.max(1e-4, lonMax - lonMin) - 0.5) * slabW;
          const fz = (0.5 - (fp.lat - latMin) / Math.max(1e-4, latMax - latMin)) * slabD;
          if (Math.abs(fx) > halfW || Math.abs(fz) > halfD) continue;
          pushFire(fx, fz, fp.acrossTrackKm * fp.alongTrackKm * perKm2 * every);
        }
      } else {
        // Every third cell each way
        const cellArea = ((3 * slabW) / (FIELD_GRID_SIZE - 1)) * ((3 * slabD) / (FIELD_GRID_SIZE - 1));
        for (let row = 2; row < FIELD_GRID_SIZE - 2; row += 3) {
          for (let col = 2; col < FIELD_GRID_SIZE - 2; col += 3) {
            if (bundle.tensor[fieldBase + (row * FIELD_GRID_SIZE + col) * 4] / 255 <= FIRE_THRESHOLD_NORM) continue;
            pushFire(
              (col / (FIELD_GRID_SIZE - 1) - 0.5) * slabW,
              (0.5 - row / (FIELD_GRID_SIZE - 1)) * slabD,
              cellArea,
            );
          }
        }
      }
      const fireCount = fires.length / 6;
      // Area of the frame at unit distance (16:10), for the share of the frame a patch of ground covers
      const tanHalfLens = Math.tan((LANDING_WORLD_FOV * Math.PI) / 360);
      const frameAreaAtUnit = 4 * tanHalfLens * tanHalfLens * 1.6;
      // Nearest ground the imagery can carry: one texel on at most LANDING_WORLD_MAX_MAGNIFICATION
      // pixels of a 1920 px wide 16:9 frame
      const pixelAngle = (2 * Math.atan(tanHalfLens * (16 / 9))) / 1920;
      const carry = Math.min(
        LANDING_WORLD_CARRY_CAP,
        (bundle.orthoTexelKm * 1000 * bundle.frame.unitsPerMetre[0]) / (LANDING_WORLD_MAX_MAGNIFICATION * pixelAngle),
      );
      // Slope at the fire: the horizontal direction the ground faces
      const faceX = ground(tx - 0.12, tz) - ground(tx + 0.12, tz);
      const faceZ = ground(tx, tz - 0.12) - ground(tx, tz + 0.12);
      const faceLen = Math.hypot(faceX, faceZ) || 1;
      const sunAz = Math.atan2(bundle.sunDir.x, bundle.sunDir.z);
      const windLen = Math.hypot(bundle.windDirUv[0] * slabW, bundle.windDirUv[1] * slabD) || 1;
      const windX = (bundle.windDirUv[0] * slabW) / windLen;
      const windZ = (-bundle.windDirUv[1] * slabD) / windLen;
      const halfSpan =
        Math.atan(Math.tan((LANDING_WORLD_FOV * Math.PI) / 360) * (16 / 9)) + LANDING_WORLD_DRIFT;

      let best: CameraPresetSpec = { ...LANDING_HERO_POSE, target: [tx, ty, tz] };
      let bestScore = -1e9;
      const stats: LandingStandpointCheck = {
        floorShare: 1,
        seaShare: 0,
        ridgeLines: 0,
        ridgeLinesMost: 0,
        fireShare: 0,
        fireFrameShare: 0,
        carryDistance: 0,
        skylineDeg: 0,
        eyeAboveGroundM: 0,
        nearGround: 0,
      };
      const upmY = bundle.frame.unitsPerMetre[1];
      for (const horiz of LANDING_WORLD_DISTANCES) {
        for (let k = 0; k < 48; k++) {
          const az = (k / 48) * Math.PI * 2 - Math.PI;
          const cx = tx + horiz * Math.sin(az);
          const cz = tz + horiz * Math.cos(az);
          if (halfW - Math.abs(cx) < 0.35 || halfD - Math.abs(cz) < 0.35) continue;
          // The eye stands over the highest ground under its drift, so the swing never lifts it
          let standY = ground(cx, cz);
          for (const side of [-1, 1]) {
            const azSide = az + side * LANDING_WORLD_DRIFT;
            standY = Math.max(standY, ground(tx + horiz * Math.sin(azSide), tz + horiz * Math.cos(azSide)));
          }
          let offSun = Math.abs(az - sunAz) % (Math.PI * 2);
          if (offSun > Math.PI) offSun = Math.PI * 2 - offSun;
          const light = 1.0 - Math.min(1.0, Math.abs(offSun - CLOSE_VIEW_SUN_ANGLE) / CLOSE_VIEW_SUN_ANGLE);
          const alongWind = Math.sin(az) * windX + Math.cos(az) * windZ;
          const downwind = Math.max(0, alongWind);
          // With an open horizon nothing ties the camera to a bowl: a nearer fire is a larger fire,
          // and from upwind the smoke drifts away behind it instead of across the view
          // A real fire is tens of kilometres across and is drawn one light per detection: from
          // far back the lights are small and the front reads as a line
          const openGain = openHorizon
            ? 0.45 * Math.max(0, -alongWind) + (realFire ? 0.16 : -0.12) * horiz
            : 0;
          const facing = (faceX * Math.sin(az) + faceZ * Math.cos(az)) / faceLen;
          // Ground heights along the sight line of every screen column, once per place
          for (let c = 0; c < LANDING_WORLD_COLUMNS; c++) {
            const phi = -halfSpan + (2 * halfSpan * c) / (LANDING_WORLD_COLUMNS - 1);
            const dirAz = az + Math.PI - phi;
            const dx = Math.sin(dirAz);
            const dz = Math.cos(dirAz);
            let n = 0;
            for (; n < LANDING_WORLD_SIGHT_STEPS; n++) {
              const d = 0.3 + n * LANDING_WORLD_SIGHT_STEP;
              const px = cx + dx * d;
              const pz = cz + dz * d;
              if (Math.abs(px) > halfW || Math.abs(pz) > halfD) break;
              sightHeights[c * LANDING_WORLD_SIGHT_STEPS + n] = ground(px, pz);
            }
            sightCounts[c] = n;
          }
          for (const liftM of LANDING_WORLD_LIFTS_M) {
            const cy = standY + liftM * upmY;
            // The fire must be in view: nothing between the eye and it
            let sight = 1e6;
            for (let s = 1; s < 10; s++) {
              const f = s / 10;
              sight = Math.min(sight, cy + (ty - cy) * f - ground(cx + (tx - cx) * f, cz + (tz - cz) * f));
            }
            if (sight < 0.03) continue;
            // Skyline per column: tangent of the highest ground seen before the slab ends
            let floorColumns = 0;
            let seaColumns = 0;
            let skySum = 0;
            let skyMax = -1e6;
            let ridgeSum = 0;
            let ridgeMost = 0;
            let ridgeColumns = 0;
            for (let c = 0; c < LANDING_WORLD_COLUMNS; c++) {
              const phi = -halfSpan + (2 * halfSpan * c) / (LANDING_WORLD_COLUMNS - 1);
              const count = sightCounts[c];
              let top = -1e6;
              // A ridge line behind the fire: ground beyond the fire that comes into view again
              // after a stretch that was hidden behind nearer ground
              let hiddenRun = 0;
              let ridges = 0;
              for (let n = 0; n < count; n++) {
                const d = 0.3 + n * LANDING_WORLD_SIGHT_STEP;
                const tan = (sightHeights[c * LANDING_WORLD_SIGHT_STEPS + n] - cy) / d;
                if (tan > top) {
                  if (hiddenRun >= 2 && d > horiz) ridges++;
                  top = tan;
                  hiddenRun = 0;
                } else if (tan < top - 0.004) {
                  hiddenRun++;
                }
              }
              if (top < 0) {
                // Open water that runs to the edge of the data reads as a sea horizon, not as a
                // floor. With context terrain every column runs on to the horizon, land or sea.
                const last = count > 0 ? sightHeights[c * LANDING_WORLD_SIGHT_STEPS + count - 1] : 1;
                if (openHorizon || (bundle.hasSeaCoast && last < 0.004)) seaColumns++;
                else floorColumns++;
              }
              skySum += Math.max(top, -0.2);
              skyMax = Math.max(skyMax, top);
              if (Math.abs(phi) < halfSpan * 0.55) {
                ridgeSum += ridges;
                ridgeMost = Math.max(ridgeMost, ridges);
                ridgeColumns++;
              }
            }
            // The highest point of the skyline is put just under the calm rectangle, so everything
            // else follows from it: where the fire sits in the frame, and how near the nearest
            // ground in the frame is (near ground shows the imagery far beyond its resolution)
            // (the terrain top is fitted to about row 0.41, so 0.59 of the frame height lies below it)
            const bottomTan = skyMax - 0.59 * 2.0 * tanHalfLens;
            let nearGround = 1e6;
            for (let c = 0; c < LANDING_WORLD_COLUMNS; c++) {
              const count = sightCounts[c];
              for (let n = 0; n < count; n++) {
                const d = 0.3 + n * LANDING_WORLD_SIGHT_STEP;
                if (d >= nearGround) break;
                const g = sightHeights[c * LANDING_WORLD_SIGHT_STEPS + n];
                // Water has no detail to lose
                if (g > 0.004 && (g - cy) / d > bottomTan) {
                  nearGround = d;
                  break;
                }
              }
            }
            const fireDrop = skyMax - (ty - cy) / horiz;
            // Share of the burning ground that is in the frame with nothing in front of it
            let firesSeen = 0;
            let firesLow = 0;
            let fireFrame = 0;
            const lowTan = skyMax - LANDING_WORLD_FIRE_LOWEST * (skyMax - bottomTan);
            for (let f = 0; f < fireCount; f++) {
              const fx = fires[f * 6];
              const fy = fires[f * 6 + 1];
              const fz = fires[f * 6 + 2];
              const fd = Math.hypot(fx - cx, fz - cz);
              if (fd < 0.5) continue;
              let off = Math.atan2(fx - cx, fz - cz) - (az + Math.PI);
              off -= Math.round(off / (Math.PI * 2)) * Math.PI * 2;
              if (Math.abs(off) > halfSpan * 0.8) continue;
              const fTan = (fy - cy) / fd;
              // Low in the frame, or under its bottom edge: the fire is in the foreground
              if (fTan < lowTan) firesLow++;
              if (fTan < bottomTan || fTan > skyMax) continue;
              let clear = true;
              for (let s = 1; s < 8 && clear; s++) {
                const k = s / 8;
                if (cy + (fy - cy) * k < ground(cx + (fx - cx) * k, cz + (fz - cz) * k) - 0.01) clear = false;
              }
              if (clear) {
                firesSeen++;
                // Share of the frame this patch of burning ground covers: its area, turned by how
                // squarely it faces the eye, over the area of the frame at its distance
                const nx = fires[f * 6 + 3];
                const nz = fires[f * 6 + 4];
                const ex = cx - fx;
                const ey = cy - fy;
                const ez = cz - fz;
                const dist2 = ex * ex + ey * ey + ez * ez;
                const facing3 = Math.max(0, (nx * ex + ey + nz * ez) / (Math.hypot(nx, 1, nz) * Math.sqrt(dist2)));
                fireFrame += (fires[f * 6 + 5] * Math.hypot(nx, 1, nz) * facing3) / (dist2 * frameAreaAtUnit);
              }
            }
            const fireShare = fireCount > 0 ? firesSeen / fireCount : 0;
            const floorShare = floorColumns / LANDING_WORLD_COLUMNS;
            const seaShare = seaColumns / LANDING_WORLD_COLUMNS;
            const ridgeLines = ridgeSum / Math.max(1, ridgeColumns);
            const sky = skySum / LANDING_WORLD_COLUMNS;
            const score =
              -9.0 * floorShare -
              (floorColumns > 0 ? 3.0 : 0.0) -
              0.6 * seaShare +
              1.1 * Math.min(ridgeLines, 2.0) +
              0.3 * Math.min(Math.max(ridgeLines - 2.0, 0.0), 1.0) +
              0.8 * light +
              0.5 * THREE.MathUtils.clamp(facing * 2.0, -1, 1) +
              // A real fire is in the frame whole: every part of it that an edge cuts off, or
              // that a ridge hides, counts against the standpoint
              (realFire ? 4.0 * fireShare : 2.4 * Math.min(fireShare, 0.5)) +
              // The fire on show covers a real share of the frame
              2.5 * Math.min(1, fireFrame / LANDING_WORLD_FIRE_FRAME_SHARE) -
              // A real fire is in the middle distance, with terrain in front of it
              (realFire && fireCount > 0 ? (7.0 * firesLow) / fireCount : 0.0) -
              0.5 * downwind +
              openGain -
              // Ground nearer than the imagery can carry is out of the frame: such a standpoint is
              // taken only when there is no other
              (nearGround < carry ? 5.0 + 4.0 * (1 - nearGround / carry) : 0.0) -
              // The fire stays in the upper two thirds of the ground, under an even skyline
              8.0 * Math.max(0, fireDrop - 0.2) -
              // Not a skyline that only just clears eye level
              4.0 * Math.max(0, 0.04 - sky);
            if (score > bestScore) {
              bestScore = score;
              const dist3 = Math.hypot(horiz, cy - ty);
              best = {
                azimuth: az,
                polar: Math.acos(THREE.MathUtils.clamp((cy - ty) / dist3, -1, 1)),
                distance: dist3,
                target: [tx, ty, tz],
              };
              stats.floorShare = floorShare;
              stats.seaShare = seaShare;
              stats.ridgeLines = ridgeLines;
              stats.ridgeLinesMost = ridgeMost;
              stats.fireShare = fireShare;
              stats.fireFrameShare = fireFrame;
              stats.carryDistance = carry;
              stats.skylineDeg = (Math.atan(sky) * 180) / Math.PI;
              stats.eyeAboveGroundM = liftM;
              stats.nearGround = nearGround;
            }
          }
        }
      }
      landingWorldStats = stats;
      return best;
    };
    let landingWorldPose: CameraPresetSpec | null = null;
    let landingWorldPoseKey = '';
    let landingWorldSeated = false;
    // The region's box as a grid of points on the terrain, projected to the viewport (CSS px)
    const regionGridOf = (bundle: CachedTheaterBundle, divisions: number): EarthStageTelemetry['regionGrid'] => {
      const count = Math.min(32, Math.max(1, Math.round(divisions)));
      const points: Array<[number, number] | null> = [];
      camera.updateMatrixWorld();
      for (let row = 0; row <= count; row++) {
        for (let col = 0; col <= count; col++) {
          const u = col / count;
          const v = 1 - row / count;
          const y = bundleWorldY(sampleAlignedDemBilinear(bundle.alignedDem, bundle.demGridRes, u, v), bundle);
          gridVec.set((u - 0.5) * slabNow.width, y, (0.5 - v) * slabNow.depth).project(camera);
          points.push(
            gridVec.z > 1 || gridVec.z < -1
              ? null
              : [(gridVec.x * 0.5 + 0.5) * viewportW, (0.5 - gridVec.y * 0.5) * viewportH],
          );
        }
      }
      return { divisions: count, points };
    };
    const gridVec = new THREE.Vector3();
    const landingFrameFor = (bundle: CachedTheaterBundle): number | null =>
      bundle.landingFrame === undefined
        ? (bundle.landingFrame = landingFrameOf(bundle.observerDataset, bundle.bbox, bundle.widthKm, bundle.depthKm))
        : bundle.landingFrame;
    /** The landing standpoint of the bundle on screen, worked out again when the bundle changed. */
    const ensureLandingWorldPose = (): CameraPresetSpec => {
      const poseKey = nextBundle.contextState === 'failed' ? `${nextBundle.key}!` : nextBundle.key;
      if (!landingWorldPose || landingWorldPoseKey !== poseKey) {
        const chosen = landingFrameFor(nextBundle);
        landingWorldPose = resolveLandingWorldPose(
          chosen !== null ? chosen / Math.max(1, nextBundle.frameCount - 1) : propsRef.current.timeProgress,
        );
        landingWorldPoseKey = poseKey;
        landingFitAge = SUBJECT_REFIT_INTERVAL_FRAMES;
      }
      return landingWorldPose;
    };
    // What the search found at the standpoint in use (also reported through telemetry)
    let landingWorldStats: LandingStandpointCheck = {
      floorShare: 1,
      seaShare: 0,
      ridgeLines: 0,
      ridgeLinesMost: 0,
      fireShare: 0,
      fireFrameShare: 0,
      carryDistance: 0,
      skylineDeg: 0,
      eyeAboveGroundM: 0,
      nearGround: 0,
    };
    const sightHeights = new Float32Array(LANDING_WORLD_COLUMNS * LANDING_WORLD_SIGHT_STEPS);
    const sightCounts = new Int32Array(LANDING_WORLD_COLUMNS);

    // World height of the context surface at a point outside the pack, as the context mesh draws it
    // (0 when the bundle has no context)
    const contextWorldY = (bundle: CachedTheaterBundle, x: number, z: number): number => {
      const context = bundle.context;
      if (!context) return 0;
      const frame = bundle.frame;
      const [upmX, upmUp, upmZ] = frame.unitsPerMetre;
      const outKm = Math.hypot(
        Math.max(Math.abs(x) - frame.width * 0.5, 0) / (upmX * 1000),
        Math.max(Math.abs(z) - frame.depth * 0.5, 0) / (upmZ * 1000),
      );
      const halfKm = 0.25 * (frame.width / upmX + frame.depth / upmZ) * 0.001;
      const elevM = sampleContextElevation(
        context,
        x / (frame.width * context.scale) + 0.5,
        0.5 - z / (frame.depth * context.scale),
      );
      return (elevM - bundle.minElevM - contextDropKm(outKm, halfKm) * 1000) * upmUp;
    };

    // Terrain samples for the skyline of the landing world view
    const skylinePoints = new Float32Array(
      (SKYLINE_GRID * SKYLINE_GRID + CONTEXT_SKYLINE_GRID * CONTEXT_SKYLINE_GRID) * 3,
    );
    const collectSkylinePoints = (): number => {
      let n = 0;
      for (let gy = 0; gy < SKYLINE_GRID; gy++) {
        const v = gy / (SKYLINE_GRID - 1);
        for (let gx = 0; gx < SKYLINE_GRID; gx++) {
          const u = gx / (SKYLINE_GRID - 1);
          skylinePoints[n * 3] = worldX(u);
          skylinePoints[n * 3 + 1] = sampleCpuTerrainY(u, v);
          skylinePoints[n * 3 + 2] = worldZ(v);
          n++;
        }
      }
      const context = nextBundle.context;
      if (context && contextMix > 0.5) {
        const frame = nextBundle.frame;
        for (let gy = 0; gy < CONTEXT_SKYLINE_GRID; gy++) {
          const cv = gy / (CONTEXT_SKYLINE_GRID - 1);
          for (let gx = 0; gx < CONTEXT_SKYLINE_GRID; gx++) {
            const cu = gx / (CONTEXT_SKYLINE_GRID - 1);
            const x = (cu - 0.5) * frame.width * context.scale;
            const z = (0.5 - cv) * frame.depth * context.scale;
            // The pack is sampled above
            if (Math.abs(x) <= frame.width * 0.5 && Math.abs(z) <= frame.depth * 0.5) continue;
            skylinePoints[n * 3] = x;
            skylinePoints[n * 3 + 1] = contextWorldY(nextBundle, x, z);
            skylinePoints[n * 3 + 2] = z;
            n++;
          }
        }
      }
      return n;
    };

    // True once the user has orbited, panned or zoomed since the last preset was applied
    let cameraTouched = false;
    // Set when the terrain under the camera changed, so the preset target is resolved again
    let presetDirty = false;

    const setOrbitTargetFromPreset = (dest: CameraPresetSpec) => {
      orbitTarget.azimuth = dest.azimuth;
      orbitTarget.polar = dest.polar;
      orbitTarget.distance = dest.distance;
      orbitTarget.target.set(dest.target[0], dest.target[1], dest.target[2]);
    };

    const triggerSlew = (targetTheaterId: TheaterId) => {
      const p = propsRef.current;
      const cached = bundleCache.get(targetTheaterId);
      if (cached && cached !== nextBundle) {
        activateBundle(cached, true);
      }
      const dest = resolveLivePreset(p.cameraPreset, p.inWorkspace, p.mode, targetTheaterId);
      slewController.trigger(orbitCurrent, dest, 2.15, SUB_ORBITAL_MORPH_DURATION_SEC);
      cameraTouched = false;
      presetDirty = false;
    };

    const applyCameraPreset = () => {
      const p = propsRef.current;
      slewController.cancel();
      if (!p.inWorkspace && p.landingView !== 'slab') {
        // Back on the landing in the world view: the camera starts from where it is, and the
        // landing's idle motion eases it to the standpoint of the region now on screen (which may
        // have changed in the workspace). Sent to the block view's pose first, it would fly up and
        // away over a block whose sides are already hidden, and only then come down.
        ensureLandingWorldPose();
        orbitTarget.azimuth = orbitCurrent.azimuth;
        orbitTarget.polar = orbitCurrent.polar;
        orbitTarget.distance = orbitCurrent.distance;
        orbitTarget.target.copy(orbitCurrent.target);
      } else {
        setOrbitTargetFromPreset(resolveLivePreset(p.cameraPreset, p.inWorkspace, p.mode, p.activeTheaterId));
      }
      cameraTouched = false;
      presetDirty = false;
    };

    const syncCinemaStart = (active: boolean) => {
      if (active && !wasCinemaActive) {
        slewController.cancel();
        cinemaDirector.startAtTheater(propsRef.current.activeTheaterId);
      } else if (!active && wasCinemaActive) {
        const lookPt = new THREE.Vector3(0, 0.65, 0);
        camera.getWorldDirection(lookPt);
        lookPt.multiplyScalar(10.5).add(camera.position);
        decomposePoseToOrbit(camera.position, lookPt, orbitCurrent);
        orbitTarget.azimuth = orbitCurrent.azimuth;
        orbitTarget.polar = orbitCurrent.polar;
        orbitTarget.distance = orbitCurrent.distance;
        orbitTarget.target.copy(orbitCurrent.target);
        camera.up.set(0, 1, 0);
      }
      wasCinemaActive = active;
    };

    engineBridgeRef.current = {
      activateBundle,
      upgradeBundleInPlace,
      bundleCache,
      takeRunBundle,
      storeRunBundle,
      onScreenRegionId: () => nextBundle.regionId,
      maxAnisotropy,
      texLoader,
      triggerSlew,
      applyCameraPreset,
      syncCinemaStart,
    };

    // 5. Immediate Offline Static Asset Hydration for Feather River, CA (plumas_ca)
    void (async () => {
      try {
        const [demResp, fieldResp, obsResp] = await Promise.all([
          fetch(siteFile('generated/terrain/ca_dem_f32.bin')).catch(() => null),
          fetch(siteFile('generated/fields/reconstruction_u8.bin')).catch(() => null),
          fetch(siteFile('generated/fields/observer_passes.json')).catch(() => null),
        ]);

        const satPromise = new Promise<THREE.Texture | null>((resolve) => {
          texLoader.load(
            siteFile('generated/terrain/ca_satellite.jpg'),
            (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.anisotropy = maxAnisotropy;
              tex.wrapS = THREE.ClampToEdgeWrapping;
              tex.wrapT = THREE.ClampToEdgeWrapping;
              resolve(tex);
            },
            undefined,
            () => resolve(null),
          );
        });

        const [demBuf, fieldBuf, obsJson, satLoaded] = await Promise.all([
          demResp && demResp.ok ? demResp.arrayBuffer() : Promise.resolve(null),
          fieldResp && fieldResp.ok ? fieldResp.arrayBuffer() : Promise.resolve(null),
          obsResp && obsResp.ok ? obsResp.json().catch(() => null) : Promise.resolve(null),
          satPromise,
        ]);

        if (disposed) return;
        const existing = bundleCache.get('plumas_ca');
        // Do not overwrite if live /api/reconstruct run already hydrated plumas_ca
        if (!existing || existing.runId !== null) return;

        const prof = THEATER_PROFILES.plumas_ca;
        const demPack = demBuf
          ? createDemR32FTexture(new Float32Array(demBuf), true)
          : {
              texture: existing.demTex,
              aligned: existing.alignedDem,
              gridRes: existing.demGridRes,
              minElev: existing.minElevM,
              maxElev: existing.maxElevM,
            };

        const tensorPack = fieldBuf
          ? alignReconstructionTensor(new Uint8Array(fieldBuf), true)
          : { buffer: existing.tensor, frames: existing.frameCount };

        const observerDataset = obsJson
          ? normalizeObserverDataset(obsJson, prof.bbox)
          : existing.observerDataset;

        const found = findingsOf(
          'plumas_ca',
          prof.bbox,
          demPack.aligned,
          demPack.gridRes,
          tensorPack.buffer,
          tensorPack.frames,
        );

        const staticBundle: CachedTheaterBundle = {
          ...existing,
          ...liteShadingFields(
            prof.widthKm,
            bboxDepthKm(prof.bbox),
            null,
            1024,
            satLoaded ? FALLBACK_IMAGERY_ATTRIBUTION : '',
          ),
          fireHistory: null,
          key: 'static-plumas_ca',
          demTex: demPack.texture,
          alignedDem: demPack.aligned,
          demGridRes: demPack.gridRes,
          minElevM: demPack.minElev,
          maxElevM: demPack.maxElev,
          satTex: satLoaded ?? existing.satTex,
          orthoLabel: '1K',
          demLabel: `${demPack.gridRes}²`,
          tensor: tensorPack.buffer,
          frameCount: tensorPack.frames,
          observerDataset,
          findings: found.anchors,
          callouts: found.callouts,
        };

        setRegionBundle('plumas_ca', staticBundle);
        upgradeBundleInPlace(staticBundle);
      } catch {
        // Procedural fallback remains active seamlessly
      }
    })();

    // 6. Pointer & Wheel Interaction Handlers (Damped Orbit/Pan/Zoom)
    let viewportW = Math.max(1, host.clientWidth);
    let viewportH = Math.max(1, host.clientHeight);
    const updateSize = () => {
      if (!host) return;
      viewportW = Math.max(1, host.clientWidth);
      viewportH = Math.max(1, host.clientHeight);
      dpr = resolveStagePixelRatio();
      pipeline.setSize(viewportW, viewportH, dpr);
      camera.aspect = viewportW / viewportH;
    };
    updateSize();

    const resizeObs = new ResizeObserver(updateSize);
    resizeObs.observe(host);

    // Device pixel ratio changes (window dragged to another display, browser zoom) do not resize the
    // host element, so they need their own listener. The query is re-armed for each new ratio.
    let dprQuery: MediaQueryList | null = null;
    const onDprChange = () => {
      updateSize();
      armDprQuery();
    };
    const armDprQuery = () => {
      dprQuery?.removeEventListener('change', onDprChange);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      dprQuery.addEventListener('change', onDprChange);
    };
    armDprQuery();

    let pointerDown = false;
    let pointerButton = 0;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let pointerLastX = 0;
    let pointerLastY = 0;
    let dragTravelPx = 0;
    // Last pointer position over the canvas, for the tile under it (NaN while the pointer is away)
    let pointerClientX = Number.NaN;
    let pointerClientY = Number.NaN;

    let seamReported = false;

    const scratchTargetVec = new THREE.Vector3();

    const tileRay = new THREE.Raycaster();
    const tileNdc = new THREE.Vector2();
    /**
     * The tile of a board under a viewport point: the first ground the ray from the eye meets, read
     * off the terrain held on the CPU. Null when the ray meets no ground inside the region.
     */
    const tileAt = (clientX: number, clientY: number, cols: number, rows: number): number | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
      tileNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      tileRay.setFromCamera(tileNdc, camera);
      const o = tileRay.ray.origin;
      const d = tileRay.ray.direction;
      const step = Math.max(0.02, slabNow.width / 400);
      for (let t = 0; t < slabNow.width * 6; t += step) {
        const x = o.x + d.x * t;
        const yy = o.y + d.y * t;
        const z = o.z + d.z * t;
        const u = slabU(x);
        const v = slabV(z);
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        if (yy <= sampleCpuTerrainY(u, v)) {
          const col = Math.min(cols - 1, Math.floor(u * cols));
          const row = Math.min(rows - 1, Math.floor((1 - v) * rows));
          return row * cols + col;
        }
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('[data-stage-ui="true"]')) {
        return;
      }
      pointerDown = true;
      pointerButton = e.button;
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
      pointerLastX = e.clientX;
      pointerLastY = e.clientY;
      dragTravelPx = 0;

      slewController.cancel();
      renderer.domElement.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      const p = propsRef.current;
      pointerClientX = e.clientX;
      pointerClientY = e.clientY;

      if (!pointerDown) return;

      const dx = e.clientX - pointerLastX;
      const dy = e.clientY - pointerLastY;
      pointerLastX = e.clientX;
      pointerLastY = e.clientY;
      dragTravelPx += Math.hypot(dx, dy);

      if (p.cinemaActive) return;

      if (pointerButton === 2 || e.shiftKey) {
        // Right-drag / Shift-drag: damped horizontal target pan across the mountain slab
        cameraTouched = true;
        const panScale = orbitCurrent.distance * 0.0011;
        const cosA = Math.cos(orbitCurrent.azimuth);
        const sinA = Math.sin(orbitCurrent.azimuth);
        orbitTarget.target.x = THREE.MathUtils.clamp(
          orbitTarget.target.x - (dx * cosA - dy * sinA) * panScale,
          -slabNow.width * 0.42,
          slabNow.width * 0.42,
        );
        orbitTarget.target.z = THREE.MathUtils.clamp(
          orbitTarget.target.z - (-dx * sinA - dy * cosA) * panScale,
          -slabNow.depth * 0.42,
          slabNow.depth * 0.42,
        );
      } else {
        // Left-drag: smooth damped 3D orbit
        cameraTouched = true;
        const rotScale = p.inWorkspace ? 0.0046 : 0.0028;
        orbitTarget.azimuth -= dx * rotScale;
        const minPolar = p.inWorkspace ? 0.12 : 0.72;
        const maxPolar = p.inWorkspace ? 1.36 : 1.18;
        orbitTarget.polar = THREE.MathUtils.clamp(
          orbitTarget.polar - dy * rotScale,
          minPolar,
          maxPolar,
        );
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!pointerDown) return;
      pointerDown = false;
      if (renderer.domElement.hasPointerCapture(e.pointerId)) {
        renderer.domElement.releasePointerCapture(e.pointerId);
      }

      // Clicking inside the Landing 3D stage window without dragging enters Workspace
      const p = propsRef.current;
      // The page layout belongs to the caller: any click that reached the canvas counts
      if (!p.inWorkspace && dragTravelPx < 5 && e.button === 0) {
        p.onEnterWorkspace?.();
      }
      // A click without a drag on a tile of a pickable board picks it
      const board = p.tileBoard;
      if (board && board.pickable && p.inWorkspace && dragTravelPx < 5 && e.button === 0) {
        const tile = tileAt(e.clientX, e.clientY, board.cols, board.rows);
        if (tile !== null && !board.tiles[tile]?.closed) p.onTilePick?.(tile);
      }
      void pointerStartX;
      void pointerStartY;
    };

    const onPointerLeave = () => {
      pointerClientX = Number.NaN;
      pointerClientY = Number.NaN;
    };

    const onWheel = (e: WheelEvent) => {
      const p = propsRef.current;
      if (!p.inWorkspace || p.cinemaActive) return;
      e.preventDefault();
      cameraTouched = true;
      slewController.cancel();
      const zoomFactor = 1.0 + THREE.MathUtils.clamp(e.deltaY, -120, 120) * 0.0011;
      orbitTarget.distance = THREE.MathUtils.clamp(
        orbitTarget.distance * zoomFactor,
        4.6,
        23.5,
      );
    };

    const onContextMenu = (e: MouseEvent) => {
      if (propsRef.current.inWorkspace) {
        e.preventDefault();
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('pointerleave', onPointerLeave);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onContextMenu);

    // 7. Main 60fps Animation, Physics, Orbital Constellation & Diegetic Projection Loop
    // The landing drift and the curtain sweep stop when the visitor asks for reduced motion
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionQuery.matches;
    const onMotionChange = () => {
      reducedMotion = motionQuery.matches;
    };
    motionQuery.addEventListener('change', onMotionChange);
    let worldMix = 0.0;

    let rafId = 0;
    let prevTimeMs = performance.now();
    let elapsedSec = 0.0;

    const viewWindowCurrent: ViewWindow = { scale: 1, offsetX: 0, offsetY: 0 };
    const viewWindowTarget: ViewWindow = { scale: 1, offsetX: 0, offsetY: 0 };
    const landingFit: ViewWindow = { scale: 1, offsetX: 0, offsetY: LEGACY_LANDING_OFFSET_Y };
    const subjectPoints = new Float32Array(SUBJECT_POINT_COUNT * 3);
    let viewWindowReady = false;
    let landingFitFrame: SubjectFrame | null = null;
    let landingFitAspect = 0;
    let landingFitAge = SUBJECT_REFIT_INTERVAL_FRAMES;
    let activeSubjectFrame: SubjectFrame | null = null;
    let workspaceFrame: SubjectFrame | null = null;
    const workspaceFit: ViewWindow = { scale: 1, offsetX: 0, offsetY: 0 };
    let workspaceFitAge = SUBJECT_REFIT_INTERVAL_FRAMES;
    let workspaceFitPreset: InspectorCameraPreset | null = null;
    let workspaceFitSky = false;

    // Samples the slab (live terrain surface plus the four base corners) and fits its projected
    // bounds into the frame for the nominal landing pose, including the idle azimuth drift.
    // `withSky` adds the fixed volume above the slab where the spacecraft of Satellite passes fly,
    // so they stay inside the frame without the framing changing from pass to pass.
    const refitSubject = (
      frame: SubjectFrame,
      pose: CameraPresetSpec,
      azimuthSwing: number,
      out: ViewWindow,
      withSky = false,
    ) => {
      let n = 0;
      for (let gy = 0; gy < SUBJECT_GRID; gy++) {
        const v = gy / (SUBJECT_GRID - 1);
        for (let gx = 0; gx < SUBJECT_GRID; gx++) {
          const u = gx / (SUBJECT_GRID - 1);
          subjectPoints[n * 3] = worldX(u);
          subjectPoints[n * 3 + 1] = sampleCpuTerrainY(u, v);
          subjectPoints[n * 3 + 2] = worldZ(v);
          n++;
        }
      }
      for (let c = 0; c < 4; c++) {
        subjectPoints[n * 3] = (c % 2 === 0 ? -0.5 : 0.5) * slabNow.width;
        subjectPoints[n * 3 + 1] = CLIFF_BASE_Y;
        subjectPoints[n * 3 + 2] = (c < 2 ? -0.5 : 0.5) * slabNow.depth;
        n++;
      }
      if (withSky) {
        const baseY = sampleCpuTerrainY(0.5, 0.5);
        for (let c = 0; c < SUBJECT_SKY_POINTS; c++) {
          const ring = c === 0 ? 0 : FLEET_SKY_RADIUS;
          const a = (c - 1) * Math.PI * 0.5;
          subjectPoints[n * 3] = Math.cos(a) * ring;
          subjectPoints[n * 3 + 1] = baseY + (c === 0 ? FLEET_SKY_TOP : FLEET_SKY_SHOULDER);
          subjectPoints[n * 3 + 2] = Math.sin(a) * ring;
          n++;
        }
      }
      fitSubjectToFrame(subjectPoints, n, pose, azimuthSwing, 39.0, viewportW / viewportH, frame, out);
    };

    let observerVisibilityMix = 0.0;

    let fpsFrames = 0;
    let fpsAccumSec = 0;
    let smoothedFps = 60;
    let lastTelemetryEmitSec = 0;

    const projVec = new THREE.Vector3();

    const animate = (nowMs: number) => {
      if (disposed) return;
      rafId = requestAnimationFrame(animate);

      const dtSec = Math.min(0.065, Math.max(0.001, (nowMs - prevTimeMs) * 0.001));
      prevTimeMs = nowMs;
      elapsedSec += dtSec;

      const p = propsRef.current;
      const dampFast = 1.0 - Math.exp(-dtSec * 8.5);
      const dampMed = 1.0 - Math.exp(-dtSec * 5.8);
      // Landing world view (the default landing): camera inside the landscape, no block on a floor
      const landingWorld = !p.inWorkspace && p.landingView !== 'slab';
      if (landingWorld) ensureLandingWorldPose();

      // A. Step GPU Elevation + Satellite Ortho Morph (950ms cubic-bezier ease)
      if (morphActive) {
        morphElapsed += dtSec;
        const rawM = Math.min(1.0, morphElapsed / morphDuration);
        morphValue = easeSubOrbitalMorph(rawM);
        terrainUniforms.uMorph.value = morphValue;
        updateSlabNow();
        if (rawM >= 1.0) {
          morphActive = false;
          morphValue = 1.0;
          prevBundle = nextBundle;
          syncUniformsFromBundles();
          terrainUniforms.uMorph.value = 1.0;
          // The transition has settled: only the pack of the region on screen stays on the GPU.
          // (Evicting only when another pack finishes loading would leave a pack behind when the
          // new region has none, and when the new pack arrives before the morph ends.)
          evictPacksExcept(nextBundle.regionId);
          sweepRetiredBundles();
        }
      }

      // Baked pack normals and the detail inset ease in once the incoming terrain is in place
      const auxTarget = nextBundle.auxTex
        ? morphActive && prevBundle.regionId !== nextBundle.regionId
          ? THREE.MathUtils.smoothstep(morphValue, 0.55, 1.0)
          : 1.0
        : 0.0;
      terrainUniforms.uAuxMix.value = THREE.MathUtils.lerp(
        terrainUniforms.uAuxMix.value,
        auxTarget,
        dampMed,
      );
      terrainUniforms.uDetailMix.value = THREE.MathUtils.lerp(
        terrainUniforms.uDetailMix.value,
        nextBundle.detailTex ? 1.0 : 0.0,
        dampMed,
      );

      // B. Camera view window (zero canvas resize). Landing without a subject frame: the
      // 11% downward shift. Landing with one: the slab fitted inside that rectangle. Workspace with
      // a subject frame: the Overview and Nadir presets are fitted inside it, the close presets
      // keep their size and look at the middle of it (no frame, clean feed or cinema: full image).
      activeSubjectFrame = p.inWorkspace ? null : sanitizeSubjectFrame(p.landingSubjectFrame);
      workspaceFrame =
        p.inWorkspace && !p.cleanHud && !p.cinemaActive
          ? sanitizeSubjectFrame(p.workspaceSubjectFrame)
          : null;
      if (p.inWorkspace && workspaceFrame) {
        const frameCx = (workspaceFrame.left + workspaceFrame.right) * 0.5;
        const frameCy = (workspaceFrame.top + workspaceFrame.bottom) * 0.5;
        if (p.cameraPreset === 'overview' || p.cameraPreset === 'nadir') {
          // Whole-slab views: fit the slab of that preset inside the frame, never magnified
          workspaceFitAge += 1;
          const fitSky = p.mode === 'observer' && p.cameraPreset === 'overview';
          if (
            workspaceFitAge >= SUBJECT_REFIT_INTERVAL_FRAMES ||
            workspaceFitPreset !== p.cameraPreset ||
            workspaceFitSky !== fitSky
          ) {
            refitSubject(
              workspaceFrame,
              resolvePresetForContext(p.cameraPreset, true, p.mode, p.activeTheaterId),
              0,
              workspaceFit,
              fitSky,
            );
            workspaceFitAge = 0;
            workspaceFitPreset = p.cameraPreset;
            workspaceFitSky = fitSky;
          }
          const s = THREE.MathUtils.clamp(workspaceFit.scale, 0.4, 1.0);
          const fitScale = Math.max(1e-3, workspaceFit.scale);
          viewWindowTarget.scale = s;
          viewWindowTarget.offsetX = ((workspaceFit.offsetX + frameCx) / fitScale) * s - frameCx;
          viewWindowTarget.offsetY = ((workspaceFit.offsetY + frameCy) / fitScale) * s - frameCy;
        } else {
          // Close obliques: full size, with the point the camera looks at in the middle of the frame
          workspaceFitPreset = null;
          viewWindowTarget.scale = 1;
          viewWindowTarget.offsetX = 0.5 - frameCx;
          viewWindowTarget.offsetY = 0.5 - frameCy;
        }
      } else if (p.inWorkspace) {
        workspaceFitPreset = null;
        viewWindowTarget.scale = 1;
        viewWindowTarget.offsetX = 0;
        viewWindowTarget.offsetY = 0;
      } else if (landingWorld && landingWorldPose) {
        // World view: the image is shifted up or down so the calm rectangle holds sky and haze
        const calm = activeSubjectFrame ?? DEFAULT_CALM_FRAME;
        landingFitAge += 1;
        const aspectNow = viewportW / viewportH;
        if (
          landingFitAge >= SUBJECT_REFIT_INTERVAL_FRAMES ||
          !subjectFramesEqual(landingFitFrame, calm) ||
          Math.abs(landingFitAspect - aspectNow) > 1e-4
        ) {
          const count = collectSkylinePoints();
          fitSkylineToFrame(
            skylinePoints,
            count,
            landingWorldPose,
            reducedMotion ? 0 : LANDING_WORLD_DRIFT,
            LANDING_WORLD_FOV,
            aspectNow,
            calm,
            landingFit,
          );
          landingFitFrame = calm;
          landingFitAspect = aspectNow;
          landingFitAge = 0;
        }
        viewWindowTarget.scale = 1;
        viewWindowTarget.offsetX = 0;
        viewWindowTarget.offsetY = landingFit.offsetY;
      } else if (!activeSubjectFrame) {
        viewWindowTarget.scale = 1;
        viewWindowTarget.offsetX = 0;
        viewWindowTarget.offsetY = LEGACY_LANDING_OFFSET_Y;
        landingFitFrame = null;
      } else {
        landingFitAge += 1;
        const aspectNow = viewportW / viewportH;
        if (
          landingFitAge >= SUBJECT_REFIT_INTERVAL_FRAMES ||
          !subjectFramesEqual(landingFitFrame, activeSubjectFrame) ||
          Math.abs(landingFitAspect - aspectNow) > 1e-4
        ) {
          refitSubject(activeSubjectFrame, LANDING_HERO_POSE, LANDING_DRIFT_AZIMUTH, landingFit);
          landingFitFrame = activeSubjectFrame;
          landingFitAspect = aspectNow;
          landingFitAge = 0;
        }
        viewWindowTarget.scale = landingFit.scale;
        viewWindowTarget.offsetX = landingFit.offsetX;
        viewWindowTarget.offsetY = landingFit.offsetY;
      }
      const windowDamp = viewWindowReady ? dampFast : 1.0;
      viewWindowReady = true;
      viewWindowCurrent.scale = THREE.MathUtils.lerp(
        viewWindowCurrent.scale,
        viewWindowTarget.scale,
        windowDamp,
      );
      viewWindowCurrent.offsetX = THREE.MathUtils.lerp(
        viewWindowCurrent.offsetX,
        viewWindowTarget.offsetX,
        windowDamp,
      );
      viewWindowCurrent.offsetY = THREE.MathUtils.lerp(
        viewWindowCurrent.offsetY,
        viewWindowTarget.offsetY,
        windowDamp,
      );
      applyViewWindow(camera, viewportW, viewportH, viewWindowCurrent);

      // C. Step Camera Controller (Cinema Catmull-Rom Spline vs Sub-Orbital Slew vs Damped Orbit)
      let effectiveTimeProg = p.timeProgress;
      // The landing of a real run shows the overpass the stage chose for it (see landingFrameOf)
      const chosenLanding = landingWorld ? landingFrameFor(nextBundle) : null;
      // The page may name the pass the landing shows; the standpoint stays with the stage's own choice
      // Or the stage tours them itself (`landingTour`): it rests on its chosen pass, then steps through
      // the run's night passes in their order, the hidden ones among them, and comes round again
      let tourFrame: number | null = null;
      if (chosenLanding !== null && p.landingTour && typeof p.landingPass !== 'number' && !reducedMotion) {
        if (tourKey !== nextBundle.key) {
          tourKey = nextBundle.key;
          tourList = [];
          nextBundle.observerDataset.frames.forEach((passes, f) => {
            if (f === chosenLanding || passes[0]?.isDay === false) tourList.push(f);
          });
          tourAt = Math.max(0, tourList.indexOf(chosenLanding));
          tourSince = 0;
          tourRested = false;
        }
        tourSince += dtSec;
        if (tourList.length > 1 && tourSince > (tourRested ? LANDING_TOUR_HOLD_SECONDS : LANDING_TOUR_REST_SECONDS)) {
          tourAt = (tourAt + 1) % tourList.length;
          tourSince = 0;
          tourRested = true;
        }
        tourFrame = tourList[tourAt] ?? null;
      } else {
        tourKey = '';
      }
      const landingFrame =
        chosenLanding !== null && typeof p.landingPass === 'number' && Number.isFinite(p.landingPass)
          ? THREE.MathUtils.clamp(p.landingPass, 0, nextBundle.frameCount - 1)
          : tourFrame ?? chosenLanding;
      if (landingFrame !== null) effectiveTimeProg = landingFrame / Math.max(1, nextBundle.frameCount - 1);
      let cinemaProgress = 0.0;
      let slewActive = false;

      if (p.cinemaActive && p.inWorkspace) {
        const pose = cinemaDirector.update(
          dtSec,
          sampleCpuTerrainY,
          p.onCinemaStepTheater,
          slabNow.width,
          slabNow.depth,
        );
        camera.fov = pose.fov;
        camera.updateProjectionMatrix();
        camera.up.copy(pose.up);
        camera.position.copy(pose.position);
        camera.lookAt(pose.lookAt);

        effectiveTimeProg = pose.syntheticTimeProgress;
        cinemaProgress = pose.cycleProgress;
      } else {
        const lens = landingWorld && landingWorldPose ? LANDING_WORLD_FOV : 39.0;
        if (Math.abs(camera.fov - lens) > 0.01) {
          camera.fov = landingWorldSeated || !landingWorld ? THREE.MathUtils.lerp(camera.fov, lens, dampFast) : lens;
        }
        camera.updateProjectionMatrix();
        camera.up.set(0, 1, 0);

        if (!p.inWorkspace && !slewController.isActive() && !pointerDown) {
          // Idle on the landing page: a slow swing around the landing pose, none under reduced motion
          const worldPose = landingWorld ? landingWorldPose : null;
          const pose = worldPose ?? LANDING_HERO_POSE;
          const swing = reducedMotion
            ? 0.0
            : worldPose
              ? Math.sin(elapsedSec * 0.11) * LANDING_WORLD_DRIFT
              : Math.sin(elapsedSec * 0.16) * 0.065;
          // The shortest way round to the pose azimuth, so a change of standpoint never spins the view
          let az = pose.azimuth + swing;
          while (az - orbitTarget.azimuth > Math.PI) az -= Math.PI * 2;
          while (az - orbitTarget.azimuth < -Math.PI) az += Math.PI * 2;
          // Eased like distance and height, so a return from the workspace is one glide. The
          // drift itself is far slower than this.
          orbitTarget.azimuth = worldPose
            ? THREE.MathUtils.lerp(orbitTarget.azimuth, az, Math.min(1, dtSec * 2.0))
            : az;
          orbitTarget.polar = THREE.MathUtils.lerp(orbitTarget.polar, pose.polar, dtSec * 1.2);
          orbitTarget.distance = THREE.MathUtils.lerp(orbitTarget.distance, pose.distance, dtSec * 1.6);
          scratchTargetVec.set(pose.target[0], pose.target[1], pose.target[2]);
          orbitTarget.target.lerp(scratchTargetVec, dtSec * 2.2);
          if (worldPose && !landingWorldSeated) {
            // First frame of the page: the view opens in place, it does not fly in from the block view
            orbitTarget.azimuth = az;
            orbitTarget.polar = pose.polar;
            orbitTarget.distance = pose.distance;
            orbitTarget.target.copy(scratchTargetVec);
            orbitCurrent.azimuth = orbitTarget.azimuth;
            orbitCurrent.polar = pose.polar;
            orbitCurrent.distance = pose.distance;
            orbitCurrent.target.copy(scratchTargetVec);
            landingWorldSeated = true;
          }
        }

        // The terrain changed under an untouched preset (data arrived, pack loaded): re-center it
        if (
          presetDirty &&
          p.inWorkspace &&
          !cameraTouched &&
          !pointerDown &&
          !slewController.isActive()
        ) {
          setOrbitTargetFromPreset(
            resolveLivePreset(p.cameraPreset, true, p.mode, p.activeTheaterId),
          );
          presetDirty = false;
        }

        const slewStep = slewController.step(dtSec, orbitTarget);
        slewActive = slewStep.slewActive;

        orbitCurrent.azimuth = THREE.MathUtils.lerp(
          orbitCurrent.azimuth,
          orbitTarget.azimuth,
          dampFast,
        );
        orbitCurrent.polar = THREE.MathUtils.lerp(
          orbitCurrent.polar,
          orbitTarget.polar,
          dampFast,
        );
        orbitCurrent.distance = THREE.MathUtils.lerp(
          orbitCurrent.distance,
          orbitTarget.distance,
          dampFast,
        );
        orbitCurrent.target.lerp(orbitTarget.target, dampFast);

        const sinP = Math.sin(orbitCurrent.polar);
        camera.position.set(
          orbitCurrent.target.x +
            orbitCurrent.distance * sinP * Math.sin(orbitCurrent.azimuth),
          orbitCurrent.target.y +
            orbitCurrent.distance * Math.cos(orbitCurrent.polar),
          orbitCurrent.target.z +
            orbitCurrent.distance * sinP * Math.cos(orbitCurrent.azimuth),
        );

        // Keep interactive camera safely above real mountain peaks
        const camU = slabU(camera.position.x);
        const camV = slabV(camera.position.z);
        if (camU >= 0 && camU <= 1 && camV >= 0 && camV <= 1) {
          const minCamY =
            sampleCpuTerrainY(camU, camV) +
            THREE.MathUtils.lerp(CAMERA_CLEARANCE, CAMERA_CLEARANCE_WORLD, worldMix);
          if (camera.position.y < minCamY) {
            camera.position.y = minCamY;
          }
        } else if (nextBundle.context && contextMix > 0.5) {
          // Beyond the pack the camera stays clear of the context terrain in the same way
          const minCamY = contextWorldY(nextBundle, camera.position.x, camera.position.z) + CAMERA_CLEARANCE;
          if (camera.position.y < minCamY) {
            camera.position.y = minCamY;
          }
        }
        camera.lookAt(orbitCurrent.target);
      }

      // D. Update Mode Mixes & Dynamic Solver Uniforms
      const effectiveMode = !p.inWorkspace || p.cinemaActive ? 'cutaway' : p.mode;
      const targetCutawayMix = effectiveMode === 'cutaway' ? 1.0 : 0.0;
      const targetReconMix = effectiveMode === 'reconstruction' ? 1.0 : 0.0;
      const targetObsMix = effectiveMode === 'observer' ? 1.0 : 0.0;
      const targetPlumeOpacity =
        effectiveMode === 'world' || effectiveMode === 'earth'
          ? 0.0
          : effectiveMode === 'observer'
            ? 0.45
            : 1.0;

      terrainUniforms.uCutawayMix.value = THREE.MathUtils.lerp(
        terrainUniforms.uCutawayMix.value,
        targetCutawayMix,
        dampMed,
      );
      terrainUniforms.uReconMix.value = THREE.MathUtils.lerp(
        terrainUniforms.uReconMix.value,
        targetReconMix,
        dampMed,
      );
      terrainUniforms.uObserverMix.value = THREE.MathUtils.lerp(
        terrainUniforms.uObserverMix.value,
        targetObsMix,
        dampMed,
      );
      terrainUniforms.uCutawayPlane.value = NO_CURTAIN_PLANE;
      terrainUniforms.uTime.value = elapsedSec;

      terrainUniforms.uUncertaintyMix.value = THREE.MathUtils.lerp(
        terrainUniforms.uUncertaintyMix.value,
        p.showUncertainty ? 1.0 : 0.0,
        dampFast,
      );
      terrainUniforms.uSensitivity.value = THREE.MathUtils.lerp(
        terrainUniforms.uSensitivity.value,
        p.sensitivityThreshold,
        dampFast,
      );

      const allowModis = p.observerFilter === 'all' || p.observerFilter === 'modis' ? 1.0 : 0.0;
      const allowViirs =
        !p.holdoutViirs && (p.observerFilter === 'all' || p.observerFilter === 'viirs')
          ? 1.0
          : 0.0;
      terrainUniforms.uModisWeight.value = THREE.MathUtils.lerp(
        terrainUniforms.uModisWeight.value,
        allowModis,
        dampFast,
      );
      terrainUniforms.uViirsWeight.value = THREE.MathUtils.lerp(
        terrainUniforms.uViirsWeight.value,
        allowViirs,
        dampFast,
      );

      // By night no smoke is drawn (see NIGHT_SMOKE_OPACITY); it fades out as a night pass comes on
      smokeOpacity = THREE.MathUtils.lerp(
        smokeOpacity,
        targetPlumeOpacity * THREE.MathUtils.lerp(1.0, NIGHT_SMOKE_OPACITY, uNight.value),
        dampMed,
      );

      const fMix = syncEpochTextures(
        nextBundle.tensor,
        nextBundle.frameCount,
        effectiveTimeProg,
      );
      terrainUniforms.uFrameMix.value = fMix;
      // Fractional epoch: the fire front is the arrival-time level set at this value
      terrainUniforms.uFireTime.value =
        THREE.MathUtils.clamp(effectiveTimeProg, 0, 1) * Math.max(1, nextBundle.frameCount - 1);

      // Scan geometry of the overpasses at the nearest epoch drives the ground cell lattice. An
      // overpass is a discrete observation, so its geometry is never blended between epochs.
      const obsFrames = nextBundle.observerDataset.frames;
      const epochIdx = Math.min(
        obsFrames.length - 1,
        Math.max(0, Math.round(effectiveTimeProg * (obsFrames.length - 1))),
      );
      const rawPasses = obsFrames[epochIdx] ?? [];
      // A real run: the detections of this overpass, each with its own footprint, replace the
      // scan lattice, and the smoke rises from detections
      const realRun = nextBundle.observerDataset.dataSource === 'firms';
      if (realRun) {
        syncDetectionTextures(nextBundle, uploadedFrame0, uploadedFrame1);
        const key = `${nextBundle.key}:${epochIdx}:${p.holdoutViirs ? 1 : 0}:${landingWorld ? 1 : 0}`;
        // On the landing, while the page steps the pass on show, the lights of the pass before fade
        // out before the next pass's come up, so no pass pops in
        const stepping = landingWorld && (typeof p.landingPass === 'number' || Boolean(p.landingTour)) && !reducedMotion;
        const fadingOut =
          key !== realPassKey && stepping && realPassKey.startsWith(`${nextBundle.key}:`) && uLightGain.value > 0.02;
        if (fadingOut) {
          uLightGain.value = Math.max(0, uLightGain.value - dtSec / LIGHT_FADE_OUT_SECONDS);
        } else if (key === realPassKey) {
          uLightGain.value = stepping ? Math.min(1, uLightGain.value + dtSec / LIGHT_FADE_IN_SECONDS) : 1;
        }
        if (key !== realPassKey && !fadingOut) {
          realPassKey = key;
          uLightGain.value = stepping ? 0 : 1;
          // The pass the frame belongs to: one the estimate was made from, before any pass laid on after scoring
          const shown =
            rawPasses.find((sp) => !passIsHidden(sp, p.holdoutViirs) && !sp.revealed) ??
            rawPasses.find((sp) => !passIsHidden(sp, p.holdoutViirs));
          const hasModis = rawPasses.some(
            (sp) => sp.family === 'modis' && !passIsHidden(sp, p.holdoutViirs) && !sp.revealed,
          );
          realPassNow = shown
            ? {
                index: epochIdx,
                sensor: shown.sensorLabel,
                timeUtc: shown.timeUtc ?? '',
                isDay: shown.isDay !== false,
                detections: shown.footprints.length,
              }
            : undefined;
          // The pass arrives as a scan: a front along its ground track, in its direction of travel
          const scanOf = shown ?? rawPasses[0];
          if (p.passScan && (p.inWorkspace || typeof p.landingPass === 'number') && scanOf && !reducedMotion) {
            const az = THREE.MathUtils.degToRad(scanOf.azimuthDeg);
            let trackEast = Math.cos(az);
            let trackNorth = -Math.sin(az);
            const northward = scanOf.orbitNode === 'ascending';
            if (scanOf.orbitNode && northward !== trackNorth > 0) {
              trackEast = -trackEast;
              trackNorth = -trackNorth;
            }
            uScan.x = trackEast;
            uScan.y = trackNorth;
            scanStartSec = elapsedSec;
          }
          footprintList.length = 0;
          revealedList.length = 0;
          uRevealed.set(0, 0);
          for (const sp of rawPasses) {
            if (passIsHidden(sp, p.holdoutViirs)) continue;
            if (sp.revealed) {
              // Laid on after scoring: drawn as outlined pixels, not as light
              for (const fp of sp.footprints) revealedList.push(fp);
              if (sp.family === 'modis') uRevealed.x = 1;
              else uRevealed.y = 1;
              continue;
            }
            for (const fp of sp.footprints) footprintList.push(fp);
          }
          // A pass that shows no detection of its own because its detections are hidden keeps a
          // trace of the fire: the last pass before it that the stage shows, as an afterglow that
          // fades with the hours since then, at the rate the run's own model lets a burning cell
          // go out. Nothing is invented: these are that earlier pass's detections, drawn as such.
          afterglowList.length = 0;
          uAfterglow.value = 0;
          lastSeenNow = undefined;
          const hiddenNow =
            footprintList.length === 0 &&
            rawPasses.length > 0 &&
            rawPasses.every((sp) => sp.revealed || passIsHidden(sp, p.holdoutViirs));
          if (hiddenNow) {
            const nowMs = Date.parse(rawPasses[0]?.timeUtc ?? '');
            for (let f = epochIdx - 1; f >= 0 && afterglowList.length === 0; f--) {
              for (const sp of obsFrames[f] ?? []) {
                if (sp.revealed || passIsHidden(sp, p.holdoutViirs) || sp.footprints.length === 0) continue;
                for (const fp of sp.footprints) afterglowList.push(fp);
                const thenMs = Date.parse(sp.timeUtc ?? '');
                const hours = Number.isFinite(nowMs) && Number.isFinite(thenMs) ? Math.max(0, (nowMs - thenMs) / 3600000) : 0;
                uAfterglow.value = Math.exp(-hours / (nextBundle.residenceHours ?? DEFAULT_RESIDENCE_HOURS));
                lastSeenNow = { index: f, sensor: sp.sensorLabel, timeUtc: sp.timeUtc ?? '', hoursBefore: hours };
              }
            }
          }
          // How hot each detection is drawn, on the run's own intensity scale
          const lightScale = nextBundle.fieldScale ?? DEFAULT_FIELD_INTENSITY_SCALE;
          lightRangeOf(lightScale, lightRange);
          footprintField.build(
            footprintList,
            nextBundle.bbox,
            [nextBundle.widthKm, nextBundle.depthKm],
            (mwPerKm2) =>
              (fieldScalePosition(lightScale, mwPerKm2) - lightRange.x) / Math.max(1e-3, lightRange.y - lightRange.x),
            revealedList,
            afterglowList,
          );
          uLightModis.value = hasModis ? 1 : 0;
        }
      } else {
        realPassNow = undefined;
        realPassKey = '';
        uAfterglow.value = 0;
        lastSeenNow = undefined;
      }
      // The scan front crosses the region, a little past each edge, in SCAN_SECONDS
      const scanProgress = (elapsedSec - scanStartSec) / SCAN_SECONDS;
      if (realRun && scanProgress >= 0 && scanProgress < 1) {
        const reachKm = 0.5 * (Math.abs(uScan.x) * nextBundle.widthKm + Math.abs(uScan.y) * nextBundle.depthKm) + 1.5;
        uScan.z = -reachKm + 2 * reachKm * scanProgress;
        uScan.w = 1;
      } else {
        uScan.w = 0;
      }
      // A run that kept nothing from the model: the model is sure of far more cells, and its squares
      // are drawn quieter so they do not bury the lights
      if (allSeenKey !== nextBundle.key) {
        allSeenKey = nextBundle.key;
        allSeen = realRun && !obsFrames.some((passes) => passes.some((sp) => sp.hidden || sp.revealed));
      }
      uBeliefQuiet.value = THREE.MathUtils.lerp(uBeliefQuiet.value, allSeen && !p.holdoutViirs ? 1.0 : 0.0, dampFast);
      // The model's belief at the time on show. Passes are unevenly spaced: the time between two
      // frames is read off their real pass times, and the belief frames are stepped through at it.
      const beliefNow = realRun && nextBundle.runId ? beliefStore.get(nextBundle.runId) : undefined;
      if (beliefNow) {
        if (frameTimesKey !== nextBundle.key) {
          frameTimesKey = nextBundle.key;
          frameTimesMs = obsFrames.map((passes) => Date.parse(passes[0]?.timeUtc ?? ''));
        }
        const exactFrame = THREE.MathUtils.clamp(effectiveTimeProg, 0, 1) * Math.max(1, obsFrames.length - 1);
        const fA = Math.min(obsFrames.length - 1, Math.floor(exactFrame));
        const fB = Math.min(obsFrames.length - 1, fA + 1);
        const tA = frameTimesMs[fA];
        const tB = frameTimesMs[fB];
        if (Number.isFinite(tA) && Number.isFinite(tB)) {
          // The belief frames are the forward estimate at fixed steps, and the step that holds a
          // pass's time was made before that pass was taken in. The belief is therefore shown one
          // step later than the time on show, so a pass on show is already part of it.
          const beliefTimeMs = tA + (tB - tA) * (exactFrame - fA) + beliefNow.info.stepMs;
          uBeliefMix.value = beliefField.sync(beliefNow, nextBundle.key, beliefTimeMs);
        } else {
          beliefField.clear();
        }
      } else {
        beliefField.clear();
      }
      // The legend ramp's sampler carries the belief on a real run (the ramp is not drawn there)
      terrainUniforms.uLipariTex.value = beliefField.grid.x > 0 ? beliefField.texture : lipariTex;
      // A pass kept from the model: every pass of the frame is hidden, or was laid on after scoring
      const heldOutTarget =
        realRun && rawPasses.length > 0 && rawPasses.every((sp) => sp.revealed || passIsHidden(sp, p.holdoutViirs))
          ? 1.0
          : 0.0;
      uHeldOut.value = THREE.MathUtils.lerp(uHeldOut.value, heldOutTarget, 1.0 - Math.exp(-dtSec * 6.0));
      smokeFireLight = THREE.MathUtils.lerp(
        smokeFireLight,
        (!realRun || footprintList.length > 0 ? 1.0 : 0.5 * uAfterglow.value) * uLightGain.value,
        1.0 - Math.exp(-dtSec * 4.0),
      );
      terrainUniforms.uPixelOutline.value = THREE.MathUtils.lerp(
        terrainUniforms.uPixelOutline.value,
        p.detectionPixels ? 1.0 : 0.0,
        dampFast,
      );
      uFarView.value = landingWorld ? 0.0 : THREE.MathUtils.smoothstep(orbitCurrent.distance, 8.5, 15.0);
      uMoonLift.value = THREE.MathUtils.lerp(1.0, MOON_LIFT_FAR, uFarView.value);
      passOnShowNow =
        realRun && rawPasses[0]
          ? {
              index: epochIdx,
              sensor: rawPasses[0].sensorLabel,
              timeUtc: rawPasses[0].timeUtc ?? '',
              isDay: rawPasses[0].isDay !== false,
              hidden: rawPasses.every((sp) => sp.revealed || passIsHidden(sp, p.holdoutViirs)),
            }
          : undefined;
      // On a real run the fire history is not drawn, and its sampler carries the detections' light
      terrainUniforms.uFireHist.value = realRun ? footprintField.lightTexture : ensureFireHistory(nextBundle).texture;
      // Time of day comes from the overpass on show: a night overpass is drawn by night
      const nightTarget = realRun && rawPasses[0]?.isDay === false ? 1.0 : 0.0;
      uNight.value = THREE.MathUtils.lerp(uNight.value, nightTarget, 1.0 - Math.exp(-dtSec * 2.4));
      domeNight.value = uNight.value;
      const fieldScale = nextBundle.fieldScale ?? DEFAULT_FIELD_INTENSITY_SCALE;
      uFieldScale.set(fieldScale.kind === 'linear' ? 0 : 1, fieldScale.maxMwKm2, fieldScale.minMwKm2);
      heatRangeOf(fieldScale, uHeatRange);
      uFootMix.set(realRun ? 1 : 0, realRun ? 1 : 0);
      resolveScanPass(
        rawPasses.find((sp) => sp.family === 'modis'),
        MODIS_SCAN,
        modisPassState,
      );
      resolveScanPass(
        rawPasses.find((sp) => sp.family === 'viirs' && !passIsHidden(sp, p.holdoutViirs)),
        VIIRS_SCAN,
        viirsPassState,
      );
      uModisPass.set(
        modisPassState.axisEast,
        modisPassState.axisNorth,
        modisPassState.nadirKm,
        modisPassState.valid ? 1 : 0,
      );
      uViirsPass.set(
        viirsPassState.axisEast,
        viirsPassState.axisNorth,
        viirsPassState.nadirKm,
        viirsPassState.valid ? 1 : 0,
      );

      // E. Spacecraft, orbit tracks and scan planes: Satellite passes only. On the landing page
      // and in the sensor split a spacecraft above the slab would run into the page's type.
      observerVisibilityMix = THREE.MathUtils.lerp(
        observerVisibilityMix,
        effectiveMode === 'observer' ? 1.0 : 0.0,
        dampMed,
      );
      if (!fleetModelsRequested && p.inWorkspace) {
        fleetModelsRequested = true;
        void fleet.loadModels(import.meta.env.BASE_URL);
      }
      {
        // In a close view the spacecraft would fill the frame as a prop in front of the terrain,
        // so everything in the sky leaves when the camera comes in. The scan strip on the ground stays.
        const wide = THREE.MathUtils.smoothstep(orbitCurrent.distance, 8.5, 11.5);
        fleetSkyMix = THREE.MathUtils.lerp(fleetSkyMix, effectiveMode === 'observer' ? wide : 0.0, dampMed);

        fleetPasses.length = 0;
        if (observerVisibilityMix >= 0.01) {
          let modisStrip = false;
          let viirsStrip = false;
          for (const sp of rawPasses) {
            if (fleetPasses.length >= MAX_ORBITAL_RIGS) break;
            if (passIsHidden(sp, p.holdoutViirs)) continue;
            if (p.observerFilter === 'modis' && sp.family !== 'modis') continue;
            if (p.observerFilter === 'viirs' && sp.family !== 'viirs') continue;
            // The terrain shader draws the scan cells of the first pass of each family
            const first = sp.family === 'modis' ? !modisStrip : !viirsStrip;
            if (sp.family === 'modis') modisStrip = true;
            else viirsStrip = true;
            fleetPasses.push({
              sensorLabel: sp.sensorLabel,
              family: sp.family,
              azimuthDeg: sp.azimuthDeg,
              scanAngleDeg: sp.scanAngleDeg,
              orbitNode: sp.orbitNode,
              groundStrip: first,
            });
          }
        }
        fleet.update(fleetPasses, {
          sky: fleetSkyMix,
          strip: observerVisibilityMix,
          dtSec,
          sampleTerrainY: sampleCpuTerrainY,
          slabWidth: slabNow.width,
          slabDepth: slabNow.depth,
          unitsPerMetre: nextBundle.frame.unitsPerMetre,
        });
        uScanStrip.set(
          fleet.strips.modis.alongTrackKm,
          fleet.strips.modis.strength,
          fleet.strips.viirs.alongTrackKm,
          fleet.strips.viirs.strength,
        );
      }

      // F. Render the scene through the HDR composer (smoke, bloom, ACES Filmic, sRGB)
      domeMesh.position.copy(camera.position);
      {
        // Camera altitude at true scale drives the sky and the horizon
        const baseElevM = THREE.MathUtils.lerp(prevBundle.minElevM, nextBundle.minElevM, morphValue);
        const camAltKm = Math.max(
          0.05,
          (baseElevM + camera.position.y / nextBundle.frame.unitsPerMetre[1]) * 0.001,
        );
        domeUniforms.uCamAltKm.value = camAltKm;
        // Picture mode (clean feed, cinema): brighter sky, and the floor reads as distant ground
        pictureMix = THREE.MathUtils.lerp(
          pictureMix,
          landingWorld || (p.inWorkspace && (p.cleanHud || p.cinemaActive)) ? 1.0 : 0.0,
          dampMed,
        );
        worldMix = THREE.MathUtils.lerp(worldMix, landingWorld ? 1.0 : 0.0, dampMed);
        domeUniforms.uSkyExposure.value = THREE.MathUtils.lerp(
          SKY_EXPOSURE_INTERFACE,
          THREE.MathUtils.lerp(SKY_EXPOSURE_CLEAN, SKY_EXPOSURE_LANDING, worldMix),
          pictureMix,
        );
        // World view: cells with a detection keep their outline, the lattice of empty cells is not
        // drawn (over flat ground and sea it reads as a grid on a floor)
        terrainUniforms.uLatticeMix.value = 1.0 - worldMix;
        // Context terrain: wherever the world is shown instead of the block (landing world view and
        // the close presets), once the region's own terrain has settled
        const worldShown = p.inWorkspace
          ? 1.0 - THREE.MathUtils.smoothstep(orbitCurrent.distance, 8.5, 11.5)
          : landingWorld
            ? 1.0
            : 0.0;
        const hasContext = nextBundle.context !== null && !morphActive;
        contextMix = THREE.MathUtils.lerp(contextMix, hasContext ? worldShown : 0.0, dampMed);
        terrainUniforms.uContextMix.value = contextMix;
        contextTerrain.mesh.visible = contextMix > 0.003;
        // World view: no block sides and no floor mark under the block at all. The same where the
        // context terrain stands around the pack.
        skirtMesh.visible = worldMix < 0.5 && contextMix < 0.5;
        pedestalMesh.visible = worldMix < 0.5 && contextMix < 0.5;
        terrainUniforms.uSkyExposure.value = domeUniforms.uSkyExposure.value;
        // Close views lose the cut edge of the slab at the horizon; whole-slab views keep it. With
        // context terrain around the pack there is no cut edge to lose: nothing dissolves or sinks.
        terrainUniforms.uEdgeFade.value = THREE.MathUtils.lerp(
          terrainUniforms.uEdgeFade.value,
          nextBundle.context
            ? 0.0
            : p.inWorkspace
            ? 1.0 - THREE.MathUtils.smoothstep(orbitCurrent.distance, 8.5, 11.5)
            : // Landing: nothing is taken away where ground forms the skyline. Open water that runs
              // to the edge of the data still dissolves there, and so does a column that shows floor.
              landingWorld && (landingWorldStats.floorShare > 0 || landingWorldStats.seaShare > 0)
              ? 1.0
              : 0.0,
          dampMed,
        );
        // How much of a close view this is, whichever way its far edge is handled
        const closeShare = Math.max(terrainUniforms.uEdgeFade.value, contextMix);
        pedestalMat.uniforms.uShadowMix.value = 1.0 - closeShare;
        // Picture mode: the floor reads as distant ground. In a close view it sits just under the
        // horizon, where real ground is lost in haze, so the air path over it is drawn thicker.
        domeUniforms.uFloorHaze.value = THREE.MathUtils.lerp(
          0.3,
          THREE.MathUtils.lerp(1.0, CLOSE_VIEW_FLOOR_HAZE, closeShare),
          pictureMix,
        );
        domeUniforms.uFloorColor.value.set(0.044, 0.06, 0.094).lerp(FLOOR_COLOR_PICTURE, pictureMix);
        atmosphere.update(renderer, uSunTrue, camAltKm);
      }
      camera.updateMatrixWorld();
      const reliefTopNow = Math.max(
        bundleWorldY(prevBundle.maxElevM, prevBundle),
        bundleWorldY(nextBundle.maxElevM, nextBundle),
      );
      smokePass.enabled = smokeOpacity > 0.01;
      // Landing world view: smoke stays under the calm rectangle. The limit is a
      // plane through the eye and the bottom row of that rectangle, so it holds for the whole drift.
      if (landingWorld) {
        camera.updateMatrixWorld();
        planeUnderRow(camera, calmRow(activeSubjectFrame ?? DEFAULT_CALM_FRAME), smokeLid);
      }
      terrainUniforms.uSmokeShadowMix.value = smokePass.enabled ? 1.0 : 0.0;
      if (smokePass.enabled) {
        smokePass.update({
          camera,
          slabWidth: slabNow.width,
          slabDepth: slabNow.depth,
          reliefTop: reliefTopNow,
          heightPrev: ensureSmokeHeight(prevBundle),
          heightNext: ensureSmokeHeight(nextBundle),
          morph: morphValue,
          field0: fieldTex0,
          field1: fieldTex1,
          detection0: nextBundle.observerDataset.dataSource === 'firms' ? detectionTex0 : null,
          detection1: nextBundle.observerDataset.dataSource === 'firms' ? detectionTex1 : null,
          frameMix: terrainUniforms.uFrameMix.value,
          windUv: uWindDirUv,
          sunDir,
          sunColor: uSunColor,
          time: elapsedSec,
          opacity: smokeOpacity,
          cutawayMix: terrainUniforms.uCutawayMix.value,
          cutawayPlane: NO_CURTAIN_PLANE,
          cutawayDir: cutDir,
          lid: smokeLid,
          lidAmount: worldMix,
          clearRadius: SMOKE_CLEAR_RADIUS,
          // A real run: thin the smoke over the detections so their light reads (illustrative)
          thinOverFire: realRun ? 0.82 : 0.0,
          night: uNight.value,
          fireLight: smokeFireLight,
        });
      }
      pipeline.render(dtSec);

      // G. No curtain is drawn: a page that follows its seam is told once that there is none.
      // Then place the callouts (workspace)
      const onSeam = p.onCurtainScreen;
      if (onSeam && !seamReported) {
        onSeam({ near: { x: 0, y: 0 }, far: { x: 0, y: 0 }, modisSide: 'left', visible: false });
        seamReported = true;
      }

      // The page's board of tiles: its states go to the terrain shader, the tile under the pointer
      // and each tile's label corner go back to the page
      const board = p.tileBoard;
      const boardOn = Boolean(board) && board!.cols >= 1 && board!.rows >= 1 && board!.cols * board!.rows <= 64;
      if (board && boardOn) {
        uTileGrid.set(board.cols, board.rows);
        const count = board.cols * board.rows;
        for (let i = 0; i < count; i++) {
          const tile = board.tiles[i];
          uTileState[i].set(
            THREE.MathUtils.clamp(tile?.level ?? 0, 0, 1),
            tile?.looked ? 1 : 0,
            tile?.chosen ? 1 : 0,
            tile?.closed ? 1 : 0,
          );
        }
        const under =
          board.pickable && !pointerDown && Number.isFinite(pointerClientX)
            ? tileAt(pointerClientX, pointerClientY, board.cols, board.rows)
            : null;
        uTileHover.value = under ?? -1;
        if (under !== tileHoverSent) {
          tileHoverSent = under;
          p.onTileHover?.(under);
        }
        if (p.onTileAnchors) {
          tileAnchors.length = 0;
          for (let i = 0; i < count; i++) {
            const u = (i % board.cols) / board.cols;
            const v = 1 - Math.floor(i / board.cols) / board.rows;
            projVec.set(worldX(u), sampleCpuTerrainY(u, v), worldZ(v)).project(camera);
            const x = (projVec.x * 0.5 + 0.5) * viewportW;
            const yPx = (-projVec.y * 0.5 + 0.5) * viewportH;
            tileAnchors.push({
              tile: i,
              x,
              y: yPx,
              visible: projVec.z > -1 && projVec.z < 1 && x >= 0 && x <= viewportW && yPx >= 0 && yPx <= viewportH,
            });
          }
          p.onTileAnchors(tileAnchors.slice());
        }
      } else {
        uTileGrid.set(0, 0);
        uTileHover.value = -1;
        if (tileHoverSent !== null) {
          tileHoverSent = null;
          p.onTileHover?.(null);
        }
      }

      // Where the fire on show sits on screen, for the page's labels: the pass's own detections,
      // or the estimate's cells on a pass whose detections are hidden
      if (p.onFireAnchor && p.inWorkspace && realRun) {
        const own = footprintList.length > 0 ? footprintList : revealedList;
        const beliefStep = beliefNow ? Math.round(beliefField.grid.x) + ':' + beliefField.stepKey : '';
        const key = `${realPassKey}:${own.length}:${own.length === 0 ? beliefStep : ''}`;
        if (key !== fireAnchorKey) {
          fireAnchorKey = key;
          const [lonMin, latMin, lonMax, latMax] = nextBundle.bbox;
          if (own.length > 0) {
            fireAnchorFrom = 'detections';
            fireAnchorPoints = new Float32Array(own.length * 3);
            own.forEach((fp, i) => {
              fireAnchorPoints[i * 3] = (fp.lon - lonMin) / Math.max(1e-9, lonMax - lonMin);
              fireAnchorPoints[i * 3 + 1] = (fp.lat - latMin) / Math.max(1e-9, latMax - latMin);
              fireAnchorPoints[i * 3 + 2] = Math.max(1, fp.frpMw);
            });
          } else {
            fireAnchorFrom = 'estimate';
            fireAnchorPoints = beliefNow
              ? beliefField.cellsAbove(beliefNow, FIRE_ANCHOR_PROBABILITY, (v) =>
                  fieldScaleValue(nextBundle.fieldScale ?? DEFAULT_FIELD_INTENSITY_SCALE, v),
                )
              : new Float32Array(0);
          }
        }
        const count = fireAnchorPoints.length / 3;
        if (count === 0) {
          if (fireAnchorSent) p.onFireAnchor(null);
          fireAnchorSent = false;
        } else {
          let sumU = 0;
          let sumV = 0;
          let sumW = 0;
          let left = Infinity;
          let right = -Infinity;
          let top = Infinity;
          let bottom = -Infinity;
          for (let i = 0; i < count; i++) {
            const u = fireAnchorPoints[i * 3];
            const v = fireAnchorPoints[i * 3 + 1];
            const w = fireAnchorPoints[i * 3 + 2];
            sumU += u * w;
            sumV += v * w;
            sumW += w;
            projVec.set(worldX(u), sampleCpuTerrainY(u, v), worldZ(v)).project(camera);
            if (projVec.z <= -1 || projVec.z >= 1) continue;
            const sx = (projVec.x * 0.5 + 0.5) * viewportW;
            const sy = (-projVec.y * 0.5 + 0.5) * viewportH;
            left = Math.min(left, sx);
            right = Math.max(right, sx);
            top = Math.min(top, sy);
            bottom = Math.max(bottom, sy);
          }
          const cu = sumU / sumW;
          const cv = sumV / sumW;
          const cy = sampleCpuTerrainY(cu, cv);
          projVec.set(worldX(cu), cy, worldZ(cv)).project(camera);
          const x = (projVec.x * 0.5 + 0.5) * viewportW;
          const yPx = (-projVec.y * 0.5 + 0.5) * viewportH;
          let visible = projVec.z > -1 && projVec.z < 1 && x >= 0 && x <= viewportW && yPx >= 0 && yPx <= viewportH;
          if (visible) {
            // Behind a ridge: some ground between the eye and the centre stands above the sight line
            const ex = camera.position.x;
            const ey = camera.position.y;
            const ez = camera.position.z;
            const tx = worldX(cu);
            const tz = worldZ(cv);
            for (let k = 1; k < 48 && visible; k++) {
              const a = k / 48;
              const su = slabU(ex + (tx - ex) * a);
              const sv = slabV(ez + (tz - ez) * a);
              if (su < 0 || su > 1 || sv < 0 || sv > 1) continue;
              if (sampleCpuTerrainY(su, sv) > ey + (cy - ey) * a + 0.012) visible = false;
            }
          }
          p.onFireAnchor({
            frame: epochIdx,
            from: fireAnchorFrom,
            x,
            y: yPx,
            left: Number.isFinite(left) ? left : x,
            top: Number.isFinite(top) ? top : yPx,
            right: Number.isFinite(right) ? right : x,
            bottom: Number.isFinite(bottom) ? bottom : yPx,
            visible,
          });
          fireAnchorSent = true;
        }
      } else if (fireAnchorSent) {
        p.onFireAnchor?.(null);
        fireAnchorSent = false;
        fireAnchorKey = '';
      }

      // The scale bar: a round number of kilometres from the run's own ground size, along the
      // block's near edge, with the two instruments' pixel sizes ticked at its start when they are
      // wide enough on screen to tell apart. Only in the views that show the block's edge.
      const scaleGroup = scaleGroupRef.current;
      if (scaleGroup) {
        let shown = false;
        if (p.inWorkspace && !landingWorld && !p.cinemaActive && orbitCurrent.distance > SCALE_BAR_FROM_DISTANCE) {
          // The edge nearest the eye: (u, v) of its two ends, and its length on the ground
          const edges: Array<[number, number, number, number, number]> = [
            [0, 0, 1, 0, nextBundle.widthKm],
            [1, 0, 1, 1, nextBundle.depthKm],
            [1, 1, 0, 1, nextBundle.widthKm],
            [0, 1, 0, 0, nextBundle.depthKm],
          ];
          let best = edges[0];
          let bestDist = Infinity;
          for (const e of edges) {
            const mx = worldX((e[0] + e[2]) * 0.5) - camera.position.x;
            const mz = worldZ((e[1] + e[3]) * 0.5) - camera.position.z;
            const dist = mx * mx + mz * mz;
            if (dist < bestDist) {
              bestDist = dist;
              best = e;
            }
          }
          const edgeKm = best[4];
          let barKm = 1;
          for (const nice of [1, 2, 5, 10, 20, 50, 100]) if (nice <= edgeKm * 0.3) barKm = nice;
          const at = (km: number): [number, number] => {
            const f = SCALE_BAR_INSET + km / edgeKm;
            return [best[0] + (best[2] - best[0]) * f, best[1] + (best[3] - best[1]) * f];
          };
          // One height for the whole bar, a little under the rim's lowest point along it, so the
          // bar is a straight line on the block's side
          let rim = Infinity;
          for (let k = 0; k <= 8; k++) {
            const [u, v] = at((barKm * k) / 8);
            rim = Math.min(rim, sampleCpuTerrainY(u, v));
          }
          const project = (km: number): [number, number] | null => {
            const [u, v] = at(km);
            projVec.set(worldX(u), rim - 0.07, worldZ(v)).project(camera);
            if (projVec.z <= -1 || projVec.z >= 1) return null;
            return [(projVec.x * 0.5 + 0.5) * viewportW, (-projVec.y * 0.5 + 0.5) * viewportH];
          };
          const a = project(0);
          const b = project(barKm);
          const cellV = project(SCALE_VIIRS_KM);
          const cellM = project(SCALE_MODIS_KM);
          if (a && b && cellV && cellM) {
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (len > 40) {
              // Ticks stand on the bar, toward the top of the screen
              let tx = -(b[1] - a[1]) / len;
              let ty = (b[0] - a[0]) / len;
              if (ty > 0) {
                tx = -tx;
                ty = -ty;
              }
              const seg = (q: [number, number], h: number) =>
                `M${q[0].toFixed(1)},${q[1].toFixed(1)} L${(q[0] + tx * h).toFixed(1)},${(q[1] + ty * h).toFixed(1)}`;
              const cellsFit = Math.hypot(cellM[0] - cellV[0], cellM[1] - cellV[1]) >= 7;
              scaleBarRef.current?.setAttribute(
                'd',
                `${seg(a, 7)} M${a[0].toFixed(1)},${a[1].toFixed(1)} L${b[0].toFixed(1)},${b[1].toFixed(1)} ${seg(b, 7)}` +
                  (cellsFit ? ` ${seg(cellV, 4)} ${seg(cellM, 4)}` : ''),
              );
              const text = scaleTextRef.current;
              if (text) {
                text.textContent = cellsFit ? `${barKm} km, ticks at 375 m and 1 km` : `${barKm} km`;
                text.setAttribute('x', (b[0] + 8).toFixed(1));
                text.setAttribute('y', (b[1] + 4).toFixed(1));
              }
              shown = true;
            }
          }
        }
        scaleGroup.style.opacity = shown ? '1' : '0';
      }

      const showCallouts = p.inWorkspace && !p.cleanHud && !p.cinemaActive;
      const findings = calloutsFor(nextBundle);
      const [lonMin, latMin, lonMax, latMax] = nextBundle.bbox;
      const lonSpan = Math.max(1e-4, lonMax - lonMin);
      const latSpan = Math.max(1e-4, latMax - latMin);

      const anchors: Array<{ ax: number; ay: number; bx: number; by: number; valid: boolean }> = [];
      const cardEstW = 232;
      const minCardLeftX = workspaceFrame ? workspaceFrame.left * viewportW + 12 : 24;
      const maxCardLeftX = Math.max(
        minCardLeftX,
        (workspaceFrame ? workspaceFrame.right * viewportW - 12 : viewportW - 356) - cardEstW,
      );
      const minCardTopY = workspaceFrame ? workspaceFrame.top * viewportH + 12 : 68;
      const maxCardTopY = Math.max(
        minCardTopY,
        workspaceFrame ? workspaceFrame.bottom * viewportH - 76 : Math.max(160, viewportH - 134),
      );
      const calloutMidX = workspaceFrame
        ? (workspaceFrame.left + workspaceFrame.right) * 0.5 * viewportW
        : viewportW * 0.44;

      for (let i = 0; i < 3; i++) {
        const f = findings[i];
        if (!showCallouts || !f) {
          anchors.push({ ax: 0, ay: 0, bx: 0, by: 0, valid: false });
          continue;
        }
        const u = THREE.MathUtils.clamp((f.lon - lonMin) / lonSpan, 0.04, 0.96);
        const v = THREE.MathUtils.clamp((f.lat - latMin) / latSpan, 0.04, 0.96);
        const wy = sampleCpuTerrainY(u, v) + 0.05;
        projVec.set(worldX(u), wy, worldZ(v)).project(camera);

        if (projVec.z >= 1.0 || projVec.z <= -1.0) {
          anchors.push({ ax: 0, ay: 0, bx: 0, by: 0, valid: false });
          continue;
        }
        const ax = (projVec.x * 0.5 + 0.5) * viewportW;
        const ay = (-projVec.y * 0.5 + 0.5) * viewportH;

        // Initial radial leader offsets, kept inside the workspace subject frame when one is set
        const dirSide = i === 1 ? -1 : ax + 108 > maxCardLeftX || ax > calloutMidX ? -1 : 1;
        const rawBx = dirSide > 0 ? ax + 56 : ax - 56 - cardEstW;
        const bx = THREE.MathUtils.clamp(rawBx, minCardLeftX, maxCardLeftX);
        const by = THREE.MathUtils.clamp(ay - (i === 0 ? 64 : i === 1 ? 48 : -44), minCardTopY, maxCardTopY);
        anchors.push({ ax, ay, bx, by, valid: true });
      }

      // 2-pass pairwise screen-space collision resolution between the 3 callout cards
      const minW = 240;
      const minH = 62;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < anchors.length; i++) {
          if (!anchors[i].valid) continue;
          for (let j = i + 1; j < anchors.length; j++) {
            if (!anchors[j].valid) continue;
            const dx = anchors[j].bx - anchors[i].bx;
            const dy = anchors[j].by - anchors[i].by;
            if (Math.abs(dx) < minW && Math.abs(dy) < minH) {
              const pushY = (minH - Math.abs(dy)) * 0.55 * (dy >= 0 ? 1 : -1);
              anchors[i].by = THREE.MathUtils.clamp(anchors[i].by - pushY, minCardTopY, maxCardTopY);
              anchors[j].by = THREE.MathUtils.clamp(anchors[j].by + pushY, minCardTopY, maxCardTopY);
            }
          }
        }
      }

      for (let i = 0; i < 3; i++) {
        const a = anchors[i];
        const pinEl = pinCrossRefs.current[i];
        const cardEl = calloutCardRefs.current[i];
        const lineEl = svgLinesRef.current[i];

        if (!a || !a.valid) {
          if (pinEl) pinEl.style.opacity = '0';
          if (cardEl) {
            cardEl.style.opacity = '0';
            cardEl.style.pointerEvents = 'none';
            // Hidden cards leave the tab order and the accessibility tree
            cardEl.style.visibility = 'hidden';
          }
          if (lineEl) lineEl.style.opacity = '0';
          continue;
        }

        if (pinEl) {
          pinEl.style.opacity = '1';
          pinEl.style.transform = `translate3d(${a.ax.toFixed(1)}px, ${a.ay.toFixed(1)}px, 0) translate(-50%, -50%)`;
        }
        if (cardEl) {
          cardEl.style.opacity = '1';
          cardEl.style.pointerEvents = 'auto';
          cardEl.style.visibility = 'visible';
          cardEl.style.transform = `translate3d(${a.bx.toFixed(1)}px, ${a.by.toFixed(1)}px, 0)`;
        }
        if (lineEl) {
          const elbowX = a.ax + (a.bx - a.ax) * 0.42;
          const elbowY = a.by + 22;
          const attachX = a.bx > a.ax ? a.bx : a.bx + (cardEl ? cardEl.offsetWidth : cardEstW);
          lineEl.setAttribute(
            'points',
            `${a.ax.toFixed(1)},${a.ay.toFixed(1)} ${elbowX.toFixed(1)},${elbowY.toFixed(1)} ${attachX.toFixed(1)},${elbowY.toFixed(1)}`,
          );
          lineEl.style.opacity = '1';
        }
      }

      // H. Emit Live Telemetry every ~320ms
      fpsFrames += 1;
      fpsAccumSec += dtSec;
      if (fpsAccumSec >= 0.32) {
        const instFps = fpsFrames / fpsAccumSec;
        smoothedFps = smoothedFps * 0.55 + Math.min(120, instFps) * 0.45;
        fpsFrames = 0;
        fpsAccumSec = 0;

        if (elapsedSec - lastTelemetryEmitSec >= 0.3) {
          lastTelemetryEmitSec = elapsedSec;
          const telemetry: EarthStageTelemetry = {
            fps: Math.round(smoothedFps),
            vertexCount:
              terrainMesh.geometry.getAttribute('position').count +
              skirtMesh.geometry.getAttribute('position').count,
            orthoResolution: nextBundle.orthoLabel,
            demResolution: nextBundle.demLabel,
            activeTheaterId: p.activeTheaterId,
            slewActive: slewActive || morphActive,
            cinemaProgress,
            wavePosition: 0,
            imageryAttribution: creditWithContext(nextBundle),
            verticalExaggeration: VERTICAL_EXAGGERATION,
            landingStandpoint: landingWorld && landingWorldPose ? landingWorldStats : undefined,
            intensityLegend: intensityLegendOf(nextBundle),
            realPass: realPassNow,
            lastSeen: lastSeenNow,
            passOnShow: passOnShowNow,
            regionGrid: p.regionGridDivisions ? regionGridOf(nextBundle, p.regionGridDivisions) : undefined,
          };
          p.onTelemetry?.(telemetry);
        }
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObs.disconnect();
      dprQuery?.removeEventListener('change', onDprChange);
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointerleave', onPointerLeave);
      dom.removeEventListener('wheel', onWheel);
      motionQuery.removeEventListener('change', onMotionChange);
      dom.removeEventListener('contextmenu', onContextMenu);

      domeGeom.dispose();
      domeMat.dispose();
      atmosphere.dispose();
      pedestalGeom.dispose();
      pedestalMat.dispose();
      terrainGeom.dispose();
      terrainMat.dispose();
      terrainDepthMat.dispose();
      skirtGeom.dispose();
      skirtMat.dispose();
      for (const tex of smokeHeightTextures) {
        tex.dispose();
      }
      fieldTex0.dispose();
      fieldTex1.dispose();
      detectionTex0.dispose();
      detectionTex1.dispose();
      footprintField.dispose();
      beliefField.dispose();
      lipariTex.dispose();
      hiResTerrainGeom?.dispose();
      hiResSkirtGeom?.dispose();
      shadowBaker.dispose();
      neutralAuxTex.dispose();
      whiteTex.dispose();
      for (const packed of packBundles.values()) {
        releasePack(packed);
      }
      packBundles.clear();
      contextTerrain.dispose();

      fleet.dispose();
      scene.environment = null;
      orbitEnvironment.dispose();

      // Every bundle, whichever cache holds it (the theater cache or the run cache), each resource once
      const disposedResources = new Set<unknown>();
      const disposeOnce = (resource: { dispose: () => void } | null | undefined) => {
        if (!resource || disposedResources.has(resource)) return;
        disposedResources.add(resource);
        resource.dispose();
      };
      for (const b of new Set([...bundleCache.values(), ...runCache.values(), ...retiredBundles, prevBundle, nextBundle])) {
        // Pack textures were released with the packs above
        if (!b.pack && b.lite === null) {
          disposeOnce(b.demTex);
          disposeOnce(b.satTex);
        }
        disposeOnce(b.fireHistory?.texture);
        disposeOnce(b.shadow);
      }

      pipeline.dispose();
      renderer.dispose();
      if (dom.parentElement === host) {
        host.removeChild(dom);
      }
      engineBridgeRef.current = null;
    };
  }, []);

  // Sync camera preset / Workspace entry-exit transitions
  useEffect(() => {
    engineBridgeRef.current?.applyCameraPreset();
  }, [props.cameraPreset, props.inWorkspace, props.mode]);

  // Sync Cinema Director [C] activation & smooth handoff
  useEffect(() => {
    engineBridgeRef.current?.syncCinemaStart(props.cinemaActive);
  }, [props.cinemaActive]);

  // Trigger Sub-Orbital Slew + Instant Cached Bundle Morph when activeTheaterId or slewRequest changes
  const lastSlewNonceRef = useRef<number | null>(null);
  const lastTheaterRef = useRef<TheaterId>(props.activeTheaterId);

  useEffect(() => {
    const bridge = engineBridgeRef.current;
    if (!bridge) return;

    const req = props.slewRequest;
    if (req && req.nonce !== lastSlewNonceRef.current) {
      lastSlewNonceRef.current = req.nonce;
      lastTheaterRef.current = req.targetTheaterId;
      bridge.triggerSlew(req.targetTheaterId);
      return;
    }

    if (props.activeTheaterId !== lastTheaterRef.current) {
      lastTheaterRef.current = props.activeTheaterId;
      bridge.triggerSlew(props.activeTheaterId);
    }
  }, [props.activeTheaterId, props.slewRequest]);

  // Hydrate the run's own files: its elevation grid, its imagery and its tensor
  useEffect(() => {
    const run: DynamicRegionRun | null = props.activeRun;
    const bridge = engineBridgeRef.current;
    if (!run || !bridge) return;

    let cancelled = false;
    const cachedByRun = bridge.takeRunBundle(run.run_id);
    if (cachedByRun) {
      // Morph when the terrain on screen is another region's. The page's theater id does not say
      // so after a custom search, which keeps the id of the theater it started from.
      bridge.activateBundle(cachedByRun, cachedByRun.regionId !== bridge.onScreenRegionId());
      return;
    }

    void (async () => {
      try {
        const prevRegionBundle = bridge.bundleCache.get(run.region.id);
        const hiresDemUrl = run.assets.dem_hires_f32_url
          ? assetAddress(propsRef.current, run.assets.dem_hires_f32_url)
          : null;
        const stdDemUrl = assetAddress(propsRef.current, run.assets.dem_f32_url);
        const satUrl = assetAddress(propsRef.current, run.assets.satellite_url);
        const tensorUrl = assetAddress(propsRef.current, run.assets.reconstruction_u8_url);

        const fetchDemBuffer = async (): Promise<ArrayBuffer | null> => {
          if (hiresDemUrl) {
            const hr = await fetch(hiresDemUrl).catch(() => null);
            if (hr && hr.ok) return hr.arrayBuffer();
          }
          const sr = await fetch(stdDemUrl).catch(() => null);
          return sr && sr.ok ? sr.arrayBuffer() : null;
        };

        const loadSatTexture = (): Promise<THREE.Texture | null> =>
          new Promise((resolve) => {
            bridge.texLoader.load(
              satUrl,
              (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.anisotropy = bridge.maxAnisotropy;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                tex.wrapS = THREE.ClampToEdgeWrapping;
                tex.wrapT = THREE.ClampToEdgeWrapping;
                resolve(tex);
              },
              undefined,
              () => resolve(null),
            );
          });

        const [demBuf, satTexLoaded, tensorResp] = await Promise.all([
          fetchDemBuffer(),
          loadSatTexture(),
          fetch(tensorUrl).catch(() => null),
        ]);

        const tensorBuf =
          tensorResp && tensorResp.ok ? await tensorResp.arrayBuffer() : null;

        if (cancelled) return;

        const knownProf = isKnownTheater(run.region.id)
          ? THEATER_PROFILES[run.region.id]
          : null;

        const demPack = demBuf
          ? createDemR32FTexture(new Float32Array(demBuf), true)
          : prevRegionBundle
            ? {
                texture: prevRegionBundle.demTex,
                aligned: prevRegionBundle.alignedDem,
                gridRes: prevRegionBundle.demGridRes,
                minElev: prevRegionBundle.minElevM,
                maxElev: prevRegionBundle.maxElevM,
              }
            : createDemR32FTexture(buildProceduralTheaterDem('plumas_ca', 256), false);

        const tensorPack = tensorBuf
          ? alignReconstructionTensor(new Uint8Array(tensorBuf), true)
          : prevRegionBundle
            ? { buffer: prevRegionBundle.tensor, frames: prevRegionBundle.frameCount }
            : { buffer: buildProceduralTheaterTensor('plumas_ca'), frames: FIELD_FRAME_COUNT };

        const finalSatTex =
          satTexLoaded ??
          prevRegionBundle?.satTex ??
          buildProceduralSatelliteTexture(
            knownProf ? knownProf.id : 'plumas_ca',
            demPack.aligned,
            demPack.gridRes,
            demPack.minElev,
            demPack.maxElev,
            bridge.maxAnisotropy,
          );

        const imgW =
          satTexLoaded &&
          typeof (satTexLoaded.image as { width?: number } | undefined)?.width === 'number'
            ? (satTexLoaded.image as { width: number }).width
            : 2048;

        const bbox = run.region.bbox;
        const observerDataset = run.observer_passes
          ? normalizeObserverDataset(run.observer_passes, bbox)
          : createFallbackObserverDataset(bbox);

        const found = findingsOf(
          run.region.id,
          bbox,
          demPack.aligned,
          demPack.gridRes,
          tensorPack.buffer,
          tensorPack.frames,
        );

        // The place's look comes from the run: a region whose lowest ground is at sea level has a coast
        const hasSeaCoast = run.region.min_elev_m <= 1.5;

        const hydratedBundle: CachedTheaterBundle = {
          key: `run-${run.run_id}`,
          regionId: run.region.id,
          runId: run.run_id,
          demTex: demPack.texture,
          alignedDem: demPack.aligned,
          demGridRes: demPack.gridRes,
          minElevM: Number.isFinite(run.region.min_elev_m)
            ? Math.min(demPack.minElev, run.region.min_elev_m)
            : demPack.minElev,
          maxElevM: Number.isFinite(run.region.max_elev_m)
            ? Math.max(demPack.maxElev, run.region.max_elev_m)
            : demPack.maxElev,
          satTex: finalSatTex,
          orthoLabel: satTexLoaded
            ? imgW >= 1600
              ? '2K'
              : '1K'
            : (prevRegionBundle?.orthoLabel ?? 'drawn stand-in'),
          demLabel: `${demPack.gridRes}²`,
          tensor: tensorPack.buffer,
          frameCount: tensorPack.frames,
          bbox,
          // The smoke's drift is drawing (no payload holds a wind): one direction for every place
          windDirUv: [...SMOKE_DRIFT_UV],
          hasSeaCoast,
          observerDataset,
          findings: found.anchors,
          callouts: found.callouts,
          fieldScale: parseFieldIntensityScale(run.encoding),
          residenceHours: parseResidenceHours(run.model) ?? undefined,
          fireHistory: null,
          ...liteShadingFields(
            Math.max(18.0, run.region.width_km || 60.0),
            Math.max(12.0, run.region.depth_km || bboxDepthKm(bbox)),
            run.assets.terrain_pack,
            imgW,
            satTexLoaded ? FALLBACK_IMAGERY_ATTRIBUTION : (prevRegionBundle?.attribution ?? ''),
          ),
        };

        bridge.storeRunBundle(run.region.id, run.run_id, hydratedBundle);

        // What the model believes between the passes: fetched once per run, after the run is on show
        const beliefInfo = parseBeliefFrames(run.belief_frames);
        const beliefStore = beliefStoreRef.current;
        if (beliefInfo && !beliefStore.has(run.run_id)) {
          void fetch(assetAddress(propsRef.current, beliefInfo.url))
            .then((resp) => (resp.ok ? resp.arrayBuffer() : null))
            .then((buf) => {
              if (!buf || buf.byteLength !== beliefInfo.steps * beliefInfo.nx * beliefInfo.ny * 2) return;
              beliefStore.set(run.run_id, { info: beliefInfo, bytes: new Uint8Array(buf) });
              while (beliefStore.size > 6) beliefStore.delete(beliefStore.keys().next().value as string);
            })
            .catch(() => undefined);
        }

        // Activate if this run matches the currently viewed theater or is a custom coordinate query
        const currentTarget = propsRef.current.activeTheaterId;
        if (!isKnownTheater(run.region.id) || run.region.id === currentTarget) {
          bridge.activateBundle(hydratedBundle, true);
        }
      } catch {
        // Retain cached or procedural bundle cleanly on transient network error
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.activeRun, props.apiBase]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label="3D terrain of the place, with the fire on it"
      onKeyDown={(e) => {
        if (!props.inWorkspace && e.key === 'Enter') {
          props.onEnterWorkspace?.();
        }
      }}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        outline: 'none',
        backgroundColor: '#080b11',
        cursor: props.inWorkspace ? 'grab' : 'pointer',
      }}
    >
      {/* Diegetic Collision-Resolved Ridge Callouts Overlay (Workspace only, hidden in Clean HUD & Cinema) */}
      <div
        aria-hidden={!props.inWorkspace || props.cleanHud || props.cinemaActive}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        <svg
          width="100%"
          height="100%"
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'visible',
            pointerEvents: 'none',
          }}
        >
          {[0, 1, 2].map((idx) => (
            <polyline
              key={idx}
              ref={(el) => {
                svgLinesRef.current[idx] = el;
              }}
              fill="none"
              stroke={
                renderedFindings[idx] && props.selectedFindingId === renderedFindings[idx].id
                  ? 'rgba(155, 227, 255, 0.88)'
                  : 'rgba(245, 246, 250, 0.34)'
              }
              strokeWidth="1"
              style={{ opacity: 0, transition: 'stroke 160ms ease' }}
            />
          ))}
          <g ref={scaleGroupRef} className="stage-scale" style={{ opacity: 0 }}>
            <path ref={scaleBarRef} fill="none" stroke="rgba(243, 244, 246, 0.72)" strokeWidth="1" />
            <text
              ref={scaleTextRef}
              fill="rgba(243, 244, 246, 0.86)"
              style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: '12px' }}
            />
          </g>
        </svg>

        {[0, 1, 2].map((idx) => {
          const finding = renderedFindings[idx];
          const isSelected = Boolean(finding && props.selectedFindingId === finding.id);
          const accentColor =
            finding?.kind === 'uncertainty'
              ? '#9be3ff'
              : finding?.kind === 'subpixel'
                ? '#ffb36b'
                : '#ff7849';

          return (
            <div key={idx}>
              <div
                ref={(el) => {
                  pinCrossRefs.current[idx] = el;
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '14px',
                  height: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: accentColor,
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  fontSize: '13px',
                  fontWeight: 600,
                  lineHeight: 1,
                  textShadow: '0 1px 6px rgba(0, 0, 0, 0.9)',
                  opacity: 0,
                  willChange: 'transform, opacity',
                }}
              >
                +
              </div>

              <button
                ref={(el) => {
                  calloutCardRefs.current[idx] = el;
                }}
                type="button"
                data-stage-ui="true"
                onClick={() => {
                  if (finding) {
                    props.onSelectFinding?.(finding);
                  }
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  minWidth: '188px',
                  maxWidth: '248px',
                  padding: '7px 10px',
                  textAlign: 'left',
                  borderRadius: 0,
                  border: isSelected
                    ? `1px solid ${accentColor}`
                    : '1px solid rgba(243, 244, 246, 0.24)',
                  background: 'rgba(10, 13, 19, 0.88)',
                  color: '#f3f4f6',
                  cursor: 'pointer',
                  opacity: 0,
                  visibility: 'hidden',
                  pointerEvents: 'none',
                  willChange: 'transform, opacity',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    fontFamily: "'Geist', -apple-system, sans-serif",
                    fontSize: '13px',
                    fontWeight: 500,
                    letterSpacing: '-0.01em',
                    color: '#f3f4f6',
                  }}
                >
                  <span>{finding?.title ?? ''}</span>
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: 0,
                      backgroundColor: accentColor,
                      flexShrink: 0,
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: '3px',
                    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                    fontSize: '12px',
                    fontVariantNumeric: 'tabular-nums',
                    color: accentColor,
                  }}
                >
                  {finding?.valueText ?? ''}
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default EarthCutawayStage;
