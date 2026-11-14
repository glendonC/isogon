import type { DynamicRegionRun } from '../stage/types';

/**
 * Imagery credit as CONTRACT 1a defines it: the string the active run's terrain pack carries
 * (`assets.terrain_pack.ortho.attribution`), exactly as the source publishes it. The fallback is the
 * contract's current published credit for Esri World Imagery, used when no run or no pack is loaded.
 */
export const FALLBACK_IMAGERY_CREDIT =
  'Esri, Vantor, Earthstar Geographics, and the GIS User Community';

export function imageryCredit(run: DynamicRegionRun | null | undefined): string {
  const assets = run?.assets as unknown as Record<string, unknown> | undefined;
  const pack = assets?.terrain_pack as Record<string, unknown> | undefined;
  const ortho = pack?.ortho as Record<string, unknown> | undefined;
  const credit = ortho?.attribution;
  return typeof credit === 'string' && credit.trim() ? credit.trim() : FALLBACK_IMAGERY_CREDIT;
}
