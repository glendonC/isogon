/**
 * The world's one projection: plate carree with longitude shortened by the cosine of 45 degrees, the projection of
 * Choose a Place, so a box drawn here looks the same there. A box on the Earth is a rectangle on the screen, which
 * is why the world is drawn flat: every featured fire is in view at once, and a box is drawn and read directly.
 */

/** West, south, east, north, in degrees. */
export type Box = [number, number, number, number];

export const K = Math.cos(Math.PI / 4);
export const toX = (lon: number) => lon * K;
export const toY = (lat: number) => -lat;

/** Map units at the screen's centre, and map units per CSS pixel. */
export interface View {
  cx: number;
  cy: number;
  scale: number;
}

/** The land a visitor picks on: Antarctica and the far north stay drawn but out of the opening view. */
export const OPENING: Box = [-170, -58, 180, 78];

export function fitView(box: Box, w: number, h: number, pad = 1.06): View {
  const x0 = toX(box[0]);
  const x1 = toX(box[2]);
  const y0 = toY(box[3]);
  const y1 = toY(box[1]);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale: Math.max((x1 - x0) / Math.max(w, 1), (y1 - y0) / Math.max(h, 1)) * pad };
}

export interface Projector {
  w: number;
  h: number;
  view: View;
  /** Screen point of a longitude and latitude, in CSS pixels from the top left of the map. */
  at: (lon: number, lat: number) => [number, number];
  /** Longitude and latitude under a screen point. */
  geo: (x: number, y: number) => [number, number];
  /** CSS pixels per degree of latitude. */
  pxPerDeg: number;
}

export function projector(view: View, w: number, h: number): Projector {
  return {
    w,
    h,
    view,
    at: (lon, lat) => [(toX(lon) - view.cx) / view.scale + w / 2, (toY(lat) - view.cy) / view.scale + h / 2],
    geo: (x, y) => [((x - w / 2) * view.scale + view.cx) / K, -((y - h / 2) * view.scale + view.cy)],
    pxPerDeg: 1 / view.scale,
  };
}

/** Keep the view on the world: the centre stays over it and a whole world is the farthest out. */
export function clampView(v: View, w: number, h: number): View {
  const maxScale = Math.max((360 * K) / Math.max(w, 1), 180 / Math.max(h, 1)) * 1.1;
  const scale = Math.min(Math.max(v.scale, 0.0008), maxScale);
  const cx = Math.min(Math.max(v.cx, -180 * K), 180 * K);
  const cy = Math.min(Math.max(v.cy, -86), 86);
  return { cx, cy, scale };
}

export const clampLat = (lat: number) => Math.min(Math.max(lat, -90), 90);
export const clampLon = (lon: number) => Math.min(Math.max(lon, -180), 180);

/** A box from two corners, ordered and kept on the Earth. */
export function boxOf(a: [number, number], b: [number, number]): Box {
  return [clampLon(Math.min(a[0], b[0])), clampLat(Math.min(a[1], b[1])), clampLon(Math.max(a[0], b[0])), clampLat(Math.max(a[1], b[1]))];
}

/** The area of a box on the sphere, in square kilometres. */
export function boxAreaKm2(b: Box): number {
  const R = 6371.0088;
  const rad = Math.PI / 180;
  return Math.abs(R * R * (b[2] - b[0]) * rad * (Math.sin(b[3] * rad) - Math.sin(b[1] * rad)));
}
