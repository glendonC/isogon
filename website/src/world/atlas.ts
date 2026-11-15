import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countries from 'world-atlas/countries-50m.json';
import { toX, toY } from './projection';

/**
 * The land and the borders between countries, from Natural Earth at 1:50 million (the world-atlas package the site
 * already ships), as paths in map units. Built once; drawn on every frame with the view's transform.
 */

type Ring = number[][];
type Geo = { type: string; coordinates: unknown } | null;

function ringsOf(g: Geo): Ring[] {
  if (!g) return [];
  if (g.type === 'Polygon') return g.coordinates as Ring[];
  if (g.type === 'MultiPolygon') return (g.coordinates as Ring[][]).flat();
  return [];
}

function linesOf(g: Geo): Ring[] {
  if (!g) return [];
  if (g.type === 'LineString') return [g.coordinates as Ring];
  if (g.type === 'MultiLineString') return g.coordinates as Ring[];
  return [];
}

/**
 * One path of many lines. A line that crosses the date line is unwrapped (its longitudes kept continuous past 180)
 * and drawn twice, once on each side, so a country across it is one shape with no wedge back across the map.
 */
function pathOf(lines: Ring[], close: boolean): Path2D {
  const p = new Path2D();
  const trace = (line: Ring, shift: number) => {
    let prev: number | null = null;
    let off = 0;
    line.forEach(([lon, lat], i) => {
      if (prev !== null) {
        if (lon - prev > 180) off -= 360;
        else if (prev - lon > 180) off += 360;
      }
      prev = lon;
      const x = toX(lon + off + shift);
      if (i === 0) p.moveTo(x, toY(lat));
      else p.lineTo(x, toY(lat));
    });
    if (close) p.closePath();
    return off;
  };
  for (const line of lines) {
    let lo = Infinity;
    let hi = -Infinity;
    let prev: number | null = null;
    let off = 0;
    for (const [lon] of line) {
      if (prev !== null) {
        if (lon - prev > 180) off -= 360;
        else if (prev - lon > 180) off += 360;
      }
      prev = lon;
      lo = Math.min(lo, lon + off);
      hi = Math.max(hi, lon + off);
    }
    // A ring round a pole (Antarctica) does not close after unwrapping: it is drawn as it is.
    if (close && Math.abs(off) > 0) {
      let prev2: number | null = null;
      line.forEach(([lon, lat], i) => {
        const jump = prev2 !== null && Math.abs(lon - prev2) > 180;
        if (i === 0 || jump) p.moveTo(toX(lon), toY(lat));
        else p.lineTo(toX(lon), toY(lat));
        prev2 = lon;
      });
      p.closePath();
      continue;
    }
    trace(line, 0);
    // A filled shape across the date line is drawn on the other side too; a line is not, or a whole coast repeats.
    if (close && hi > 180) trace(line, -360);
    if (close && lo < -180) trace(line, 360);
  }
  return p;
}

export interface Atlas {
  land: Path2D;
  borders: Path2D;
  coast: Path2D;
}

let built: Atlas | null = null;

export function atlas(): Atlas {
  if (built) return built;
  const topo = countries as unknown as Topology<{ countries: GeometryCollection }>;
  const fc = feature(topo, topo.objects.countries) as unknown as { features: Array<{ geometry: Geo }> };
  const rings = fc.features.flatMap((f) => ringsOf(f.geometry));
  const inner = mesh(topo, topo.objects.countries, (a, b) => a !== b) as unknown as Geo;
  const outer = mesh(topo, topo.objects.countries, (a, b) => a === b) as unknown as Geo;
  built = { land: pathOf(rings, true), borders: pathOf(linesOf(inner), false), coast: pathOf(linesOf(outer), false) };
  return built;
}
