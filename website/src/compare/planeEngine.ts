import * as THREE from 'three';
import { buildTerrain, cutOf, loadBelief, loadElevation, loadImage, type Terrain } from './ground';
import { marksSignature, paintMarks, type BeliefStep, type MarkPalette } from './marks';
import type { CompareAnchor, CompareBlock, CompareScaleBar, EstimateGrid } from './types';

/**
 * The plane's renderer: lays the cut-outs out at one scale, looks at them with an orthographic camera at an
 * isometric angle, draws only when something changed, and answers which block is under a point.
 */

/** The camera's bearing and elevation, degrees. Drawing. */
const AZIMUTH = 45;
const ELEVATION = 40;
/** The gap between neighbours, as a share of a block's width on screen. Drawing. */
const GAP = 0.07;
/** Pixels kept free at the plane's sides and top. */
const PAD_X = 16;
const PAD_TOP = 10;
/** How long marks take to arrive, ms. */
const ARRIVE_MS = 520;
/** The length on screen of a kilometre on the ground, as a share of the layout's scale, at this camera. */
const GROUND_ON_SCREEN = Math.sqrt(0.5 + 0.5 * Math.sin((ELEVATION * Math.PI) / 180) ** 2);

const DEG = Math.PI / 180;
const LIGHT = new THREE.Vector3(-0.55, 0.72, 0.42).normalize();

