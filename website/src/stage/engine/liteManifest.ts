import type { TerrainPackManifest } from './terrainPack';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isUrlEntry(v: unknown): v is { url: string; size: number } {
  return isRecord(v) && typeof v.url === 'string' && typeof v.size === 'number' && Number.isFinite(v.size);
}

/**
 * The pack's small twin (`lite`: the same ground and registration at 256 elevation posts, a 1024 picture, a 512
 * aux picture and a small land around, about 2 MB in all), as a manifest of the same shape as the pack's, or null
 * where the pack has none. The stage draws it first, so its first picture comes over a slow network in seconds,
 * and takes the full pack after.
 */
export function liteManifestOf(m: TerrainPackManifest | null): TerrainPackManifest | null {
  const lite = (m as unknown as { lite?: unknown } | null)?.lite;
  if (!m || !isRecord(lite) || !isUrlEntry(lite.dem) || !isUrlEntry(lite.ortho) || !isUrlEntry(lite.aux)) return null;
  const aux = lite.aux as unknown as TerrainPackManifest['aux'];
  return {
    ...m,
    dem: lite.dem as unknown as TerrainPackManifest['dem'],
    ortho: { ...(lite.ortho as unknown as TerrainPackManifest['ortho']), attribution: m.ortho.attribution },
    ortho_fallback: undefined,
    ortho_detail: undefined,
    aux: { ...aux, channels: aux.channels ?? m.aux.channels },
    context: isRecord(lite.context) ? lite.context : undefined,
  };
}
