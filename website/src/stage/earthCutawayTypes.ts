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
  /**
   * The share of the device's pixel ratio the stage draws at: 1, or less while frames run slow on this
   * machine. Shown nowhere on the page.
   */
  renderScale?: number;
  /** True where the stage measured a slow page thread and took the smaller ground pictures. */
  slowDevice?: boolean;
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
  /**
   * While `dayPicture` is asked for: the photograph on show (or being fetched, or missing), its
   * satellite as the backend names it, its kind and its UTC day, and whether it stands in for a
   * hidden satellite's own (then it is Aqua's).
   */
  dayPicture?: {
    state: 'loading' | 'shown' | 'missing';
    platform: string;
    kind: 'true_color' | 'false_color';
    day: string;
    insteadOfHidden: boolean;
  };
  /**
   * The stage's picture: `holding` while its cover holds (its first picture not yet whole), `fading` while
   * the cover lifts (FILM_FADE_SECONDS), `shown` once the picture is fully in. The same on the page and in
   * the film presentation. A film's first shot starts on `shown`.
   */
  picture?: 'holding' | 'fading' | 'shown';
  /** The film's camera move running, and how far through it is (0 to 1; 1 holds the last pose). */
  film?: { move: StageFilmMove; progress: number };
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
/** The fields of `GET /api/burned`'s answer the stage reads (isogon-notes/harmonize/BURNED-shape.md). */
export interface StageBurnedArea {
  region_id?: string;
  /** The box asked for: west, south, east, north. */
  box: [number, number, number, number];
  /** The run's window, UTC; end exclusive. */
  window: { start: string; end: string };
  /** The months read: `start` is the first day, from which `day_png`'s days count. */
  span: { start: string };
  grid: {
    cell_km?: number;
    nx: number;
    ny: number;
    /** The picture on the ground: west, south, east, north (up to a cell past the box's east and north). */
    bounds?: [number, number, number, number];
  };
  /** The day of burn per cell, from `span.start` (1 is that day, 0 not burned): a grey PNG data URL. */
  day_png: string;
}

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

/**
 * A camera move for the film, one for each of the four steps (see `filmMove`):
 *   record    the whole box on its land, a slow turn of about seven degrees in twelve seconds
 *   estimate  a slow push on the fire, from a little farther than the close view to a little
 *             nearer, in nine seconds
 *   test      a hold on the fire, at the push's last pose, through the reveal
 *   play      from that pose, a rise to the whole box on its land in five seconds, then a hold
 *   turn      from wherever the camera stands, a slow turn of about seven degrees in twelve seconds
 *             around the point it looks at, its framing held while the passes play under it (the
 *             close view does not re-aim on each pass); a `test` after it holds its last pose
 */
export type StageFilmMove = 'record' | 'estimate' | 'test' | 'play' | 'turn';

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
   * Once, when the stage's first picture is whole (the ground's shape, its imagery, the land around and the
   * fire's light in) and its cover starts to lift. The same moment is on `stageReady()`, the window event
   * `isogon:stage-ready` and the root's `data-stage="ready"` (see ./stageReady).
   */
  onPictureReady?: () => void;
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
   * The stage stands behind a screen of the page (the Record): it rests dark and calm, by night on the
   * landing's own pass (its lights on the ground), with no estimate drawn (no frames, no dotted line)
   * and no film move, whatever pass or step the page holds. Absent or false: as before.
   */
  backdrop?: boolean;
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
  /**
   * Real runs. Draws the estimate's squares sized by chance: one square in each cell of the
   * model's grid, its area growing with the probability that the cell burns. Off by default:
   * the estimate is then the open frames of the cells the model declared burning at a hidden
   * pass and the dotted line around ground that may burn.
   */
  chanceSquares?: boolean;
  /**
   * Real runs, in the workspace. Lays NASA's photograph of the box for the UTC day of the pass on
   * show on the ground in place of the box's own picture: the daily true-colour or false-colour
   * (MODIS bands 7, 2, 1: burned ground brown, fire red) composite of daytime swaths, from the
   * backend's `/api/gibs/day`. The satellite is that of the pass on show; on a pass whose
   * detections are hidden, Aqua's (the coarse satellite), never the hidden satellite's. While
   * it is shown the ground is drawn by day. `telemetry.dayPicture` says which photograph is on
   * show. Off by default.
   */
  dayPicture?: 'true_color' | 'false_color' | null;
  /**
   * Runs a camera move for the film. Each move is a function of the time since it began, aimed
   * from the fire on show and the presets, so it is the same every time it runs; it starts when
   * the value changes and holds its last pose when done. `auto` picks the move from what is on
   * the stage (a board: play; detections laid on after scoring: test; the workspace: estimate;
   * the landing: record). A drag or a wheel ends it. Without this prop the stage reads the
   * page address's parameter `film` (the same values), so a recorder can start it from a link.
   */
  filmMove?: StageFilmMove | 'auto' | null;
  /** Where the fire on show sits on screen, every rendered frame in the workspace. Null when nothing is drawn. */
  onFireAnchor?: (anchor: StageFireAnchor | null) => void;
  /** A board of tiles over the region's box, drawn on the terrain. Null or absent: no board. */
  tileBoard?: StageTileBoard | null;
  /**
   * NASA's burned-area map of the run's box (MCD64A1), to lay on the terrain after the reveal: the answer
   * of `GET /api/burned` for the run's place and window, as it comes. Null or absent: none drawn. The
   * stage draws what burned in the run's window as the scar, what burned before it darker and what burned
   * after it to the month's end lighter, with an edge line, under the estimate's frames and the revealed
   * squares. A run of another place, or a simulated run, draws nothing.
   */
  burnedArea?: StageBurnedArea | null;
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
