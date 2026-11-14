import * as THREE from 'three';
import { createDemR32FTexture } from '../earthCutawayShaders';

/**
 * Consumer side of terrain pack v1 (CONTRACT section 1).
 *
 * Registration as stated by the producer (terrain-assets T1): every raster covers the same bbox as
 * `dem_hires_f32.bin`; row 0 is north, column 0 is west. The DEM is node registered (first and last
 * samples on the bbox edges), ortho and aux are pixel registered images, so plain 0..1 plane UVs
 * line up once the images are flipped vertically at decode time (image row 0 = north = v 1).
 *
 * Aux channels: r = normal x (east), g = normal z (south), b = sky view (1 = open sky),
 * a = canopy index. Normals are unit normals of the true-scale terrain packed as n * 0.5 + 0.5.
 * The png must be decoded without premultiplied alpha and without colour conversion, otherwise
 * canopy = 0 texels lose their normal and sky view values.
 */
export interface TerrainPackManifest {
  version: number;
  tier: string;
  extent_km: [number, number];
  elev_range_m: [number, number];
  dem: { url: string; size: number; format: string };
  ortho: {
    url: string;
    size: number;
    zoom?: number;
    gsd_m?: number;
    source?: string;
    attribution?: string;
  };
  ortho_fallback?: { url: string; size: number };
  ortho_detail?: Array<{
    url: string;
    size: number;
    zoom?: number;
    gsd_m?: number;
    uv_rect: [number, number, number, number];
  }>;
  aux: { url: string; size: number; channels?: Record<string, string> };
  sun: { azimuth_deg: number; elevation_deg: number };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isUrlEntry(v: unknown): v is { url: string; size: number } {
  return isRecord(v) && typeof v.url === 'string' && v.url.length > 0 && typeof v.size === 'number';
}

function isPair(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** Returns the manifest when it is a well-formed version 1 pack, otherwise null (use the fallback). */
export function parseTerrainPackManifest(raw: unknown): TerrainPackManifest | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  if (!isUrlEntry(raw.dem) || !isUrlEntry(raw.ortho) || !isUrlEntry(raw.aux)) return null;
  if (!isPair(raw.extent_km) || !isPair(raw.elev_range_m)) return null;
  const sun = raw.sun;
  if (
    !isRecord(sun) ||
    typeof sun.azimuth_deg !== 'number' ||
    typeof sun.elevation_deg !== 'number' ||
    !Number.isFinite(sun.azimuth_deg) ||
    !Number.isFinite(sun.elevation_deg)
  ) {
    return null;
  }
  return raw as unknown as TerrainPackManifest;
}

export interface LoadedTerrainPack {
  manifest: TerrainPackManifest;
  demTexture: THREE.DataTexture;
  alignedDem: Float32Array;
  demGridRes: number;
  minElevM: number;
  maxElevM: number;
  orthoTexture: THREE.Texture;
  orthoSize: number;
  auxTexture: THREE.Texture;
  attribution: string;
  dispose: () => void;
}

export interface TerrainPackLoadOptions {
  resolveUrl: (rawUrl: string) => string;
  maxTextureSize: number;
  maxAnisotropy: number;
  /** Returns true once the caller no longer wants the result. */
  isCancelled?: () => boolean;
}

function loadBitmap(url: string, options: ImageBitmapOptions): Promise<ImageBitmap | null> {
  return new Promise((resolve) => {
    const loader = new THREE.ImageBitmapLoader();
    loader.setCrossOrigin('anonymous');
    loader.setOptions(options);
    loader.load(
      url,
      (bitmap) => resolve(bitmap),
      undefined,
      () => resolve(null),
    );
  });
}

function bitmapTexture(bitmap: ImageBitmap): THREE.Texture {
  const tex = new THREE.Texture(bitmap as unknown as HTMLImageElement);
  // The bitmap was flipped at decode time; three cannot flip an ImageBitmap at upload.
  tex.flipY = false;
  tex.premultiplyAlpha = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  // Free the decoded pixels once they are on the GPU (an 8192 ortho is 256 MB of RGBA).
  tex.onUpdate = () => {
    bitmap.close();
  };
  tex.needsUpdate = true;
  return tex;
}

/** Loads one pack image (for example a zoom 16 detail inset) as a mipmapped sRGB texture. */
export async function loadPackImage(url: string, maxAnisotropy: number): Promise<THREE.Texture | null> {
  const bitmap = await loadBitmap(url, { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
  if (!bitmap) return null;
  const tex = bitmapTexture(bitmap);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Display reconstruction of the pack's elevation grid, in place. Two steps:
 *
 *   1. Every node takes the value a cubic B-spline through the grid has at that node (weights
 *      1/6, 2/3, 1/6 along each axis). The mesh has one vertex per node, so this is the surface
 *      that spline would draw. It rounds features one or two posts wide (about 40 m posts).
 *   2. Crests are rounded: where a node stands above the mean of its surroundings (about 190 m
 *      across), 45 percent of that excess is taken off. Valleys and even slopes do not move.
 *
 * Why: relief is drawn at twice its height, which turns a real knife ridge into a fin and a rocky
 * crest into saw teeth. It is a rendering treatment. Summits come out lower than they are (by up
 * to a few tens of metres on the sharpest peaks); the elevation range shown on the page comes from
 * the run, not from this grid.
 */
export function smoothDemForDisplay(dem: Float32Array, n: number): void {
  if (n < 8 || dem.length !== n * n) return;
  const tmp = new Float32Array(n * n);
  const a = 1 / 6;
  const b = 2 / 3;
  for (let j = 0; j < n; j++) {
    const row = j * n;
    for (let i = 0; i < n; i++) {
      const l = dem[row + (i > 0 ? i - 1 : 0)];
      const r = dem[row + (i < n - 1 ? i + 1 : n - 1)];
      tmp[row + i] = a * l + b * dem[row + i] + a * r;
    }
  }
  for (let j = 0; j < n; j++) {
    const up = (j > 0 ? j - 1 : 0) * n;
    const down = (j < n - 1 ? j + 1 : n - 1) * n;
    const row = j * n;
    for (let i = 0; i < n; i++) {
      dem[row + i] = a * tmp[up + i] + b * tmp[row + i] + a * tmp[down + i];
    }
  }

  // Mean of the surroundings: a box of 5 posts run twice along each axis (close to a Gaussian)
  const mean = new Float32Array(dem);
  const radius = 2;
  const blurRows = (src: Float32Array, dst: Float32Array) => {
    for (let j = 0; j < n; j++) {
      const row = j * n;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += src[row + Math.min(n - 1, Math.max(0, k))];
      for (let i = 0; i < n; i++) {
        dst[row + i] = sum / (2 * radius + 1);
        sum += src[row + Math.min(n - 1, i + radius + 1)] - src[row + Math.max(0, i - radius)];
      }
    }
  };
  const blurCols = (src: Float32Array, dst: Float32Array) => {
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += src[Math.min(n - 1, Math.max(0, k)) * n + i];
      for (let j = 0; j < n; j++) {
        dst[j * n + i] = sum / (2 * radius + 1);
        sum += src[Math.min(n - 1, j + radius + 1) * n + i] - src[Math.max(0, j - radius) * n + i];
      }
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    blurRows(mean, tmp);
    blurCols(tmp, mean);
  }
  for (let k = 0; k < dem.length; k++) {
    const excess = dem[k] - mean[k];
    if (excess > 0) dem[k] -= CREST_ROUNDING * excess;
  }
}

/** Share of a crest's height above its surroundings that the display reconstruction takes off. */
const CREST_ROUNDING = 0.45;

/**
 * Downloads and decodes one terrain pack. Resolves null on any failure so the caller keeps the
 * 512 DEM and 2048 jpg it already has.
 */
export async function loadTerrainPack(
  manifest: TerrainPackManifest,
  opts: TerrainPackLoadOptions,
): Promise<LoadedTerrainPack | null> {
  try {
    const wantFull = manifest.ortho.size <= opts.maxTextureSize;
    const orthoEntry = wantFull ? manifest.ortho : (manifest.ortho_fallback ?? null);
    if (!orthoEntry || orthoEntry.size > opts.maxTextureSize) return null;

    const demPromise = fetch(opts.resolveUrl(manifest.dem.url)).then((r) =>
      r.ok ? r.arrayBuffer() : null,
    );
    const orthoPromise = loadBitmap(opts.resolveUrl(orthoEntry.url), {
      imageOrientation: 'flipY',
      premultiplyAlpha: 'none',
    }).then(async (bitmap) => {
      if (bitmap || !wantFull || !manifest.ortho_fallback) return { bitmap, size: orthoEntry.size };
      // The full-size image failed to decode: try the smaller one before giving up.
      const fallback = await loadBitmap(opts.resolveUrl(manifest.ortho_fallback.url), {
        imageOrientation: 'flipY',
        premultiplyAlpha: 'none',
      });
      return { bitmap: fallback, size: manifest.ortho_fallback.size };
    });
    const auxPromise = loadBitmap(opts.resolveUrl(manifest.aux.url), {
      imageOrientation: 'flipY',
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });

    const [demBuf, ortho, auxBitmap] = await Promise.all([demPromise, orthoPromise, auxPromise]);
    const cancelled = opts.isCancelled?.() ?? false;
    const expectedDemBytes = manifest.dem.size * manifest.dem.size * 4;
    if (
      cancelled ||
      !demBuf ||
      demBuf.byteLength !== expectedDemBytes ||
      manifest.dem.format !== 'f32le' ||
      !ortho.bitmap ||
      !auxBitmap
    ) {
      ortho.bitmap?.close();
      auxBitmap?.close();
      return null;
    }

    const demRaw = new Float32Array(demBuf);
    smoothDemForDisplay(demRaw, manifest.dem.size);
    const demPack = createDemR32FTexture(demRaw, true);

    const orthoTexture = bitmapTexture(ortho.bitmap);
    orthoTexture.colorSpace = THREE.SRGBColorSpace;
    orthoTexture.anisotropy = opts.maxAnisotropy;

    const auxTexture = bitmapTexture(auxBitmap);
    auxTexture.colorSpace = THREE.NoColorSpace;
    auxTexture.anisotropy = Math.min(4, opts.maxAnisotropy);

    return {
      manifest,
      demTexture: demPack.texture,
      alignedDem: demPack.aligned,
      demGridRes: demPack.gridRes,
      minElevM: demPack.minElev,
      maxElevM: demPack.maxElev,
      orthoTexture,
      orthoSize: ortho.size,
      auxTexture,
      attribution: manifest.ortho.attribution ?? '',
      dispose: () => {
        demPack.texture.dispose();
        orthoTexture.dispose();
        auxTexture.dispose();
      },
    };
  } catch {
    return null;
  }
}

/**
 * Sun direction in stage world space (x east, y up, z south) for an azimuth measured clockwise
 * from north toward the sun and an elevation above the horizon.
 */
export function sunDirectionFromAngles(
  azimuthDeg: number,
  elevationDeg: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

/**
 * The stage draws relief with different scales on each axis (world units per metre). Lighting the
 * scaled terrain with the equally scaled sun direction reproduces the cast-shadow pattern of the
 * true-scale terrain under the true sun, so computed shadows land on the shadows already present
 * in the imagery instead of beside them.
 */
export function scaleSunToStage(
  trueDir: THREE.Vector3,
  unitsPerMetre: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  return out
    .set(trueDir.x * unitsPerMetre.x, trueDir.y * unitsPerMetre.y, trueDir.z * unitsPerMetre.z)
    .normalize();
}
