import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FeaturedFire, Place } from '../app/places';
import { factorAt, factorCanvas, FACTOR_HIGH, FACTOR_LOW, FACTOR_RAMP, FACTOR_STEPS, factorT, useFactor } from './factor';
import { placeLabels } from './labels';
import { cellAt, FIRE_RAMP, GRID, loadedShare, NOT_LOADED, rampAt, tOfValue, useWorldLayer } from './layers';
import { boxAreaKm2, type Box, type Projector } from './projection';
import { EARTH_WORDS as W, monthYear } from './words';
import { rectOf, WorldCanvas, type GridLayer } from './WorldCanvas';
import '../styles/world.css';

/**
 * The Earth for choosing a place anywhere. It reads one thing, the fire cube's world layers (`layers`, the address
 * of their `layers.json` and images), and draws where fire is detected on a flat Earth; a second layer on the same
 * Earth is the factor between the two satellites (`factor`, read only when asked for). On it: the featured fires as
 * marks with short labels, each opening a card of its fires; and a box the visitor draws anywhere, which says its
 * size and how much of it is loaded before it opens that box's record.
 */

export interface ChooseOnEarthProps {
  /** Address of the cube's world layers index (`/api/cube/layers`); each layer's image is beside it. */
  layers: string;
  /** The layer of where fire is detected; the coarse satellite over every month by default. */
  layer?: string;
  /** Address of the harmonize maps' index (`maps.json` or its route); the second layer is offered only with it. */
  factor?: string | null;
  /** The places of the registry; those with featured fires are marked. */
  places: Place[];
  /** The fire on the stage now, marked as selected. */
  currentFire?: string | null;
  /** The box calendar's limits, in degrees on a side. */
  limits?: { min_span_deg: number; max_span_deg: number } | null;
  onFire: (place: Place, fire: FeaturedFire) => void;
  onPlace?: (place: Place) => void;
  onBox: (box: Box) => void;
  /** Open with the box being drawn. */
  startDrawing?: boolean;
  /** Open on the second layer. */
  startOnFactor?: boolean;
  /** Open with this box drawn (the box the visitor drew last, when the screen opens again). */
  startBox?: Box | null;
  /** Open with this place's card open. */
  startOpen?: string | null;
  /** The box first in view; the land a visitor picks on when left out. */
  focus?: Box;
  /**
   * Fires or places the page must not open yet (by fire id or place id), with the words to say, or true for the
   * plain words; joined to any `held` the registry gives.
   */
  held?: Record<string, string | true> | null;
  /** Pixels of the Earth that the screen around it covers on the right (its list): fitted beside, labels kept clear. */
  roomRight?: number;
}

type Mode = 'fire' | 'factor';

const midOf = (b: Box): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const yearOf = (f: FeaturedFire) => f.first_day?.slice(0, 4) ?? null;
const sizeOf = (f: FeaturedFire) => f.size?.modis_pixels_in_box ?? 0;

/** A name as a stranger reads it: an agency's incident code in brackets is left to the fire's card. */
const plainName = (s: string | null) => (s ? s.replace(/\s*\([A-Z]{1,6}\d{3,}\)/g, '') : s);

/**
 * A label's name: the first of several names an agency gives one fire ("Stein Mountain fire, Ponderosa Creek fire
 * and ..."), without a place in brackets ("Gospers Mountain (Wollemi National Park) Fire"); the card keeps it whole.
 */
