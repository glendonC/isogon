import * as THREE from 'three';
import { COMMON_HEIGHTFIELD_GLSL, createDemR32FTexture } from '../earthCutawayShaders';
import { ATMOSPHERE_GLSL, NIGHT_GLSL, SKY_VIEW_MAPPING_GLSL } from './atmosphere';
import { levelGround } from './levelGround';
import { loadPackImage } from './terrainPack';
import { TERRAIN_LOOK_GLSL } from './terrainShader';

/**
 * Consumer side of the context terrain: land and sea around a terrain pack,
 * `scale` times its side, so the world continues to a horizon instead of ending at the pack edge.
 *
 * Registration, as `backend/terrain/terrain_pack.py` writes it: same centre, axes and row order as
 * the pack (row 0 north, column 0 west). The DEM is node registered (first and last posts on the
 * context box edges), the ortho is a pixel registered image. The pack box is the central 1/scale of
 * the context box on each axis. Sea posts are exactly 0 m.
 *
 * What is drawn here is a rendering of those two rasters and nothing else: the same vertical
 * factor, the same sun and the same air as the pack. There are no baked shadows and no fire,
 * smoke or sensor cells out here; the solver field covers the pack only.
 */
export interface TerrainContextManifest {
  extent_km: [number, number];
  scale: number;
  dem: { url: string; size: number; format: string };
  ortho: { url: string; size: number; zoom?: number; source?: string; attribution?: string };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Returns the context entry of a terrain pack manifest when it is well formed, otherwise null. */
export function parseTerrainContext(raw: unknown): TerrainContextManifest | null {
  if (!isRecord(raw)) return null;
  const { extent_km: extent, scale, dem, ortho } = raw;
  if (!Array.isArray(extent) || extent.length !== 2 || !extent.every((n) => typeof n === 'number' && n > 0)) {
    return null;
  }
  if (typeof scale !== 'number' || !(scale > 1) || scale > 15) return null;
  if (!isRecord(dem) || typeof dem.url !== 'string' || typeof dem.size !== 'number' || dem.format !== 'f32le') {
    return null;
  }
  if (!isRecord(ortho) || typeof ortho.url !== 'string' || typeof ortho.size !== 'number') return null;
  return raw as unknown as TerrainContextManifest;
}

export interface LoadedTerrainContext {
  manifest: TerrainContextManifest;
  scale: number;
  demTexture: THREE.DataTexture;
  /** Elevation in metres, row 0 south (the same order as the pack grid the stage keeps). */
  alignedDem: Float32Array;
  gridRes: number;
  /** r, g: true-scale unit normal x (east) and z (south) as n * 0.5 + 0.5. b: sea. a: a lake (level ground). */
  shadeTexture: THREE.DataTexture;
  orthoTexture: THREE.Texture;
  dispose: () => void;
}

export interface TerrainContextLoadOptions {
  resolveUrl: (rawUrl: string) => string;
  maxTextureSize: number;
  maxAnisotropy: number;
  isCancelled?: () => boolean;
}

/** Normals, the sea mask and the lakes of the context grid, computed once when it is loaded. */
function buildShadeTexture(dem: Float32Array, n: number, extentKm: [number, number]): THREE.DataTexture {
  const out = new Uint8Array(n * n * 4);
  const lakes = levelGround(dem, n);
  const dx = (extentKm[0] * 1000) / (n - 1);
  const dz = (extentKm[1] * 1000) / (n - 1);
  for (let r = 0; r < n; r++) {
    const rN = Math.min(n - 1, r + 1); // rows run south to north
    const rS = Math.max(0, r - 1);
    for (let c = 0; c < n; c++) {
      const cE = Math.min(n - 1, c + 1);
      const cW = Math.max(0, c - 1);
      const dhdx = (dem[r * n + cE] - dem[r * n + cW]) / ((cE - cW) * dx);
      // z points south, rows point north
      const dhdz = (dem[rS * n + c] - dem[rN * n + c]) / ((rN - rS) * dz);
      const inv = 1 / Math.hypot(dhdx, 1, dhdz);
      const o = (r * n + c) * 4;
      out[o] = Math.round((-dhdx * inv * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((-dhdz * inv * 0.5 + 0.5) * 255);
      out[o + 2] = dem[r * n + c] === 0 ? 255 : 0;
      out[o + 3] = lakes[r * n + c] ? 255 : 0;
    }
  }
  const tex = new THREE.DataTexture(out, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/** Downloads and decodes one context terrain. Resolves null on any failure (the pack stands alone). */
export async function loadTerrainContext(
  manifest: TerrainContextManifest,
  opts: TerrainContextLoadOptions,
): Promise<LoadedTerrainContext | null> {
  try {
    if (manifest.ortho.size > opts.maxTextureSize) return null;
    const [demBuf, orthoTexture] = await Promise.all([
      fetch(opts.resolveUrl(manifest.dem.url)).then((r) => (r.ok ? r.arrayBuffer() : null)),
      loadPackImage(opts.resolveUrl(manifest.ortho.url), opts.maxAnisotropy),
    ]);
    const n = manifest.dem.size;
    if ((opts.isCancelled?.() ?? false) || !demBuf || demBuf.byteLength !== n * n * 4 || !orthoTexture) {
      orthoTexture?.dispose();
      return null;
    }
    const dem = createDemR32FTexture(new Float32Array(demBuf), true);
    const shadeTexture = buildShadeTexture(dem.aligned, dem.gridRes, manifest.extent_km);
    return {
      manifest,
      scale: manifest.scale,
      demTexture: dem.texture,
      alignedDem: dem.aligned,
      gridRes: dem.gridRes,
      shadeTexture,
      orthoTexture,
      dispose: () => {
        dem.texture.dispose();
        shadeTexture.dispose();
        orthoTexture.dispose();
      },
    };
  } catch {
    return null;
  }
}

/** Mean radius used for the fall of the ground away from the pack, km. */
const EARTH_RADIUS_KM = 6360.0;

/**
 * How far the surface of the earth has fallen below the plane of the pack at a point `outKm` outside
 * the pack rectangle, whose half size is about `halfKm` (true scale, km). Zero on the pack edge.
 * The pack itself is drawn flat; beyond it the ground curves away, which is what puts distant land
 * and open sea behind a horizon.
 */
export function contextDropKm(outKm: number, halfKm: number): number {
  return (outKm * outKm + 2 * outKm * halfKm) / (2 * EARTH_RADIUS_KM);
}

const CONTEXT_VERTEX_SHADER = /* glsl */ `
${COMMON_HEIGHTFIELD_GLSL}

uniform vec3 uUnitsPerMetre;

varying vec2 vCuv;
varying vec2 vPackUv;
varying vec3 vWorldPos;
varying float vElevM;

void main() {
  vCuv = uv;
  vec2 packUv = (uv - 0.5) * uContextScale + 0.5;
  vPackUv = packUv;
  float elevM = sampleR32FBilinear(uContextDem, uv, uContextRes);
  vElevM = elevM;
  float y = (elevM - uElevNextRange.x) * uReliefScale.y;

  vec2 xz = vec2((packUv.x - 0.5) * uSlabSize.x, (0.5 - packUv.y) * uSlabSize.y);
  // The ground curves away beyond the pack (see contextDropKm)
  vec2 outKm = max(abs(xz) - 0.5 * uSlabSize, vec2(0.0)) / (uUnitsPerMetre.xz * 1000.0);
  float halfKm = 0.25 * (uSlabSize.x / uUnitsPerMetre.x + uSlabSize.y / uUnitsPerMetre.z) * 0.001;
  float dOut = length(outKm);
  y -= (dOut * dOut + 2.0 * dOut * halfKm) / (2.0 * ${EARTH_RADIUS_KM.toFixed(1)}) * 1000.0 * uUnitsPerMetre.y;

  // Under the pack this surface dives out of the way; the pack is the surface there. The dive
  // starts more than one cell of this mesh inside the pack, so along the pack edge both surfaces
  // are at the same height (the pack takes the context elevation there, see contextJoin).
  vec2 e = min(packUv, 1.0 - packUv);
  y -= clamp((min(e.x, e.y) - 0.012) * 40.0, 0.0, 1.0) * 0.6;

  vec4 worldPos = modelMatrix * vec4(xz.x, y, xz.y, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const CONTEXT_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uContextOrtho;
uniform sampler2D uContextShade;
uniform float uContextMix;
uniform vec3 uSunDir;
uniform vec3 uSunTrue;
uniform vec3 uSunColor;
uniform vec3 uSunTransmittance;
uniform float uHazeStrength;
uniform sampler2D uSkyView;
uniform float uSkyExposure;
uniform vec3 uFloorColor;
uniform float uFloorHaze;
uniform vec3 uUnitsPerMetre;
uniform vec2 uElevNextRange;

varying vec2 vCuv;
varying vec2 vPackUv;
varying vec3 vWorldPos;
varying float vElevM;

${ATMOSPHERE_GLSL}
${SKY_VIEW_MAPPING_GLSL}
${NIGHT_GLSL}
${TERRAIN_LOOK_GLSL}

void main() {
  vec2 e = min(vPackUv, 1.0 - vPackUv);
  if (min(e.x, e.y) > 0.004) discard;

  vec3 sunDir = normalize(uSunDir);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec4 shade = texture2D(uContextShade, vCuv);
  vec2 nxz = shade.rg * 2.0 - 1.0;
  vec3 nTrue = vec3(nxz.x, sqrt(max(1e-4, 1.0 - dot(nxz, nxz))), nxz.y);
  vec3 N = normalize(nTrue / uUnitsPerMetre);
  float sea = smoothstep(0.55, 0.95, shade.b);

  vec3 picture = texture2D(uContextOrtho, vCuv).rgb;
  vec3 albedo = pictureToScene(picture);
  // A lake by the elevation: level ground, unless the picture plainly shows a green field there
  // (a gentler edge than the sea's: a lake is a few posts wide out here, and its shore would step)
  float lake = smoothstep(0.30, 0.70, shade.a) * notGreenField(picture);
  float water = max(sea, lake);

  // The pack's light balance (see ./terrainShader.ts), without baked shadows or sky view
  float nDotL = max(0.0, dot(N, sunDir));
  float skyFill = 0.5 + 0.5 * N.y;
  vec3 lighting = mix(vec3(0.16, 0.19, 0.25), vec3(0.24, 0.27, 0.33), skyFill) * 0.92
                + uSunColor * (SUN_KEY * nDotL);
  vec3 lit = albedo * lighting;

  // The pack's water (see waterSurface in ./terrainShader.ts): the same terms, so a lake or a
  // sea that crosses the pack's edge is one body of water
  if (water > 0.01) {
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 halfVec = normalize(sunDir + viewDir);
    float fresnel = pow(1.0 - max(0.0, dot(up, viewDir)), 4.0);
    float spec = pow(max(0.0, dot(up, halfVec)), 96.0);
    lit = waterSurface(lit, water, lake, fresnel, spec, uNight);
  }

  // The same air as over the pack: distance takes the ground into what the dome draws behind it
  vec3 toPointKm = (vWorldPos - cameraPosition) / (uUnitsPerMetre * 1000.0);
  float pathKm = length(toPointKm);
  float camAltKm = (uElevNextRange.x + cameraPosition.y / uUnitsPerMetre.y) * 0.001;
  float hazeKm = pathKm * uHazeStrength * pathKm / (pathKm + HAZE_NEAR_KM);
  vec3 viewTrue = toPointKm / max(pathKm, 1e-4);
  vec3 unused;
  vec3 trans = atmAerialPerspective(
    camAltKm, vElevM * 0.001, hazeKm, dot(viewTrue, uSunTrue), uSunTransmittance, unused
  );
  vec3 backdrop = atmBackdrop(
    uSkyView, viewTrue, normalize(uSunTrue), clamp(camAltKm, 0.02, ATM_TOP - 1.0),
    uSkyExposure, uFloorColor, uFloorHaze
  );
  vec3 rgb = nightGrade(capSurface(lit * trans + backdrop * (1.0 - trans)));
  // By night water gives back a dark sky: never brighter than the land beside it
  rgb *= 1.0 - WATER_NIGHT_DIM * water * uNight;
  gl_FragColor = vec4(rgb, uContextMix);
}
`;

/** Uniform objects the context terrain shares with the pack terrain, so both sit under one light. */
export interface ContextSharedUniforms {
  uSlabSize: THREE.IUniform;
  uElevNextRange: THREE.IUniform;
  uReliefScale: THREE.IUniform;
  uUnitsPerMetre: THREE.IUniform;
  uSunDir: THREE.IUniform;
  uSunTrue: THREE.IUniform;
  uSunColor: THREE.IUniform;
  uSunTransmittance: THREE.IUniform;
  uHazeStrength: THREE.IUniform;
  uSkyView: THREE.IUniform;
  uSkyExposure: THREE.IUniform;
  uFloorColor: THREE.IUniform;
  uFloorHaze: THREE.IUniform;
  uContextDem: THREE.IUniform;
  uContextRes: THREE.IUniform;
  uContextScale: THREE.IUniform;
  uContextMix: THREE.IUniform;
  uContextOrtho: THREE.IUniform;
  uNight: THREE.IUniform;
  /** The block's own lift of the moonlit ground, so the land around it is drawn as bright as the block. */
  uMoonLift: THREE.IUniform;
}

/** Grid cells per side of the context mesh. The context DEM has 1024 posts; this draws every 1.6th. */
const CONTEXT_SEGMENTS = 640;

/** The mesh that draws the context terrain around the pack. One instance serves every region. */
export class ContextTerrain {
  public readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly shadeUniform: THREE.IUniform = { value: null };

  constructor(shared: ContextSharedUniforms) {
    const geometry = new THREE.PlaneGeometry(1, 1, CONTEXT_SEGMENTS, CONTEXT_SEGMENTS);
    this.material = new THREE.ShaderMaterial({
      vertexShader: CONTEXT_VERTEX_SHADER,
      fragmentShader: CONTEXT_FRAGMENT_SHADER,
      uniforms: { ...shared, uContextShade: this.shadeUniform },
      // It fades in and out between the block views and the close views
      transparent: true,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    // Vertices are placed in the shader; the plane's own bounds say nothing about where they end up
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    // Before the other transparent layers (curtain, markers), after the opaque pack terrain
    this.mesh.renderOrder = -2;
  }

  /** Points the mesh at a loaded context, or at none. */
  public setContext(context: LoadedTerrainContext | null): void {
    this.shadeUniform.value = context?.shadeTexture ?? null;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/** Bilinear elevation (metres) of a loaded context at context uv (0..1, v north). */
export function sampleContextElevation(context: LoadedTerrainContext, u: number, v: number): number {
  const n = context.gridRes;
  const fx = Math.min(n - 1, Math.max(0, u * (n - 1)));
  const fy = Math.min(n - 1, Math.max(0, v * (n - 1)));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(n - 1, x0 + 1);
  const y1 = Math.min(n - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const d = context.alignedDem;
  const a = d[y0 * n + x0] * (1 - tx) + d[y0 * n + x1] * tx;
  const b = d[y1 * n + x0] * (1 - tx) + d[y1 * n + x1] * tx;
  return a * (1 - ty) + b * ty;
}
