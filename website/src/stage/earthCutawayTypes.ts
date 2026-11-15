import type {
  DynamicRegionRun,
  ObserverFilter,
  TerrainFindingCallout,
  WorkspaceMode,
} from './types';

/**
 * A place's id, as the regions registry gives it. Any id is valid: the stage takes a place's box,
 * terrain and look from the run it is given and keys nothing on the id's value.
 */
export type TheaterId = string;

/**
 * Camera presets of the workspace. `overview` and `nadir` show the place's box as a block on a
 * floor; `canyon` and `ridge` are close views with the land running to a horizon; `region` is
 * the whole box seen from higher with the land around it and no block edge or floor (where the
 * place has no land around its box to show, it falls back to the block).
 */
export type InspectorCameraPreset = 'overview' | 'canyon' | 'ridge' | 'nadir' | 'region';

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
  /** Always 0: it was the sensor curtain's place across the block, and no curtain is drawn. */
  wavePosition: number;
  /** Attribution of the imagery on screen, empty when the imagery is procedural. */
  imageryAttribution?: string;
  /**
   * Real runs: the files of the run on show that did not load and that nothing true stands in for.
   * The stage puts nothing drawn in their place and no other run's field: flat ground for the
   * elevation, ground of one plain tone for the imagery, no field, no estimate. The ground and its
   * picture belong to the place, so an earlier run of the same place may lend them, and then they
   * are not listed. Absent when nothing is missing.
   */
  missingFiles?: StageMissingFile[];
  /** Vertical exaggeration of the relief (one value for every region). */
  verticalExaggeration?: number;
  /**
   * The intensity scale of the run on screen, for the page's legend: what the colour scale shows
   * at its start, a quarter, half, three quarters and its top, in MW/km2. Values above the top are
   * drawn at the top ("and above").
   */
  intensityLegend?: { scale: 'linear' | 'log'; ticks: Array<{ at: number; mwPerKm2: number }> };
  /**
   * Real runs: the overpass on show. On the landing the stage chooses it. `pairedModis` is no
   * longer set: it named a second overpass drawn beside the sensor curtain, and no curtain is drawn.
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
  /** Real runs: the pass on show, and whether its detections are hidden from the model and the picture. */
  passOnShow?: { index: number; sensor: string; timeUtc: string; isDay: boolean; hidden: boolean };
  /**
   * Real runs, on a pass whose detections are hidden: the last pass before it that the stage shows,
   * whose detections are drawn as an afterglow, and how many hours before the pass on show it was.
   */
  lastSeen?: { index: number; sensor: string; timeUtc: string; hoursBefore: number };
  /** Landing world view only: the standpoint check of the region on screen. */
  landingStandpoint?: LandingStandpointCheck;
}

/** A file of a real run the stage could not load. */
export type StageMissingFile = 'elevation' | 'imagery' | 'field' | 'estimate';

/** The sensor curtain's seam on screen. No curtain is drawn: `visible` is always false. */
export interface CurtainScreenSeam {
  /** Seam point at the slab's near edge, on the terrain surface. */
  near: { x: number; y: number };
  /** Seam point at the slab's far edge, on the terrain surface. */
  far: { x: number; y: number };
  /** Which side of the near-to-far line shows raw 1 km MODIS. */
  modisSide: 'left' | 'right';
  visible: boolean;
}

/** One tile of a board (see StageTileBoard). */
export interface StageTile {
  /**
   * 0 to 1: how strongly the tile is marked as worth a look. The page says what it is (the model's
   * doubt in the tile, or the score an agent gave it); the stage only draws more or less of it.
   * Absent: unmarked.
   */
  level?: number;
  /** A look was spent on this tile. */
  looked?: boolean;
  /** The tile chosen at this step: the one an agent is taking now, or the one under keyboard focus. */
  chosen?: boolean;
  /** The tile cannot be looked at in this step. */
  closed?: boolean;
}

/** A board of tiles over the region's box, drawn on the terrain. At most 64 tiles. */
export interface StageTileBoard {
  /** Rows run north to south, columns west to east. Tile = row * cols + col. */
  rows: number;
  cols: number;
  /** One entry per tile in that order. A missing entry is a plain tile. */
  tiles: StageTile[];
  /** A tile can be picked now: the stage marks the tile under the pointer and reports hover and pick. */
  pickable: boolean;
}

/** Where a tile's label can sit: its north-west corner on the terrain surface, in viewport CSS px. */
export interface StageTileAnchor {
  tile: number;
  x: number;
  y: number;
  /** False when that corner is behind the camera or outside the viewport. */
  visible: boolean;
}

