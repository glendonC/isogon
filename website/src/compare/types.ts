import type { ReactNode } from 'react';

/**
 * The compare plane: several terrain cut-outs on one isometric plane, so that places or versions of one fire can
 * be compared side by side. This file is what the page gives the plane and what the plane reports back.
 */

/** West, south, east, north, in degrees. */
export type Box = [number, number, number, number];

/** Where a block's ground comes from. Addresses are given as an answer names them and resolved by the page's client. */
export interface CompareGround {
  /** Elevation: a square little-endian float32 grid, metres, row 0 north (a run's `assets.dem_hires_f32_url`). */
  elevationUrl: string;
  /**
   * The image over the same box: the run's terrain pack image when the run names one, else its
   * `assets.satellite_url`. Null, or an address a recorded page withholds, draws the relief alone.
   */
  imageUrl: string | null;
  /** Whose image it is, as the run says, for the page's credit. */
  imageCredit?: string | null;
  /** The box both cover. */
  box: Box;
  /** Its size on the ground, km. */
  widthKm: number;
  depthKm: number;
  /** The part of the box to show. Default the whole box. */
  cut?: Box;
}

/** One FIRMS row at its reported footprint. */
export interface DetectionRow {
  lon: number;
  lat: number;
  scanKm: number;
  trackKm: number;
  /** Bearing of the scan axis, degrees clockwise from north. Absent: drawn east to west. */
  bearingDeg?: number | null;
}

/** FIRMS rows, each at its reported footprint. */
export interface DetectionsMark {
  kind: 'detections';
  /** The instrument the rows are from. */
  instrument: 'modis' | 'viirs';
  rows: DetectionRow[];
  /**
   * The data colour. `instrument` (the default) tells the two instruments apart: the coarse instrument's colour for
   * MODIS, a detection's for VIIRS. `detection` draws either as a detection, where the fire is the subject and
   * the instrument is not.
   */
  ink?: 'instrument' | 'detection';
  /**
   * Hollow footprints, solid ones, or a wash: a faint pane per footprint with no line, for many passes laid over
   * each other, so that ground detected often reads stronger. Default: hollow for MODIS, solid for VIIRS.
   */
  draw?: 'outline' | 'filled' | 'wash';
  /** `quiet` thins the ink, for context under other marks. */
  weight?: 'full' | 'quiet';
}

/** The model's own grid: `nx` columns from the west, `ny` rows from the north, over `box`. */
export interface EstimateGrid {
  nx: number;
  ny: number;
  box: Box;
}

/**
 * The model's estimate: one ink square per cell of the model's own grid, its area by the probability that the
 * cell burns, inside a dotted line where that probability reaches 2 percent.
 */
export interface EstimateMark {
  kind: 'estimate';
  grid: EstimateGrid;
  /** The address of a run's belief file with the step to show, or the bytes of one step (one byte per cell, 0 to 255). */
  source: { url: string; step: number; steps: number } | { probability: Uint8Array; intensity?: Uint8Array };
  /** Open frames in place of squares at one half or more: what the model holds for a hidden pass. */
  open?: boolean;
  /**
   * Cells to frame in the estimate's ink (row times `nx` plus column, row 0 north): the cells the model declared for
   * a hidden pass, which are what the test sets against the hidden detections. Each gets a frame the size of its cell.
   */
  frames?: number[];
}

/** The board of a round: tile lines in ink, and brackets on the tiles looked at. */
export interface TilesMark {
  kind: 'tiles';
  rows: number;
  cols: number;
  /** Tile indices (row major, row 0 north) that carry brackets. */
  looked?: number[];
  /** Dim the ground of every tile that was not looked at, so that where a player looked reads at a glance. Drawing. */
  veil?: boolean;
}

export type CompareMark = DetectionsMark | EstimateMark | TilesMark;

export interface CompareLabel {
  /** One line: a period, a player, what the block shows. */
  title: string;
  /** Up to three short lines of facts. */
  lines?: string[];
}

/** A point on the ground the page wants a screen position for. `text` is drawn by the default label. */
export interface ComparePin {
  id: string;
  lon: number;
  lat: number;
  text?: string;
}

export type CompareState = 'idle' | 'selected' | 'dimmed' | 'withheld';

export interface CompareBlock {
  /** Stable. Used in every report back. */
  id: string;
  ground: CompareGround;
  /** Drawn in this order, on the ground. */
  marks: CompareMark[];
  label: CompareLabel;
  /** Default `idle`. */
  state?: CompareState;
  /** Darken the image, for a night pass or to let the marks lead. */
  night?: boolean;
  pins?: ComparePin[];
}

export interface CompareAnchor {
  id: string;
  /** Where the label hangs: under the block's lowest corner. CSS pixels from the plane's top left. */
  x: number;
  y: number;
  /** The block's bounds on screen. */
  rect: { left: number; top: number; width: number; height: number };
  /** Each pin of the block, on screen. */
  pins: { id: string; x: number; y: number }[];
  /** False until the block's files have arrived. */
  ready: boolean;
  /** False when the relief alone is drawn because the image was not given or not recorded. */
  image: boolean;
}

/** The plane's one scale bar: a round length laid along the ground beside the first block. CSS pixels. */
export interface CompareScaleBar {
  km: number;
  /** The bar's two ends on screen. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** A short tick across each end, along the ground. */
  ticks: [{ x: number; y: number }, { x: number; y: number }][];
}

export interface ComparePlaneProps {
  /** The cut-outs, in reading order. One to nine. */
  blocks: CompareBlock[];
  /** Blocks per row. Default: one row up to four blocks, rows of three above that. */
  perRow?: number;
  /** Pixels kept free under each row for labels. Default 88. */
  labelSpace?: number;
  /** The block under the pointer or holding the keyboard's place, or null. */
  onHover?: (id: string | null) => void;
  /** A click, or Enter on a block. */
  onPick?: (id: string) => void;
  /** Screen points per block, sent after every layout. */
  onAnchors?: (anchors: CompareAnchor[]) => void;
  /** Draw the label yourself. Without it the plane draws `label` under each block. */
  renderLabel?: (block: CompareBlock, anchor: CompareAnchor, hovered: boolean) => ReactNode;
  /** Set the default labels on a plate, for a plane over a picture. */
  labelPlate?: boolean;
  /** The scale bar: every block is at one scale, and the bar says which. Default true. */
  scaleBar?: boolean;
  /** A name for the whole plane, for a screen reader. */
  ariaLabel?: string;
  className?: string;
}