const TOP_VERT = /* glsl */ `
  attribute vec2 uvMark;
  varying vec2 vUv;
  varying vec2 vUvMark;
  varying vec3 vN;
  void main() {
    vUv = uv;
    vUvMark = uvMark;
    vN = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The image is lit by one fixed light for relief. The marks are laid over it unlit, so their colour is the
// design system's own. Night darkens and cools the image; that is drawing, and the page says so.
const TOP_FRAG = /* glsl */ `
  uniform sampler2D uImage;
  uniform sampler2D uMarks;
  uniform vec3 uLight;
  uniform float uHasImage;
  uniform float uNight;
  uniform float uDimmed;
  uniform float uLift;
  uniform float uArrive;
  varying vec2 vUv;
  varying vec2 vUvMark;
  varying vec3 vN;
  void main() {
    vec3 base = mix(vec3(0.30, 0.33, 0.37), texture2D(uImage, vUv).rgb, uHasImage);
    float l = dot(base, vec3(0.2126, 0.7152, 0.0722));
    base = mix(base, vec3(l), mix(0.15, 0.45, uNight)) * mix(vec3(1.0), vec3(0.78, 0.88, 1.0), uNight);
    float ndl = clamp(dot(normalize(vN), uLight), 0.0, 1.0);
    vec3 col = base * (0.34 + 1.05 * ndl) * mix(0.9, 0.42, uNight);
    col *= 1.0 + 0.16 * uLift;
    vec4 mk = texture2D(uMarks, vUvMark);
    col = mix(col, mk.rgb, mk.a * uArrive);
    col = mix(col, vec3(dot(col, vec3(0.3333))) * 0.5, uDimmed * 0.7);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

interface Entry {
  block: CompareBlock;
  groundKey: string;
  group: THREE.Group;
  terrain: Terrain | null;
  material: THREE.ShaderMaterial | null;
  marks: HTMLCanvasElement | null;
  marksTexture: THREE.CanvasTexture | null;
  marksSig: string | null;
  /** When the marks last began to arrive, ms; 0 once they are in. */
  arriveFrom: number;
  /** Loaded, or failed for good. */
  settled: boolean;
  ready: boolean;
  image: boolean;
}

export interface PlaneLayout {
  perRow?: number;
  labelSpace: number;
}

export class PlaneEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
  private entries: Entry[] = [];
  private terrains = new Map<string, { terrain: Terrain; uses: number }>();
  private imageTextures = new Map<HTMLImageElement, THREE.Texture>();
  private beliefBytes = new Map<string, Uint8Array | null>();
  private beliefSteps = new Map<string, BeliefStep>();
  private shadowTexture: THREE.CanvasTexture;
  private blank: THREE.DataTexture;
  private layout: PlaneLayout = { labelSpace: 88 };
  private width = 0;
  private height = 0;
  private scale = 1;
  private hovered: string | null = null;
  private frame = 0;
  private disposed = false;
  private raycaster = new THREE.Raycaster();

  constructor(
    canvas: HTMLCanvasElement,
    private palette: MarkPalette,
    private onAnchors: (anchors: CompareAnchor[], scaleBar: CompareScaleBar | null) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    this.blank.needsUpdate = true;
    this.shadowTexture = softShadow();
    const a = AZIMUTH * DEG;
    const e = ELEVATION * DEG;
    this.camera.position.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(2400);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld(true);
  }

  setSize(width: number, height: number, dpr: number): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(Math.min(2, dpr || 1));
    this.renderer.setSize(width, height, false);
    this.place();
  }

  /** The blocks to show. A block that keeps its id and its ground keeps its terrain; its marks are repainted when they change. */
  setBlocks(blocks: readonly CompareBlock[], layout: PlaneLayout): void {
    if (this.disposed) return;
    this.layout = layout;
    const posts = blocks.length <= 4 ? 384 : 256;
    const next: Entry[] = [];
    for (const block of blocks) {
      const g = block.ground;
      const groundKey = `${g.elevationUrl}|${g.imageUrl ?? ''}|${(g.cut ?? g.box).join(',')}|${posts}`;
      const old = this.entries.find((x) => x.block.id === block.id && x.groundKey === groundKey);
      if (old) {
        old.block = block;
        next.push(old);
        if (old.ready) this.paint(old);
        continue;
      }
      const entry: Entry = {
        block,
        groundKey,
        group: new THREE.Group(),
        terrain: null,
        material: null,
        marks: null,
        marksTexture: null,
        marksSig: null,
        arriveFrom: 0,
        settled: false,
        ready: false,
        image: false,
      };
      next.push(entry);
      void this.load(entry, posts, blocks.length);
    }
    for (const gone of this.entries) if (!next.includes(gone)) this.drop(gone);
    this.entries = next;
    this.place();
  }

  setHover(id: string | null): void {
    if (this.hovered === id) return;
    this.hovered = id;
    this.requestRender();
  }

  /** The block under a point of the plane (CSS pixels from its top left), or null. */
  pick(x: number, y: number): string | null {
    if (!this.width || !this.height) return null;
    this.raycaster.setFromCamera(new THREE.Vector2((x / this.width) * 2 - 1, 1 - (y / this.height) * 2), this.camera);
    let best: { id: string; at: number } | null = null;
    const box = new THREE.Box3();
    const hit = new THREE.Vector3();
    for (const entry of this.entries) {
      if (!entry.terrain) continue;
      const t = entry.terrain;
      const p = entry.group.position;
      box.min.set(p.x - t.widthKm / 2, 0, p.z - t.depthKm / 2);
      box.max.set(p.x + t.widthKm / 2, t.topKm, p.z + t.depthKm / 2);
      if (!this.raycaster.ray.intersectBox(box, hit)) continue;
      const at = hit.distanceTo(this.raycaster.ray.origin);
      if (!best || at < best.at) best = { id: entry.block.id, at };
    }
    return best ? best.id : null;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    for (const entry of this.entries) this.drop(entry);
    this.entries = [];
    for (const tex of this.imageTextures.values()) tex.dispose();
    this.imageTextures.clear();
    this.shadowTexture.dispose();
    this.blank.dispose();
    this.renderer.dispose();
  }

  // -------------------------------------------------------------------------------------------

  private async load(entry: Entry, posts: number, count: number): Promise<void> {
    const g = entry.block.ground;
    try {
      const [elevation, image] = await Promise.all([loadElevation(g.elevationUrl), loadImage(g.imageUrl)]);
      if (this.disposed || !this.entries.includes(entry)) return;
      let shared = this.terrains.get(entry.groundKey);
      if (!shared) {
        shared = { terrain: buildTerrain(elevation, g, posts), uses: 0 };
        this.terrains.set(entry.groundKey, shared);
      }
      shared.uses += 1;
      const terrain = shared.terrain;
      entry.terrain = terrain;
      entry.image = image !== null;

      const marks = document.createElement('canvas');
      marks.width = count <= 4 ? 2048 : 1024;
      marks.height = Math.max(2, Math.round((marks.width * terrain.depthKm) / terrain.widthKm));
      entry.marks = marks;
      entry.marksTexture = new THREE.CanvasTexture(marks);
      entry.marksTexture.colorSpace = THREE.SRGBColorSpace;
      entry.marksTexture.anisotropy = 8;

      entry.material = new THREE.ShaderMaterial({
        vertexShader: TOP_VERT,
        fragmentShader: TOP_FRAG,
        uniforms: {
          uImage: { value: image ? this.imageTexture(image) : this.blank },
          uMarks: { value: entry.marksTexture },
          uLight: { value: LIGHT },
          uHasImage: { value: image ? 1 : 0 },
          uNight: { value: 0 },
          uDimmed: { value: 0 },
          uLift: { value: 0 },
          uArrive: { value: 1 },
        },
      });
      const top = new THREE.Mesh(terrain.top, entry.material);
      const walls = new THREE.Mesh(terrain.walls, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(terrain.widthKm * 2, terrain.depthKm * 2),
        new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false, opacity: 0.6 }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(1.2, 0.01, 1.2);
      shadow.renderOrder = -1;
      entry.group.add(shadow, walls, top);
      entry.ready = true;
    } catch {
      // The block stays empty; its anchor says it is not ready and the page says why
    }
    entry.settled = true;
    if (this.disposed || !this.entries.includes(entry)) return;
    this.place();
  }

  private imageTexture(img: HTMLImageElement): THREE.Texture {
    let tex = this.imageTextures.get(img);
    if (!tex) {
      tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      this.imageTextures.set(img, tex);
    }
    return tex;
  }

  private drop(entry: Entry): void {
    this.scene.remove(entry.group);
    entry.material?.dispose();
    entry.marksTexture?.dispose();
    for (const child of entry.group.children) {
      const mesh = child as THREE.Mesh;
      if (mesh.material !== entry.material) (mesh.material as THREE.Material).dispose();
      if (mesh.geometry !== entry.terrain?.top && mesh.geometry !== entry.terrain?.walls) mesh.geometry.dispose();
    }
    const shared = entry.terrain ? this.terrains.get(entry.groundKey) : undefined;
    if (shared && --shared.uses <= 0) {
      shared.terrain.top.dispose();
      shared.terrain.walls.dispose();
      this.terrains.delete(entry.groundKey);
    }
    entry.terrain = null;
    entry.ready = false;
  }

  /** One step of a run's belief file, once the file has arrived. */
  private beliefStep = (url: string, step: number, grid: EstimateGrid): BeliefStep | null => {
    const key = `${url}@${step}`;
    const hit = this.beliefSteps.get(key);
    if (hit) return hit;
    const bytes = this.beliefBytes.get(url);
    if (!bytes) return null;
    const cells = grid.nx * grid.ny;
    const from = step * cells * 2;
    if (from < 0 || from + cells * 2 > bytes.length) return null;
    const probability = new Uint8Array(cells);
    const intensity = new Uint8Array(cells);
    for (let k = 0; k < cells; k++) {
      probability[k] = bytes[from + k * 2];
      intensity[k] = bytes[from + k * 2 + 1];
    }
    const made = { probability, intensity };
    this.beliefSteps.set(key, made);
    return made;
  };

  /** Repaints a block's marks when they changed, and sets its state. */
  private paint(entry: Entry): void {
    if (!entry.ready || !entry.marks || !entry.marksTexture || !entry.terrain || !entry.material) return;
    const withheld = entry.block.state === 'withheld';
    const marks = withheld ? [] : entry.block.marks;
    // An estimate that names a file waits for the file, then paints
    for (const m of marks) {
      if (m.kind !== 'estimate' || !('url' in m.source)) continue;
      const url = m.source.url;
      if (this.beliefBytes.has(url)) continue;
      this.beliefBytes.set(url, null);
      void loadBelief(url).then((bytes) => {
        if (this.disposed) return;
        this.beliefBytes.set(url, bytes);
        for (const other of this.entries) {
          if (!other.block.marks.some((x) => x.kind === 'estimate' && 'url' in x.source && x.source.url === url)) continue;
          other.marksSig = null;
          this.paint(other);
        }
      });
    }
    const waiting = marks.some((m) => m.kind === 'estimate' && 'url' in m.source && !this.beliefBytes.get(m.source.url));
    // Canvas pixels per CSS pixel on screen: a kilometre on the ground is about 0.84 of the layout's scale long
    const pxPerKm = entry.marks.width / entry.terrain.widthKm;
    const perCssPx = Math.max(1, Math.round((pxPerKm / (this.scale * GROUND_ON_SCREEN)) * 4) / 4);
    const marksOnly = marksSignature(marks);
    const sig = marksOnly === '' ? '' : `${marksOnly}@${perCssPx}${waiting ? '#waiting' : ''}`;
    if (sig !== entry.marksSig) {
      const ctx = entry.marks.getContext('2d');
      if (ctx) {
        paintMarks(
          {
            ctx,
            width: entry.marks.width,
            height: entry.marks.height,
            view: entry.terrain.view,
            pxPerKm,
            perCssPx,
          },
          marks,
          this.palette,
          this.beliefStep,
        );
        entry.marksTexture.needsUpdate = true;
      }
      // Marks that replace nothing arrive; marks that replace marks are simply there
      const hadNone = entry.marksSig === null || entry.marksSig === '' || entry.marksSig.endsWith('#waiting');
      if (hadNone && sig !== '' && !waiting) entry.arriveFrom = performance.now();
      entry.marksSig = sig;
    }
    this.requestRender();
  }

  /** Sets every block on the plane at one scale, fits the camera, and reports the anchors. */
  private place(): void {
    if (this.disposed || !this.width || !this.height || this.entries.length === 0) {
      this.requestRender();
      return;
    }
    // One layout, once every block has arrived, so nothing moves while files come in
    if (this.entries.some((x) => !x.settled)) return;
    const a = AZIMUTH * DEG;
    const e = ELEVATION * DEG;
    const n = this.entries.length;
    const cols = Math.max(1, Math.min(n, this.layout.perRow ?? (n <= 4 ? n : 3)));
    const rows = Math.ceil(n / cols);
    const sizes = this.entries.map((x) => {
      const cut = x.terrain ?? { ...cutOf(x.block.ground), topKm: 0 };
      return {
        across: cut.widthKm * Math.abs(Math.cos(a)) + cut.depthKm * Math.abs(Math.sin(a)),
        deep: (cut.widthKm * Math.abs(Math.sin(a)) + cut.depthKm * Math.abs(Math.cos(a))) * Math.sin(e),
        tall: cut.topKm * Math.cos(e),
      };
    });
    const cellAcross = Math.max(...sizes.map((s) => s.across));
    const cellTall = Math.max(...sizes.map((s) => s.deep + s.tall));
    const gap = cellAcross * GAP;
    const label = this.layout.labelSpace;
    const scale = Math.max(
      0.01,
      Math.min((this.width - 2 * PAD_X) / (cols * cellAcross + (cols - 1) * gap), (this.height - PAD_TOP - rows * label) / (rows * cellTall)),
    );
    this.scale = scale;
    const rowHeight = cellTall * scale + label;
    const top = PAD_TOP + Math.max(0, (this.height - PAD_TOP - rows * rowHeight) / 2);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
    const toward = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    this.entries.forEach((entry, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const inRow = Math.min(cols, n - r * cols);
      const dx = (c - (inRow - 1) / 2) * (cellAcross + gap) * scale;
      const baseline = top + r * rowHeight + cellTall * scale;
      const dy = baseline - (sizes[i].deep / 2) * scale - this.height / 2;
      entry.group.position
        .copy(right)
        .multiplyScalar(dx / scale)
        .addScaledVector(toward, dy / (scale * Math.sin(e)));
      if (entry.ready && entry.group.parent !== this.scene) this.scene.add(entry.group);
    });
    this.camera.left = -this.width / (2 * scale);
    this.camera.right = this.width / (2 * scale);
    this.camera.top = this.height / (2 * scale);
    this.camera.bottom = -this.height / (2 * scale);
    this.camera.updateProjectionMatrix();
    for (const entry of this.entries) this.paint(entry);
    this.onAnchors(this.anchors(), this.scaleBar());
    this.requestRender();
  }

  private toScreen(p: THREE.Vector3): { x: number; y: number } {
    const v = p.clone().project(this.camera);
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height };
  }

  private anchors(): CompareAnchor[] {
    return this.entries.map((entry) => {
      const cut = entry.terrain ?? { ...cutOf(entry.block.ground), topKm: 0 };
      const pos = entry.group.position;
      let low = { x: 0, y: -Infinity };
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const sx of [-0.5, 0.5]) {
        for (const sz of [-0.5, 0.5]) {
          for (const y of [0, cut.topKm]) {
            const s = this.toScreen(new THREE.Vector3(pos.x + sx * cut.widthKm, y, pos.z + sz * cut.depthKm));
            if (y === 0 && s.y > low.y) low = s;
            minX = Math.min(minX, s.x);
            maxX = Math.max(maxX, s.x);
            minY = Math.min(minY, s.y);
            maxY = Math.max(maxY, s.y);
          }
        }
      }
      const view = cut.view;
      const pins = (entry.block.pins ?? []).map((pin) => {
        const u = (pin.lon - view[0]) / (view[2] - view[0]);
        const v = (view[3] - pin.lat) / (view[3] - view[1]);
        const y = entry.terrain ? entry.terrain.heightAt(u, v) : 0;
        const s = this.toScreen(new THREE.Vector3(pos.x + (u - 0.5) * cut.widthKm, y, pos.z + (v - 0.5) * cut.depthKm));
        return { id: pin.id, x: s.x, y: s.y };
      });
      return {
        id: entry.block.id,
        x: low.x,
        y: low.y,
        rect: { left: minX, top: minY, width: maxX - minX, height: maxY - minY },
        pins,
        ready: entry.ready,
        image: entry.image,
      };
    });
  }

  /** A round length laid along the ground just south of the first block's south edge, a little in from its west corner. */
  private scaleBar(): CompareScaleBar | null {
    const first = this.entries.find((x) => x.terrain);
    if (!first || !first.terrain) return null;
    const narrowest = Math.min(...this.entries.map((x) => (x.terrain ? x.terrain.widthKm : Infinity)));
    const km = [100, 50, 20, 10, 5, 2, 1].find((v) => v <= narrowest * 0.3) ?? 1;
    const t = first.terrain;
    const pos = first.group.position;
    const off = t.depthKm * 0.07;
    const tick = t.depthKm * 0.018;
    // In from the corner, so that the bar and its words stay under the block and inside the plane
    const west = pos.x - t.widthKm / 2 + t.widthKm * 0.16;
    const south = pos.z + t.depthKm / 2 + off;
    const at = (x: number, z: number) => this.toScreen(new THREE.Vector3(x, 0, z));
    return {
      km,
      from: at(west, south),
      to: at(west + km, south),
      ticks: [
        [at(west, south - tick), at(west, south + tick)],
        [at(west + km, south - tick), at(west + km, south + tick)],
      ],
    };
  }

  private requestRender(): void {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw(): void {
    if (this.disposed || !this.width || !this.height) return;
    const now = performance.now();
    let moving = false;
    for (const entry of this.entries) {
      if (!entry.material) continue;
      const u = entry.material.uniforms;
      u.uNight.value = entry.block.night ? 1 : 0;
      u.uDimmed.value = entry.block.state === 'dimmed' ? 1 : 0;
      u.uLift.value = this.hovered === entry.block.id ? 1 : 0;
      if (entry.arriveFrom) {
        const t = Math.min(1, (now - entry.arriveFrom) / ARRIVE_MS);
        u.uArrive.value = 1 - (1 - t) * (1 - t);
        if (t >= 1) entry.arriveFrom = 0;
        else moving = true;
      } else {
        u.uArrive.value = 1;
      }
    }
    this.renderer.render(this.scene, this.camera);
    if (moving) this.requestRender();
  }

  /** Pixels per kilometre on screen, for the page's own measures. */
  get pixelsPerKm(): number {
    return this.scale;
  }
}

function softShadow(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.filter = 'blur(16px)';
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(64, 64, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}
