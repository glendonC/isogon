import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ENTRY } from '../app/names';
import { SoundControl } from '../audio';
import { IsogonMark } from './IsogonMark';
import { SplitHeadline } from './SplitHeadline';
import type { PartId, PartStatus } from '../content/partsStatus';
import type { EarthStageTelemetry } from '../stage/earthCutawayTypes';

const LandingBelow = lazy(() =>
  import('./LandingBelow').then((m) => ({ default: m.LandingBelow })),
);

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
  /** Imagery credit from the active run (ui/attribution.ts). */
  imageryCredit: string;
  /** The three parts under the hero, their status read from the evidence data. */
  parts: PartStatus[];
  onOpenPart: (id: PartId) => void;
  /** The pass the picture shows, for the facts line (stage telemetry). */
  realPass: EarthStageTelemetry['realPass'] | null;
  /** The script's words for the fire on show (its start step), in plain words before any satellite's name. */
  lines?: string[];
  /** The pass on show is hidden from the model: the legend shows the white frame of its estimate, not a light. */
  passHidden?: boolean;
  onOpenSearch: () => void;
  onOpenSensor: () => void;
  onOpenMethod: () => void;
  onEnter: () => void;
}

export function LandingComposition({
  imageryCredit,
  parts,
  onOpenPart,
  realPass,
  lines,
  passHidden = false,
  onOpenSearch,
  onOpenSensor,
  onOpenMethod,
  onEnter,
}: LandingCompositionProps) {
  const [ready, setReady] = useState(facesLoaded);
  const [showBelow, setShowBelow] = useState(false);
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

  useEffect(() => {
    if (!ready || showBelow) return;
    const el = scrollRef.current;
    const reveal = () => setShowBelow(true);
    el?.addEventListener('scroll', reveal, { passive: true, once: true });
    const timer = window.setTimeout(reveal, 250);
    return () => {
      el?.removeEventListener('scroll', reveal);
      window.clearTimeout(timer);
    };
  }, [ready, showBelow]);

  // The entry leads with the idea, not one fire: it opens the choice of a place.
  const entry = ENTRY;

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

          <nav className="iso-land__menu" aria-label="Sound, search and reference" data-landing-ui="true">
            <SoundControl />
            <button type="button" className="iso-navlink" onClick={onOpenSearch}>
              <kbd>/</kbd>
              <span>Search</span>
            </button>
            <button type="button" className="iso-navlink iso-navlink--sensor" onClick={onOpenSensor}>
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
              <kbd className="iso-entry__key">Enter</kbd>
              <span className="iso-entry__label">{entry}</span>
              <svg className="iso-entry__arrow" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2 6h7.5M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="square" />
              </svg>
            </button>
          </div>

          <div className="iso-land__legend">
            <div className="iso-land__keys" aria-label="What the picture shows">
              {/* What the pass on show draws: lights on a pass the model was given, white frames on a hidden one. */}
              {passHidden ? (
                <span className="iso-land__legend-item iso-land__legend-item--frame">Model estimate, sharp satellite hidden</span>
              ) : (
                <span className="iso-land__legend-item iso-land__legend-item--detection">Satellite detection</span>
              )}
            </div>
            {lines && lines.length > 0 ? (
              <p className="iso-land__facts">{lines.join(' ')}</p>
            ) : (
              realPass && <p className="iso-land__facts">{passFacts(realPass)}</p>
            )}
          </div>

          <p className="iso-land__credit">Imagery: {imageryCredit}</p>

          {/* The one hint that there is more below: the first application, a click or a scroll away. */}
          <button
            type="button"
            className="iso-land__more"
            onClick={() => {
              setShowBelow(true);
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

          {showBelow ? (
            <Suspense fallback={<div style={{ minHeight: '100dvh' }} aria-hidden="true" />}>
              <LandingBelow
                parts={parts}
                onOpenPart={onOpenPart}
                onOpenMethod={onOpenMethod}
                onOpenSensor={onOpenSensor}
                onEnter={onEnter}
              />
            </Suspense>
          ) : (
            <div style={{ minHeight: '100dvh' }} aria-hidden="true" />
          )}
        </>
      )}
    </div>
  );
}
