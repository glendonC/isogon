/**
 * A window onto NASA's Blue Marble (equirectangular, public domain, served from
 * /generated/terrain/earth_day.jpg) centred on a place, with a reticle. Moving between places pans the
 * image, so choosing a region reads as travelling across the planet.
 *
 * The window is a CSS size container; positions are in container units so it scales with its box.
 */

const SPAN_LON = 34; // degrees of longitude across the window
const K = 360 / SPAN_LON; // image width in window widths

interface LocatorProps {
  lat: number | null;
  lon: number | null;
  /** Short caption under the reticle, for example "40.05° N  121.18° W". */
  caption?: string;
}

export function Locator({ lat, lon, caption }: LocatorProps) {
  const known = lat !== null && lon !== null;
  const fx = known ? (lon + 180) / 360 : 0.5;
  const fy = known ? (90 - lat) / 180 : 0.42;
  return (
    <div className="iso-locator" data-known={known ? 'true' : 'false'} aria-hidden="true">
      <div
        className="iso-locator__map"
        style={{
          backgroundSize: `${(K * 100).toFixed(2)}cqw auto`,
          backgroundPosition: `calc(50cqw - ${(fx * K * 100).toFixed(3)}cqw) calc(50cqh - ${(
            fy *
            K *
            50
          ).toFixed(3)}cqw)`,
        }}
      />
      <span className="iso-locator__h" />
      <span className="iso-locator__v" />
      <span className="iso-locator__mark" />
      {caption && <span className="iso-locator__caption">{caption}</span>}
      <span className="iso-locator__credit">Blue Marble, NASA</span>
    </div>
  );
}
