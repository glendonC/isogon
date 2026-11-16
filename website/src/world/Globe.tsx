import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { atlas } from './atlas';
import { K } from './projection';

/**
 * The Earth as a turning globe, for the Earth's years: the yearly layer (a year's cells as palette indices, 1440 by
 * 720, equirectangular) laid on a sphere, drawn by one fragment shader that traces the sphere for every pixel (so the
 * edge is exact and a click is read back by the same sums). The land, the borders and the coast come from the same
 * atlas as the flat map, baked once into one texture; land no loaded file holds a row in is hatched in screen space,
 * as on the flat map. A thin rim of atmosphere, the night side darker (the fires keep their light there), a slow turn
 * that a drag takes over. WebGL 2 only: where it is missing, or the page cannot hold its frames, the flat map stands
 * in (`globeAvailable`, `onSlow`).
 */

export interface GlobeProps {
  label: string;
  /** The year's cells as palette indices (0 not loaded, 1 loaded, 2 closed, 3 to 255 the ramp), or null while read. */
  ix: Uint8Array | null;
  /** The colour of each index, packed as `yearLut` packs it (r in the low byte). */
  lut: Uint32Array;
  /** CSS pixels kept clear at the top and the bottom (the caption, the strip of totals). */
  padTop?: number;
  padBottom?: number;
  /** CSS pixels on the left kept for a caption beside the globe; the globe centres in the rest. */
  padLeft?: number;
  /** The film's turn: from the Americas through Africa to Asia while the years play, at rest when they stop. */
  film?: { playing: boolean; passMs: number } | null;
  /**
   * A place to fly to, as its outline's rings: the globe turns to it and draws near until it fills the view, with no
   * cut; null flies back out to the whole globe.
   */
  fly?: { rings: number[][][]; drift?: boolean } | null;
  /** Outlines drawn on the globe (the country under the pointer, the one chosen), as rings of [lon, lat]. */
  outlines?: Array<{ rings: number[][][]; strong: boolean; report?: boolean }>;
  /** The screen box (viewport CSS px) of the near side of the outline marked `report`, as the globe turns; null with none. */
  onBox?: (box: { left: number; top: number; right: number; bottom: number } | null) => void;
  /** The point under the pointer, or null off the globe; called again as the globe turns under a still pointer. */
  onPoint?: (at: { lon: number; lat: number; x: number; y: number } | null) => void;
  /** A click: the point under it, or null off the globe. */
  onPick?: (at: { lon: number; lat: number } | null) => void;
  /** The page cannot hold its frames (or lost its WebGL context): the flat map stands in. */
  onSlow?: () => void;
  /**
   * Places marked on the globe as squares of one size on the screen, whatever the zoom; two that would touch are set
   * apart. Pointing at one tells `onPin` its screen box; a click on one goes to `onPinPick` instead of `onPick`.
   */
  pins?: GlobePin[];
  onPin?: (hit: { id: string; box: { left: number; top: number; right: number; bottom: number } } | null) => void;
  onPinPick?: (id: string) => void;
  /** Open drawn near on this point (the place the visitor came back up from) and draw out to the whole globe. */
  startAt?: { lon: number; lat: number; zoom: number } | null;
  /** One pin marked (ringed) as where the visitor came from, its screen box told to `onMarked`. */
  markedPin?: string | null;
  onMarked?: (box: { left: number; top: number; right: number; bottom: number } | null) => void;
  className?: string;
}

export interface GlobePin {
  id: string;
  lon: number;
  lat: number;
}

/** A pin's square on the screen, in CSS px, and the reach a pointer has round its middle. */
const PIN = 12;
const PIN_REACH = 13;

/**
 * The switch: whether the Earth's years show the globe without being asked. Off until the lead has seen the globe
 * whole; flipping it is one commit. Until then `?globe=1` shows it (and `?globe=0` the flat map either way).
 */
export const GLOBE_ON = true;

/** Whether the Earth's years open on the globe: the switch, or the address, and a browser that can draw it. */
export function globeWanted(search: string): boolean {
  const q = new URLSearchParams(search).get('globe');
  if (q === '0') return false;
  return (q === '1' || GLOBE_ON) && globeAvailable();
}

