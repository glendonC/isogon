import * as THREE from 'three';
import dracoWasmUrl from 'three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url';
import dracoWrapperUrl from 'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url';
import { MODIS_SCAN, SCAN_EARTH_RADIUS_KM, VIIRS_SCAN, type ScanSensorSpec } from './scanGeometry';

/**
 * Spacecraft, orbit track and scan plane for the Satellite passes view.
 *
 * Models come from `models/spacecraft/manifest.json` (NASA 3D Resources glb files). A procedural
 * spacecraft stands in while a model loads or when it is missing.
 *
 * What is true to the pass and what is not:
 *   true      the direction from the region to the spacecraft (azimuth and view zenith of the
 *             pass, with the stage's vertical exaggeration applied like everywhere else), the
 *             track direction (square to the scan axis), the scan plane, the width of the
 *             strip one mirror scan sweeps on the ground, and the direction of travel along the
 *             track when the pass carries its orbit node (ascending heads north, descending south)
 *   not true  the distance and the size of the spacecraft (a 705 km orbit would be about 150 slab
 *             widths away and the bus would be invisible) and its speed
 *
 * Craft frame: +X along track, +Y zenith, +Z across track.
 */

export type CraftFamily = 'modis' | 'viirs';

export interface FleetPass {
  sensorLabel: string;
  family: CraftFamily;
  /** Bearing from the region toward the sub-satellite track, degrees clockwise from north. */
  azimuthDeg: number;
  scanAngleDeg: number;
  /** Equator-crossing node of the pass, when the run carries it. */
  orbitNode?: 'ascending' | 'descending';
  /** True for the pass whose scan cells the terrain shader draws for this family. */
  groundStrip: boolean;
}

export interface FleetFrame {
  /** 0..1 presence of everything in the sky: spacecraft, orbit tracks and scan planes. */
  sky: number;
  /** 0..1 strength of the scan strip on the ground. */
  strip: number;
  dtSec: number;
  sampleTerrainY: (u: number, v: number) => number;
  slabWidth: number;
  slabDepth: number;
  /** World units per metre on x (east), y (up) and z (south). */
  unitsPerMetre: readonly [number, number, number];
}

/** Scan strip under a spacecraft, for the terrain shader. */
export interface GroundStrip {
  /** Strip center along the track from the region center, km. */
  alongTrackKm: number;
  /** 0..1 */
  strength: number;
}

interface ManifestModel {
  id: string;
  url: string;
}

const DEG = Math.PI / 180;
const CRAFT_SIZE = 1.05; // longest dimension in world units
const TRACK_POINTS = 40;
const TRACK_HALF_SPAN = 6.2; // drawn length of the track either side of the pass point
const TRAVEL_HALF_SPAN = 3.0; // the spacecraft stays this close to the pass point, in view
const TRAVEL_FADE = 0.5; // length of the entry and of the exit at the two ends of the travel
const TRACK_SPEED = 0.16; // world units per second
const FAN_POINTS = 33;
/** Display distance from the region center to the spacecraft, world units, in orbit height ratio. */
const DISPLAY_RANGE: Record<CraftFamily, number> = { modis: 3.5, viirs: 4.1 };

const FAMILY_COLOR: Record<CraftFamily, THREE.Color> = {
  modis: new THREE.Color(1.0, 0.5, 0.24),
  viirs: new THREE.Color(0.4, 0.84, 1.0),
};

const FAMILY_SPEC: Record<CraftFamily, ScanSensorSpec> = { modis: MODIS_SCAN, viirs: VIIRS_SCAN };

/**
 * Rotation that takes each NASA model's own axes into the craft frame. Set by looking at the
 * models: bus long axis along the track, solar array across it, instrument deck toward the ground.
 */
const MODEL_ORIENTATION: Record<string, THREE.Euler> = {
  terra: new THREE.Euler(0, 0, 0),
  aqua: new THREE.Euler(Math.PI / 2, 0, 0),
  suomi_npp: new THREE.Euler(0, 0, Math.PI / 2),
};

const BLANK_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

