import type {
  DynamicRegionRun,
  ObserverFilter,
  TerrainFindingCallout,
  WorkspaceMode,
} from './types';

export type TheaterId =
  | 'plumas_ca'
  | 'lytton_bc'
  | 'evia_greece'
  | 'blue_mountains_au';

export type InspectorCameraPreset = 'overview' | 'canyon' | 'ridge' | 'nadir';

export type RecordEraJumpId = '2006_modis' | '2012_snpp' | '2026_fused';

export interface OrbitalSlewRequest {
  nonce: number;
  targetTheaterId: TheaterId;
  eraLabel?: string;
}

/** What the standpoint search of the landing world view found on the terrain it chose from. */
export interface LandingStandpointCheck {
  /** Share of screen columns in which no ground rises to eye level before the terrain data ends. */
  floorShare: number;
  /**
   * Share of screen columns whose ground stays under eye level to the end of the pack: open water
   * at its edge, or, where context terrain is announced, land or sea that runs on to the horizon.
   */
  seaShare: number;
  /** Ridge lines that come into view behind the fire, over the middle of the frame: mean and most. */
  ridgeLines: number;
  ridgeLinesMost: number;
  /** Share of the burning ground of the moment on show that is in the frame with nothing in front. */
  fireShare: number;
  /** Share of the frame that burning ground in view covers (overlap not removed). */
  fireFrameShare: number;
  /** Nearest ground the imagery can carry at the chosen lens, world units. */
  carryDistance: number;
  /** Mean height of the skyline above eye level, degrees. */
  skylineDeg: number;
  /** Height of the eye above the ground under it, metres at true scale. */
  eyeAboveGroundM: number;
  /** Distance from the eye to the nearest ground in the frame, world units. */
  nearGround: number;
}

export interface EarthStageTelemetry {
  fps: number;
  vertexCount: number;
  orthoResolution: string;
  demResolution: string;
  activeTheaterId: TheaterId;
  slewActive: boolean;
  cinemaProgress: number;
  wavePosition: number;
  /** Attribution of the imagery on screen, empty when the imagery is procedural. */
  imageryAttribution?: string;
  /** Vertical exaggeration of the relief (one value for every region). */
  verticalExaggeration?: number;
  /**
   * The intensity scale of the run on screen, for the page's legend: what the colour scale shows
   * at its start, a quarter, half, three quarters and its top, in MW/km2. Values above the top are
   * drawn at the top ("and above").
   */
  intensityLegend?: { scale: 'linear' | 'log'; ticks: Array<{ at: number; mwPerKm2: number }> };
  /**
   * Real runs: the overpass on show. On the landing the stage chooses it (the night VIIRS overpass
   * with the most detections) and, when that overpass has no MODIS detections, shows the MODIS
   * overpass nearest in time on the raw side: `pairedModis`. The legend has to name both times.
   */
  realPass?: {
    index: number;
    sensor: string;
    timeUtc: string;
    isDay: boolean;
    detections: number;
    pairedModis?: { index: number; sensor: string; timeUtc: string; detections: number };
  };
  /**
   * Only when `regionGridDivisions` is set: the region's box as a grid of points on the terrain,
   * projected to the viewport in CSS px. `points` has (divisions + 1) squared entries, row by row
   * from the north edge to the south edge, each row from west to east. A point behind the camera
   * is null. Sent with the rest of the telemetry (about three times a second).
   */
  regionGrid?: { divisions: number; points: Array<[number, number] | null> };
  /** Landing world view only: the standpoint check of the region on screen. */
  landingStandpoint?: LandingStandpointCheck;
}

export interface CurtainScreenSeam {
  /** Seam point at the slab's near edge, on the terrain surface. */
  near: { x: number; y: number };
  /** Seam point at the slab's far edge, on the terrain surface. */
  far: { x: number; y: number };
  /** Which side of the near-to-far line shows raw 1 km MODIS. */
  modisSide: 'left' | 'right';
  visible: boolean;
}