let available: boolean | null = null;
/** Whether this browser can draw the globe (WebGL 2 with integer textures). */
export function globeAvailable(): boolean {
  if (available !== null) return available;
  try {
    const c = document.createElement('canvas');
    available = Boolean(c.getContext('webgl2'));
  } catch {
    available = false;
  }
  return available;
}

const GRID_W = 1440;
const GRID_H = 720;
const GEO_W = 4096;
const GEO_H = 2048;
const D = Math.PI / 180;

/** The land (red), the borders (green) and the coast (blue), equirectangular, from the flat map's atlas. */
let geoCanvas: HTMLCanvasElement | null = null;
function geoImage(): HTMLCanvasElement {
  if (geoCanvas) return geoCanvas;
  const c = document.createElement('canvas');
  c.width = GEO_W;
  c.height = GEO_H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, GEO_W, GEO_H);
  const { land, borders, coast } = atlas();
  // The atlas is drawn in (lon * K, -lat); the texture is (lon + 180, 90 - lat) at GEO_W / 360 pixels a degree.
  g.setTransform(GEO_W / (360 * K), 0, 0, GEO_H / 180, GEO_W / 2, GEO_H / 2);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgb(255, 0, 0)';
  g.fill(land);
  g.lineWidth = 1.3 * (180 / GEO_H);
  g.strokeStyle = 'rgb(0, 255, 0)';
  g.stroke(borders);
  g.lineWidth = 1.6 * (180 / GEO_H);
  g.strokeStyle = 'rgb(0, 0, 255)';
  g.stroke(coast);
  geoCanvas = c;
  return c;
}

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision highp usampler2D;
uniform vec2 uC;
uniform float uR;
uniform float uPx;
uniform mat3 uRot;
uniform vec3 uSun;
uniform float uHas;
uniform sampler2D uGeo;
uniform usampler2D uIx;
uniform sampler2D uLut;
uniform sampler2D uGlow;
out vec4 o;
const vec3 SEA = vec3(8.0, 11.0, 17.0) / 255.0;
const vec3 UNLOADED = vec3(16.0, 19.0, 24.0) / 255.0;
const vec3 SOLID = vec3(36.0, 40.0, 48.0) / 255.0;
const vec3 INK = vec3(243.0, 244.0, 246.0) / 255.0;
const vec3 AIR = vec3(0.36, 0.55, 0.92);
void main() {
  vec2 p = (gl_FragCoord.xy - uC) / uR;
  float d = length(p);
  float px = 1.0 / uR;
  float air = exp(-max(d - 1.0, 0.0) * 22.0) * 0.5 * smoothstep(1.0 - 6.0 * px, 1.0, d);
  if (d > 1.0 + px) {
    o = vec4(AIR * air, air);
    return;
  }
  float z = sqrt(max(0.0, 1.0 - d * d));
  vec3 nv = vec3(p, z);
  vec3 nw = uRot * nv;
  float lat = asin(clamp(nw.y, -1.0, 1.0));
  float lon = atan(nw.x, nw.z);
  vec2 uv = vec2(lon / 6.2831853 + 0.5, 0.5 - lat / 3.1415927);
  // Derivatives without the seam at the date line: of the two longitudes, the one that does not jump here.
  vec2 uw = vec2(fract(uv.x + 0.5), uv.y);
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  vec2 dxw = dFdx(uw);
  vec2 dyw = dFdy(uw);
  if (abs(dxw.x) < abs(dx.x)) dx.x = dxw.x;
  if (abs(dyw.x) < abs(dy.x)) dy.x = dyw.x;
  vec4 g = textureGrad(uGeo, uv, dx, dy);
  ivec2 cell = ivec2(clamp(floor(uv * vec2(1440.0, 720.0)), vec2(0.0), vec2(1439.0, 719.0)));
  uint k = uHas > 0.5 ? texelFetch(uIx, cell, 0).r : 0u;
  // Land with no loaded file's row: hatched across the screen, 7 CSS pixels apart, as on the flat map.
  float h = fract((gl_FragCoord.x + gl_FragCoord.y) / (7.0 * uPx));
  float hatch = 1.0 - smoothstep(0.8 / 7.0, 1.6 / 7.0, h);
  vec3 land = k >= 1u ? SOLID : mix(UNLOADED, INK, hatch * 0.08);
  vec3 c = mix(SEA, land, g.r);
  vec3 fire = vec3(0.0);
  if (k >= 2u) {
    c = texelFetch(uLut, ivec2(int(k), 0), 0).rgb;
    if (k >= 3u) fire = c;
  }
  c = mix(c, INK, clamp(g.g * 0.1 + g.b * 0.22, 0.0, 1.0));
  float sun = dot(nv, uSun);
  float day = smoothstep(-0.3, 0.4, sun);
  vec3 lit = c * mix(0.34, 1.04, day);
  // The fires keep their light on the night side, with the soft glow round them.
  lit = mix(lit, fire, k >= 3u ? 0.7 : 0.0);
  float glow = uHas > 0.5 ? textureLod(uGlow, uv, 2.2).r : 0.0;
  lit += vec3(1.0, 0.45, 0.16) * glow * 0.42;
  lit += AIR * pow(1.0 - z, 3.0) * 0.3 * (0.35 + 0.65 * day);
  float edge = smoothstep(1.0 + px, 1.0 - px, d);
  o = vec4(mix(AIR * air, lit, edge), max(edge, air));
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
  return s;
}

