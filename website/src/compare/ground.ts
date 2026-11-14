import * as THREE from 'three';
import { assetUrl } from '../lib/api';
import type { Box, CompareGround } from './types';

/**
 * The ground of a block: its files, fetched once through the page's client, and the cut-out built from them
 * (a top surface displaced by the real elevation, and four walls down to the plane).
 */

/** Heights are drawn at twice their true size, as on the stage. */
export const VERTICAL_EXAGGERATION = 2;
/** Thickness of the cut under the lowest point of the ground, km. Drawing. */
const BASE_KM = 1.2;

export interface Elevation {
  /** Metres, row 0 north, `size` posts on a side. */
  data: Float32Array;
  size: number;
}

const elevations = new Map<string, Promise<Elevation>>();
const images = new Map<string, Promise<HTMLImageElement | null>>();
const beliefs = new Map<string, Promise<Uint8Array | null>>();

async function bytesOf(path: string): Promise<ArrayBuffer | null> {
  const url = await assetUrl(path);
  if (!url) return null;
  const resp = await fetch(url);
  return resp.ok ? resp.arrayBuffer() : null;
}

/** A square float32 grid of elevations. Fails when the file is missing or is not a square grid. */
export function loadElevation(path: string): Promise<Elevation> {
  let hit = elevations.get(path);
  if (!hit) {
    hit = bytesOf(path).then((buf) => {
      if (!buf) throw new Error(`no elevation at ${path}`);
      const data = new Float32Array(buf);
      const size = Math.round(Math.sqrt(data.length));
      if (size < 2 || size * size !== data.length) throw new Error(`elevation at ${path} is not a square grid`);
      return { data, size };
    });
    hit.catch(() => elevations.delete(path));
    elevations.set(path, hit);
  }
  return hit;
}

/** The image of a ground, or null when none is given or a recorded page withholds it. */
export function loadImage(path: string | null): Promise<HTMLImageElement | null> {
  if (!path) return Promise.resolve(null);
  let hit = images.get(path);
  if (!hit) {
    hit = (async () => {
      const url = await assetUrl(path);
      if (!url) return null;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const img = new Image();
      img.src = URL.createObjectURL(await resp.blob());
      await img.decode();
      return img;
    })().catch(() => null);
    images.set(path, hit);
  }
  return hit;
}

/** A run's belief file: steps by rows by columns by two bytes. Null when it is not there. */
export function loadBelief(path: string): Promise<Uint8Array | null> {
  let hit = beliefs.get(path);
  if (!hit) {
    hit = bytesOf(path)
      .then((buf) => (buf ? new Uint8Array(buf) : null))
      .catch(() => null);
    beliefs.set(path, hit);
  }
  return hit;
}

export interface Terrain {
  top: THREE.BufferGeometry;
  walls: THREE.BufferGeometry;
  /** Size of the cut on the ground, km. */
  widthKm: number;
  depthKm: number;
  /** Height of the highest point above the plane, in scene units (km, exaggerated). */
  topKm: number;
  /** The box the cut shows. */
  view: Box;
  /** Height above the plane at a point of the cut: `u` from the west edge, `v` from the north edge, 0 to 1. */
  heightAt(u: number, v: number): number;
}

/** The cut of a ground and its size on the ground, without its files. */
export function cutOf(ground: CompareGround): { view: Box; widthKm: number; depthKm: number } {
  const view = ground.cut ?? ground.box;
  const [W, S, E, N] = ground.box;
  return {
    view,
    widthKm: (ground.widthKm * (view[2] - view[0])) / (E - W),
    depthKm: (ground.depthKm * (view[3] - view[1])) / (N - S),
  };
}

function sample(e: Elevation, u: number, v: number): number {
  const s = e.size - 1;
  const fx = Math.min(s, Math.max(0, u * s));
  const fy = Math.min(s, Math.max(0, v * s));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(s, x0 + 1);
  const y1 = Math.min(s, y0 + 1);
  const ax = fx - x0;
  const ay = fy - y0;
  const d = e.data;
  const n = e.size;
  return (d[y0 * n + x0] * (1 - ax) + d[y0 * n + x1] * ax) * (1 - ay) + (d[y1 * n + x0] * (1 - ax) + d[y1 * n + x1] * ax) * ay;
}

