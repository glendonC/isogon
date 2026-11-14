import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ATMOSPHERE_DOME_FRAGMENT_SHADER,
  ATMOSPHERE_DOME_VERTEX_SHADER,
  CLIFF_BASE_Y,
  CURTAIN_FRAGMENT_SHADER,
  CURTAIN_VERTEX_SHADER,
  FIELD_FRAME_COUNT,
  FIELD_GRID_SIZE,
  MAX_RELIEF_WORLD_Y,
  PEDESTAL_FRAGMENT_SHADER,
  PEDESTAL_VERTEX_SHADER,
  PLUME_FRAGMENT_SHADER,
  PLUME_VERTEX_SHADER,
  SIGMA_MAX_MW_KM2,
  SKIRT_FRAGMENT_SHADER,
  SKIRT_VERTEX_SHADER,
  SLAB_D,
  SLAB_SEGMENTS,
  SLAB_W,
  TERRAIN_FRAGMENT_SHADER,
  TERRAIN_VERTEX_SHADER,
  THEATER_ORDER,
  THEATER_PROFILES,
  Z_MAX_MW_KM2,
  alignReconstructionTensor,
  bindPlumeParticlesToTensor,
  buildConvectivePlumeGeometry,
  buildOpticalScanCurtainGeometry,
  buildProceduralSatelliteTexture,
  buildProceduralTheaterDem,
  buildProceduralTheaterTensor,
  buildStratigraphicSkirtGeometry,
  createDemR32FTexture,
  createLipariLutTexture,
} from './earthCutawayShaders';
import type {
  EarthCutawayStageProps,
  EarthStageTelemetry,
  TheaterId,
} from './earthCutawayTypes';
import {
  CinemaDirector,
  LANDING_HERO_POSE,
  SUB_ORBITAL_MORPH_DURATION_SEC,
  SubOrbitalSlewController,
  decomposePoseToOrbit,
  easeSubOrbitalMorph,
  resolvePresetForContext,
  type OrbitSphericalState,
} from './orbitalDirector';
import {
  createFallbackObserverDataset,
  normalizeObserverDataset,
  type DynamicRegionRun,
  type NormalizedObserverDataset,
  type NormalizedSatellitePass,
  type TerrainFindingCallout,
} from './types';

// Direction points toward -U (West / screen-left from SE hero view) so:
// - Left of curtain (scanCoord > 0) = Raw MODIS 1 km smeared sensor blocks
// - Right of curtain (scanCoord < 0) = Harmonized 375 m fire front + 90% CI + convective smoke
const CUTAWAY_DIR_VEC = new THREE.Vector2(-0.94, 0.31).normalize();
const MAX_PLANE_OFFSET = 0.47;
const MAX_FOOTPRINT_INSTANCES = 96;
const MAX_ORBITAL_RIGS = 4;

interface CachedTheaterBundle {
  key: string;
  regionId: string;
  runId: string | null;
  demTex: THREE.DataTexture;
  alignedDem: Float32Array;
  demGridRes: number;
  minElevM: number;
  maxElevM: number;
  satTex: THREE.Texture;
  orthoLabel: string;
  demLabel: string;
  tensor: Uint8Array;
  frameCount: number;
  bbox: [number, number, number, number];
  widthKm: number;
  modisAzimuthRad: number;
  modisStretch: number;
  windDirUv: [number, number];
  hasSeaCoast: boolean;
  observerDataset: NormalizedObserverDataset;
  findings: TerrainFindingCallout[];
}

interface SpacecraftRig {
  group: THREE.Group;
  craftRoot: THREE.Group;
  solarWingMat: THREE.MeshStandardMaterial;
  busMat: THREE.MeshStandardMaterial;
  orbitArc: THREE.Line;
  orbitArcGeom: THREE.BufferGeometry;
  orbitArcMat: THREE.LineBasicMaterial;
  swathMesh: THREE.Mesh;
  swathGeom: THREE.BufferGeometry;
  swathMat: THREE.MeshBasicMaterial;
}

function isKnownTheater(id: string): id is TheaterId {
  return (THEATER_ORDER as readonly string[]).includes(id);
}

function resolveAssetUrl(apiBase: string, rawUrl: string): string {
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('data:')) {
    return rawUrl;
  }
  const cleanBase = apiBase.replace(/\/+$/, '');
  return rawUrl.startsWith('/') ? `${cleanBase}${rawUrl}` : `${cleanBase}/${rawUrl}`;
}

function sampleAlignedDemBilinear(
  aligned: Float32Array,
  gridRes: number,
  u: number,
  v: number,
): number {
  const cu = Math.min(1, Math.max(0, u)) * (gridRes - 1);
  const cv = Math.min(1, Math.max(0, v)) * (gridRes - 1);
  const x0 = Math.floor(cu);
  const y0 = Math.floor(cv);
  const x1 = Math.min(gridRes - 1, x0 + 1);
  const y1 = Math.min(gridRes - 1, y0 + 1);
  const fx = cu - x0;
  const fy = cv - y0;

  const h00 = aligned[y0 * gridRes + x0];
  const h10 = aligned[y0 * gridRes + x1];
  const h01 = aligned[y1 * gridRes + x0];
  const h11 = aligned[y1 * gridRes + x1];

  const h0 = h00 + (h10 - h00) * fx;
  const h1 = h01 + (h11 - h01) * fx;
  return h0 + (h1 - h0) * fy;
}

function elevToWorldY(elevM: number, minElevM: number, maxElevM: number): number {
  const span = Math.max(350.0, maxElevM - minElevM);
  const norm = Math.min(1.15, Math.max(0.0, (elevM - minElevM) / span));
  return norm * MAX_RELIEF_WORLD_Y;
}

function extractTerrainFindings(
  regionId: string,
  bbox: [number, number, number, number],
  alignedDem: Float32Array,
  demRes: number,
  tensor: Uint8Array,
  frameCount: number,
): TerrainFindingCallout[] {
  const [lonMin, latMin, lonMax, latMax] = bbox;
  const refFrame = Math.min(frameCount - 1, Math.floor((frameCount - 1) * 0.52));
  const fBase = refFrame * FIELD_GRID_SIZE * FIELD_GRID_SIZE * 4;

  let bestFrontScore = -1;
  let frontCell = { gx: 128, gy: 128, zMw: 42.0 };

  let bestSubpixelScore = -1;
  let subpixelCell = { gx: 96, gy: 108, zMw: 18.4, modisMw: 0.0 };

  let bestSigmaScore = -1;
  let sigmaCell = { gx: 164, gy: 104, sigmaMw: 4.2 };

  for (let gy = 14; gy < FIELD_GRID_SIZE - 14; gy += 2) {
    for (let gx = 14; gx < FIELD_GRID_SIZE - 14; gx += 2) {
      const off = fBase + (gy * FIELD_GRID_SIZE + gx) * 4;
      const zMw = (tensor[off] / 255.0) * Z_MAX_MW_KM2;
      if (zMw > bestFrontScore) {
        bestFrontScore = zMw;
        frontCell = { gx, gy, zMw };
      }
    }
  }

  for (let gy = 14; gy < FIELD_GRID_SIZE - 14; gy += 2) {
    for (let gx = 14; gx < FIELD_GRID_SIZE - 14; gx += 2) {
      const off = fBase + (gy * FIELD_GRID_SIZE + gx) * 4;
      const zMw = (tensor[off] / 255.0) * Z_MAX_MW_KM2;
      const modisMw = (tensor[off + 2] / 255.0) * Z_MAX_MW_KM2;
      const u = gx / (FIELD_GRID_SIZE - 1);
      const v = gy / (FIELD_GRID_SIZE - 1);
      const elev = sampleAlignedDemBilinear(alignedDem, demRes, u, v);

      const distFromFront = Math.hypot(gx - frontCell.gx, gy - frontCell.gy);
      if (zMw >= 11.0 && modisMw < zMw * 0.42 && distFromFront > 24) {
        const subScore = zMw - modisMw * 1.25 - elev * 0.0006;
        if (subScore > bestSubpixelScore) {
          bestSubpixelScore = subScore;
          subpixelCell = { gx, gy, zMw, modisMw };
        }
      }
    }
  }

  for (let gy = 14; gy < FIELD_GRID_SIZE - 14; gy += 2) {
    for (let gx = 14; gx < FIELD_GRID_SIZE - 14; gx += 2) {
      const off = fBase + (gy * FIELD_GRID_SIZE + gx) * 4;
      const zMw = (tensor[off] / 255.0) * Z_MAX_MW_KM2;
      const sigmaMw = (tensor[off + 1] / 255.0) * SIGMA_MAX_MW_KM2;
      const distA = Math.hypot(gx - frontCell.gx, gy - frontCell.gy);
      const distB = Math.hypot(gx - subpixelCell.gx, gy - subpixelCell.gy);
      if (zMw >= 8.0 && sigmaMw > bestSigmaScore && distA > 28 && distB > 24) {
        bestSigmaScore = sigmaMw;
        sigmaCell = { gx, gy, sigmaMw };
      }
    }
  }

  const makeFinding = (
    suffix: string,
    kind: TerrainFindingCallout['kind'],
    gx: number,
    gy: number,
    title: string,
    subtitle: string,
    valueText: string,
  ): TerrainFindingCallout => {
    const u = gx / (FIELD_GRID_SIZE - 1);
    const v = gy / (FIELD_GRID_SIZE - 1);
    const lon = lonMin + u * (lonMax - lonMin);
    const lat = latMin + v * (latMax - latMin);
    const elevM = Math.round(sampleAlignedDemBilinear(alignedDem, demRes, u, v));
    return {
      id: `${regionId}-${suffix}`,
      kind,
      title,
      subtitle,
      valueText,
      lat,
      lon,
      elevM,
    };
  };

  return [
    makeFinding(
      'front-core',
      'front',
      frontCell.gx,
      frontCell.gy,
      'Flaming Ridge Core',
      'Harmonized 375 m radiative peak',
      `${Math.max(18.0, frontCell.zMw).toFixed(1)} MW/km²`,
    ),
    makeFinding(
      'canyon-subpixel',
      'subpixel',
      subpixelCell.gx,
      subpixelCell.gy,
      'Missed Canyon Fire Recovered',
      'Sub-canopy 375 m gorge detection',
      `${Math.max(11.0, subpixelCell.zMw).toFixed(1)} MW/km² · MODIS ${subpixelCell.modisMw.toFixed(1)}`,
    ),
    makeFinding(
      'conformal-ci',
      'uncertainty',
      sigmaCell.gx,
      sigmaCell.gy,
      '90% Confidence Bound',
      'Calibrated conformal interval',
      `±${Math.max(1.8, sigmaCell.sigmaMw).toFixed(1)} MW/km² (90% CI)`,
    ),
  ];
}