const firstName = (s: string | null) =>
  s ? (plainName(s) ?? '').split(/, | and /)[0].replace(/\s*\([^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim() : s;

type Raw = Record<string, unknown>;
/** A fire kept as the model's test: its record is shown, it is never hidden and tested again (registry `closed`). */
export const isClosed = (f: FeaturedFire) => (f as unknown as Raw).closed === true;

/**
 * A fire the page must not open yet, with every satellite or revealed: the registry's `held` on the fire or its place,
 * or the mounting screen's own list. Its mark stays, says so, and offers nothing.
 */
export function heldWhy(f: FeaturedFire, p: Place, held: Record<string, string | true> | null): string | true | null {
  const fr = f as unknown as Raw;
  const pr = p as unknown as Raw;
  const own = held?.[f.id] ?? held?.[p.id];
  if (own) return own;
  if (fr.held === true || pr.held === true) return (typeof fr.held_why === 'string' && fr.held_why) || (typeof pr.held_why === 'string' && pr.held_why) || true;
  return null;
}

type Kind = 'open' | 'closed' | 'held';

/**
 * The fire a place is known by and what its mark is: a fire that can be opened, the largest named one first, else the
 * place's own name; a place whose every fire is kept as the test says so; a place whose fires are held says so.
 */
function knownBy(p: Place, held: Record<string, string | true> | null): { text: string; kind: Kind } {
  const short = p.name.split(',')[0];
  const open = p.featured_fires.filter((f) => !isClosed(f) && !heldWhy(f, p, held));
  const named = (xs: FeaturedFire[]) => xs.filter((f) => f.name).sort((a, b) => sizeOf(b) - sizeOf(a));
  if (open.length) {
    const n = named(open);
    return { text: n.length ? W.fireLabel(firstName(n[0].name), short, yearOf(n[0])) : short, kind: 'open' };
  }
  const closed = p.featured_fires.filter(isClosed);
  if (closed.length) {
    const n = named(closed);
    return { text: W.keptLabel(n.length ? W.fireLabel(firstName(n[0].name), short, yearOf(n[0])) : short), kind: 'closed' };
  }
  return { text: W.heldLabel(short), kind: 'held' };
}

function ramp(ramp: Array<[number, [number, number, number]]>): string {
  return `linear-gradient(to right, ${ramp.map(([t, [r, g, b]]) => `rgb(${r | 0} ${g | 0} ${b | 0}) ${(t * 100).toFixed(0)}%`).join(', ')})`;
}

export function ChooseOnEarth({ layers, layer = 'rows_modis', factor = null, places, currentFire = null, limits = null, onFire, onPlace, onBox, startDrawing = false, startOnFactor = false, startBox = null, startOpen = null, focus, held = null, roomRight = 0 }: ChooseOnEarthProps) {
  const world = useWorldLayer(layers, layer);
  const [mode, setMode] = useState<Mode>(startOnFactor && factor ? 'factor' : 'fire');
  // The legend and the tools stand over the map; labels keep clear of them.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const legendRef = useRef<HTMLDivElement | null>(null);
  const toolsRef = useRef<HTMLDivElement | null>(null);
  const [overlays, setOverlays] = useState<Array<{ left: number; top: number; width: number; height: number }>>([]);
  // On a narrow screen the legend lies across the bottom; the Earth is fitted into the room above it.
  const [padBottom, setPadBottom] = useState(0);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const r = root.getBoundingClientRect();
      const lg = legendRef.current?.getBoundingClientRect();
      const pb = lg && r.width < 640 ? Math.round(Math.max(0, r.bottom - lg.top + 8)) : 0;
      setPadBottom((o) => (o === pb ? o : pb));
      setOverlays(
        [legendRef.current, toolsRef.current].flatMap((el) => {
          if (!el) return [];
          const b = el.getBoundingClientRect();
          return [{ left: b.left - r.left, top: b.top - r.top, width: b.width, height: b.height }];
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    if (legendRef.current) ro.observe(legendRef.current);
    if (toolsRef.current) ro.observe(toolsRef.current);
    return () => ro.disconnect();
  }, []);
  const fac = useFactor(factor, mode === 'factor');
  const [drawing, setDrawing] = useState(startDrawing);
  const [box, setBox] = useState<Box | null>(startBox);
  const [open, setOpen] = useState<string | null>(startOpen);
  const [hover, setHover] = useState<{ lon: number; lat: number; x: number; y: number } | null>(null);
  const [overMark, setOverMark] = useState<string | null>(null);

  const featured = useMemo(() => places.filter((p) => p.featured_fires.length > 0), [places]);
  const currentPlace = featured.find((p) => p.featured_fires.some((f) => f.id === currentFire)) ?? null;
  const currentCentre = useMemo<[number, number] | null>(() => (currentPlace ? midOf(currentPlace.box) : null), [currentPlace]);
  const since = world.state === 'ready' ? monthYear(world.layer.meta.first_month ?? '2000-11') : null;

  const grid = useMemo<GridLayer[]>(() => {
    if (world.state !== 'ready') return [];
    const out: GridLayer[] = [{ key: 'loaded', image: world.layer.loaded, onLand: true, crispFromPx: 2 }];
    if (mode === 'fire') out.push({ key: 'fire', image: world.layer.image, halo: true });
    else if (fac.state === 'ready') {
      out.push({ key: 'factor', image: factorCanvas(fac.map, (t) => rampAt(FACTOR_RAMP, t)), crispFromPx: 1 });
    }
    return out;
  }, [world, mode, fac]);

  const keys = useCallback(
    (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'b' || e.key === 'B') {
        setDrawing((d) => !d);
        setOpen(null);
      } else if (e.key === 'Escape') {
        if (drawing) setDrawing(false);
        else if (open) setOpen(null);
        else if (box) setBox(null);
        else return;
      } else if (e.key === 'l' || e.key === 'L') {
        if (!factor) return;
        setMode((m) => (m === 'fire' ? 'factor' : 'fire'));
      } else if (e.key === 'Enter' && box && !fit(box) && !t?.closest('button, a')) {
        onBox(box);
      } else return;
      // A key the Earth used is not seen by the screen around it; an Escape it did not use goes on (to close).
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawing, open, box, factor, onBox],
  );
  // Taken in the capture phase, so the Earth hears its keys before a screen that mounts it and listens the same way.
  useEffect(() => {
    window.addEventListener('keydown', keys, true);
    return () => window.removeEventListener('keydown', keys, true);
  }, [keys]);

  const fit = (b: Box) => {
    const lat = b[3] - b[1];
    const lon = b[2] - b[0];
    if (limits && (lat > limits.max_span_deg || lon > limits.max_span_deg)) return W.tooLarge(limits.max_span_deg);
    if (limits && (lat < limits.min_span_deg || lon < limits.min_span_deg)) return W.tooSmall(limits.min_span_deg);
    return null;
  };

  const readout = (): string[] | null => {
    if (!hover || drawing || overMark || world.state !== 'ready') return null;
    if (mode === 'factor') {
      if (fac.state !== 'ready') return null;
      const c = factorAt(fac.map, hover.lon, hover.lat);
      const cell = cellAt(hover.lon, hover.lat);
      if (!cell || world.layer.values[cell.row * GRID.cols + cell.col] === NOT_LOADED) return null;
      if (!c) return [W.atNoFactor];
      return [W.atFactor(c.factor, c.end), ...(c.error !== null ? [W.atFactorError(c.error, c.errorEnd)] : [])];
    }
    const cell = cellAt(hover.lon, hover.lat);
    if (!cell) return null;
    const v = world.layer.values[cell.row * GRID.cols + cell.col];
    if (v === NOT_LOADED) return null;
    return [v > 0 ? W.atCell(v, since) : W.atEmpty(since)];
  };
  const lines = readout();

  const marks = (p: Projector) => {
    const items = featured.map((pl) => {
      const [lon, lat] = midOf(pl.box);
      const [x, y] = p.at(lon, lat);
      const k = knownBy(pl, held);
      const current = pl.featured_fires.some((f) => f.id === currentFire);
      return { id: pl.id, x, y, text: k.text, kind: k.kind, sub: null, rank: current ? -1 : -Math.max(...pl.featured_fires.map(sizeOf)), place: pl, current };
    });
    const onScreen = items.filter((m) => m.x > -20 && m.y > -20 && m.x < p.w + 20 && m.y < p.h + 20);
    const at = open ? cardAt(p) : null;
    const covered = roomRight > 0 ? [{ left: p.w - roomRight, top: 0, width: roomRight, height: p.h }] : [];
    const placed = placeLabels(onScreen, p.w, p.h, { avoid: [...(at ? [at.rect] : []), ...overlays, ...covered] });
    return (
      <>
        <svg className="world-leaders" width={p.w} height={p.h} aria-hidden="true">
          {placed.map((l) =>
            l.shown || overMark === l.id ? <line key={l.id} x1={l.from[0]} y1={l.from[1]} x2={l.to[0]} y2={l.to[1]} /> : null,
          )}
        </svg>
        {onScreen.map((m, i) => {
          const l = placed[i];
          const show = l.shown || overMark === m.id || open === m.id;
          return (
            <div key={m.id}>
              <button
                type="button"
                data-world-ui
                className="world-mark sys-sel"
                data-kind={m.kind}
                data-selected={m.current || open === m.id ? 'true' : 'false'}
                data-small="true"
                style={{ left: m.x, top: m.y }}
                aria-label={`${m.text}, ${m.place.name}`}
                aria-expanded={open === m.id}
                onClick={() => setOpen((o) => (o === m.id ? null : m.id))}
                onPointerEnter={() => setOverMark(m.id)}
                onPointerLeave={() => setOverMark(null)}
                onFocus={() => setOverMark(m.id)}
                onBlur={() => setOverMark(null)}
              />
              {show && open !== m.id && (
                <div className="world-label" style={{ left: l.left, top: l.top }} aria-hidden="true">
                  {m.text}
                </div>
              )}
            </div>
          );
        })}
        {open && card(p)}
      </>
    );
  };

  /** Where the open card stands: beside its mark, on the side with room, kept inside the map. */
  const cardAt = (p: Projector) => {
    const pl = featured.find((x) => x.id === open);
    if (!pl) return null;
    const [lon, lat] = midOf(pl.box);
    const [x, y] = p.at(lon, lat);
    const right = x < p.w * 0.62;
    const height = 70 + pl.featured_fires.length * 54;
    const top = Math.max(12, Math.min(y - 24, p.h - height - 12));
    const left = right ? x + 22 : x - 22 - 300;
    return { pl, rect: { left, top, width: 300, height } };
  };

  const card = (p: Projector) => {
    const at = cardAt(p);
    if (!at) return null;
    const { pl } = at;
    const fires = [...pl.featured_fires].sort((a, b) => (b.first_day ?? '').localeCompare(a.first_day ?? ''));
    const keptN = places.reduce((n, x) => n + x.featured_fires.filter(isClosed).length, 0);
    const allHeld = fires.every((f) => heldWhy(f, pl, held));
    return (
      <div data-world-ui className="world-card sys-plate" style={{ left: at.rect.left, top: at.rect.top }}>
        <div className="world-card__title">{pl.name}</div>
        <div className="world-card__acts">
          {fires.map((f) => {
            const why = heldWhy(f, pl, held);
            if (why)
              return (
                <div key={f.id} className="world-card__fire">
                  <span>{f.label}</span>
                  <span className="world-act__sub">{why === true ? W.heldLine : why}</span>
                </div>
              );
            if (isClosed(f))
              return (
                <div key={f.id} className="world-card__fire">
                  <span>{f.label}{f.name ? `, ${firstName(f.name)}` : ''}</span>
                  <span className="world-act__sub">{W.keptLine(keptN)}</span>
                </div>
              );
            return (
              <button key={f.id} type="button" className="world-act world-act--stack" data-current={f.id === currentFire} onClick={() => onFire(pl, f)}>
                <span>{W.showFire(f.label)}</span>
                {f.name && <span className="world-act__sub">{plainName(f.name)}</span>}
              </button>
            );
          })}
          {onPlace && !allHeld && (
            <button type="button" className="world-act world-act--quiet" onClick={() => onPlace(pl)}>
              {W.readPlace}
            </button>
          )}
        </div>
      </div>
    );
  };

  const boxed = (p: Projector) => {
    if (!box) return null;
    const r = rectOf(p, box);
    if (open) return <div className="world-box" style={r} />;
    const why = fit(box);
    const share = world.state === 'ready' ? loadedShare(world.layer, box) : null;
    const below = r.top < 120;
    return (
      <>
        <div className="world-box" style={r} />
        <div data-world-ui className="world-boxlabel sys-plate" style={below ? { left: r.left, top: r.top + r.height + 10 } : { left: r.left, top: r.top - 10, transform: 'translateY(-100%)' }}>
          <div className="world-boxlabel__line">{W.boxSize(box[3] - box[1], box[2] - box[0], boxAreaKm2(box))}</div>
          {share && share.cells > 0 && <div className="world-boxlabel__sub">{W.boxLoaded(share.loaded, share.cells)}</div>}
          {why ? (
            <div className="world-boxlabel__why">{why}</div>
          ) : (
            <button type="button" className="world-act world-act--next" onClick={() => onBox(box)}>
              <span>{W.readBox}</span>
              <kbd>Enter</kbd>
            </button>
          )}
          <button type="button" className="world-act world-act--quiet" onClick={() => { setBox(null); setDrawing(true); }}>
            {W.again}
          </button>
        </div>
      </>
    );
  };

  const legend = () => {
    if (world.state === 'loading') return <div className="world-legend__line">{W.loading}</div>;
    if (world.state === 'failed') return <div className="world-legend__line">{W.failed}</div>;
    const idx = world.index;
    const complete = idx.world_complete === true;
    if (mode === 'factor') {
      if (fac.state === 'loading' || fac.state === 'idle') return <div className="world-legend__line">{W.factorLoading}</div>;
      if (fac.state === 'failed') return <div className="world-legend__line">{W.factorFailed}</div>;
      const m = fac.map;
      return (
        <>
          <div className="world-legend__line">{W.factorLegend(m.placeDeg)}</div>
          <div className="world-ramp" style={{ background: ramp(FACTOR_RAMP) }} />
          <div className="world-ticks">
            {FACTOR_STEPS.map((f) => (
              <span key={f} style={{ left: `${factorT(f) * 100}%` }} data-end={factorT(f) > 0.9 ? 'true' : 'false'}>
                {W.factorTick(f, FACTOR_LOW, FACTOR_HIGH)}
              </span>
            ))}
          </div>
          {m.median !== null && m.p10 !== null && m.p90 !== null && <div className="world-legend__fine">{W.factorSpread(m.median, m.p10, m.p90)}</div>}
          <div className="world-legend__fine">{W.factorUnmeasured}</div>
        </>
      );
    }
    const max = world.layer.meta.max;
    // Powers of ten on the log scale, none closer than a sixth of the ramp to the one before, so none touch.
    const ticks = [1, 10, 100, 1000, 10000, 100000]
      .filter((v) => v <= max)
      .filter((v, i, xs) => i === 0 || tOfValue(v, max) - tOfValue(xs[i - 1], max) >= 1 / 6 || xs.length <= 4);
    return (
      <>
        <div className="world-legend__line">
          <span className="world-legend__long">{W.fireLegend(since)}</span>
          <span className="world-legend__short">{W.fireLegendShort(since)}</span>
        </div>
        <div className="world-ramp" style={{ background: ramp(FIRE_RAMP) }} />
        <div className="world-ticks">
          {ticks.map((v) => (
            <span key={v} style={{ left: `${tOfValue(v, max) * 100}%` }} data-end={tOfValue(v, max) > 0.9 ? 'true' : 'false'}>
              {W.tick(v)}
            </span>
          ))}
        </div>
        <div className="world-legend__fine">
          <span className="world-swatch world-swatch--hatch" aria-hidden="true" />
          <span>
            <span className="world-legend__long">{W.hatch(complete, since, idx.countries_loaded)}</span>
            <span className="world-legend__short">{W.hatchShort(complete)}</span> <span className="world-legend__more">{W.halo}</span>
          </span>
        </div>
      </>
    );
  };

  return (
    <div className="world-earth" ref={rootRef}>
      <WorldCanvas
        label={W.label}
        layers={grid}
        focus={focus}
        padBottom={padBottom}
        padRight={roomRight}
        centre={currentCentre}
        hatchLand
        drawing={drawing}
        onBox={(b) => {
          setBox(b);
          setDrawing(false);
          setOpen(null);
        }}
        onHover={setHover}
        onClickMap={() => setOpen(null)}
      >
        {(p) => (
          <>
            {boxed(p)}
            {!drawing && marks(p)}
            {lines && hover && (
              <div className="world-readout sys-plate" style={{ left: Math.min(hover.x + 16, p.w - 300), top: hover.y + 18 }} aria-live="polite">
                {lines.map((s) => (
                  <div key={s}>{s}</div>
                ))}
              </div>
            )}
          </>
        )}
      </WorldCanvas>
      <div className="world-earth__tools" data-world-ui ref={toolsRef}>
        {drawing ? (
          <>
            <span className="world-hint">{W.drawing}</span>
            <button type="button" className="world-act" onClick={() => setDrawing(false)}>
              <kbd>Esc</kbd>
              <span>{W.cancel}</span>
            </button>
          </>
        ) : (
          <button type="button" className="world-act" onClick={() => { setDrawing(true); setOpen(null); }}>
            <kbd>B</kbd>
            <span>{W.draw}</span>
          </button>
        )}
      </div>
      <div className="world-legend" data-world-ui ref={legendRef} tabIndex={0}>
        {factor && (
          <div className="world-legend__choice iso-choice" role="radiogroup">
            <button type="button" role="radio" aria-checked={mode === 'fire'} className="iso-choice__opt" data-active={mode === 'fire'} onClick={() => setMode('fire')}>
              {W.layerFire}
            </button>
            <button type="button" role="radio" aria-checked={mode === 'factor'} className="iso-choice__opt" data-active={mode === 'factor'} onClick={() => setMode('factor')}>
              {W.layerFactor}
              <kbd className="world-legend__key">L</kbd>
            </button>
          </div>
        )}
        {legend()}
      </div>
    </div>
  );
}
