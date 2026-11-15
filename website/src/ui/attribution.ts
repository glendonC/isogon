import type { DynamicRegionRun } from '../stage/types';

/**
 * Imagery credit: the string the active run's terrain pack carries
 * (`assets.terrain_pack.ortho.attribution`), exactly as the source publishes it. The fallback is the credit of the
 * stand-in ground the stage draws before a run's pack loads (`ca_satellite.jpg`, a tile of the 2020 EOxCloudless
 * layer), in the words its licence asks for.
 */
export const FALLBACK_IMAGERY_CREDIT =
  'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)';

export function imageryCredit(run: DynamicRegionRun | null | undefined): string {
  const assets = run?.assets as unknown as Record<string, unknown> | undefined;
  const pack = assets?.terrain_pack as Record<string, unknown> | undefined;
  const ortho = pack?.ortho as Record<string, unknown> | undefined;
  const credit = ortho?.attribution;
  return typeof credit === 'string' && credit.trim() ? credit.trim() : FALLBACK_IMAGERY_CREDIT;
}
