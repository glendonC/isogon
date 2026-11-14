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
}

/**
 * Landing explode prototype. One anchor per plate, bottom to top:
 * `elevation`, `imagery`, `modis`, `viirs`, `record`. Viewport CSS px.
 */
export interface ExplodeAnchor {
  id: string;
  x: number;
  y: number;
  visible: boolean;
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
  /** Viewport rectangle (fractions 0..1, origin top-left) where the terrain subject should sit on the landing page. */
  landingSubjectFrame?: { left: number; top: number; right: number; bottom: number };
  /** Landing only. Projected sensor curtain seam in viewport CSS px, called each rendered frame. */
  onCurtainScreen?: (seam: CurtainScreenSeam) => void;
  /** Workspace only. Viewport rectangle (fractions 0..1) the slab should stay inside, so HUD columns stay clear. */
  workspaceSubjectFrame?: { left: number; top: number; right: number; bottom: number };
  /**
   * Landing only, prototype, off when absent. 0 is the slab as it is; 1 separates it into five
   * plates: elevation, imagery, MODIS 1 km detections, VIIRS 375 m detections, calibrated 375 m record.
   */
  landingExplode?: number;
  /** Landing only. One anchor per plate (its leftmost corner on screen), each rendered frame while exploded. */
  onExplodeAnchors?: (anchors: ExplodeAnchor[]) => void;
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
