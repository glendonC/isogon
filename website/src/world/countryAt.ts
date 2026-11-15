import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countries from 'world-atlas/countries-50m.json';

/**
 * The country a point lies in, from Natural Earth's countries at 1:50 million, so a fire chosen by its coordinates
 * can be said by the country around it. Null at sea or where no country holds the point.
 */

type Ring = number[][];
interface Shape {
  name: string;
  box: [number, number, number, number];
  rings: Ring[];
}

let shapes: Shape[] | null = null;

function build(): Shape[] {
  const topo = countries as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const fc = feature(topo, topo.objects.countries) as unknown as {
    features: Array<{ properties: { name: string }; geometry: { type: string; coordinates: unknown } | null }>;
  };
  return fc.features
    .filter((f) => f.geometry)
    .map((f) => {
      const g = f.geometry!;
      const rings = g.type === 'Polygon' ? (g.coordinates as Ring[]) : g.type === 'MultiPolygon' ? (g.coordinates as Ring[][]).flat() : [];
      let w = 180;
      let s = 90;
      let e = -180;
      let n = -90;
      for (const r of rings)
        for (const [x, y] of r) {
          w = Math.min(w, x);
          e = Math.max(e, x);
          s = Math.min(s, y);
          n = Math.max(n, y);
        }
      return { name: f.properties.name, box: [w, s, e, n] as [number, number, number, number], rings };
    });
}

function inside(rings: Ring[], x: number, y: number): boolean {
  let c = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
  }
  return c;
}

/** Natural Earth shortens long names on its small maps; a sentence says them whole. */
const WHOLE: Array<[RegExp, string]> = [
  [/^Dem\. Rep\. /, 'Democratic Republic of the '],
  [/^Central African Rep\.$/, 'Central African Republic'],
  [/^Eq\. /, 'Equatorial '],
  [/^S\. /, 'South '],
  [/^N\. /, 'North '],
  [/^W\. /, 'Western '],
  [/^Fr\. /, 'French '],
  [/ Is\.$/, ' Islands'],
  [/ Herz\.$/, ' Herzegovina'],
  [/^St\. /, 'Saint '],
  [/ Rep\.$/, ' Republic'],
];
const whole = (name: string) => WHOLE.reduce((n, [re, w]) => n.replace(re, w), name);

export function countryAt(lon: number, lat: number): string | null {
  if (!shapes) shapes = build();
  for (const s of shapes) {
    if (lon < s.box[0] || lon > s.box[2] || lat < s.box[1] || lat > s.box[3]) continue;
    if (inside(s.rings, lon, lat)) return whole(s.name);
  }
  return null;
}

/** "15.44 S, 124.85 E". */
export const pointWords = (lon: number, lat: number) =>
  `${Math.abs(lat).toFixed(2)} ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(2)} ${lon < 0 ? 'W' : 'E'}`;