/**
 * One patch of the fire on show: cells that touch (by a side or a corner, on the grid the cells
 * are on; a detection counts for the squares its pixel lies on).
 */
export interface StageFirePatch {
  /**
   * CSS px of the viewport: the patch's point on the terrain surface. It is the patch's own cell
   * nearest to its centre (weighted by fire power), so it always lies on the patch.
   */
  x: number;
  y: number;
  /** CSS px: the screen box of the patch's cells. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** How many cells (detections, or the estimate's cells) the patch holds. */
  cells: number;
  /** False when the centre is behind the camera, off screen or behind a ridge. */
  visible: boolean;
}

/** Where the fire on show sits on screen (see `onFireAnchor`). */
export interface StageFireAnchor {
  /** The frame (pass index) the anchor describes. */
  frame: number;
  /**
   * What it was taken from: the pass's own detections (a pass on show, or a hidden pass once its
   * detections are laid on), or the estimate on a pass whose detections are hidden: the cells the
   * run says its model declared there (the frames on the terrain), or, for a run that gives no
   * such list, the cells inside the dotted line.
   */
  from: 'detections' | 'estimate';
  /** CSS px of the viewport: the centre of those cells on the terrain surface, weighted by fire power. */
  x: number;
  y: number;
  /** CSS px: the screen box of those cells. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** False when the centre is behind the camera, off screen or behind a ridge. */
  visible: boolean;
  /**
   * The patches the fire is made of, the one with the most cells first; the eight largest at
   * most. A label hangs on a patch, since the centre of two patches can lie on bare ground
   * between them.
   */
  patches?: StageFirePatch[];
}

export interface EarthCutawayStageProps {
  apiBase: string;
  /**
   * How the stage turns the address of a run's file into one it can fetch: the run's terrain,
   * imagery and field (`assets.*`), the terrain pack's and the context terrain's files, the belief
   * frames. The page's client maps the address to a live one or to a recorded file. Absent: the
   * address is joined to `apiBase`. The site's own files (the stand-in terrain, the spacecraft
   * models) are loaded from the site and do not pass through it.
   */
  resolveAsset?: (address: string) => string;
  inWorkspace: boolean;
  mode: WorkspaceMode;
  activeTheaterId: TheaterId;
  activeRun: DynamicRegionRun | null;
  timeProgress: number;
  observerFilter: ObserverFilter;
  showUncertainty: boolean;
  holdoutViirs: boolean;
  sensitivityThreshold: number;
  /** Not used: it placed the sensor curtain across the block, and no curtain is drawn. */
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
  /**
   * Landing only, real runs. The pass the landing shows: 0 is the run's first pass, and a fraction is
   * a time between two passes. Absent: the stage chooses the pass (`telemetry.realPass`). The
   * standpoint does not move with it.
   */
  landingPass?: number;
  /**
   * Landing only, real runs. The stage tours the run by itself: it rests on the pass it chose, then
   * steps slowly through the run's night passes in their order, the hidden ones among them, the
   * lights fading out and in, and comes round again. `telemetry.passOnShow` names the pass on show.
   * Ignored while `landingPass` is given, and under reduced motion.
   */
  landingTour?: boolean;
  /**
   * Real runs. When the time on show reaches another pass, the pass arrives as a scan: a front
   * crosses the region along the pass's ground track and what the pass brought appears behind it.
   * Off by default. Never under reduced motion.
   */
  passScan?: boolean;
  /**
   * Real runs. Draws the outline of each detection's own pixel around its light, on the landing and
   * in the workspace (a 1 km MODIS pixel then reads as coarse beside the model's 375 m cells).
   * Off by default.
   */
  detectionPixels?: boolean;
  /** Called once with `visible: false`: no curtain is drawn, so there is no seam to follow. */
  onCurtainScreen?: (seam: CurtainScreenSeam) => void;
  /** Asks for `telemetry.regionGrid` with this many cells each way (1 to 32). */
  regionGridDivisions?: number;
  /** Where the fire on show sits on screen, every rendered frame in the workspace. Null when nothing is drawn. */
  onFireAnchor?: (anchor: StageFireAnchor | null) => void;
  /** A board of tiles over the region's box, drawn on the terrain. Null or absent: no board. */
  tileBoard?: StageTileBoard | null;
  /** The tile under the pointer, or null. Called on change, only while `tileBoard.pickable` is true. */
  onTileHover?: (tile: number | null) => void;
  /** A click or tap on a tile, only while `tileBoard.pickable` is true. */
  onTilePick?: (tile: number) => void;
  /** Screen point of each tile's label corner, every rendered frame while a board is set. */
  onTileAnchors?: (anchors: StageTileAnchor[]) => void;
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
