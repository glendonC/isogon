import { SLAB_D, SLAB_W } from '../earthCutawayShaders';

/**
 * Map frame of the terrain slab.
 *
 * Horizontal scale is the same east-west and north-south, so the slab takes the aspect ratio of the
 * region instead of stretching every region onto one fixed rectangle. The slab keeps a constant
 * footprint area (that of the reference SLAB_W x SLAB_D rectangle) so camera presets stay valid.
 *
 * Relief uses ONE vertical exaggeration factor for every region. It is a display choice and must
 * be stated wherever the stage is described.
 */
export const VERTICAL_EXAGGERATION = 2.0;

const SLAB_AREA = SLAB_W * SLAB_D;
const MIN_ASPECT = 0.62;
const MAX_ASPECT = 1.75;

export interface SlabFrame {
  /** World units east-west and north-south. */
  width: number;
  depth: number;
  /** World units per metre on x (east), y (up) and z (south). */
  unitsPerMetre: [number, number, number];
}

export function computeSlabFrame(widthKm: number, depthKm: number): SlabFrame {
  const wKm = Math.max(1, widthKm);
  const dKm = Math.max(1, depthKm);
  const aspect = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, wKm / dKm));
  const width = Math.sqrt(SLAB_AREA * aspect);
  const depth = SLAB_AREA / width;
  const upmX = width / (wKm * 1000);
  const upmZ = depth / (dKm * 1000);
  const upmY = Math.sqrt(upmX * upmZ) * VERTICAL_EXAGGERATION;
  return { width, depth, unitsPerMetre: [upmX, upmY, upmZ] };
}

/** Height above the slab datum in world units for an elevation in metres. */
export function elevationToWorldY(
  elevM: number,
  minElevM: number,
  maxElevM: number,
  frame: SlabFrame,
): number {
  const span = Math.max(350.0, maxElevM - minElevM);
  const above = Math.min(span * 1.15, Math.max(0.0, elevM - minElevM));
  return above * frame.unitsPerMetre[1];
}