/** Builds the cut-out of a ground with `posts` posts on a side. +X is east, +Y up, +Z south; the base sits on y = 0. */
export function buildTerrain(e: Elevation, ground: CompareGround, posts: number): Terrain {
  const { view, widthKm, depthKm } = cutOf(ground);
  const [W, S, E, N] = ground.box;
  const u0 = (view[0] - W) / (E - W);
  const u1 = (view[2] - W) / (E - W);
  const v0 = (N - view[3]) / (N - S);
  const v1 = (N - view[1]) / (N - S);
  const seg = posts - 1;

  const heights = new Float32Array(posts * posts);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < posts; i++) {
    for (let j = 0; j < posts; j++) {
      const h = sample(e, u0 + ((u1 - u0) * j) / seg, v0 + ((v1 - v0) * i) / seg);
      heights[i * posts + j] = h;
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  const yOf = (h: number) => BASE_KM + ((h - lo) / 1000) * VERTICAL_EXAGGERATION;
  for (let k = 0; k < heights.length; k++) heights[k] = yOf(heights[k]);

  const position = new Float32Array(posts * posts * 3);
  const uv = new Float32Array(posts * posts * 2);
  const uvMark = new Float32Array(posts * posts * 2);
  for (let i = 0; i < posts; i++) {
    for (let j = 0; j < posts; j++) {
      const k = i * posts + j;
      position[k * 3] = (j / seg - 0.5) * widthKm;
      position[k * 3 + 1] = heights[k];
      position[k * 3 + 2] = (i / seg - 0.5) * depthKm;
      uv[k * 2] = u0 + ((u1 - u0) * j) / seg;
      uv[k * 2 + 1] = 1 - (v0 + ((v1 - v0) * i) / seg);
      uvMark[k * 2] = j / seg;
      uvMark[k * 2 + 1] = 1 - i / seg;
    }
  }
  const index = new Uint32Array(seg * seg * 6);
  let q = 0;
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * posts + j;
      const b = a + 1;
      const c = a + posts;
      const d = c + 1;
      index[q++] = a;
      index[q++] = c;
      index[q++] = b;
      index[q++] = b;
      index[q++] = c;
      index[q++] = d;
    }
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.BufferAttribute(position, 3));
  top.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  top.setAttribute('uvMark', new THREE.BufferAttribute(uvMark, 2));
  top.setIndex(new THREE.BufferAttribute(index, 1));
  top.computeVertexNormals();

  // Walls: from the cut edge of the ground down to the plane, darker toward the plane
  const wallPos: number[] = [];
  const wallCol: number[] = [];
  const wallIdx: number[] = [];
  const edge = (pick: (s: number) => number, shade: number) => {
    const start = wallPos.length / 3;
    for (let s = 0; s < posts; s++) {
      const k = pick(s);
      const x = position[k * 3];
      const y = position[k * 3 + 1];
      const z = position[k * 3 + 2];
      wallPos.push(x, y, z, x, 0, z);
      const hiC = 0.07 * shade;
      const loC = 0.022 * shade;
      wallCol.push(hiC, hiC * 1.12, hiC * 1.32, loC, loC * 1.12, loC * 1.32);
    }
    for (let s = 0; s < seg; s++) {
      const a = start + s * 2;
      wallIdx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  };
  edge((s) => seg * posts + s, 1.0); // south
  edge((s) => s * posts + seg, 0.62); // east
  edge((s) => s, 0.5); // north
  edge((s) => s * posts, 0.5); // west
  const walls = new THREE.BufferGeometry();
  walls.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
  walls.setAttribute('color', new THREE.Float32BufferAttribute(wallCol, 3));
  walls.setIndex(wallIdx);

  const heightAt = (u: number, v: number): number => {
    const fx = Math.min(seg, Math.max(0, u * seg));
    const fy = Math.min(seg, Math.max(0, v * seg));
    return heights[Math.round(fy) * posts + Math.round(fx)];
  };

  return { top, walls, widthKm, depthKm, topKm: yOf(hi), view, heightAt };
}