export interface EarthCutawayStageProps {
  apiBase: string;
  inWorkspace: boolean;
  mode: WorkspaceMode;
  activeTheaterId: TheaterId;
  activeRun: DynamicRegionRun | null;
  timeProgress: number;
  observerFilter: ObserverFilter;
  showUncertainty: boolean;
  holdoutViirs: boolean;
  sensitivityThreshold: number;
  cutawaySplit: number | null;
  cameraPreset: InspectorCameraPreset;
  cinemaActive: boolean;
  cleanHud: boolean;
  slewRequest: OrbitalSlewRequest | null;
  selectedFindingId: string | null;
  onSelectFinding?: (finding: TerrainFindingCallout) => void;
  onEnterWorkspace?: () => void;
  onCinemaStepTheater?: (nextTheaterId: TheaterId) => void;
  onTelemetry?: (telemetry: EarthStageTelemetry) => void;
  /**
   * Landing page view. `world` (the default): the camera stands inside the landscape and the terrain
   * runs to a haze horizon under the sky, with no slab edge, block side, floor, grid or ring on
   * screen. `slab`: the view of the whole block on a floor.
   */
  landingView?: 'world' | 'slab';
  /**
   * Viewport rectangle (fractions 0..1, origin top-left). In the `world` view it is the rectangle
   * that must stay calm for type: the stage keeps terrain below its bottom edge across its width,
   * so it holds sky and haze. In the `slab` view it is where the slab should sit.
   */
  landingSubjectFrame?: { left: number; top: number; right: number; bottom: number };
  /** Landing only. Projected sensor curtain seam in viewport CSS px, called each rendered frame. */
  onCurtainScreen?: (seam: CurtainScreenSeam) => void;
  /** Asks for `telemetry.regionGrid` with this many cells each way (1 to 32). */
  regionGridDivisions?: number;
  /** Workspace only. Viewport rectangle (fractions 0..1) the slab should stay inside, so HUD columns stay clear. */
  workspaceSubjectFrame?: { left: number; top: number; right: number; bottom: number };
}

export interface StaticTheaterMeta {
  id: TheaterId;
  indexCode: string;
  shortLabel: string;
  title: string;
  regionTag: string;
  coordsLabel: string;
  centerLat: number;
  centerLon: number;
  eventYear: string;
  sensorNote: string;
}

export const THEATER_CATALOG: readonly StaticTheaterMeta[] = [
  {
    id: 'plumas_ca',
    indexCode: '01',
    shortLabel: 'Feather River, CA',
    title: 'Feather River Canyon, CA',
    regionTag: 'PLUMAS, SIERRA NEVADA',
    coordsLabel: '40.05°N, 121.18°W',
    centerLat: 40.05,
    centerLon: -121.18,
    eventYear: '2021 Dixie Corridor',
    sensorNote: 'North Fork granite gorge, 1 km MODIS smear vs 375 m canyon fireline',
  },
  {
    id: 'lytton_bc',
    indexCode: '02',
    shortLabel: 'Lytton Gorge, BC',
    title: 'Lytton & Fraser Gorge, BC',
    regionTag: 'FRASER CANYON, BC',
    coordsLabel: '50.23°N, 121.58°W',
    centerLat: 50.23,
    centerLon: -121.58,
    eventYear: '2021 Fraser Canyon Complex',
    sensorNote: '2,860 m Coast Mountain relief, steep upslope canyon advection',
  },
  {
    id: 'evia_greece',
    indexCode: '03',
    shortLabel: 'Northern Evia, GR',
    title: 'Northern Evia Island, Greece',
    regionTag: 'AEGEAN COAST, EUBOEA',
    coordsLabel: '38.88°N, 23.32°E',
    centerLat: 38.88,
    centerLon: 23.32,
    eventYear: '2021 Evia Coastal Crown Fire',
    sensorNote: '48° off-nadir MODIS coastal water spill vs 375 m land-masked front',
  },
  {
    id: 'blue_mountains_au',
    indexCode: '04',
    shortLabel: 'Blue Mountains, AU',
    title: 'Grose Valley & Blue Mountains, NSW',
    regionTag: 'SANDSTONE ESCARPMENT, NSW',
    coordsLabel: '33.62°S, 150.38°E',
    centerLat: -33.62,
    centerLon: 150.38,
    eventYear: '2019-2020 Gospers Escarpment',
    sensorNote: 'Vertical sandstone cliff shadows, night sub-canopy eucalyptus fire',
  },
];