/** The rotation from the view (x right, y up, z to the viewer) to the Earth, for a centre at lon, lat (degrees). */
function rotation(lon: number, lat: number): number[] {
  const cl = Math.cos(lon * D);
  const sl = Math.sin(lon * D);
  const cp = Math.cos(lat * D);
  const sp = Math.sin(lat * D);
  // Columns: the view's x, y and z axes in the Earth's frame (y north, z at lon 0 on the equator, x at 90 E).
  return [cl, 0, -sl, -sl * sp, cp, -cl * sp, sl * cp, sp, cl * cp];
}

interface Turn {
  lon: number;
  lat: number;
  /** How near the view is: 1 the whole globe, more nearer. */
  zoom: number;
  vLon: number;
  vLat: number;
  dragAt: number;
}

/** A flight under way: from where the view was to where it goes, over `ms`. */
interface Flight {
  from: { lon: number; lat: number; zoom: number };
  to: { lon: number; lat: number; zoom: number };
  t0: number;
  ms: number;
  dip: number;
}

/** The middle and the size (degrees across, as seen) of a place's largest ring: its main land, not its far islands. */
export function aimOf(rings: number[][][]): { lon: number; lat: number; across: number } | null {
  let best: { w: number; s: number; e: number; n: number; area: number } | null = null;
  for (const r of rings) {
    let w = 180;
    let s = 90;
    let e = -180;
    let n = -90;
    for (const [x, y] of r) {
      w = Math.min(w, x);
      e = Math.max(e, x);
      s = Math.min(s, y);
      n = Math.max(n, y);
    }
    const area = (e - w) * (n - s) * Math.cos((((s + n) / 2) * Math.PI) / 180);
    if (!best || area > best.area) best = { w, s, e, n, area };
  }
  if (!best) return null;
  const lat = (best.s + best.n) / 2;
  const across = Math.max((best.e - best.w) * Math.cos((lat * Math.PI) / 180), best.n - best.s);
  return { lon: (best.w + best.e) / 2, lat, across };
}

const AUTO_DEG_S = 4;
const FILM_FROM = -82;
const FILM_TO = 52;