function modelIdsForSensor(label: string): string[] {
  const s = label.toUpperCase();
  if (s.includes('TERRA')) return ['terra'];
  if (s.includes('AQUA')) return ['aqua'];
  // NASA publishes no separate NOAA-20 or NOAA-21 model; they fly the Suomi NPP bus and instrument
  if (s.includes('NOAA') || s.includes('J1') || s.includes('J2')) return ['noaa_20', 'suomi_npp'];
  return ['suomi_npp'];
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Solar cell grid: dark blue cells, fine interconnect lines, one bus bar per cell. */
function buildSolarCellTexture(): THREE.DataTexture {
  const w = 256;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const cx = i % 16;
      const cy = j % 16;
      const line = cx === 0 || cy === 0;
      const bus = cx === 8;
      const tone = 0.86 + 0.14 * hash2(Math.floor(i / 16), Math.floor(j / 16));
      const o = (j * w + i) * 4;
      data[o] = Math.round((line ? 118 : bus ? 40 : 7) * tone);
      data[o + 1] = Math.round((line ? 124 : bus ? 52 : 14) * tone);
      data[o + 2] = Math.round((line ? 138 : bus ? 88 : 46) * tone);
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Environment for image-based lighting in low Earth orbit: black space above, a thin bright limb
 * at the horizon and sunlit Earth below. The sun itself is the scene's directional light.
 */
export function buildOrbitEnvironment(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const envScene = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        float y = normalize(vDir).y;
        vec3 space = vec3(0.012, 0.016, 0.026);
        // Sunlit Earth from orbit: ocean and cloud average, brighter toward the limb
        vec3 earth = mix(vec3(0.30, 0.42, 0.58), vec3(0.62, 0.68, 0.74), smoothstep(-1.0, -0.15, y) * 0.6);
        vec3 limb = vec3(0.55, 0.80, 1.25);
        vec3 col = mix(earth, space, smoothstep(-0.07, 0.05, y));
        col += limb * exp(-abs(y + 0.02) * 22.0) * 1.1;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), material);
  envScene.add(dome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(envScene, 0.03);
  pmrem.dispose();
  dome.geometry.dispose();
  material.dispose();
  return target;
}

type Surface =
  | 'foilGold'
  | 'foilSilver'
  | 'foilBlack'
  | 'solar'
  | 'radiator'
  | 'paintWhite'
  | 'paintGrey'
  | 'dark';

interface SurfaceOptions {
  /** The geometry has no normals (NASA Terra): shade by face. */
  flat?: boolean;
  /** Base color texture that ships with the model. */
  map?: THREE.Texture | null;
  /** Crinkle cells per object unit. */
  crinkleScale?: number;
}

/**
 * Crumpled foil: space is cut into cells in object space and every cell tilts the shading normal
 * its own way, so multi-layer insulation breaks the sun and the Earth into flat facets with sharp
 * creases. It needs no texture coordinates (the Terra model has none). The effect fades out once
 * the facets are smaller than a few pixels and widens the highlight instead.
 */
function addCrinkle(material: THREE.MeshStandardMaterial, scale: number, strength: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFoilScale = { value: scale };
    shader.uniforms.uFoilStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFoilPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFoilPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vFoilPos;
        uniform float uFoilScale;
        uniform float uFoilStrength;
        uniform mat3 normalMatrix;
        vec3 foilHash(vec3 p) {
          p = fract(p * vec3(0.1031, 0.1030, 0.0973));
          p += dot(p, p.yxz + 33.33);
          return fract((p.xxy + p.yxx) * p.zyx);
        }
        // Tilt of the facet that holds p
        vec3 foilFacet(vec3 p) {
          vec3 i = floor(p);
          vec3 f = p - i;
          float best = 8.0;
          vec3 tilt = vec3(0.0);
          for (int z = -1; z <= 1; z++) {
            for (int y = -1; y <= 1; y++) {
              for (int x = -1; x <= 1; x++) {
                vec3 g = vec3(float(x), float(y), float(z));
                vec3 r = g + foilHash(i + g) - f;
                float d = dot(r, r);
                if (d < best) {
                  best = d;
                  tilt = foilHash(i + g + 17.0) * 2.0 - 1.0;
                }
              }
            }
          }
          return tilt;
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        {
          vec3 fp = vFoilPos * uFoilScale;
          float fw = max(length(dFdx(fp)), length(dFdy(fp)));
          float fine = 1.0 - smoothstep(0.16, 0.5, fw);
          vec3 tilt = foilFacet(fp) + 0.45 * foilFacet(fp * 2.7 + 5.1) * (1.0 - smoothstep(0.06, 0.18, fw));
          vec3 tv = normalize(normalMatrix * tilt) * length(tilt);
          tv -= dot(tv, normal) * normal;
          normal = normalize(normal + uFoilStrength * fine * tv);
          roughnessFactor = min(1.0, roughnessFactor + 0.2 * (1.0 - fine));
        }`,
      );
  };
  material.customProgramCacheKey = () => 'isogon-foil';
}

/** Shared textures and the one place where spacecraft surfaces are defined. */
class CraftLook {
  public readonly cells = buildSolarCellTexture();

  public make(surface: Surface, opts: SurfaceOptions = {}): THREE.MeshStandardMaterial {
    const map = opts.map ?? null;
    const m = new THREE.MeshStandardMaterial({ flatShading: opts.flat === true });
    const crinkle = opts.crinkleScale ?? 26;
    switch (surface) {
      case 'foilGold':
        // Aluminized Kapton: gold tinted mirror
        m.color.setRGB(1.0, 0.62, 0.18);
        m.metalness = 1.0;
        m.roughness = 0.3;
        addCrinkle(m, crinkle, 0.24);
        break;
      case 'foilSilver':
        m.color.setRGB(0.9, 0.91, 0.93);
        m.metalness = 1.0;
        m.roughness = 0.32;
        addCrinkle(m, crinkle, 0.2);
        break;
      case 'foilBlack':
        m.color.setRGB(0.035, 0.035, 0.04);
        m.metalness = 0.75;
        m.roughness = 0.42;
        addCrinkle(m, crinkle, 0.22);
        break;
      case 'solar':
        m.color.setRGB(1, 1, 1);
        m.metalness = 0.55;
        m.roughness = 0.22;
        m.map = map ?? this.cells;
        // The NASA array textures are a saturated blue; real cells are close to black
        if (map) m.color.setRGB(0.42, 0.46, 0.62);
        break;
      case 'radiator':
        // Mirror tiles on the bus sides: they show the Earth or black space, never a color of their own
        m.color.setRGB(0.84, 0.87, 0.92);
        m.metalness = 0.92;
        m.roughness = 0.16;
        break;
      case 'paintWhite':
        m.color.setRGB(0.86, 0.87, 0.88);
        m.metalness = 0.05;
        m.roughness = 0.55;
        break;
      case 'paintGrey':
        m.color.setRGB(0.3, 0.31, 0.33);
        m.metalness = 0.45;
        m.roughness = 0.5;
        break;
      case 'dark':
        m.color.setRGB(0.03, 0.032, 0.036);
        m.metalness = 0.6;
        m.roughness = 0.5;
        break;
    }
    if (map && surface !== 'solar') {
      // Textured NASA surfaces keep their texture; the texture carries the tint
      m.map = map;
      m.color.setRGB(1, 1, 1);
      if (surface === 'foilGold' || surface === 'foilSilver') m.metalness = 0.82;
    }
    return m;
  }

  public dispose(): void {
    this.cells.dispose();
  }
}

function surfaceForMaterialName(name: string): Surface | null {
  const n = name.toLowerCase();
  if (n.includes('gold')) return 'foilGold';
  if (n.includes('silver')) return 'foilSilver';
  if (n.includes('krinkle') || n.includes('kapton')) return 'foilBlack';
  if (n.includes('solar') || n.includes('shiny_panel')) return 'solar';
  if (n === 'side panels') return 'radiator';
  if (n.includes('dish')) return 'paintWhite';
  if (n.includes('thruster')) return 'dark';
  if (n.includes('hardware') || n.includes('grey') || n.includes('gray')) return 'paintGrey';
  return null;
}

/** Planar texture coordinates for a flat panel that ships without any (the Terra solar array). */
function addPlanarUv(geometry: THREE.BufferGeometry): void {
  const pos = geometry.getAttribute('position');
  if (!pos || geometry.getAttribute('uv')) return;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const axes = [0, 1, 2].sort((a, b) => size.getComponent(b) - size.getComponent(a));
  const [long, short] = axes;
  const cell = Math.max(size.getComponent(short) / 12, 1e-6);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    // The cell texture holds 16 x 4 cells
    uv[i * 2] = (pos.getComponent(i, long) - box.min.getComponent(long)) / (cell * 16);
    uv[i * 2 + 1] = (pos.getComponent(i, short) - box.min.getComponent(short)) / (cell * 4);
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Replaces the flat export materials of a NASA model with physically based ones. */
function dressModel(root: THREE.Object3D, look: CraftLook): void {
  const box = new THREE.Box3().setFromObject(root);
  const longest = Math.max(...box.getSize(new THREE.Vector3()).toArray(), 1e-6);
  const crinkleScale = 26 / longest;
  const made = new Map<THREE.Material, THREE.Material>();
  const retired = new Set<THREE.Material>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const flat = !mesh.geometry.getAttribute('normal');
    const dress = (source: THREE.Material): THREE.Material => {
      const cached = made.get(source);
      if (cached) return cached;
      const std = source as THREE.MeshStandardMaterial;
      const surface = surfaceForMaterialName(source.name);
      // A real texture, not the one pixel stand-in for a file that was never published
      const image = std.map?.image as { width?: number } | undefined;
      const map = std.map && mesh.geometry.getAttribute('uv') && (image?.width ?? 0) > 4 ? std.map : null;
      let next: THREE.Material = source;
      if (surface) {
        next = look.make(surface, { flat, map, crinkleScale });
      } else if (std.isMeshStandardMaterial && !map) {
        next = look.make('paintGrey', { flat });
      }
      if (next !== source) {
        next.name = source.name;
        retired.add(source);
        if (std.map && std.map !== map) std.map.dispose();
      }
      made.set(source, next);
      return next;
    };
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(dress);
    } else {
      if (surfaceForMaterialName(mesh.material.name) === 'solar') addPlanarUv(mesh.geometry);
      mesh.material = dress(mesh.material);
    }
  });
  for (const m of retired) m.dispose();
}

/** Clean procedural stand-in: foil bus, nadir instrument deck, one segmented array, dish. */
function buildProceduralCraft(family: CraftFamily, look: CraftLook): THREE.Group {
  const root = new THREE.Group();
  const gold = look.make('foilGold');
  const silver = look.make('foilSilver');
  const white = look.make('paintWhite');
  const dark = look.make('dark');
  const solar = look.make('solar');
  const add = (geom: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  const busLen = family === 'modis' ? 0.42 : 0.32;
  add(new THREE.BoxGeometry(busLen, 0.17, 0.18), gold, 0, 0, 0);
  // Earth-facing instrument deck with the scanner aperture and a radiator
  add(new THREE.BoxGeometry(busLen * 0.86, 0.035, 0.15), silver, 0, -0.1, 0);
  add(new THREE.CylinderGeometry(0.045, 0.055, 0.07, 24), dark, busLen * 0.18, -0.145, 0);
  add(new THREE.BoxGeometry(0.1, 0.05, 0.1), white, -busLen * 0.25, -0.135, 0);
  // Zenith side: radiator plate and a small dish on a mast
  add(new THREE.BoxGeometry(busLen * 0.5, 0.012, 0.14), white, -busLen * 0.1, 0.092, 0);
  add(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 8), silver, busLen * 0.3, 0.13, 0.04);
  const dish = add(new THREE.ConeGeometry(0.05, 0.03, 24, 1, true), white, busLen * 0.3, 0.19, 0.04);
  dish.rotation.x = Math.PI;
  (dish.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  // One solar array on a boom, in three hinged segments
  const boom = add(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 8), silver, 0, 0, 0.17);
  boom.rotation.x = Math.PI / 2;
  for (let s = 0; s < 3; s++) {
    const geom = new THREE.BoxGeometry(0.2, 0.008, 0.2);
    const uv = geom.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 6) / 16, (uv.getY(i) * 6) / 4);
    const panel = add(geom, solar, 0, 0, 0.36 + s * 0.208);
    panel.rotation.z = -0.35;
  }
  return root;
}

/** Fits an object into the craft frame: centered, longest side equal to CRAFT_SIZE. */
function normalizeCraft(object: THREE.Object3D, orientation: THREE.Euler | null): THREE.Group {
  const pivot = new THREE.Group();
  if (orientation) object.rotation.copy(orientation);
  pivot.add(object);
  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(pivot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z, 1e-6);
  object.position.sub(center);
  const holder = new THREE.Group();
  holder.add(pivot);
  holder.scale.setScalar(CRAFT_SIZE / longest);
  return holder;
}

/** Frees the geometries, materials and textures under an object. */
function disposeObject(root: THREE.Object3D): void {
  const geoms = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  const texs = new Set<THREE.Texture>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) geoms.add(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of list) {
      mats.add(m);
      const std = m as THREE.MeshStandardMaterial;
      for (const t of [std.map, std.normalMap, std.roughnessMap, std.metalnessMap, std.emissiveMap, std.aoMap]) {
        if (t) texs.add(t);
      }
    }
  });
  for (const g of geoms) g.dispose();
  for (const m of mats) m.dispose();
  for (const t of texs) {
    // The loader decodes embedded images into ImageBitmaps; free their pixels with the texture
    const image = t.image as { close?: () => void } | null;
    if (image && typeof image.close === 'function') image.close();
    t.dispose();
  }
}

interface Rig {
  root: THREE.Group;
  craft: THREE.Group;
  craftKey: string;
  /** Position along the track, world units from the pass point. */
  along: number;
  passKey: string;
  track: THREE.Line;
  trackMat: THREE.LineBasicMaterial;
  rays: THREE.LineSegments;
  raysMat: THREE.LineBasicMaterial;
  fan: THREE.Mesh;
  fanMat: THREE.MeshBasicMaterial;
}

function smooth01(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

export class SpacecraftFleet {
  public readonly group = new THREE.Group();
  /** Scan strip under the spacecraft of each family, for the terrain shader. */
  public readonly strips: Record<CraftFamily, GroundStrip> = {
    modis: { alongTrackKm: 0, strength: 0 },
    viirs: { alongTrackKm: 0, strength: 0 },
  };

  private readonly look = new CraftLook();
  private readonly templates = new Map<string, THREE.Group>();
  private readonly rigs: Rig[] = [];
  private draco: { dispose(): void } | null = null;
  private disposed = false;

  private readonly pos = new THREE.Vector3();
  private readonly xAxis = new THREE.Vector3();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly zAxis = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();

  constructor(maxRigs: number) {
    this.templates.set('procedural-modis', normalizeCraft(buildProceduralCraft('modis', this.look), null));
    this.templates.set('procedural-viirs', normalizeCraft(buildProceduralCraft('viirs', this.look), null));
    for (let i = 0; i < maxRigs; i++) this.rigs.push(this.buildRig(i));
  }

  private buildRig(index: number): Rig {
    const root = new THREE.Group();
    root.visible = false;
    const craft = new THREE.Group();
    root.add(craft);

    const lineGeometry = (count: number): THREE.BufferGeometry => {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 4), 4));
      return geom;
    };
    const lineMat = () =>
      new THREE.LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, vertexColors: true });

    const trackMat = lineMat();
    const track = new THREE.Line(lineGeometry(TRACK_POINTS), trackMat);
    const raysMat = lineMat();
    const rays = new THREE.LineSegments(lineGeometry(6), raysMat);
    for (const obj of [track, rays]) {
      obj.frustumCulled = false;
      root.add(obj);
    }

    // Scan plane: a fan from the spacecraft down to the scan line, fading toward the ground
    const fanGeom = lineGeometry(FAN_POINTS + 1);
    const index3: number[] = [];
    for (let i = 0; i < FAN_POINTS - 1; i++) index3.push(0, 1 + i, 2 + i);
    fanGeom.setIndex(index3);
    const fanMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
    const fan = new THREE.Mesh(fanGeom, fanMat);
    fan.frustumCulled = false;
    root.add(fan);

    this.group.add(root);
    return {
      root,
      craft,
      craftKey: '',
      along: -1.4 + index * 0.9,
      passKey: '',
      track,
      trackMat,
      rays,
      raysMat,
      fan,
      fanMat,
    };
  }

  /** Loads the manifest and its models. Missing or failing models keep the procedural craft. */
  public async loadModels(baseUrl: string): Promise<void> {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    let models: ManifestModel[] = [];
    try {
      const resp = await fetch(`${base}models/spacecraft/manifest.json`);
      if (!resp.ok) return;
      const manifest = (await resp.json()) as { models?: ManifestModel[] };
      models = Array.isArray(manifest.models) ? manifest.models : [];
    } catch {
      return;
    }
    // The loaders are a separate chunk: the page does not need them until a model is wanted
    const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/loaders/DRACOLoader.js'),
    ]);
    if (this.disposed) return;

    const manager = new THREE.LoadingManager();
    // The original NASA Terra file names two textures that were never published with it
    manager.setURLModifier((url) => (/\.tga(\?|$)/i.test(url) ? BLANK_PNG : url));
    // The Draco decoder ships inside three. Its two files are taken as bundler URLs, so nothing
    // has to be copied under public/ and the dev server and the build resolve them the same way.
    const draco = new DRACOLoader(manager);
    draco.setDecoderPath({ js: dracoWrapperUrl, wasm: dracoWasmUrl });
    this.draco = draco;
    const loader = new GLTFLoader(manager);
    loader.setDRACOLoader(draco);

    await Promise.all(
      models.map(async (model) => {
        if (typeof model.id !== 'string' || typeof model.url !== 'string') return;
        try {
          const gltf = await loader.loadAsync(`${base}${model.url.replace(/^\/+/, '')}`);
          if (this.disposed) {
            disposeObject(gltf.scene);
            return;
          }
          dressModel(gltf.scene, this.look);
          this.templates.set(model.id, normalizeCraft(gltf.scene, MODEL_ORIENTATION[model.id] ?? null));
        } catch {
          // Keep the procedural craft for this spacecraft
        }
      }),
    );
  }

  private resolveTemplate(pass: FleetPass): { key: string; template: THREE.Group } {
    for (const id of modelIdsForSensor(pass.sensorLabel)) {
      const t = this.templates.get(id);
      if (t) return { key: id, template: t };
    }
    const key = `procedural-${pass.family}`;
    return { key, template: this.templates.get(key)! };
  }

  public update(passes: readonly FleetPass[], frame: FleetFrame): void {
    this.strips.modis.strength = 0;
    this.strips.viirs.strength = 0;
    const anything = frame.sky > 0.004 || frame.strip > 0.004;
    const [upmX, upmY, upmZ] = frame.unitsPerMetre;
    const halfW = frame.slabWidth * 0.5;
    const halfD = frame.slabDepth * 0.5;
    const groundY = frame.sampleTerrainY(0.5, 0.5);

    for (let i = 0; i < this.rigs.length; i++) {
      const rig = this.rigs[i];
      const pass = passes[i];
      if (!pass || !anything) {
        rig.root.visible = false;
        continue;
      }
      rig.root.visible = true;

      const { key, template } = this.resolveTemplate(pass);
      if (rig.craftKey !== key) {
        rig.craft.clear();
        rig.craft.add(template.clone(true));
        rig.craftKey = key;
      }

      // Direction from the region to the spacecraft: pass azimuth and view zenith angle
      const spec = FAMILY_SPEC[pass.family];
      const az = pass.azimuthDeg * DEG;
      const theta = Math.min(spec.maxScanDeg, Math.abs(pass.scanAngleDeg)) * DEG;
      const orbitK = (SCAN_EARTH_RADIUS_KM + spec.altitudeKm) / SCAN_EARTH_RADIUS_KM;
      const sinVz = Math.min(0.999, orbitK * Math.sin(theta));
      const cosVz = Math.sqrt(1 - sinVz * sinVz);
      // Scan axis in the stage frame (x east, z south); the track is square to it
      const ax = Math.sin(az);
      const azz = -Math.cos(az);
      let dx = ax * sinVz * upmX;
      let dy = cosVz * upmY;
      let dz = azz * sinVz * upmZ;
      const dn = Math.hypot(dx, dy, dz) || 1;
      const range = DISPLAY_RANGE[pass.family];
      dx = (dx / dn) * range;
      dy = (dy / dn) * range;
      dz = (dz / dn) * range;

      // Travel direction: an ascending pass heads north, a descending one south. A pass without
      // its orbit node (the procedural fallback, or a payload that carries none) gets the day-side
      // rule: Terra heads south, the afternoon spacecraft head north.
      let tx = Math.cos(az);
      let tz = Math.sin(az);
      const southbound = pass.orbitNode
        ? pass.orbitNode === 'descending'
        : pass.sensorLabel.toUpperCase().includes('TERRA');
      if (tz > 0 !== southbound) {
        tx = -tx;
        tz = -tz;
      }

      // A new pass starts from the middle of its track so it is in view at once
      const passKey = `${pass.sensorLabel}|${pass.azimuthDeg}|${pass.scanAngleDeg}|${pass.orbitNode ?? ''}`;
      if (rig.passKey !== passKey) {
        if (rig.passKey !== '') rig.along = -0.6;
        rig.passKey = passKey;
      }
      rig.along += TRACK_SPEED * Math.min(0.1, Math.max(0, frame.dtSec));
      if (rig.along > TRAVEL_HALF_SPAN) rig.along -= 2 * TRAVEL_HALF_SPAN;
      const s = rig.along;
      // Presence along the track: grows in at one end and out at the other
      const endFade = smooth01((TRAVEL_HALF_SPAN - Math.abs(s)) / TRAVEL_FADE);

      const pos = this.pos.set(dx + tx * s, groundY + dy, dz + tz * s);
      this.xAxis.set(tx, 0, tz);
      this.zAxis.crossVectors(this.xAxis, this.yAxis).normalize();
      this.basis.makeBasis(this.xAxis, this.yAxis, this.zAxis);
      rig.craft.quaternion.setFromRotationMatrix(this.basis);
      rig.craft.position.copy(pos);
      const craftScale = smooth01(frame.sky * 1.15) * endFade;
      rig.craft.visible = craftScale > 0.002;
      rig.craft.scale.setScalar(Math.max(craftScale, 1e-4));

      // Orbit track: straight through the pass point, bright just behind the spacecraft
      const color = FAMILY_COLOR[pass.family];
      const trackPos = rig.track.geometry.getAttribute('position') as THREE.BufferAttribute;
      const trackCol = rig.track.geometry.getAttribute('color') as THREE.BufferAttribute;
      for (let k = 0; k < TRACK_POINTS; k++) {
        const q = (k / (TRACK_POINTS - 1)) * 2 - 1;
        const sq = q * TRACK_HALF_SPAN;
        trackPos.setXYZ(k, dx + tx * sq, groundY + dy, dz + tz * sq);
        const ends = smooth01((1 - Math.abs(q)) / 0.3);
        const behind = s - sq;
        const trail = behind >= 0 ? Math.exp(-behind / 1.6) : Math.exp(behind / 0.12);
        trackCol.setXYZW(k, color.r, color.g, color.b, ends * (0.3 + 0.7 * trail * endFade));
      }
      trackPos.needsUpdate = true;
      trackCol.needsUpdate = true;
      rig.trackMat.opacity = 0.8 * frame.sky;
      rig.track.visible = frame.sky > 0.004;

      // Scan line on the ground: where the scan plane (through the spacecraft, square to the
      // track) meets the terrain, clipped to the slab
      const swath = frame.sky * endFade;
      const strip = frame.strip * endFade;
      let k0 = -1e9;
      let k1 = 1e9;
      if (Math.abs(ax) > 1e-5) {
        const a = (pos.x - halfW) / ax;
        const b = (pos.x + halfW) / ax;
        k0 = Math.max(k0, Math.min(a, b));
        k1 = Math.min(k1, Math.max(a, b));
      } else if (Math.abs(pos.x) > halfW) {
        k1 = -1e9;
      }
      if (Math.abs(azz) > 1e-5) {
        const a = (pos.z - halfD) / azz;
        const b = (pos.z + halfD) / azz;
        k0 = Math.max(k0, Math.min(a, b));
        k1 = Math.min(k1, Math.max(a, b));
      } else if (Math.abs(pos.z) > halfD) {
        k1 = -1e9;
      }
      if (pass.groundStrip && strip > 0.004) {
        const mark = this.strips[pass.family];
        // Along-track coordinate in the terrain shader's frame: track = (cos az, sin az) in x, z
        const eastKm = pos.x / (upmX * 1000);
        const southKm = pos.z / (upmZ * 1000);
        mark.alongTrackKm = eastKm * Math.cos(az) + southKm * Math.sin(az);
        mark.strength = strip;
      }

      const hasSwath = swath > 0.004 && k1 > k0 + 0.05;
      rig.rays.visible = hasSwath;
      rig.fan.visible = hasSwath;
      if (!hasSwath) continue;

      const fanPos = rig.fan.geometry.getAttribute('position') as THREE.BufferAttribute;
      const fanCol = rig.fan.geometry.getAttribute('color') as THREE.BufferAttribute;
      const apexY = pos.y - 0.04;
      fanPos.setXYZ(0, pos.x, apexY, pos.z);
      fanCol.setXYZW(0, color.r, color.g, color.b, 1);
      for (let n = 0; n < FAN_POINTS; n++) {
        const k = k0 + ((k1 - k0) * n) / (FAN_POINTS - 1);
        const gx = pos.x - ax * k;
        const gz = pos.z - azz * k;
        const u = THREE.MathUtils.clamp(gx / frame.slabWidth + 0.5, 0, 1);
        const v = THREE.MathUtils.clamp(0.5 - gz / frame.slabDepth, 0, 1);
        fanPos.setXYZ(n + 1, gx, frame.sampleTerrainY(u, v) + 0.02, gz);
        fanCol.setXYZW(n + 1, color.r, color.g, color.b, 0.12);
      }
      fanPos.needsUpdate = true;
      fanCol.needsUpdate = true;
      rig.fanMat.opacity = 0.04 * swath;

      // Three sight lines: both ends of the scan line and its middle
      const raysPos = rig.rays.geometry.getAttribute('position') as THREE.BufferAttribute;
      const raysCol = rig.rays.geometry.getAttribute('color') as THREE.BufferAttribute;
      const ends = [1, 1 + Math.floor(FAN_POINTS / 2), FAN_POINTS];
      for (let e = 0; e < 3; e++) {
        raysPos.setXYZ(e * 2, pos.x, apexY, pos.z);
        raysPos.setXYZ(e * 2 + 1, fanPos.getX(ends[e]), fanPos.getY(ends[e]), fanPos.getZ(ends[e]));
        raysCol.setXYZW(e * 2, color.r, color.g, color.b, 1);
        raysCol.setXYZW(e * 2 + 1, color.r, color.g, color.b, e === 1 ? 0.25 : 0.5);
      }
      raysPos.needsUpdate = true;
      raysCol.needsUpdate = true;
      rig.raysMat.opacity = 0.6 * swath;
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.draco?.dispose();
    for (const template of this.templates.values()) disposeObject(template);
    disposeObject(this.group);
    this.look.dispose();
  }
}