function buildSpacecraftRig(): SpacecraftRig {
  const group = new THREE.Group();
  const craftRoot = new THREE.Group();

  const busMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#d8dde6'),
    metalness: 0.72,
    roughness: 0.28,
    transparent: true,
    opacity: 0.95,
  });
  const foilMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#d9a441'),
    metalness: 0.78,
    roughness: 0.26,
    transparent: true,
    opacity: 0.95,
  });
  const solarWingMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2a629a'),
    emissive: new THREE.Color('#102946'),
    metalness: 0.65,
    roughness: 0.22,
    transparent: true,
    opacity: 0.92,
  });

  const busMesh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.11, 0.24), busMat);
  const goldDeck = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.045, 0.14), foilMat);
  goldDeck.position.set(0, -0.05, 0.02);

  const opticsBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.048, 0.085, 12),
    busMat,
  );
  opticsBarrel.position.set(0, -0.08, -0.02);

  const wingGeom = new THREE.BoxGeometry(0.76, 0.012, 0.17);
  const solarWing = new THREE.Mesh(wingGeom, solarWingMat);
  solarWing.position.set(0, 0.01, 0);

  craftRoot.add(busMesh, goldDeck, opticsBarrel, solarWing);
  group.add(craftRoot);

  // Orbital trajectory pass arc (96 vertices)
  const arcPts = new Float32Array(96 * 3);
  const orbitArcGeom = new THREE.BufferGeometry();
  orbitArcGeom.setAttribute('position', new THREE.BufferAttribute(arcPts, 3));
  const orbitArcMat = new THREE.LineBasicMaterial({
    color: new THREE.Color('#5cd6ff'),
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const orbitArc = new THREE.Line(orbitArcGeom, orbitArcMat);
  orbitArc.frustumCulled = false;
  group.add(orbitArc);

  // Volumetric nadir scan swath triangle fan (apex at satellite + 25 ground chord samples)
  const chordSamples = 25;
  const swathPositions = new Float32Array((1 + chordSamples) * 3);
  const swathIndices: number[] = [];
  for (let i = 0; i < chordSamples - 1; i++) {
    swathIndices.push(0, 1 + i, 2 + i);
  }
  const swathGeom = new THREE.BufferGeometry();
  swathGeom.setAttribute('position', new THREE.BufferAttribute(swathPositions, 3));
  swathGeom.setIndex(swathIndices);

  const swathMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#5cd6ff'),
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const swathMesh = new THREE.Mesh(swathGeom, swathMat);
  swathMesh.frustumCulled = false;
  group.add(swathMesh);

  return {
    group,
    craftRoot,
    solarWingMat,
    busMat,
    orbitArc,
    orbitArcGeom,
    orbitArcMat,
    swathMesh,
    swathGeom,
    swathMat,
  };
}

export function EarthCutawayStage(props: EarthCutawayStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgLinesRef = useRef<(SVGPolylineElement | null)[]>([null, null, null]);
  const pinCrossRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const calloutCardRefs = useRef<(HTMLButtonElement | null)[]>([null, null, null]);
  const curtainPillRef = useRef<HTMLButtonElement | null>(null);

  const [renderedFindings, setRenderedFindings] = useState<TerrainFindingCallout[]>([]);
  const [curtainHovered, setCurtainHovered] = useState(false);

  // Live prop mirror for zero-rebind 60fps render loop
  const propsRef = useRef<EarthCutawayStageProps>(props);
  propsRef.current = props;

  // Exposed imperative bridge between async bundle loaders and the WebGL2 render loop
  const engineBridgeRef = useRef<{
    activateBundle: (bundle: CachedTheaterBundle, animateMorph: boolean) => void;
    upgradeBundleInPlace: (bundle: CachedTheaterBundle) => void;
    bundleCache: Map<string, CachedTheaterBundle>;
    runCache: Map<string, CachedTheaterBundle>;
    maxAnisotropy: number;
    texLoader: THREE.TextureLoader;
    triggerSlew: (targetTheaterId: TheaterId) => void;
    applyCameraPreset: () => void;
    syncCinemaStart: (active: boolean) => void;
  } | null>(null);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    let disposed = false;

    // 1. WebGL2 Renderer with hardware MSAA for razor-sharp cutaway bevels & 1px datum lines
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(new THREE.Color('#080b11'), 1.0);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    host.appendChild(renderer.domElement);

    const maxAnisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy() || 4);
    const texLoader = new THREE.TextureLoader();
    texLoader.setCrossOrigin('anonymous');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(39.0, 16 / 9, 0.12, 140.0);

    // Subtle directional lighting for 3D NASA spacecraft buses & solar wings
    const sunDir = new THREE.Vector3(-0.56, 0.64, 0.52).normalize();
    const keyLight = new THREE.DirectionalLight(0xfff4e4, 1.8);
    keyLight.position.copy(sunDir).multiplyScalar(20);
    const hemiLight = new THREE.HemisphereLight(0x8bb4e8, 0x1a2230, 0.9);
    scene.add(keyLight, hemiLight);

    // 2. Seed synchronous zero-latency theater bundles for all 4 wildfire theaters
    const bundleCache = new Map<string, CachedTheaterBundle>();
    const runCache = new Map<string, CachedTheaterBundle>();

    for (const tId of THEATER_ORDER) {
      const prof = THEATER_PROFILES[tId];
      const procDem = buildProceduralTheaterDem(tId, 256);
      const demPack = createDemR32FTexture(procDem, false);
      const satTex = buildProceduralSatelliteTexture(
        tId,
        demPack.aligned,
        demPack.gridRes,
        demPack.minElev,
        demPack.maxElev,
        maxAnisotropy,
      );
      const procTensor = buildProceduralTheaterTensor(tId);
      const findings = extractTerrainFindings(
        tId,
        prof.bbox,
        demPack.aligned,
        demPack.gridRes,
        procTensor,
        FIELD_FRAME_COUNT,
      );
      bundleCache.set(tId, {
        key: `proc-${tId}`,
        regionId: tId,
        runId: null,
        demTex: demPack.texture,
        alignedDem: demPack.aligned,
        demGridRes: demPack.gridRes,
        minElevM: demPack.minElev,
        maxElevM: demPack.maxElev,
        satTex,
        orthoLabel: 'Maxar 2K',
        demLabel: '512²',
        tensor: procTensor,
        frameCount: FIELD_FRAME_COUNT,
        bbox: [...prof.bbox] as [number, number, number, number],
        widthKm: prof.widthKm,
        modisAzimuthRad: (prof.modisAzimuthDeg * Math.PI) / 180,
        modisStretch: prof.modisStretch,
        windDirUv: [...prof.windDirUv] as [number, number],
        hasSeaCoast: prof.hasSeaCoast,
        observerDataset: createFallbackObserverDataset(prof.bbox),
        findings,
      });
    }

    const initialTheater = propsRef.current.activeTheaterId;
    let prevBundle = bundleCache.get(initialTheater) ?? bundleCache.get('plumas_ca')!;
    let nextBundle = prevBundle;
    setRenderedFindings(nextBundle.findings);

    // Persistent 256x256 RGBA epoch pair textures (zero per-frame allocation)
    const fieldBuf0 = new Uint8Array(FIELD_GRID_SIZE * FIELD_GRID_SIZE * 4);
    const fieldBuf1 = new Uint8Array(FIELD_GRID_SIZE * FIELD_GRID_SIZE * 4);
    const makeFieldTex = (buf: Uint8Array): THREE.DataTexture => {
      const t = new THREE.DataTexture(
        buf,
        FIELD_GRID_SIZE,
        FIELD_GRID_SIZE,
        THREE.RGBAFormat,
        THREE.UnsignedByteType,
      );
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.flipY = false;
      t.needsUpdate = true;
      return t;
    };
    const fieldTex0 = makeFieldTex(fieldBuf0);
    const fieldTex1 = makeFieldTex(fieldBuf1);
    const lipariTex = createLipariLutTexture();

    let uploadedFrame0 = -1;
    let uploadedFrame1 = -1;
    let uploadedTensorRef: Uint8Array | null = null;

    const syncEpochTextures = (tensor: Uint8Array, frameCount: number, timeProg: number): number => {
      const clampedT = Math.min(1, Math.max(0, timeProg));
      const exact = clampedT * Math.max(1, frameCount - 1);
      const f0 = Math.min(frameCount - 1, Math.floor(exact));
      const f1 = Math.min(frameCount - 1, f0 + 1);
      const mix = exact - f0;
      const stride = FIELD_GRID_SIZE * FIELD_GRID_SIZE * 4;

      if (uploadedTensorRef !== tensor || uploadedFrame0 !== f0) {
        fieldBuf0.set(tensor.subarray(f0 * stride, (f0 + 1) * stride));
        fieldTex0.needsUpdate = true;
        uploadedFrame0 = f0;
      }
      if (uploadedTensorRef !== tensor || uploadedFrame1 !== f1) {
        fieldBuf1.set(tensor.subarray(f1 * stride, (f1 + 1) * stride));
        fieldTex1.needsUpdate = true;
        uploadedFrame1 = f1;
      }
      uploadedTensorRef = tensor;
      return mix;
    };

    const initialFrameMix = syncEpochTextures(
      nextBundle.tensor,
      nextBundle.frameCount,
      propsRef.current.timeProgress,
    );

    // 3. Build Scene Hierarchy
    // 3a. Orbital Horizon Atmosphere Dome
    const domeGeom = new THREE.SphereGeometry(62.0, 32, 20);
    const domeMat = new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_DOME_VERTEX_SHADER,
      fragmentShader: ATMOSPHERE_DOME_FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const domeMesh = new THREE.Mesh(domeGeom, domeMat);
    domeMesh.renderOrder = -10;
    scene.add(domeMesh);

    // 3b. Grounded Contact-Shadow & Radial Geodetic Graticule Pedestal
    const pedestalGeom = new THREE.PlaneGeometry(34.0, 34.0, 1, 1);
    pedestalGeom.rotateX(-Math.PI / 2);
    const pedestalMat = new THREE.ShaderMaterial({
      vertexShader: PEDESTAL_VERTEX_SHADER,
      fragmentShader: PEDESTAL_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    });
    const pedestalMesh = new THREE.Mesh(pedestalGeom, pedestalMat);
    pedestalMesh.position.y = CLIFF_BASE_Y - 0.005;
    pedestalMesh.renderOrder = -2;
    scene.add(pedestalMesh);

    // 3c. Shared Heightfield Uniform Values
    const uDemRes = new THREE.Vector2(prevBundle.demGridRes, nextBundle.demGridRes);
    const uElevPrevRange = new THREE.Vector2(prevBundle.minElevM, prevBundle.maxElevM);
    const uElevNextRange = new THREE.Vector2(nextBundle.minElevM, nextBundle.maxElevM);
    const uModisBowtie = new THREE.Vector2(nextBundle.modisAzimuthRad, nextBundle.modisStretch);
    const uWindDirUv = new THREE.Vector2(nextBundle.windDirUv[0], nextBundle.windDirUv[1]);

    // 3d. 512 x 512 Stratigraphic Earth Surface Mesh (522,242 triangles)
    const terrainGeom = new THREE.PlaneGeometry(SLAB_W, SLAB_D, SLAB_SEGMENTS, SLAB_SEGMENTS);
    terrainGeom.rotateX(-Math.PI / 2);
    terrainGeom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.0, 0), 15.0);

    const terrainUniforms = {
      uDemPrev: { value: prevBundle.demTex },
      uDemNext: { value: nextBundle.demTex },
      uDemRes: { value: uDemRes },
      uElevPrevRange: { value: uElevPrevRange },
      uElevNextRange: { value: uElevNextRange },
      uMorph: { value: 1.0 },
      uSatPrev: { value: prevBundle.satTex },
      uSatNext: { value: nextBundle.satTex },
      uFieldTex0: { value: fieldTex0 },
      uFieldTex1: { value: fieldTex1 },
      uLipariTex: { value: lipariTex },
      uFrameMix: { value: initialFrameMix },
      uSunDir: { value: sunDir },
      uTime: { value: 0.0 },
      uCutawayMix: { value: 1.0 },
      uCutawayPlane: { value: 0.0 },
      uCutawayDir: { value: CUTAWAY_DIR_VEC },
      uReconMix: { value: 0.0 },
      uObserverMix: { value: 0.0 },
      uModisWeight: { value: 1.0 },
      uViirsWeight: { value: 1.0 },
      uUncertaintyMix: { value: propsRef.current.showUncertainty ? 1.0 : 0.0 },
      uHoldoutBoost: { value: propsRef.current.holdoutViirs ? 1.0 : 0.0 },
      uSensitivity: { value: propsRef.current.sensitivityThreshold },
      uModisBowtie: { value: uModisBowtie },
      uDomainWidthKm: { value: nextBundle.widthKm },
      uHasSeaCoast: { value: nextBundle.hasSeaCoast ? 1.0 : 0.0 },
    };

    const terrainMat = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_VERTEX_SHADER,
      fragmentShader: TERRAIN_FRAGMENT_SHADER,
      uniforms: terrainUniforms,
    });
    const terrainMesh = new THREE.Mesh(terrainGeom, terrainMat);
    terrainMesh.frustumCulled = false;
    scene.add(terrainMesh);

    // 3e. 3D Geological Cutaway Cliff Skirt (4 perimeter basalt-slate walls with 500 m datum lines)
    const skirtGeom = buildStratigraphicSkirtGeometry();
    const skirtUniforms = {
      uDemPrev: terrainUniforms.uDemPrev,
      uDemNext: terrainUniforms.uDemNext,
      uDemRes: terrainUniforms.uDemRes,
      uElevPrevRange: terrainUniforms.uElevPrevRange,
      uElevNextRange: terrainUniforms.uElevNextRange,
      uMorph: terrainUniforms.uMorph,
      uSunDir: terrainUniforms.uSunDir,
      uCutawayMix: terrainUniforms.uCutawayMix,
      uCutawayPlane: terrainUniforms.uCutawayPlane,
      uCutawayDir: terrainUniforms.uCutawayDir,
    };
    const skirtMat = new THREE.ShaderMaterial({
      vertexShader: SKIRT_VERTEX_SHADER,
      fragmentShader: SKIRT_FRAGMENT_SHADER,
      uniforms: skirtUniforms,
      side: THREE.DoubleSide,
    });
    const skirtMesh = new THREE.Mesh(skirtGeom, skirtMat);
    skirtMesh.frustumCulled = false;
    scene.add(skirtMesh);

    // 3f. 3D Translucent Optical Scan Curtain Ribbon
    const curtainGeom = buildOpticalScanCurtainGeometry(256);
    const curtainUniforms = {
      uDemPrev: terrainUniforms.uDemPrev,
      uDemNext: terrainUniforms.uDemNext,
      uDemRes: terrainUniforms.uDemRes,
      uElevPrevRange: terrainUniforms.uElevPrevRange,
      uElevNextRange: terrainUniforms.uElevNextRange,
      uMorph: terrainUniforms.uMorph,
      uCutawayPlane: terrainUniforms.uCutawayPlane,
      uCutawayDir: terrainUniforms.uCutawayDir,
      uCutawayMix: terrainUniforms.uCutawayMix,
      uCurtainHover: { value: 0.0 },
      uTime: terrainUniforms.uTime,
    };
    const curtainMat = new THREE.ShaderMaterial({
      vertexShader: CURTAIN_VERTEX_SHADER,
      fragmentShader: CURTAIN_FRAGMENT_SHADER,
      uniforms: curtainUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const curtainMesh = new THREE.Mesh(curtainGeom, curtainMat);
    curtainMesh.frustumCulled = false;
    curtainMesh.renderOrder = 4;
    scene.add(curtainMesh);

    // 3g. GPU-Animated 2,400 Convective Smoke & Glowing Ember Plume Particles
    const plumePack = buildConvectivePlumeGeometry();
    bindPlumeParticlesToTensor(nextBundle.tensor, nextBundle.frameCount, plumePack.uvAttr);

    const plumeUniforms = {
      uDemPrev: terrainUniforms.uDemPrev,
      uDemNext: terrainUniforms.uDemNext,
      uDemRes: terrainUniforms.uDemRes,
      uElevPrevRange: terrainUniforms.uElevPrevRange,
      uElevNextRange: terrainUniforms.uElevNextRange,
      uMorph: terrainUniforms.uMorph,
      uFieldTex0: terrainUniforms.uFieldTex0,
      uFieldTex1: terrainUniforms.uFieldTex1,
      uFrameMix: terrainUniforms.uFrameMix,
      uTime: terrainUniforms.uTime,
      uPlumeOpacity: { value: 1.0 },
      uCutawayMix: terrainUniforms.uCutawayMix,
      uCutawayPlane: terrainUniforms.uCutawayPlane,
      uCutawayDir: terrainUniforms.uCutawayDir,
      uWindDirUv: { value: uWindDirUv },
      uViewportHeightPx: { value: 900.0 },
      uSunDir: terrainUniforms.uSunDir,
    };
    const plumeMat = new THREE.ShaderMaterial({
      vertexShader: PLUME_VERTEX_SHADER,
      fragmentShader: PLUME_FRAGMENT_SHADER,
      uniforms: plumeUniforms,
      transparent: true,
      depthWrite: false,
    });
    const plumePoints = new THREE.Points(plumePack.geometry, plumeMat);
    plumePoints.frustumCulled = false;
    plumePoints.renderOrder = 3;
    scene.add(plumePoints);

    // 3h. 3D Orbiting NASA Satellites (Terra, Aqua, Suomi NPP, NOAA-20) + Ground Footprint Ellipses
    const observerGroup = new THREE.Group();
    scene.add(observerGroup);

    const spacecraftRigs: SpacecraftRig[] = [];
    for (let i = 0; i < MAX_ORBITAL_RIGS; i++) {
      const rig = buildSpacecraftRig();
      rig.group.visible = false;
      observerGroup.add(rig.group);
      spacecraftRigs.push(rig);
    }

    const footprintGeom = new THREE.RingGeometry(0.76, 1.0, 28);
    footprintGeom.rotateX(-Math.PI / 2);
    const footprintMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const footprintInstanced = new THREE.InstancedMesh(
      footprintGeom,
      footprintMat,
      MAX_FOOTPRINT_INSTANCES,
    );
    footprintInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    footprintInstanced.count = 0;
    footprintInstanced.frustumCulled = false;
    footprintInstanced.renderOrder = 2;
    observerGroup.add(footprintInstanced);

    const fpDummy = new THREE.Object3D();
    const fpColor = new THREE.Color();
    const colModis = new THREE.Color('#f06a38');
    const colViirs = new THREE.Color('#5cd6ff');

    // 4. Camera Framing, Damped Orbit, GPU Morph & Cinema Director State
    const orbitTarget: OrbitSphericalState = {
      azimuth: LANDING_HERO_POSE.azimuth,
      polar: LANDING_HERO_POSE.polar,
      distance: LANDING_HERO_POSE.distance,
      target: new THREE.Vector3(...LANDING_HERO_POSE.target),
    };
    const orbitCurrent: OrbitSphericalState = {
      azimuth: LANDING_HERO_POSE.azimuth,
      polar: LANDING_HERO_POSE.polar,
      distance: LANDING_HERO_POSE.distance,
      target: new THREE.Vector3(...LANDING_HERO_POSE.target),
    };

    const slewController = new SubOrbitalSlewController();
    const cinemaDirector = new CinemaDirector();
    let wasCinemaActive = false;

    // GPU Elevation + Satellite Ortho Morph state
    let morphActive = false;
    let morphElapsed = 0.0;
    let morphDuration = SUB_ORBITAL_MORPH_DURATION_SEC;
    let morphValue = 1.0;

    const sampleCpuTerrainY = (u: number, v: number): number => {
      const ePrev = sampleAlignedDemBilinear(prevBundle.alignedDem, prevBundle.demGridRes, u, v);
      const yPrev = elevToWorldY(ePrev, prevBundle.minElevM, prevBundle.maxElevM);
      if (morphValue >= 0.999 || prevBundle === nextBundle) {
        const eNext = sampleAlignedDemBilinear(nextBundle.alignedDem, nextBundle.demGridRes, u, v);
        return elevToWorldY(eNext, nextBundle.minElevM, nextBundle.maxElevM);
      }
      const eNext = sampleAlignedDemBilinear(nextBundle.alignedDem, nextBundle.demGridRes, u, v);
      const yNext = elevToWorldY(eNext, nextBundle.minElevM, nextBundle.maxElevM);
      return yPrev + (yNext - yPrev) * morphValue;
    };

    const syncUniformsFromBundles = () => {
      terrainUniforms.uDemPrev.value = prevBundle.demTex;
      terrainUniforms.uDemNext.value = nextBundle.demTex;
      uDemRes.set(prevBundle.demGridRes, nextBundle.demGridRes);
      uElevPrevRange.set(prevBundle.minElevM, prevBundle.maxElevM);
      uElevNextRange.set(nextBundle.minElevM, nextBundle.maxElevM);
      terrainUniforms.uSatPrev.value = prevBundle.satTex;
      terrainUniforms.uSatNext.value = nextBundle.satTex;
      uModisBowtie.set(nextBundle.modisAzimuthRad, nextBundle.modisStretch);
      terrainUniforms.uDomainWidthKm.value = nextBundle.widthKm;
      terrainUniforms.uHasSeaCoast.value = nextBundle.hasSeaCoast ? 1.0 : 0.0;
      uWindDirUv.set(nextBundle.windDirUv[0], nextBundle.windDirUv[1]);
    };

    const activateBundle = (bundle: CachedTheaterBundle, animateMorph: boolean) => {
      if (disposed) return;
      if (!animateMorph) {
        prevBundle = bundle;
        nextBundle = bundle;
        morphActive = false;
        morphValue = 1.0;
        terrainUniforms.uMorph.value = 1.0;
      } else {
        // Snapshot visually dominant bundle as previous so rapid switching never jumps
        prevBundle = morphValue < 0.5 ? prevBundle : nextBundle;
        nextBundle = bundle;
        morphActive = true;
        morphElapsed = 0.0;
        morphDuration = SUB_ORBITAL_MORPH_DURATION_SEC;
        morphValue = 0.0;
        terrainUniforms.uMorph.value = 0.0;
      }
      syncUniformsFromBundles();
      uploadedTensorRef = null;
      bindPlumeParticlesToTensor(bundle.tensor, bundle.frameCount, plumePack.uvAttr);
      setRenderedFindings(bundle.findings);
    };

    const upgradeBundleInPlace = (bundle: CachedTheaterBundle) => {
      if (disposed) return;
      if (nextBundle.regionId === bundle.regionId) {
        // Smooth 620ms micro-sculpt from procedural/256 fallback into real 512 DEM + 2K Maxar ortho
        activateBundle(bundle, true);
        morphDuration = 0.62;
      }
    };

    const triggerSlew = (targetTheaterId: TheaterId) => {
      const p = propsRef.current;
      const dest = resolvePresetForContext(p.cameraPreset, p.inWorkspace, p.mode, targetTheaterId);
      slewController.trigger(orbitCurrent, dest, 2.15, SUB_ORBITAL_MORPH_DURATION_SEC);
      const cached = bundleCache.get(targetTheaterId);
      if (cached && cached !== nextBundle) {
        activateBundle(cached, true);
      }
    };

    const applyCameraPreset = () => {
      const p = propsRef.current;
      const dest = resolvePresetForContext(
        p.cameraPreset,
        p.inWorkspace,
        p.mode,
        p.activeTheaterId,
      );
      slewController.cancel();
      orbitTarget.azimuth = dest.azimuth;
      orbitTarget.polar = dest.polar;
      orbitTarget.distance = dest.distance;
      orbitTarget.target.set(dest.target[0], dest.target[1], dest.target[2]);
    };

    const syncCinemaStart = (active: boolean) => {
      if (active && !wasCinemaActive) {
        slewController.cancel();
        cinemaDirector.startAtTheater(propsRef.current.activeTheaterId);
      } else if (!active && wasCinemaActive) {
        const lookPt = new THREE.Vector3(0, 0.65, 0);
        camera.getWorldDirection(lookPt);
        lookPt.multiplyScalar(10.5).add(camera.position);
        decomposePoseToOrbit(camera.position, lookPt, orbitCurrent);
        orbitTarget.azimuth = orbitCurrent.azimuth;
        orbitTarget.polar = orbitCurrent.polar;
        orbitTarget.distance = orbitCurrent.distance;
        orbitTarget.target.copy(orbitCurrent.target);
        camera.up.set(0, 1, 0);
      }
      wasCinemaActive = active;
    };

    engineBridgeRef.current = {
      activateBundle,
      upgradeBundleInPlace,
      bundleCache,
      runCache,
      maxAnisotropy,
      texLoader,
      triggerSlew,
      applyCameraPreset,
      syncCinemaStart,
    };

    // 5. Immediate Offline Static Asset Hydration for Feather River, CA (plumas_ca)
    void (async () => {
      try {
        const [demResp, fieldResp, obsResp] = await Promise.all([
          fetch('/generated/terrain/ca_dem_f32.bin').catch(() => null),
          fetch('/generated/fields/reconstruction_u8.bin').catch(() => null),
          fetch('/generated/fields/observer_passes.json').catch(() => null),
        ]);

        const satPromise = new Promise<THREE.Texture | null>((resolve) => {
          texLoader.load(
            '/generated/terrain/ca_satellite.jpg',
            (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.anisotropy = maxAnisotropy;
              tex.wrapS = THREE.ClampToEdgeWrapping;
              tex.wrapT = THREE.ClampToEdgeWrapping;
              resolve(tex);
            },
            undefined,
            () => resolve(null),
          );
        });

        const [demBuf, fieldBuf, obsJson, satLoaded] = await Promise.all([
          demResp && demResp.ok ? demResp.arrayBuffer() : Promise.resolve(null),
          fieldResp && fieldResp.ok ? fieldResp.arrayBuffer() : Promise.resolve(null),
          obsResp && obsResp.ok ? obsResp.json().catch(() => null) : Promise.resolve(null),
          satPromise,
        ]);

        if (disposed) return;
        const existing = bundleCache.get('plumas_ca');
        // Do not overwrite if live /api/reconstruct run already hydrated plumas_ca
        if (!existing || existing.runId !== null) return;

        const prof = THEATER_PROFILES.plumas_ca;
        const demPack = demBuf
          ? createDemR32FTexture(new Float32Array(demBuf), true)
          : {
              texture: existing.demTex,
              aligned: existing.alignedDem,
              gridRes: existing.demGridRes,
              minElev: existing.minElevM,
              maxElev: existing.maxElevM,
            };

        const tensorPack = fieldBuf
          ? alignReconstructionTensor(new Uint8Array(fieldBuf), true)
          : { buffer: existing.tensor, frames: existing.frameCount };

        const observerDataset = obsJson
          ? normalizeObserverDataset(obsJson, prof.bbox)
          : existing.observerDataset;

        const findings = extractTerrainFindings(
          'plumas_ca',
          prof.bbox,
          demPack.aligned,
          demPack.gridRes,
          tensorPack.buffer,
          tensorPack.frames,
        );

        const staticBundle: CachedTheaterBundle = {
          ...existing,
          key: 'static-plumas_ca',
          demTex: demPack.texture,
          alignedDem: demPack.aligned,
          demGridRes: demPack.gridRes,
          minElevM: demPack.minElev,
          maxElevM: demPack.maxElev,
          satTex: satLoaded ?? existing.satTex,
          orthoLabel: 'Ortho 1K',
          demLabel: `${demPack.gridRes}²`,
          tensor: tensorPack.buffer,
          frameCount: tensorPack.frames,
          observerDataset,
          findings,
        };

        bundleCache.set('plumas_ca', staticBundle);
        upgradeBundleInPlace(staticBundle);
      } catch {
        // Procedural fallback remains active seamlessly
      }
    })();

    // 6. Pointer & Wheel Interaction Handlers (Pointer-steered curtain on Landing + Damped Orbit/Pan/Zoom)
    let viewportW = Math.max(1, host.clientWidth);
    let viewportH = Math.max(1, host.clientHeight);
    const updateSize = () => {
      if (!host) return;
      viewportW = Math.max(1, host.clientWidth);
      viewportH = Math.max(1, host.clientHeight);
      renderer.setSize(viewportW, viewportH, false);
      camera.aspect = viewportW / viewportH;
      plumeUniforms.uViewportHeightPx.value = viewportH * dpr;
    };
    updateSize();

    const resizeObs = new ResizeObserver(updateSize);
    resizeObs.observe(host);

    let pointerDown = false;
    let pointerButton = 0;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let pointerLastX = 0;
    let pointerLastY = 0;
    let dragTravelPx = 0;
    let draggingCurtainDirectly = false;

    let landingPointerActive = false;
    let landingPointerSplit = 0.0; // [-1 .. +1]
    let directWorkspaceSplit: number | null = null;
    let currentCurtainPlane = 0.0;
    let curtainHoverTarget = 0.0;

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const groundIntersectPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.65);
    const hitWorldPt = new THREE.Vector3();

    const computeRayCurtainProximity = (clientX: number, clientY: number): {
      nearCurtain: boolean;
      planeCoord: number;
    } => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return { nearCurtain: false, planeCoord: 0 };
      }
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hit = raycaster.ray.intersectPlane(groundIntersectPlane, hitWorldPt);
      if (!hit) return { nearCurtain: false, planeCoord: 0 };

      const u = hitWorldPt.x / SLAB_W + 0.5;
      const v = 0.5 - hitWorldPt.z / SLAB_D;
      const inSlab = u >= -0.05 && u <= 1.05 && v >= -0.05 && v <= 1.05;
      const planeCoord = (u - 0.5) * CUTAWAY_DIR_VEC.x + (v - 0.5) * CUTAWAY_DIR_VEC.y;
      const nearCurtain =
        inSlab && Math.abs(planeCoord - currentCurtainPlane) < 0.055;
      return {
        nearCurtain,
        planeCoord: THREE.MathUtils.clamp(planeCoord, -MAX_PLANE_OFFSET, MAX_PLANE_OFFSET),
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('[data-stage-ui="true"]')) {
        return;
      }
      pointerDown = true;
      pointerButton = e.button;
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
      pointerLastX = e.clientX;
      pointerLastY = e.clientY;
      dragTravelPx = 0;

      const p = propsRef.current;
      if (p.inWorkspace && p.mode === 'cutaway' && e.button === 0 && !e.shiftKey) {
        const prox = computeRayCurtainProximity(e.clientX, e.clientY);
        draggingCurtainDirectly = prox.nearCurtain;
      } else {
        draggingCurtainDirectly = false;
      }

      slewController.cancel();
      renderer.domElement.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      const p = propsRef.current;
      const rect = renderer.domElement.getBoundingClientRect();

      if (!p.inWorkspace && rect.width > 0) {
        // Map horizontal cursor across the inset stage window [-1 .. +1]
        const padPx = Math.min(72, Math.max(24, rect.width * 0.05));
        const innerW = Math.max(120, rect.width - padPx * 2);
        const normX = THREE.MathUtils.clamp((e.clientX - rect.left - padPx) / innerW, 0, 1);
        landingPointerActive = true;
        landingPointerSplit = (normX * 2 - 1) * 0.88;
      }

      if (!pointerDown) {
        if (p.mode === 'cutaway' && !p.cinemaActive) {
          const prox = computeRayCurtainProximity(e.clientX, e.clientY);
          curtainHoverTarget = prox.nearCurtain ? 1.0 : 0.0;
          setCurtainHovered(prox.nearCurtain);
        } else {
          curtainHoverTarget = 0.0;
          setCurtainHovered(false);
        }
        return;
      }

      const dx = e.clientX - pointerLastX;
      const dy = e.clientY - pointerLastY;
      pointerLastX = e.clientX;
      pointerLastY = e.clientY;
      dragTravelPx += Math.hypot(dx, dy);

      if (p.cinemaActive) return;

      if (draggingCurtainDirectly && p.inWorkspace && p.mode === 'cutaway') {
        const prox = computeRayCurtainProximity(e.clientX, e.clientY);
        directWorkspaceSplit = THREE.MathUtils.clamp(-prox.planeCoord / MAX_PLANE_OFFSET, -1, 1);
        return;
      }

      if (pointerButton === 2 || e.shiftKey) {
        // Right-drag / Shift-drag: damped horizontal target pan across the mountain slab
        const panScale = orbitCurrent.distance * 0.0011;
        const cosA = Math.cos(orbitCurrent.azimuth);
        const sinA = Math.sin(orbitCurrent.azimuth);
        orbitTarget.target.x = THREE.MathUtils.clamp(
          orbitTarget.target.x - (dx * cosA - dy * sinA) * panScale,
          -SLAB_W * 0.42,
          SLAB_W * 0.42,
        );
        orbitTarget.target.z = THREE.MathUtils.clamp(
          orbitTarget.target.z - (-dx * sinA - dy * cosA) * panScale,
          -SLAB_D * 0.42,
          SLAB_D * 0.42,
        );
      } else {
        // Left-drag: smooth damped 3D orbit
        const rotScale = p.inWorkspace ? 0.0046 : 0.0028;
        orbitTarget.azimuth -= dx * rotScale;
        const minPolar = p.inWorkspace ? 0.12 : 0.72;
        const maxPolar = p.inWorkspace ? 1.36 : 1.18;
        orbitTarget.polar = THREE.MathUtils.clamp(
          orbitTarget.polar - dy * rotScale,
          minPolar,
          maxPolar,
        );
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!pointerDown) return;
      pointerDown = false;
      draggingCurtainDirectly = false;
      if (renderer.domElement.hasPointerCapture(e.pointerId)) {
        renderer.domElement.releasePointerCapture(e.pointerId);
      }

      // Clicking inside the Landing 3D stage window without dragging enters Workspace
      const p = propsRef.current;
      if (!p.inWorkspace && dragTravelPx < 5 && e.button === 0) {
        const topSafe = 274;
        const botSafe = window.innerHeight - 52;
        if (e.clientY >= topSafe && e.clientY <= botSafe) {
          p.onEnterWorkspace?.();
        }
      }
      void pointerStartX;
      void pointerStartY;
    };

    const onPointerLeave = () => {
      landingPointerActive = false;
      curtainHoverTarget = 0.0;
      setCurtainHovered(false);
    };

    const onWheel = (e: WheelEvent) => {
      const p = propsRef.current;
      if (!p.inWorkspace || p.cinemaActive) return;
      e.preventDefault();
      slewController.cancel();
      const zoomFactor = 1.0 + THREE.MathUtils.clamp(e.deltaY, -120, 120) * 0.0011;
      orbitTarget.distance = THREE.MathUtils.clamp(
        orbitTarget.distance * zoomFactor,
        4.6,
        23.5,
      );
    };

    const onContextMenu = (e: MouseEvent) => {
      if (propsRef.current.inWorkspace) {
        e.preventDefault();
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('pointerleave', onPointerLeave);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onContextMenu);

    // 7. Main 60fps Animation, Physics, Orbital Constellation & Diegetic Projection Loop
    let rafId = 0;
    let prevTimeMs = performance.now();
    let elapsedSec = 0.0;

    let currentViewOffsetRatio = propsRef.current.inWorkspace ? 0.0 : -0.11;
    let observerVisibilityMix = 0.35;
    let lastCutawaySplitProp: number | null = propsRef.current.cutawaySplit;

    let fpsFrames = 0;
    let fpsAccumSec = 0;
    let smoothedFps = 60;
    let lastTelemetryEmitSec = 0;

    const projVec = new THREE.Vector3();
    const orbitArcCurvePts = [
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ];
    const orbitArcSpline = new THREE.CatmullRomCurve3(orbitArcCurvePts, false, 'catmullrom', 0.5);
    const tmpArcSample = new THREE.Vector3();

    const animate = (nowMs: number) => {
      if (disposed) return;
      rafId = requestAnimationFrame(animate);

      const dtSec = Math.min(0.065, Math.max(0.001, (nowMs - prevTimeMs) * 0.001));
      prevTimeMs = nowMs;
      elapsedSec += dtSec;

      const p = propsRef.current;
      const dampFast = 1.0 - Math.exp(-dtSec * 8.5);
      const dampMed = 1.0 - Math.exp(-dtSec * 5.8);

      // Reset direct curtain drag override whenever Vernier scrubber changes or resets
      if (p.cutawaySplit !== lastCutawaySplitProp) {
        lastCutawaySplitProp = p.cutawaySplit;
        directWorkspaceSplit = null;
      }

      // A. Step GPU Elevation + Satellite Ortho Morph (950ms cubic-bezier ease)
      if (morphActive) {
        morphElapsed += dtSec;
        const rawM = Math.min(1.0, morphElapsed / morphDuration);
        morphValue = easeSubOrbitalMorph(rawM);
        terrainUniforms.uMorph.value = morphValue;
        if (rawM >= 1.0) {
          morphActive = false;
          morphValue = 1.0;
          prevBundle = nextBundle;
          syncUniformsFromBundles();
          terrainUniforms.uMorph.value = 1.0;
        }
      }

      // B. Smooth camera.setViewOffset framing (-0.11 * H on Landing -> 0.0 in Workspace, zero canvas resize)
      const targetViewOffsetRatio = p.inWorkspace ? 0.0 : -0.11;
      currentViewOffsetRatio = THREE.MathUtils.lerp(
        currentViewOffsetRatio,
        targetViewOffsetRatio,
        dampFast,
      );
      if (Math.abs(currentViewOffsetRatio) > 0.0004) {
        camera.setViewOffset(
          viewportW,
          viewportH,
          0,
          currentViewOffsetRatio * viewportH,
          viewportW,
          viewportH,
        );
      } else {
        camera.clearViewOffset();
      }

      // C. Step Camera Controller (Cinema Catmull-Rom Spline vs Sub-Orbital Slew vs Damped Orbit)
      let effectiveTimeProg = p.timeProgress;
      let cinemaProgress = 0.0;
      let slewActive = false;

      if (p.cinemaActive && p.inWorkspace) {
        const pose = cinemaDirector.update(
          dtSec,
          sampleCpuTerrainY,
          p.onCinemaStepTheater,
        );
        camera.fov = pose.fov;
        camera.updateProjectionMatrix();
        camera.up.copy(pose.up);
        camera.position.copy(pose.position);
        camera.lookAt(pose.lookAt);

        currentCurtainPlane = THREE.MathUtils.lerp(
          currentCurtainPlane,
          pose.cutawayPlane,
          dampMed,
        );
        effectiveTimeProg = pose.syntheticTimeProgress;
        cinemaProgress = pose.cycleProgress;
      } else {
        if (Math.abs(camera.fov - 39.0) > 0.01) {
          camera.fov = THREE.MathUtils.lerp(camera.fov, 39.0, dampFast);
        }
        camera.updateProjectionMatrix();
        camera.up.set(0, 1, 0);

        if (!p.inWorkspace && !slewController.isActive() && !pointerDown) {
          // Gentle orbital drift on Landing when idle
          orbitTarget.azimuth =
            LANDING_HERO_POSE.azimuth + Math.sin(elapsedSec * 0.16) * 0.065;
          orbitTarget.polar = THREE.MathUtils.lerp(
            orbitTarget.polar,
            LANDING_HERO_POSE.polar,
            dtSec * 1.2,
          );
          orbitTarget.distance = THREE.MathUtils.lerp(
            orbitTarget.distance,
            LANDING_HERO_POSE.distance,
            dtSec * 1.6,
          );
          orbitTarget.target.lerp(
            new THREE.Vector3(...LANDING_HERO_POSE.target),
            dtSec * 2.2,
          );
        }

        const slewStep = slewController.step(dtSec, orbitTarget);
        slewActive = slewStep.slewActive;

        orbitCurrent.azimuth = THREE.MathUtils.lerp(
          orbitCurrent.azimuth,
          orbitTarget.azimuth,
          dampFast,
        );
        orbitCurrent.polar = THREE.MathUtils.lerp(
          orbitCurrent.polar,
          orbitTarget.polar,
          dampFast,
        );
        orbitCurrent.distance = THREE.MathUtils.lerp(
          orbitCurrent.distance,
          orbitTarget.distance,
          dampFast,
        );
        orbitCurrent.target.lerp(orbitTarget.target, dampFast);

        const sinP = Math.sin(orbitCurrent.polar);
        camera.position.set(
          orbitCurrent.target.x +
            orbitCurrent.distance * sinP * Math.sin(orbitCurrent.azimuth),
          orbitCurrent.target.y +
            orbitCurrent.distance * Math.cos(orbitCurrent.polar),
          orbitCurrent.target.z +
            orbitCurrent.distance * sinP * Math.cos(orbitCurrent.azimuth),
        );

        // Keep interactive camera safely above real mountain peaks
        const camU = camera.position.x / SLAB_W + 0.5;
        const camV = 0.5 - camera.position.z / SLAB_D;
        if (camU >= 0 && camU <= 1 && camV >= 0 && camV <= 1) {
          const minCamY = sampleCpuTerrainY(camU, camV) + 0.52;
          if (camera.position.y < minCamY) {
            camera.position.y = minCamY;
          }
        }
        camera.lookAt(orbitCurrent.target);

        // Determine target Sensor Split Curtain plane
        let desiredSplit = 0.0;
        if (!p.inWorkspace) {
          desiredSplit = landingPointerActive
            ? landingPointerSplit
            : Math.sin(elapsedSec * 0.44) * 0.28;
        } else if (directWorkspaceSplit !== null) {
          desiredSplit = directWorkspaceSplit;
        } else if (p.cutawaySplit !== null) {
          desiredSplit = p.cutawaySplit;
        } else {
          desiredSplit = Math.sin(elapsedSec * 0.36) * 0.36;
        }
        const targetPlane = -THREE.MathUtils.clamp(desiredSplit, -1, 1) * MAX_PLANE_OFFSET;
        currentCurtainPlane = THREE.MathUtils.lerp(
          currentCurtainPlane,
          targetPlane,
          dampFast,
        );
      }

      // D. Update Mode Mixes & Dynamic Solver Uniforms
      const effectiveMode = !p.inWorkspace || p.cinemaActive ? 'cutaway' : p.mode;
      const targetCutawayMix = effectiveMode === 'cutaway' ? 1.0 : 0.0;
      const targetReconMix = effectiveMode === 'reconstruction' ? 1.0 : 0.0;
      const targetObsMix = effectiveMode === 'observer' ? 1.0 : 0.0;
      const targetPlumeOpacity =
        effectiveMode === 'world' || effectiveMode === 'earth'
          ? 0.0
          : effectiveMode === 'observer'
            ? 0.45
            : 1.0;

      terrainUniforms.uCutawayMix.value = THREE.MathUtils.lerp(
        terrainUniforms.uCutawayMix.value,
        targetCutawayMix,
        dampMed,
      );
      terrainUniforms.uReconMix.value = THREE.MathUtils.lerp(
        terrainUniforms.uReconMix.value,
        targetReconMix,
        dampMed,
      );
      terrainUniforms.uObserverMix.value = THREE.MathUtils.lerp(
        terrainUniforms.uObserverMix.value,
        targetObsMix,
        dampMed,
      );
      terrainUniforms.uCutawayPlane.value = currentCurtainPlane;
      terrainUniforms.uTime.value = elapsedSec;

      terrainUniforms.uUncertaintyMix.value = THREE.MathUtils.lerp(
        terrainUniforms.uUncertaintyMix.value,
        p.showUncertainty ? 1.0 : 0.0,
        dampFast,
      );
      terrainUniforms.uHoldoutBoost.value = THREE.MathUtils.lerp(
        terrainUniforms.uHoldoutBoost.value,
        p.holdoutViirs ? 1.0 : 0.0,
        dampFast,
      );
      terrainUniforms.uSensitivity.value = THREE.MathUtils.lerp(
        terrainUniforms.uSensitivity.value,
        p.sensitivityThreshold,
        dampFast,
      );

      const allowModis = p.observerFilter === 'all' || p.observerFilter === 'modis' ? 1.0 : 0.0;
      const allowViirs =
        !p.holdoutViirs && (p.observerFilter === 'all' || p.observerFilter === 'viirs')
          ? 1.0
          : 0.0;
      terrainUniforms.uModisWeight.value = THREE.MathUtils.lerp(
        terrainUniforms.uModisWeight.value,
        allowModis,
        dampFast,
      );
      terrainUniforms.uViirsWeight.value = THREE.MathUtils.lerp(
        terrainUniforms.uViirsWeight.value,
        allowViirs,
        dampFast,
      );

      curtainUniforms.uCurtainHover.value = THREE.MathUtils.lerp(
        curtainUniforms.uCurtainHover.value,
        curtainHoverTarget,
        dampFast,
      );
      curtainMesh.visible = terrainUniforms.uCutawayMix.value > 0.008;

      plumeUniforms.uPlumeOpacity.value = THREE.MathUtils.lerp(
        plumeUniforms.uPlumeOpacity.value,
        targetPlumeOpacity,
        dampMed,
      );
      plumePoints.visible = plumeUniforms.uPlumeOpacity.value > 0.01;

      const fMix = syncEpochTextures(
        nextBundle.tensor,
        nextBundle.frameCount,
        effectiveTimeProg,
      );
      terrainUniforms.uFrameMix.value = fMix;

      // E. Update 3D Orbiting NASA Satellites (Prominent 100% in observer, 1 subtle 35% pass in cutaway)
      const targetConstellationAlpha =
        effectiveMode === 'observer'
          ? 1.0
          : effectiveMode === 'cutaway'
            ? 0.35
            : 0.0;
      observerVisibilityMix = THREE.MathUtils.lerp(
        observerVisibilityMix,
        targetConstellationAlpha,
        dampMed,
      );

      if (observerVisibilityMix < 0.01) {
        observerGroup.visible = false;
      } else {
        observerGroup.visible = true;
        const obsFrames = nextBundle.observerDataset.frames;
        const epochIdx = Math.min(
          obsFrames.length - 1,
          Math.max(0, Math.round(effectiveTimeProg * (obsFrames.length - 1))),
        );
        const rawPasses = obsFrames[epochIdx] ?? [];
        const filteredPasses: NormalizedSatellitePass[] = rawPasses.filter((sp) => {
          if (p.holdoutViirs && sp.family === 'viirs') return false;
          if (effectiveMode === 'observer') {
            if (p.observerFilter === 'modis' && sp.family !== 'modis') return false;
            if (p.observerFilter === 'viirs' && sp.family !== 'viirs') return false;
          }
          return true;
        });

        const maxVisiblePasses = effectiveMode === 'observer' ? MAX_ORBITAL_RIGS : 1;
        const activePasses = filteredPasses.slice(0, maxVisiblePasses);

        for (let rIdx = 0; rIdx < MAX_ORBITAL_RIGS; rIdx++) {
          const rig = spacecraftRigs[rIdx];
          const pass = activePasses[rIdx];
          if (!pass) {
            rig.group.visible = false;
            continue;
          }
          rig.group.visible = true;

          const isViirs = pass.family === 'viirs';
          const accentColor = isViirs ? colViirs : colModis;
          const azRad = (pass.azimuthDeg * Math.PI) / 180;
          const dirAlongX = -Math.sin(azRad);
          const dirAlongZ = Math.cos(azRad);

          // Build curved sun-synchronous orbital arc across the sky through skyPosition
          const [sxBase, syBase, szBase] = pass.skyPosition;
          const arcSpan = 7.4;
          for (let k = 0; k < 5; k++) {
            const s = (k / 4 - 0.5) * 2.0; // [-1 .. +1]
            orbitArcCurvePts[k].set(
              sxBase + dirAlongX * arcSpan * s,
              syBase - s * s * 0.72,
              szBase + dirAlongZ * arcSpan * s,
            );
          }
          orbitArcSpline.updateArcLengths();

          const arcPosAttr = rig.orbitArcGeom.getAttribute('position') as THREE.BufferAttribute;
          const arcArr = arcPosAttr.array as Float32Array;
          for (let i = 0; i < 96; i++) {
            orbitArcSpline.getPoint(i / 95, tmpArcSample);
            arcArr[i * 3] = tmpArcSample.x;
            arcArr[i * 3 + 1] = tmpArcSample.y;
            arcArr[i * 3 + 2] = tmpArcSample.z;
          }
          arcPosAttr.needsUpdate = true;

          // Glide spacecraft smoothly along the central segment of its orbital pass arc
          const orbitalDrift = 0.5 + 0.22 * Math.sin(elapsedSec * 0.32 + rIdx * 1.7);
          orbitArcSpline.getPoint(orbitalDrift, rig.craftRoot.position);
          orbitArcSpline.getPoint(Math.min(0.99, orbitalDrift + 0.02), tmpArcSample);
          rig.craftRoot.lookAt(tmpArcSample);

          rig.busMat.opacity = 0.95 * observerVisibilityMix;
          rig.solarWingMat.opacity = 0.92 * observerVisibilityMix;
          rig.orbitArcMat.color.copy(accentColor);
          rig.orbitArcMat.opacity = 0.46 * observerVisibilityMix;

          // Update volumetric nadir scan swath fan down onto the mountain surface
          const swathPosAttr = rig.swathGeom.getAttribute('position') as THREE.BufferAttribute;
          const sArr = swathPosAttr.array as Float32Array;
          sArr[0] = rig.craftRoot.position.x;
          sArr[1] = rig.craftRoot.position.y - 0.06;
          sArr[2] = rig.craftRoot.position.z;

          const perpU = -CUTAWAY_DIR_VEC.y;
          const perpV = CUTAWAY_DIR_VEC.x;
          const planeRef = effectiveMode === 'cutaway' ? currentCurtainPlane : 0.0;
          const centerU = 0.5 + CUTAWAY_DIR_VEC.x * planeRef;
          const centerV = 0.5 + CUTAWAY_DIR_VEC.y * planeRef;

          for (let c = 0; c < 25; c++) {
            const spanT = (c / 24 - 0.5) * 0.86;
            const gu = THREE.MathUtils.clamp(centerU + perpU * spanT, 0.02, 0.98);
            const gv = THREE.MathUtils.clamp(centerV + perpV * spanT, 0.02, 0.98);
            const gy = sampleCpuTerrainY(gu, gv) + 0.02;
            const gwx = (gu - 0.5) * SLAB_W;
            const gwz = (0.5 - gv) * SLAB_D;
            const vOff = (1 + c) * 3;
            sArr[vOff] = gwx;
            sArr[vOff + 1] = gy;
            sArr[vOff + 2] = gwz;
          }
          swathPosAttr.needsUpdate = true;
          rig.swathMat.color.copy(accentColor);
          rig.swathMat.opacity =
            (effectiveMode === 'observer' ? 0.085 : 0.065) * observerVisibilityMix;
        }

        // Update ground sensor footprint ellipses in observer mode
        if (effectiveMode === 'observer') {
          const [lonMin, latMin, lonMax, latMax] = nextBundle.bbox;
          const lonSpan = Math.max(1e-4, lonMax - lonMin);
          const latSpan = Math.max(1e-4, latMax - latMin);
          const worldPerKm = SLAB_W / Math.max(12.0, nextBundle.widthKm);
          const minGate = p.sensitivityThreshold * 0.58;

          let fpCount = 0;
          for (const pass of activePasses) {
            for (const fp of pass.footprints) {
              if (fpCount >= MAX_FOOTPRINT_INSTANCES) break;
              if (fp.intensityNorm < minGate) continue;

              const u = (fp.lon - lonMin) / lonSpan;
              const v = (fp.lat - latMin) / latSpan;
              if (u < 0.02 || u > 0.98 || v < 0.02 || v > 0.98) continue;

              const wx = (u - 0.5) * SLAB_W;
              const wz = (0.5 - v) * SLAB_D;
              const wy = sampleCpuTerrainY(u, v) + 0.032;

              const rx = Math.max(0.065, fp.acrossTrackKm * worldPerKm * 0.5);
              const rz = Math.max(0.065, fp.alongTrackKm * worldPerKm * 0.5);

              fpDummy.position.set(wx, wy, wz);
              fpDummy.rotation.set(0, -(fp.azimuthDeg * Math.PI) / 180, 0);
              fpDummy.scale.set(rx, 1.0, rz);
              fpDummy.updateMatrix();
              footprintInstanced.setMatrixAt(fpCount, fpDummy.matrix);

              fpColor.copy(fp.family === 'viirs' ? colViirs : colModis);
              fpColor.multiplyScalar(0.65 + 0.55 * fp.intensityNorm);
              footprintInstanced.setColorAt(fpCount, fpColor);
              fpCount++;
            }
          }
          footprintInstanced.count = fpCount;
          footprintInstanced.instanceMatrix.needsUpdate = true;
          if (footprintInstanced.instanceColor) {
            footprintInstanced.instanceColor.needsUpdate = true;
          }
          footprintMat.opacity = 0.78 * observerVisibilityMix;
          footprintInstanced.visible = fpCount > 0;
        } else {
          footprintInstanced.visible = false;
        }
      }

      // F. Render 3D WebGL2 Scene
      domeMesh.position.copy(camera.position);
      renderer.render(scene, camera);

      // G. Project Diegetic Curtain Pill (Landing) & Collision-Resolved Ridge Callouts (Workspace)
      const curtainPillEl = curtainPillRef.current;
      if (curtainPillEl) {
        if (!p.inWorkspace && terrainUniforms.uCutawayMix.value > 0.25) {
          const cu = THREE.MathUtils.clamp(
            0.5 + CUTAWAY_DIR_VEC.x * currentCurtainPlane,
            0.08,
            0.92,
          );
          const cv = THREE.MathUtils.clamp(
            0.5 + CUTAWAY_DIR_VEC.y * currentCurtainPlane,
            0.08,
            0.92,
          );
          const cy = sampleCpuTerrainY(cu, cv) + 1.48;
          projVec.set((cu - 0.5) * SLAB_W, cy, (0.5 - cv) * SLAB_D).project(camera);
          const sx = (projVec.x * 0.5 + 0.5) * viewportW;
          const sy = (-projVec.y * 0.5 + 0.5) * viewportH;
          if (projVec.z < 1.0 && sy > 286 && sy < viewportH - 72) {
            curtainPillEl.style.opacity = '1';
            curtainPillEl.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
          } else {
            curtainPillEl.style.opacity = '0';
          }
        } else {
          curtainPillEl.style.opacity = '0';
        }
      }

      const showCallouts = p.inWorkspace && !p.cleanHud && !p.cinemaActive;
      const findings = nextBundle.findings;
      const [lonMin, latMin, lonMax, latMax] = nextBundle.bbox;
      const lonSpan = Math.max(1e-4, lonMax - lonMin);
      const latSpan = Math.max(1e-4, latMax - latMin);

      const anchors: Array<{ ax: number; ay: number; bx: number; by: number; valid: boolean }> = [];

      for (let i = 0; i < 3; i++) {
        const f = findings[i];
        if (!showCallouts || !f) {
          anchors.push({ ax: 0, ay: 0, bx: 0, by: 0, valid: false });
          continue;
        }
        const u = THREE.MathUtils.clamp((f.lon - lonMin) / lonSpan, 0.04, 0.96);
        const v = THREE.MathUtils.clamp((f.lat - latMin) / latSpan, 0.04, 0.96);
        const wy = sampleCpuTerrainY(u, v) + 0.05;
        projVec.set((u - 0.5) * SLAB_W, wy, (0.5 - v) * SLAB_D).project(camera);

        if (projVec.z >= 1.0 || projVec.z <= -1.0) {
          anchors.push({ ax: 0, ay: 0, bx: 0, by: 0, valid: false });
          continue;
        }
        const ax = (projVec.x * 0.5 + 0.5) * viewportW;
        const ay = (-projVec.y * 0.5 + 0.5) * viewportH;

        // Initial radial leader offsets keeping clear of the right telemetry rail (320px + 24px margin)
        const cardEstW = 212;
        const maxCardLeftX = Math.max(220, viewportW - 356 - cardEstW);
        const dirSide = i === 1 ? -1 : ax + 108 > maxCardLeftX || ax > viewportW * 0.44 ? -1 : 1;
        const rawBx = dirSide > 0 ? ax + 56 : ax - 56 - cardEstW;
        const bx = THREE.MathUtils.clamp(rawBx, 24, maxCardLeftX);
        const by = THREE.MathUtils.clamp(
          ay - (i === 0 ? 64 : i === 1 ? 48 : -44),
          68,
          Math.max(160, viewportH - 134),
        );
        anchors.push({ ax, ay, bx, by, valid: true });
      }

      // 2-pass pairwise screen-space collision resolution between the 3 callout cards
      const minW = 198;
      const minH = 62;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < anchors.length; i++) {
          if (!anchors[i].valid) continue;
          for (let j = i + 1; j < anchors.length; j++) {
            if (!anchors[j].valid) continue;
            const dx = anchors[j].bx - anchors[i].bx;
            const dy = anchors[j].by - anchors[i].by;
            if (Math.abs(dx) < minW && Math.abs(dy) < minH) {
              const pushY = (minH - Math.abs(dy)) * 0.55 * (dy >= 0 ? 1 : -1);
              anchors[i].by = THREE.MathUtils.clamp(
                anchors[i].by - pushY,
                68,
                Math.max(160, viewportH - 134),
              );
              anchors[j].by = THREE.MathUtils.clamp(
                anchors[j].by + pushY,
                68,
                Math.max(160, viewportH - 134),
              );
            }
          }
        }
      }

      for (let i = 0; i < 3; i++) {
        const a = anchors[i];
        const pinEl = pinCrossRefs.current[i];
        const cardEl = calloutCardRefs.current[i];
        const lineEl = svgLinesRef.current[i];

        if (!a || !a.valid) {
          if (pinEl) pinEl.style.opacity = '0';
          if (cardEl) {
            cardEl.style.opacity = '0';
            cardEl.style.pointerEvents = 'none';
          }
          if (lineEl) lineEl.style.opacity = '0';
          continue;
        }

        if (pinEl) {
          pinEl.style.opacity = '1';
          pinEl.style.transform = `translate3d(${a.ax.toFixed(1)}px, ${a.ay.toFixed(1)}px, 0) translate(-50%, -50%)`;
        }
        if (cardEl) {
          cardEl.style.opacity = '1';
          cardEl.style.pointerEvents = 'auto';
          cardEl.style.transform = `translate3d(${a.bx.toFixed(1)}px, ${a.by.toFixed(1)}px, 0)`;
        }
        if (lineEl) {
          const elbowX = a.ax + (a.bx - a.ax) * 0.42;
          const elbowY = a.by + 22;
          const attachX = a.bx > a.ax ? a.bx : Math.min(viewportW - 350, a.bx + 178);
          lineEl.setAttribute(
            'points',
            `${a.ax.toFixed(1)},${a.ay.toFixed(1)} ${elbowX.toFixed(1)},${elbowY.toFixed(1)} ${attachX.toFixed(1)},${elbowY.toFixed(1)}`,
          );
          lineEl.style.opacity = '1';
        }
      }

      // H. Emit Live Telemetry every ~320ms
      fpsFrames += 1;
      fpsAccumSec += dtSec;
      if (fpsAccumSec >= 0.32) {
        const instFps = fpsFrames / fpsAccumSec;
        smoothedFps = smoothedFps * 0.55 + Math.min(120, instFps) * 0.45;
        fpsFrames = 0;
        fpsAccumSec = 0;

        if (elapsedSec - lastTelemetryEmitSec >= 0.3) {
          lastTelemetryEmitSec = elapsedSec;
          const wavePos = THREE.MathUtils.clamp(
            (-currentCurtainPlane / MAX_PLANE_OFFSET + 1.0) * 0.5,
            0,
            1,
          );
          const telemetry: EarthStageTelemetry = {
            fps: Math.round(smoothedFps),
            vertexCount: 266754,
            orthoResolution: nextBundle.orthoLabel,
            demResolution: nextBundle.demLabel,
            activeTheaterId: p.activeTheaterId,
            slewActive: slewActive || morphActive,
            cinemaProgress,
            wavePosition: wavePos,
          };
          p.onTelemetry?.(telemetry);
        }
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObs.disconnect();
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointerleave', onPointerLeave);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('contextmenu', onContextMenu);

      domeGeom.dispose();
      domeMat.dispose();
      pedestalGeom.dispose();
      pedestalMat.dispose();
      terrainGeom.dispose();
      terrainMat.dispose();
      skirtGeom.dispose();
      skirtMat.dispose();
      curtainGeom.dispose();
      curtainMat.dispose();
      plumePack.geometry.dispose();
      plumeMat.dispose();
      footprintGeom.dispose();
      footprintMat.dispose();
      fieldTex0.dispose();
      fieldTex1.dispose();
      lipariTex.dispose();

      for (const rig of spacecraftRigs) {
        rig.orbitArcGeom.dispose();
        rig.orbitArcMat.dispose();
        rig.swathGeom.dispose();
        rig.swathMat.dispose();
        rig.busMat.dispose();
        rig.solarWingMat.dispose();
      }

      const disposedTextures = new Set<THREE.Texture>();
      for (const b of bundleCache.values()) {
        if (!disposedTextures.has(b.demTex)) {
          b.demTex.dispose();
          disposedTextures.add(b.demTex);
        }
        if (!disposedTextures.has(b.satTex)) {
          b.satTex.dispose();
          disposedTextures.add(b.satTex);
        }
      }

      renderer.dispose();
      if (dom.parentElement === host) {
        host.removeChild(dom);
      }
      engineBridgeRef.current = null;
    };
  }, []);

  // Sync camera preset / Workspace entry-exit transitions
  useEffect(() => {
    engineBridgeRef.current?.applyCameraPreset();
  }, [props.cameraPreset, props.inWorkspace, props.mode]);

  // Sync Cinema Director [C] activation & smooth handoff
  useEffect(() => {
    engineBridgeRef.current?.syncCinemaStart(props.cinemaActive);
  }, [props.cinemaActive]);

  // Trigger Sub-Orbital Slew + Instant Cached Bundle Morph when activeTheaterId or slewRequest changes
  const lastSlewNonceRef = useRef<number | null>(null);
  const lastTheaterRef = useRef<TheaterId>(props.activeTheaterId);

  useEffect(() => {
    const bridge = engineBridgeRef.current;
    if (!bridge) return;

    const req = props.slewRequest;
    if (req && req.nonce !== lastSlewNonceRef.current) {
      lastSlewNonceRef.current = req.nonce;
      lastTheaterRef.current = req.targetTheaterId;
      bridge.triggerSlew(req.targetTheaterId);
      return;
    }

    if (props.activeTheaterId !== lastTheaterRef.current) {
      lastTheaterRef.current = props.activeTheaterId;
      bridge.triggerSlew(props.activeTheaterId);
    }
  }, [props.activeTheaterId, props.slewRequest]);

  // Hydrate real 512x512 Float32 AWS Terrarium DEM + 2048x2048 Maxar Satellite Ortho + Solver Tensor from activeRun
  useEffect(() => {
    const run: DynamicRegionRun | null = props.activeRun;
    const bridge = engineBridgeRef.current;
    if (!run || !bridge) return;

    let cancelled = false;
    const cachedByRun = bridge.runCache.get(run.run_id);
    if (cachedByRun) {
      bridge.activateBundle(cachedByRun, cachedByRun.regionId !== lastTheaterRef.current);
      return;
    }

    void (async () => {
      try {
        const prevRegionBundle = bridge.bundleCache.get(run.region.id);
        const hiresDemUrl = run.assets.dem_hires_f32_url
          ? resolveAssetUrl(props.apiBase, run.assets.dem_hires_f32_url)
          : null;
        const stdDemUrl = resolveAssetUrl(props.apiBase, run.assets.dem_f32_url);
        const satUrl = resolveAssetUrl(props.apiBase, run.assets.satellite_url);
        const tensorUrl = resolveAssetUrl(props.apiBase, run.assets.reconstruction_u8_url);

        const fetchDemBuffer = async (): Promise<ArrayBuffer | null> => {
          if (hiresDemUrl) {
            const hr = await fetch(hiresDemUrl).catch(() => null);
            if (hr && hr.ok) return hr.arrayBuffer();
          }
          const sr = await fetch(stdDemUrl).catch(() => null);
          return sr && sr.ok ? sr.arrayBuffer() : null;
        };

        const loadSatTexture = (): Promise<THREE.Texture | null> =>
          new Promise((resolve) => {
            bridge.texLoader.load(
              satUrl,
              (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.anisotropy = bridge.maxAnisotropy;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                tex.wrapS = THREE.ClampToEdgeWrapping;
                tex.wrapT = THREE.ClampToEdgeWrapping;
                resolve(tex);
              },
              undefined,
              () => resolve(null),
            );
          });

        const [demBuf, satTexLoaded, tensorResp] = await Promise.all([
          fetchDemBuffer(),
          loadSatTexture(),
          fetch(tensorUrl).catch(() => null),
        ]);

        const tensorBuf =
          tensorResp && tensorResp.ok ? await tensorResp.arrayBuffer() : null;

        if (cancelled) return;

        const knownProf = isKnownTheater(run.region.id)
          ? THEATER_PROFILES[run.region.id]
          : null;

        const demPack = demBuf
          ? createDemR32FTexture(new Float32Array(demBuf), true)
          : prevRegionBundle
            ? {
                texture: prevRegionBundle.demTex,
                aligned: prevRegionBundle.alignedDem,
                gridRes: prevRegionBundle.demGridRes,
                minElev: prevRegionBundle.minElevM,
                maxElev: prevRegionBundle.maxElevM,
              }
            : createDemR32FTexture(buildProceduralTheaterDem('plumas_ca', 256), false);

        const tensorPack = tensorBuf
          ? alignReconstructionTensor(new Uint8Array(tensorBuf), true)
          : prevRegionBundle
            ? { buffer: prevRegionBundle.tensor, frames: prevRegionBundle.frameCount }
            : { buffer: buildProceduralTheaterTensor('plumas_ca'), frames: FIELD_FRAME_COUNT };

        const finalSatTex =
          satTexLoaded ??
          prevRegionBundle?.satTex ??
          buildProceduralSatelliteTexture(
            knownProf ? knownProf.id : 'plumas_ca',
            demPack.aligned,
            demPack.gridRes,
            demPack.minElev,
            demPack.maxElev,
            bridge.maxAnisotropy,
          );

        const imgW =
          satTexLoaded &&
          typeof (satTexLoaded.image as { width?: number } | undefined)?.width === 'number'
            ? (satTexLoaded.image as { width: number }).width
            : 2048;

        const bbox = run.region.bbox;
        const observerDataset = run.observer_passes
          ? normalizeObserverDataset(run.observer_passes, bbox)
          : createFallbackObserverDataset(bbox);

        const findings = extractTerrainFindings(
          run.region.id,
          bbox,
          demPack.aligned,
          demPack.gridRes,
          tensorPack.buffer,
          tensorPack.frames,
        );

        const hasSeaCoast = knownProf ? knownProf.hasSeaCoast : run.region.min_elev_m <= 1.5;

        const hydratedBundle: CachedTheaterBundle = {
          key: `run-${run.run_id}`,
          regionId: run.region.id,
          runId: run.run_id,
          demTex: demPack.texture,
          alignedDem: demPack.aligned,
          demGridRes: demPack.gridRes,
          minElevM: Number.isFinite(run.region.min_elev_m)
            ? Math.min(demPack.minElev, run.region.min_elev_m)
            : demPack.minElev,
          maxElevM: Number.isFinite(run.region.max_elev_m)
            ? Math.max(demPack.maxElev, run.region.max_elev_m)
            : demPack.maxElev,
          satTex: finalSatTex,
          orthoLabel: imgW >= 1600 ? 'Maxar 2K' : 'Ortho 1K',
          demLabel: `${demPack.gridRes}²`,
          tensor: tensorPack.buffer,
          frameCount: tensorPack.frames,
          bbox,
          widthKm: Math.max(18.0, run.region.width_km || knownProf?.widthKm || 60.0),
          modisAzimuthRad: ((knownProf?.modisAzimuthDeg ?? -12.4) * Math.PI) / 180,
          modisStretch: knownProf?.modisStretch ?? 2.6,
          windDirUv: knownProf ? [...knownProf.windDirUv] : [0.64, 0.76],
          hasSeaCoast,
          observerDataset,
          findings,
        };

        bridge.bundleCache.set(run.region.id, hydratedBundle);
        bridge.runCache.set(run.run_id, hydratedBundle);

        // Activate if this run matches the currently viewed theater or is a custom coordinate query
        const currentTarget = propsRef.current.activeTheaterId;
        if (!isKnownTheater(run.region.id) || run.region.id === currentTarget) {
          bridge.activateBundle(hydratedBundle, true);
        }
      } catch {
        // Retain cached or procedural bundle cleanly on transient network error
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.activeRun, props.apiBase]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label="3D Photogrammetric Earth Cutaway and Orbital Sensor Harmonization Stage"
      onKeyDown={(e) => {
        if (!props.inWorkspace && e.key === 'Enter') {
          props.onEnterWorkspace?.();
        }
      }}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        outline: 'none',
        backgroundColor: '#080b11',
        cursor:
          curtainHovered && props.mode === 'cutaway' && !props.cinemaActive
            ? 'ew-resize'
            : props.inWorkspace
              ? 'grab'
              : 'pointer',
      }}
    >
      {/* Diegetic Optical Scan Curtain Handle on Landing */}
      <button
        ref={curtainPillRef}
        type="button"
        data-stage-ui="true"
        onClick={() => props.onEnterWorkspace?.()}
        title="Enter 3D Terrain Workspace"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          opacity: 0,
          pointerEvents: props.inWorkspace ? 'none' : 'auto',
          zIndex: 4,
          padding: '4px 8px',
          borderRadius: '3px',
          border: '1px solid rgba(155, 227, 255, 0.42)',
          background: 'rgba(8, 12, 20, 0.82)',
          backdropFilter: 'blur(8px)',
          color: '#e8f6ff',
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: '10px',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          willChange: 'transform, opacity',
        }}
      >
        1 km MODIS | 375 m Fused · Inspect
      </button>

      {/* Diegetic Collision-Resolved Ridge Callouts Overlay (Workspace only, hidden in Clean HUD & Cinema) */}
      <div
        aria-hidden={!props.inWorkspace || props.cleanHud || props.cinemaActive}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        <svg
          width="100%"
          height="100%"
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'visible',
            pointerEvents: 'none',
          }}
        >
          {[0, 1, 2].map((idx) => (
            <polyline
              key={idx}
              ref={(el) => {
                svgLinesRef.current[idx] = el;
              }}
              fill="none"
              stroke={
                renderedFindings[idx] && props.selectedFindingId === renderedFindings[idx].id
                  ? 'rgba(155, 227, 255, 0.88)'
                  : 'rgba(245, 246, 250, 0.34)'
              }
              strokeWidth="1"
              style={{ opacity: 0, transition: 'stroke 160ms ease' }}
            />
          ))}
        </svg>

        {[0, 1, 2].map((idx) => {
          const finding = renderedFindings[idx];
          const isSelected = Boolean(finding && props.selectedFindingId === finding.id);
          const accentColor =
            finding?.kind === 'uncertainty'
              ? '#9be3ff'
              : finding?.kind === 'subpixel'
                ? '#ffb36b'
                : '#ff7849';

          return (
            <div key={idx}>
              <div
                ref={(el) => {
                  pinCrossRefs.current[idx] = el;
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '14px',
                  height: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: accentColor,
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  fontSize: '13px',
                  fontWeight: 600,
                  lineHeight: 1,
                  textShadow: '0 1px 6px rgba(0, 0, 0, 0.9)',
                  opacity: 0,
                  willChange: 'transform, opacity',
                }}
              >
                +
              </div>

              <button
                ref={(el) => {
                  calloutCardRefs.current[idx] = el;
                }}
                type="button"
                data-stage-ui="true"
                onClick={() => {
                  if (finding) {
                    props.onSelectFinding?.(finding);
                  }
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  minWidth: '178px',
                  maxWidth: '226px',
                  padding: '6px 9px',
                  textAlign: 'left',
                  borderRadius: '3px',
                  border: isSelected
                    ? `1px solid ${accentColor}`
                    : '1px solid rgba(245, 246, 250, 0.20)',
                  background: isSelected
                    ? 'rgba(11, 16, 25, 0.92)'
                    : 'rgba(8, 11, 17, 0.78)',
                  backdropFilter: 'blur(10px)',
                  color: '#f5f6fa',
                  cursor: 'pointer',
                  opacity: 0,
                  pointerEvents: 'none',
                  willChange: 'transform, opacity',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    fontFamily: "'Geist', -apple-system, sans-serif",
                    fontSize: '11px',
                    fontWeight: 500,
                    letterSpacing: '-0.01em',
                    color: '#f5f6fa',
                  }}
                >
                  <span>{finding?.title ?? ''}</span>
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '1px',
                      backgroundColor: accentColor,
                      flexShrink: 0,
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: '2px',
                    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                    fontSize: '10.5px',
                    fontVariantNumeric: 'tabular-nums',
                    color: accentColor,
                  }}
                >
                  {finding?.valueText ?? ''}
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default EarthCutawayStage;
