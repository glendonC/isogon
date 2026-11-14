import { useEffect, useRef, useState } from 'react';
import type { TheaterId } from '../stage/earthCutawayTypes';
import { THEATER_DISPLAY } from '../content/theaters';
import { IsogonMark } from './IsogonMark';
import { SplitHeadline } from './SplitHeadline';
import type { PartId, PartStatus } from '../content/partsStatus';
import type { EarthStageTelemetry } from '../stage/earthCutawayTypes';

/**
 * The landing's copy: the headline, the second line and one entry that names the first application.
 */
const HEADLINE = ['Turn real-world observations', 'into testable worlds.'] as const;
const SENTENCE =
  'Scientific world models that reconstruct physical systems from imperfect measurements, predict what other instruments will see, and learn what to investigate next.';

/** The faces the landing draws with. Text renders once these are loaded, so nothing re-flows. */
const LANDING_FACES = ['300 52px Geist', '400 17px Geist', '500 14px Geist', '400 11px "IBM Plex Mono"'];

function facesLoaded(): boolean {
  if (typeof document === 'undefined' || !document.fonts) return true;
  return LANDING_FACES.every((f) => document.fonts.check(f));
}

const PLATFORM_NAMES: Record<string, string> = {
  VIIRS_SNPP: 'Suomi NPP VIIRS',
  VIIRS_NOAA20: 'NOAA-20 VIIRS',
  VIIRS_NOAA21: 'NOAA-21 VIIRS',
  MODIS_TERRA: 'Terra MODIS',
  MODIS_AQUA: 'Aqua MODIS',
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The picture's facts line: the NASA satellite, the date and the count of detections, from telemetry.realPass. */
function passFacts(p: NonNullable<EarthStageTelemetry['realPass']>): string {
  const d = new Date(p.timeUtc);
  const date = Number.isNaN(d.getTime()) ? p.timeUtc : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const sat = PLATFORM_NAMES[p.sensor] ?? p.sensor.replace(/_/g, ' ');
  return `NASA ${sat}, ${date}, ${p.isDay ? 'day' : 'night'} pass: ${p.detections.toLocaleString('en-US')} detections`;
}

export interface CustomRegionSummary {
  name: string;
  lat: number;
  lon: number;
}

interface LandingCompositionProps {
  activeTheaterId: TheaterId;
  /** Imagery credit from the active run (ui/attribution.ts). */
  imageryCredit: string;
  customRegion: CustomRegionSummary | null;
  /** The year of the real run on the landing, from the run's own window; null when no real run is in. */
  runYear: string | null;
  /** The three parts under the hero, their status read from the evidence data. */
  parts: PartStatus[];
  onOpenPart: (id: PartId) => void;
  /** The pass the picture shows, for the facts line (stage telemetry). */
  realPass: EarthStageTelemetry['realPass'] | null;
  onOpenSearch: () => void;
  onOpenSensor: () => void;
  onOpenMethod: () => void;
  onEnter: () => void;
}

export function LandingComposition({
  activeTheaterId,
  imageryCredit,
  customRegion,
  runYear,
  parts,
  onOpenPart,
  realPass,
  onOpenSearch,
  onOpenSensor,
  onOpenMethod,
  onEnter,
}: LandingCompositionProps) {
  const [ready, setReady] = useState(facesLoaded);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (ready) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setReady(true);
    };
    // Never hold the page longer than 2.5 s for fonts; fall back to whatever has loaded.
    const timer = window.setTimeout(finish, 2500);
    Promise.all(LANDING_FACES.map((f) => document.fonts.load(f)))
      .catch(() => undefined)
      .then(finish);
    return () => window.clearTimeout(timer);
  }, [ready]);

  const placeName = customRegion ? customRegion.name : THEATER_DISPLAY[activeTheaterId].name;
  // The entry names the first application: the region's fire and the year of its real run ("the 2021 Dixie Fire").
  const fire = customRegion ? undefined : THEATER_DISPLAY[activeTheaterId].fire;
  const entry = fire && runYear ? `Explore the ${runYear} ${fire}` : `Explore ${placeName}`;

  return (
    <div className="iso-land" data-ready={ready ? 'true' : 'false'} ref={scrollRef}>
      {/* The picture under the first screen: a click on it enters the workspace. Keyboard: Enter. */}
      <div className="iso-land__picture" aria-hidden="true" onClick={onEnter} />
      <div className="iso-land__scrim" aria-hidden="true" />
      <div className="iso-land__scrim iso-land__scrim--bottom" aria-hidden="true" />
      {ready && (
        <>
          <div className="iso-land__brand">
            <IsogonMark />
            <span>Isogon</span>
          </div>

          <nav className="iso-land__menu" aria-label="Search and reference" data-landing-ui="true">
            <button type="button" className="iso-navlink" onClick={onOpenSearch}>
              Search <kbd>/</kbd>
            </button>
            <button type="button" className="iso-navlink" onClick={onOpenSensor}>
              Sensor physics
            </button>
            <button type="button" className="iso-navlink" onClick={onOpenMethod}>
              Method
            </button>
          </nav>

          <div className="iso-land__hero">
            <SplitHeadline lines={HEADLINE} className="iso-land__headline" play={ready} />
            <p className="iso-land__sentence">{SENTENCE}</p>
            <button type="button" className="iso-entry" onClick={onEnter} data-landing-ui="true">
              <span className="iso-entry__label">{entry}</span>
              <kbd>Enter</kbd>
            </button>
          </div>

          <div className="iso-land__legend">
            <div className="iso-land__keys" aria-label="What the picture shows">
              <span className="iso-land__legend-item iso-land__legend-item--detection">Satellite detection</span>
              <span className="iso-land__legend-item iso-land__legend-item--estimate">Model estimate</span>
            </div>
            {realPass && <p className="iso-land__facts">{passFacts(realPass)}</p>}
          </div>

          <p className="iso-land__credit">Imagery: {imageryCredit}</p>

          {/* The one hint that there is more below: the first application, a click or a scroll away. */}
          <button
            type="button"
            className="iso-land__more"
            onClick={() => {
              const el = scrollRef.current;
              const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
              el?.scrollTo({ top: el.clientHeight, behavior: reduce ? 'auto' : 'smooth' });
            }}
          >
            <span>The first application</span>
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2 3.5 5 6.5 8 3.5" />
            </svg>
          </button>

          <section className="iso-land__parts" aria-labelledby="iso-land-parts-title" data-landing-ui="true">
            <p id="iso-land-parts-title" className="iso-land__first">
              First application: wildfire, across 26 years of NASA satellite observations.
            </p>
            <ol className="iso-land__partlist">
              {parts.map((p, i) => (
                <li key={p.id} className="iso-land__part">
                  <span className="iso-land__partnum" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h2 className="iso-land__partname">{p.name}</h2>
                  <p className="iso-land__partdoes">{p.does}</p>
                  {p.status && <p className="iso-land__partstatus">{p.status}</p>}
                  <button type="button" className="iso-land__partopen" onClick={() => onOpenPart(p.id)}>
                    {p.open}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
