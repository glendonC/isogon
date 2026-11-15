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
  /** Outlines drawn on the globe (the country under the pointer, the one chosen), as rings of [lon, lat]. */
  outlines?: Array<{ rings: number[][][]; strong: boolean }>;
  /** The point under the pointer, or null off the globe; called again as the globe turns under a still pointer. */
  onPoint?: (at: { lon: number; lat: number; x: number; y: number } | null) => void;
  /** A click: the point under it, or null off the globe. */
  onPick?: (at: { lon: number; lat: number } | null) => void;
  /** The page cannot hold its frames (or lost its WebGL context): the flat map stands in. */
  onSlow?: () => void;
  className?: string;
}

/**
 * The switch: whether the Earth's years show the globe without being asked. Off until the lead has seen the globe
 * whole; flipping it is one commit. Until then `?globe=1` shows it (and `?globe=0` the flat map either way).
 */
export const GLOBE_ON = false;

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
  vLon: number;
  vLat: number;
  dragAt: number;
}

const AUTO_DEG_S = 4;
const FILM_FROM = -82;
const FILM_TO = 52;

export function Globe({ label, ix, lut, padTop = 0, padBottom = 0, padLeft = 0, film = null, outlines = [], onPoint, onPick, onSlow, className }: GlobeProps) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const over = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const turn = useRef<Turn>({ lon: film ? FILM_FROM : 10, lat: film ? 12 : 16, vLon: 0, vLat: 0, dragAt: 0 });
  const gl = useRef<{
    gl: WebGL2RenderingContext;
    prog: WebGLProgram;
    u: Record<string, WebGLUniformLocation | null>;
    ix: WebGLTexture;
    glow: WebGLTexture;
    lut: WebGLTexture;
    has: boolean;
  } | null>(null);
  const props = useRef({ ix, lut, padTop, padBottom, padLeft, film, outlines, onPoint, onPick, onSlow });
  props.current = { ix, lut, padTop, padBottom, padLeft, film, outlines, onPoint, onPick, onSlow };
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
    const r = Math.max(Math.min((w - left) * 0.5, room * 0.5) * 0.94, 40);
    return { cx: left + (w - left) / 2, cy: top + room / 2, r };
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
  }, [outlines, padTop, padBottom, padLeft]);

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
      if (f) {
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
        t.lat = Math.max(-60, Math.min(60, t.lat + t.vLat * dt));
        const damp = Math.exp(-dt * 3);
        t.vLon *= damp;
        t.vLat *= damp;
        moved = true;
      } else if (!reduce && now - t.dragAt > 3500 && t.dragAt >= 0) {
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
    if (!list.length) return;
    const m = rotation(turn.current.lon, turn.current.lat);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineJoin = 'round';
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
        }
      }
      g.fillStyle = o.strong ? 'rgba(237, 239, 243, 0.1)' : 'rgba(237, 239, 243, 0.06)';
      g.strokeStyle = o.strong ? 'rgba(237, 239, 243, 1)' : 'rgba(237, 239, 243, 0.7)';
      g.lineWidth = o.strong ? 1.5 : 1;
      g.stroke();
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
      t.lat = Math.max(-60, Math.min(60, t.lat + dLat));
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
    props.current.onPick?.(geoAt(p.x, p.y));
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
        props.current.onPoint?.(null);
      }}
    >
      <canvas ref={canvas} className="world-globe__gl" />
      <canvas ref={over} className="world-globe__over" aria-hidden="true" />
    </div>
  );
}
