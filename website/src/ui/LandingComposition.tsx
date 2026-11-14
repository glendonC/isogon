import { useEffect, useRef } from 'react';
import type { TheaterId } from '../stage/earthCutawayTypes';
import { THEATER_DISPLAY, THEATER_ORDER, formatLat, formatLon } from '../content/theaters';
import { curtainSeam } from './curtainSeam';
import { IsogonMark } from './IsogonMark';
import { SplitHeadline } from './SplitHeadline';

export const IMAGERY_ATTRIBUTION = 'Imagery: Esri, Maxar, Earthstar Geographics';

const HEADLINE = ['One calibrated', 'fire record.'] as const;

export interface CustomRegionSummary {
  name: string;
  lat: number;
  lon: number;
}

interface LandingCompositionProps {
  activeTheaterId: TheaterId;
  customRegion: CustomRegionSummary | null;
  onSelectTheater: (id: TheaterId) => void;
  onOpenSearch: () => void;
  onOpenSensor: () => void;
  onOpenMethod: () => void;
  onEnter: () => void;
}

/**
 * The landing page as one composition over the full-bleed stage: a monumental headline in the sky band,
 * split where the sensor curtain splits, and spare text triggers anchored to the four viewport edges.
 * Every interactive element carries data-landing-ui so the curtain stops following the cursor over text.
 */
export function LandingComposition({
  activeTheaterId,
  customRegion,
  onSelectTheater,
  onOpenSearch,
  onOpenSensor,
  onOpenMethod,
  onEnter,
}: LandingCompositionProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const detach = curtainSeam.attach(el);
    // The rule only means something where it splits the headline; past its ends it fades out.
    let span = { left: 0, right: 0 };
    const measure = () => {
      const fine = el.querySelector('.iso-split__fine');
      if (!fine) return;
      const r = fine.getBoundingClientRect();
      span = { left: r.left, right: r.right };
    };
    measure();
    const ro = new ResizeObserver(measure);
    const fine = el.querySelector('.iso-split__fine');
    if (fine) ro.observe(fine);
    window.addEventListener('resize', measure);
    void document.fonts.ready.then(measure);
    let state = '';
    const unsubscribe = curtainSeam.subscribe((x) => {
      const next = x > span.left - 8 && x < span.right + 8 ? 'type' : 'scene';
      if (next !== state) {
        state = next;
        el.dataset.seamOver = next;
      }
    });
    return () => {
      unsubscribe();
      ro.disconnect();
      window.removeEventListener('resize', measure);
      detach();
    };
  }, []);

  return (
    <div ref={rootRef} className="iso-land" data-seam-modis="left">
      <div className="iso-land__scrim iso-land__scrim--top" aria-hidden="true" />
      <div className="iso-land__scrim iso-land__scrim--bottom" aria-hidden="true" />

      <div className="iso-land__brand">
        <IsogonMark />
        <span>Isogon</span>
      </div>

      <nav className="iso-land__menu" aria-label="Search and reference" data-landing-ui="true">
        <button type="button" className="iso-trig" onClick={onOpenSearch}>
          <span className="iso-trig__label">Search a place</span>
          <kbd className="iso-trig__key">/</kbd>
        </button>
        <button type="button" className="iso-trig" onClick={onOpenSensor}>
          <span className="iso-trig__label">Sensor physics</span>
          <kbd className="iso-trig__key">M</kbd>
        </button>
        <button type="button" className="iso-trig" onClick={onOpenMethod}>
          <span className="iso-trig__label">Method</span>
          <kbd className="iso-trig__key" aria-hidden="true" />
        </button>
      </nav>

      <SplitHeadline lines={HEADLINE} className="iso-land__headline" />

      <div className="iso-seam" aria-hidden="true">
        <span className="iso-seam__rule" />
        <span className="iso-seam__label iso-seam__label--modis">
          <span>1 km MODIS</span>
          <span>as observed</span>
        </span>
        <span className="iso-seam__label iso-seam__label--fused">
          <span>375 m record</span>
          <span>harmonized</span>
        </span>
      </div>

      <div className="iso-land__lede">
        <p>
          MODIS sees a fire in 1 km pixels. VIIRS sees the same fire in 375 m pixels. Isogon calibrates
          the two into one record and lays it on real terrain.
        </p>
        <p className="iso-land__hint">Move across the terrain to sweep the curtain.</p>
      </div>

      <div className="iso-land__regions" role="group" aria-label="Calibrated regions" data-landing-ui="true">
        {customRegion && (
          <div className="iso-region" data-active="true" aria-current="true">
            <span className="iso-region__name">{customRegion.name}</span>
            <span className="iso-region__area" />
            <span className="iso-region__coord">{formatLat(customRegion.lat)}</span>
            <span className="iso-region__coord">{formatLon(customRegion.lon)}</span>
          </div>
        )}
        {THEATER_ORDER.map((id) => {
          const t = THEATER_DISPLAY[id];
          const active = !customRegion && id === activeTheaterId;
          return (
            <button
              key={id}
              type="button"
              className="iso-region"
              data-active={active ? 'true' : 'false'}
              aria-pressed={active}
              onClick={() => onSelectTheater(id)}
            >
              <span className="iso-region__name">{t.name}</span>
              <span className="iso-region__area">{t.area}</span>
              <span className="iso-region__coord">{t.lat}</span>
              <span className="iso-region__coord">{t.lon}</span>
            </button>
          );
        })}
      </div>

      <button type="button" className="iso-enter" onClick={onEnter} data-landing-ui="true">
        <span className="iso-enter__rule" aria-hidden="true" />
        <span className="iso-enter__label">
          <span className="iso-enter__roll">
            <span>Enter the terrain</span>
            <span aria-hidden="true">Enter the terrain</span>
          </span>
        </span>
        <kbd className="iso-enter__key">Enter</kbd>
      </button>

      <p className="iso-land__credit iso-land__credit--imagery">{IMAGERY_ATTRIBUTION}</p>
      <p className="iso-land__credit iso-land__credit--event">NASA Space Apps 2026</p>
    </div>
  );
}