export function Globe({ label, ix, lut, padTop = 0, padBottom = 0, padLeft = 0, film = null, fly = null, outlines = [], onBox, onPoint, onPick, onSlow, pins = [], onPin, onPinPick, startAt = null, markedPin = null, onMarked, className }: GlobeProps) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const over = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const turn = useRef<Turn>(
    startAt && !film
      ? { lon: startAt.lon, lat: Math.max(-75, Math.min(75, startAt.lat)), zoom: startAt.zoom, vLon: 0, vLat: 0, dragAt: 0 }
      : { lon: film ? FILM_FROM : 10, lat: film ? 12 : 16, zoom: 1, vLon: 0, vLat: 0, dragAt: 0 },
  );
  const flight = useRef<Flight | null>(null);
  const gl = useRef<{
    gl: WebGL2RenderingContext;
    prog: WebGLProgram;
    u: Record<string, WebGLUniformLocation | null>;
    ix: WebGLTexture;
    glow: WebGLTexture;
    lut: WebGLTexture;
    has: boolean;
  } | null>(null);
  const props = useRef({ ix, lut, padTop, padBottom, padLeft, film, fly, outlines, onBox, onPoint, onPick, onSlow, pins, onPin, onPinPick, markedPin, onMarked });
  props.current = { ix, lut, padTop, padBottom, padLeft, film, fly, outlines, onBox, onPoint, onPick, onSlow, pins, onPin, onPinPick, markedPin, onMarked };
  const lastMarked = useRef<string>('none');
  // The pins as last drawn (the overlay's own px) and the one last told as pointed.
  const pinsAt = useRef<Array<{ id: string; x: number; y: number }>>([]);
  const lastPin = useRef<string>('none');
  const pinUnder = (x: number, y: number) => {
    let best: { id: string; x: number; y: number } | null = null;
    let bestD = PIN_REACH;
    for (const q of pinsAt.current) {
      const d = Math.max(Math.abs(q.x - x), Math.abs(q.y - y));
      if (d <= bestD) {
        bestD = d;
        best = q;
      }
    }
    return best;
  };
  const lastBox = useRef<string>('none');
  const lastBoxAt = useRef(0);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const dirty = useRef(true);
  const filmT0 = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // The globe's place: centred in the room left by the caption and the strip.
  const geom = useCallback(() => {
    const { w, h } = size;
    const top = props.current.padTop;
    const room = Math.max(h - top - props.current.padBottom, 80);
    const left = Math.min(props.current.padLeft, w * 0.5);
    const base = Math.max(Math.min((w - left) * 0.5, room * 0.5) * 0.94, 40);
    return { cx: left + (w - left) / 2, cy: top + room / 2, r: base * turn.current.zoom, base, room };
  }, [size]);

  // The point under a CSS pixel, by the shader's own sums.
  const geoAt = useCallback(
    (x: number, y: number): { lon: number; lat: number } | null => {
      const { cx, cy, r } = geom();
      const px = (x - cx) / r;
      const py = -(y - cy) / r;
      const d2 = px * px + py * py;
      if (d2 > 1) return null;
      const pz = Math.sqrt(1 - d2);
      const m = rotation(turn.current.lon, turn.current.lat);
      const wx = m[0] * px + m[3] * py + m[6] * pz;
      const wy = m[1] * px + m[4] * py + m[7] * pz;
      const wz = m[2] * px + m[5] * py + m[8] * pz;
      return { lon: Math.atan2(wx, wz) / D, lat: Math.asin(Math.max(-1, Math.min(1, wy))) / D };
    },
    [geom],
  );

  // WebGL: the program, the quad and the textures, once.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('webgl2', { antialias: false, premultipliedAlpha: true, alpha: true });
    if (!g) {
      props.current.onSlow?.();
      return;
    }
    let prog: WebGLProgram;
    try {
      prog = g.createProgram()!;
      g.attachShader(prog, compile(g, g.VERTEX_SHADER, VERT));
      g.attachShader(prog, compile(g, g.FRAGMENT_SHADER, FRAG));
      g.linkProgram(prog);
      if (!g.getProgramParameter(prog, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(prog) ?? 'link');
    } catch {
      props.current.onSlow?.();
      return;
    }
    g.useProgram(prog);
    const buf = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, buf);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), g.STATIC_DRAW);
    const aPos = g.getAttribLocation(prog, 'aPos');
    g.enableVertexAttribArray(aPos);
    g.vertexAttribPointer(aPos, 2, g.FLOAT, false, 0, 0);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    const tex = (unit: number) => {
      const t = g.createTexture()!;
      g.activeTexture(g.TEXTURE0 + unit);
      g.bindTexture(g.TEXTURE_2D, t);
      return t;
    };
    // The land, borders and coast, mipmapped, wrapping east to west.
    tex(0);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, g.RGBA, g.UNSIGNED_BYTE, geoImage());
    g.generateMipmap(g.TEXTURE_2D);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR_MIPMAP_LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    const aniso = g.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) g.texParameterf(g.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, g.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    // The year's cells, as integers, read exactly.
    const ixTex = tex(1);
    g.texImage2D(g.TEXTURE_2D, 0, g.R8UI, GRID_W, GRID_H, 0, g.RED_INTEGER, g.UNSIGNED_BYTE, new Uint8Array(GRID_W * GRID_H));
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
    // The colour of each index.
    const lutTex = tex(2);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
    // The fires' glow: their strength, mipmapped, read a few levels down.
    const glowTex = tex(3);
    g.texImage2D(g.TEXTURE_2D, 0, g.R8, GRID_W, GRID_H, 0, g.RED, g.UNSIGNED_BYTE, new Uint8Array(GRID_W * GRID_H));
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR_MIPMAP_LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT);
    g.generateMipmap(g.TEXTURE_2D);
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const n of ['uC', 'uR', 'uPx', 'uRot', 'uSun', 'uHas', 'uGeo', 'uIx', 'uLut', 'uGlow']) u[n] = g.getUniformLocation(prog, n);
    g.uniform1i(u.uGeo, 0);
    g.uniform1i(u.uIx, 1);
    g.uniform1i(u.uLut, 2);
    g.uniform1i(u.uGlow, 3);
    const s = [-0.55, 0.42, 0.72];
    const n = Math.hypot(s[0], s[1], s[2]);
    g.uniform3f(u.uSun, s[0] / n, s[1] / n, s[2] / n);
    gl.current = { gl: g, prog, u, ix: ixTex, glow: glowTex, lut: lutTex, has: false };
    dirty.current = true;
    const lost = (e: Event) => {
      e.preventDefault();
      props.current.onSlow?.();
    };
    c.addEventListener('webglcontextlost', lost);
    return () => {
      c.removeEventListener('webglcontextlost', lost);
      gl.current = null;
    };
  }, []);

  // A new year, or new colours: the cells and their glow uploaded.
  useEffect(() => {
    const s = gl.current;
    if (!s) return;
    const g = s.gl;
    const bytes = new Uint8Array(lut.buffer, lut.byteOffset, 256 * 4);
    g.activeTexture(g.TEXTURE2);
    g.bindTexture(g.TEXTURE_2D, s.lut);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, 256, 1, 0, g.RGBA, g.UNSIGNED_BYTE, bytes);
    dirty.current = true;
  }, [lut, size]);
  useEffect(() => {
    const s = gl.current;
    if (!s || !ix) return;
    const g = s.gl;
    g.activeTexture(g.TEXTURE1);
    g.bindTexture(g.TEXTURE_2D, s.ix);
    g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, GRID_W, GRID_H, g.RED_INTEGER, g.UNSIGNED_BYTE, ix);
    const glow = new Uint8Array(ix.length);
    for (let i = 0; i < ix.length; i++) {
      const k = ix[i];
      if (k >= 3) glow[i] = Math.round(((k - 3) / 252) * 255);
    }
    g.activeTexture(g.TEXTURE3);
    g.bindTexture(g.TEXTURE_2D, s.glow);
    g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, GRID_W, GRID_H, g.RED, g.UNSIGNED_BYTE, glow);
    g.generateMipmap(g.TEXTURE_2D);
    s.has = true;
    dirty.current = true;
  }, [ix, size]);
  useEffect(() => {
    dirty.current = true;
  }, [outlines, padTop, padBottom, padLeft, pins]);

  // A flight to a place, or back out: from the view as it is, eased, with a short rise on a long turn so it reads as
  // travel; a drag ends it where it is.
  useEffect(() => {
    const t = turn.current;
    const from = { lon: t.lon, lat: t.lat, zoom: t.zoom };
    let to: { lon: number; lat: number; zoom: number };
    if (fly) {
      const aim = aimOf(fly.rings);
      if (!aim) return;
      const { base, room } = geom();
      // Near enough that the place's main land takes about half the room, within 1 and 16 times the whole globe.
      const zoom = Math.max(1, Math.min(16, (0.5 * Math.min(room, size.w)) / (base * Math.max(aim.across, 0.5) * D)));
      to = { lon: aim.lon, lat: Math.max(-75, Math.min(75, aim.lat)), zoom };
    } else {
      if (t.zoom < 1.01 && !flight.current) return;
      to = { lon: t.lon, lat: Math.max(-60, Math.min(60, t.lat)) * 0.4 + 16 * 0.6, zoom: 1 };
    }
    let dLon = to.lon - from.lon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    const far = Math.hypot(dLon, to.lat - from.lat);
    const ms = 900 + Math.min(far, 140) * 6 + Math.abs(Math.log(to.zoom / from.zoom)) * 180;
    flight.current = { from, to: { ...to, lon: from.lon + dLon }, t0: performance.now(), ms, dip: Math.min(0.4, far / 300) };
    t.vLon = 0;
    t.vLat = 0;
    dirty.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fly?.rings]);

  // The frame loop: the turn (the film's, a drag's glide, or the slow turn), the globe, the outlines.
  useEffect(() => {
    if (!size.w) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let raf = 0;
    let last = performance.now();
    const times: number[] = [];
    let judged = false;
    let since = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      const t = turn.current;
      const f = props.current.film;
      let moved = false;
      const fl = flight.current;
      if (fl) {
        const k = Math.min((now - fl.t0) / fl.ms, 1);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        t.lon = fl.from.lon + (fl.to.lon - fl.from.lon) * e;
        t.lat = fl.from.lat + (fl.to.lat - fl.from.lat) * e;
        // The zoom eases in its logarithm, and rises a little mid-way on a long turn.
        const z = Math.exp(Math.log(fl.from.zoom) + (Math.log(fl.to.zoom) - Math.log(fl.from.zoom)) * e);
        t.zoom = Math.max(1, z * (1 - fl.dip * Math.sin(Math.PI * k)));
        if (k >= 1) {
          flight.current = null;
          t.zoom = fl.to.zoom;
          t.dragAt = now;
        }
        moved = true;
      } else if (props.current.fly?.drift && t.zoom > 1.01) {
        // A flight that lands where the page goes next keeps drawing nearer, so the camera never holds still on
        // the coarse squares while the place's ground comes.
        t.zoom = Math.min(t.zoom * (1 + 0.35 * dt), 48);
        moved = true;
      } else if (f) {
        if (f.playing && filmT0.current === null) filmT0.current = now;
        const k = filmT0.current === null ? 0 : Math.min((now - filmT0.current) / Math.max(f.passMs, 1), 1);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const lon = FILM_FROM + (FILM_TO - FILM_FROM) * e;
        if (lon !== t.lon) {
          t.lon = lon;
          moved = true;
        }
      } else if (now - t.dragAt > 60 && (Math.abs(t.vLon) > 0.01 || Math.abs(t.vLat) > 0.01)) {
        // A drag's glide, slowing.
        t.lon += t.vLon * dt;
        const lim = t.zoom > 1.02 ? 80 : 60;
        t.lat = Math.max(-lim, Math.min(lim, t.lat + t.vLat * dt));
        const damp = Math.exp(-dt * 3);
        t.vLon *= damp;
        t.vLat *= damp;
        moved = true;
      } else if (!reduce && now - t.dragAt > 3500 && t.zoom < 1.02) {
        t.lon += AUTO_DEG_S * dt;
        moved = true;
      }
      if (t.lon > 180) t.lon -= 360;
      if (t.lon < -180) t.lon += 360;
      if (!moved && !dirty.current) return;
      dirty.current = false;
      draw();
      // The point under a still pointer changes as the globe turns.
      if (moved && pointer.current && (since += dt) > 0.1) {
        since = 0;
        const at = geoAt(pointer.current.x, pointer.current.y);
        props.current.onPoint?.(at ? { ...at, ...pointer.current } : null);
      }
      // Too slow to hold its frames here: the flat map stands in (not in the film, whose frames are taken one by one).
      if (!judged && !props.current.film && document.visibilityState === 'visible') {
        times.push(dt);
        if (times.length > 90) {
          judged = true;
          const sorted = times.slice(30).sort((a, b) => a - b);
          if (sorted[Math.floor(sorted.length / 2)] > 0.024) props.current.onSlow?.();
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, geoAt]);

  const draw = () => {
    const s = gl.current;
    const c = canvas.current;
    if (!s || !c || !size.w) return;
    const g = s.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(size.w * dpr);
    const H = Math.round(size.h * dpr);
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    g.viewport(0, 0, W, H);
    g.clearColor(0, 0, 0, 0);
    g.clear(g.COLOR_BUFFER_BIT);
    const { cx, cy, r } = geom();
    g.uniform2f(s.u.uC, cx * dpr, H - cy * dpr);
    g.uniform1f(s.u.uR, r * dpr);
    g.uniform1f(s.u.uPx, dpr);
    g.uniformMatrix3fv(s.u.uRot, false, rotation(turn.current.lon, turn.current.lat));
    g.uniform1f(s.u.uHas, s.has ? 1 : 0);
    g.drawArrays(g.TRIANGLES, 0, 6);
    drawOutlines(dpr, cx, cy, r);
  };

  // The outlines, on a 2D canvas over the globe: only the near side, broken where a line goes round the edge.
  const drawOutlines = (dpr: number, cx: number, cy: number, r: number) => {
    const c = over.current;
    if (!c) return;
    const W = Math.round(size.w * dpr);
    const H = Math.round(size.h * dpr);
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const g = c.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    const list = props.current.outlines;
    const m = rotation(turn.current.lon, turn.current.lat);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineJoin = 'round';
    let box: { left: number; top: number; right: number; bottom: number } | null = null;
    for (const o of list) {
      g.beginPath();
      for (const ring of o.rings) {
        let pen = false;
        for (const [lon, lat] of ring) {
          const cl = Math.cos(lat * D);
          const wx = cl * Math.sin(lon * D);
          const wy = Math.sin(lat * D);
          const wz = cl * Math.cos(lon * D);
          // The view's coordinates: the transpose of the rotation.
          const vx = m[0] * wx + m[1] * wy + m[2] * wz;
          const vy = m[3] * wx + m[4] * wy + m[5] * wz;
          const vz = m[6] * wx + m[7] * wy + m[8] * wz;
          if (vz < 0.02) {
            pen = false;
            continue;
          }
          const x = cx + vx * r;
          const y = cy - vy * r;
          if (pen) g.lineTo(x, y);
          else g.moveTo(x, y);
          pen = true;
          if (o.report) {
            if (!box) box = { left: x, top: y, right: x, bottom: y };
            else {
              box.left = Math.min(box.left, x);
              box.top = Math.min(box.top, y);
              box.right = Math.max(box.right, x);
              box.bottom = Math.max(box.bottom, y);
            }
          }
        }
      }
      // The interface's one colour (the plan's pale cyan): the chosen country strong, the pointed one quiet.
      g.strokeStyle = o.strong ? 'rgba(159, 227, 255, 0.95)' : 'rgba(159, 227, 255, 0.55)';
      g.lineWidth = o.strong ? 1.5 : 1;
      g.stroke();
    }
    // The pointed country's box on the screen, told only when it moves by more than a pixel.
    const report = props.current.onBox;
    if (report) {
      const wr = wrap.current?.getBoundingClientRect();
      const b = box && wr ? { left: Math.round(wr.left + box.left), top: Math.round(wr.top + box.top), right: Math.round(wr.left + box.right), bottom: Math.round(wr.top + box.bottom) } : null;
      const key = b ? `${b.left},${b.top},${b.right},${b.bottom}` : 'none';
      const now = performance.now();
      if (key !== lastBox.current && (!b || now - lastBoxAt.current > 50)) {
        lastBox.current = key;
        lastBoxAt.current = now;
        report(b);
      }
    }
    // The places, as squares of one size on the screen on the near side, set apart where two would touch.
    const placed: Array<{ id: string; x: number; y: number }> = [];
    for (const pin of props.current.pins) {
      const cl = Math.cos(pin.lat * D);
      const wx = cl * Math.sin(pin.lon * D);
      const wy = Math.sin(pin.lat * D);
      const wz = cl * Math.cos(pin.lon * D);
      const vx = m[0] * wx + m[1] * wy + m[2] * wz;
      const vy = m[3] * wx + m[4] * wy + m[5] * wz;
      const vz = m[6] * wx + m[7] * wy + m[8] * wz;
      if (vz < 0.12) continue;
      let x = cx + vx * r;
      const y = cy - vy * r;
      for (const q of placed) {
        if (Math.abs(q.x - x) < PIN + 6 && Math.abs(q.y - y) < PIN + 6) x = q.x + (x >= q.x ? 1 : -1) * (PIN + 6);
      }
      placed.push({ id: pin.id, x, y });
    }
    pinsAt.current = placed;
    const p = pointer.current;
    const hit = p && !props.current.film ? pinUnder(p.x, p.y) : null;
    const markedId = props.current.markedPin;
    let marked: { x: number; y: number } | null = null;
    for (const q of placed) {
      const on = hit?.id === q.id;
      const was = markedId === q.id;
      g.fillStyle = on || was ? 'rgba(159, 227, 255, 0.35)' : 'rgba(5, 7, 12, 0.55)';
      g.fillRect(Math.round(q.x - PIN / 2), Math.round(q.y - PIN / 2), PIN, PIN);
      g.strokeStyle = 'rgba(159, 227, 255, 0.95)';
      g.lineWidth = on || was ? 2 : 1.5;
      g.strokeRect(Math.round(q.x - PIN / 2) + 0.5, Math.round(q.y - PIN / 2) + 0.5, PIN - 1, PIN - 1);
      if (was) {
        // The place the visitor came back from: a ring round its pin.
        marked = q;
        g.lineWidth = 1;
        g.strokeRect(Math.round(q.x - PIN) + 0.5, Math.round(q.y - PIN) + 0.5, PIN * 2 - 1, PIN * 2 - 1);
      }
    }
    const tellMarked = props.current.onMarked;
    if (tellMarked) {
      const wr = wrap.current?.getBoundingClientRect();
      const mb = marked && wr ? { left: Math.round(wr.left + marked.x - PIN), top: Math.round(wr.top + marked.y - PIN), right: Math.round(wr.left + marked.x + PIN), bottom: Math.round(wr.top + marked.y + PIN) } : null;
      const key = mb ? `${mb.left},${mb.top}` : 'none';
      if (key !== lastMarked.current) {
        lastMarked.current = key;
        tellMarked(mb);
      }
    }
    const tellPin = props.current.onPin;
    if (tellPin) {
      const wr = wrap.current?.getBoundingClientRect();
      const pb = hit && wr ? { left: Math.round(wr.left + hit.x - PIN), top: Math.round(wr.top + hit.y - PIN), right: Math.round(wr.left + hit.x + PIN), bottom: Math.round(wr.top + hit.y + PIN) } : null;
      const key = pb && hit ? `${hit.id},${pb.left},${pb.top}` : 'none';
      if (key !== lastPin.current) {
        lastPin.current = key;
        tellPin(pb && hit ? { id: hit.id, box: pb } : null);
      }
    }
    // The pointed square: the one the readout's count is for, in the interface's pale cyan (not over a place's pin).
    if (p && !hit && !props.current.film && (p.x - cx) ** 2 + (p.y - cy) ** 2 < r * r) {
      g.strokeStyle = 'rgba(159, 227, 255, 0.95)';
      g.lineWidth = 1;
      g.strokeRect(Math.round(p.x) - 6.5, Math.round(p.y) - 6.5, 13, 13);
    }
  };

  // The pointer: a drag turns the globe (and stops the slow turn for a while), a still click picks.
  const drag = useRef<{ x: number; y: number; moved: boolean; t: number } | null>(null);
  const local = (e: React.PointerEvent) => {
    const b = wrap.current!.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (props.current.film) return;
    const p = local(e);
    drag.current = { ...p, moved: false, t: performance.now() };
    flight.current = null;
    turn.current.vLon = 0;
    turn.current.vLat = 0;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = local(e);
    pointer.current = p;
    const d = drag.current;
    if (d) {
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      const { r } = geom();
      const now = performance.now();
      const dt = Math.max((now - d.t) / 1000, 1 / 240);
      const t = turn.current;
      const dLon = -(dx / r) / D;
      const dLat = (dy / r) / D;
      t.lon += dLon;
      t.lat = Math.max(t.zoom > 1.02 ? -80 : -60, Math.min(t.zoom > 1.02 ? 80 : 60, t.lat + dLat));
      t.vLon = dLon / dt;
      t.vLat = dLat / dt;
      t.dragAt = now;
      d.x = p.x;
      d.y = p.y;
      d.t = now;
      dirty.current = true;
      return;
    }
    const at = geoAt(p.x, p.y);
    props.current.onPoint?.(at ? { ...at, ...p } : null);
    dirty.current = true;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      turn.current.dragAt = performance.now();
      return;
    }
    const p = local(e);
    const pin = props.current.onPinPick ? pinUnder(p.x, p.y) : null;
    if (pin) props.current.onPinPick!(pin.id);
    else props.current.onPick?.(geoAt(p.x, p.y));
  };

  return (
    <div
      ref={wrap}
      className={`world-globe${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      onPointerLeave={() => {
        pointer.current = null;
        dirty.current = true;
        props.current.onPoint?.(null);
      }}
    >
      <canvas ref={canvas} className="world-globe__gl" />
      <canvas ref={over} className="world-globe__over" aria-hidden="true" />
    </div>
  );
}
