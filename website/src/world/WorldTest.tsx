import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { count } from '../guide/formats';
import { listAnd, percent1 } from './words';
import { countryAt } from './countryAt';
import { parseFresh, type FreshLook } from './freshTest';
import { OverlapBars } from '../dataviz/OverlapBars';
import { overlapFromEvidence } from '../dataviz/overlapRows';
import '../dataviz/dataviz.css';
import { useRead } from './read';
import { inFilm, useGuideRoom, WorldCaption } from './WorldCaption';
import { useWorldLayer } from './layers';
import { WorldCanvas, type GridLayer } from './WorldCanvas';
import '../styles/world.css';

/**
 * The test across the world: one mark per tested fire, where it burned, a square filled from the bottom by the share
 * of its scores on which the estimate beat both simple methods, so a fire it lost on is an empty square the same size
 * and ink as a full one. Beside the Earth, the fires grouped as the protocol groups them, by continent or by zone:
 * each group's fires as a row of the same squares from fewest scores won to most, and its scores judged with an
 * interval (ahead, tied, behind). Pointing at a group picks out its fires on the Earth; a fire's own figures open at
 * its mark. Under it, the three fires of 2021 kept as the test, as recorded. It reads one answer, the evidence route.
 */

export const TEST_WORDS = {
  label: 'The Earth, with every fire the estimate was tested on across the world',
  loading: 'Loading the test across the world.',
  failed: 'The test across the world did not load.',
  noLook: 'No look of the test across the world has been taken yet. Its plan of fires is written before any score.',
  // The product lane's words (WORDS-wider.json version 14, world_pictures): the objective, the film's captions and the
  // names of the two looks, shown in place of the served ones.
  objective: 'See how the estimate did on new fires',
  // Words version 16: the overlap with VIIRS fire pixels, exact, as plain percentages.
  filmA: (first: string, modis: string) => `Unseen fires, overlap with VIIRS: model ${first}%, MODIS ${modis}%.`,
  filmB: (second: string, modis: string, first: string) => `New fires, overlap with VIIRS: new model ${second}%, MODIS ${modis}%, first model ${first}%.`,
  /** The overlap's three rows (words version 16, the panel's rows). */
  overlapRows: { modis: 'MODIS alone', in_use: 'First model', new: 'New model' },
  lookNames: { test_a: 'Earlier test', test_b: 'Latest test, picked by a fixed rule before any result was seen' } as Record<string, string>,
  // The panel in the product lane's words (WORDS-wider.json version 6, world_pictures, test_across_world.panel; WORDS-2).
  title: (fires: number, groups: number) =>
    `${count(fires)} fires on ${count(groups)} continents, picked by a fixed rule before any result was seen. Each square on the map is one fire.`,
  held: (stated: number, held: number, passes: number) =>
    `The model also estimates how much heat the fire gives off each time VIIRS flies over, with a range. VIIRS's measure fell inside that range on ${Math.round(held * 100)} percent of ${count(passes)} passes, ${
      Math.round(held * 100) < Math.round(stated * 100) ? `short of the ${Math.round(stated * 100)} percent it aims for` : 'as it aims for'
    }.`,
  byContinent: 'By continent',
  byZone: 'By band of latitude',
  zoneNote: 'The bands are cut by latitude alone, with no map of what grows there.',
  emptyGroup: 'No fire of this test, so it says nothing here.',
  all: 'Every fire',
  fires: (n: number | null) => (n === null ? '' : n === 1 ? '1 fire' : `${count(n)} fires`),
  classes: (a: number, t: number, b: number) => `${a} won, ${t} tied, ${b} lost`,
  head: 'Fires, from fewest scores won to most',
  headAhead: 'Won',
  headTied: 'Tied',
  headBehind: 'Lost',
  classesKey: (judged: number) =>
    `A square is filled by how many of the ${judged} scores the estimate won on that fire: full is all, empty is none. Beside each group, its ${judged} scores: won or lost only where the gap is too large to be luck, tied where it is not.`,
  notScored: (n: number) => (n === 1 ? 'One fire of the plan could not be scored; the reason is in the record.' : `${n} fires of the plan could not be scored; the reasons are in the record.`),
  kept: (xs: string[]) => `The three fires of the original test stay as recorded and are never scored again: ${listAnd(xs)}.`,
  keptFire: (name: string, a: number, of: number) => `${a} of ${of} scores won on ${name}`,
  ahead: (a: number, of: number) => `Won ${a} of ${of} scores against both simple guesses`,
  fireLine: (year: string | null, continent: string | null, _won: number, _of: number, passes: number | null) =>
    `A fire of ${year ?? 'the test'}${continent ? ` in ${continent}` : ''}${passes !== null ? `, over ${passes} hidden passes` : ''}.`,
  zones: { tropical: 'Tropics', subtropical: 'Subtropics', temperate: 'Middle latitudes', boreal: 'High latitudes' } as Record<string, string>,
};

// The land where fires are tested, without the poles: the Earth is drawn larger and Antarctica stays out of the view.
const TEST_VIEW: [number, number, number, number] = [-170, -48, 180, 76];
const centre = (b: [number, number, number, number]): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const fill = (a: number, of: number): React.CSSProperties => ({ ['--fill' as string]: `${of > 0 ? (a / of) * 100 : 0}%` });


/** What a host's guide drives: "Show a fire's scores" opens the next fire's card. */
export interface WorldTestControl {
  nextFire: () => void;
}

/**
 * `caption` (on by default) gives the picture its own caption where the page's objective stands, the objective on the
 * page and the film's caption in the film presentation, and keeps the room of the guide clear at the bottom
 * (`--world-guide-room`). The host of the pictures of the world draws the caption where the page's objective stands
 * and passes `caption={false}` with `keepGuideRoom`, so the picture keeps clear of the host's guide.
 */
export function WorldTest({ source, control, caption = true, keepGuideRoom, onReady }: {
  source: string;
  control?: MutableRefObject<WorldTestControl | null>;
  caption?: boolean;
  keepGuideRoom?: boolean;
  /** Told when the picture is whole: the answer read and, in the film, the Earth's fire in (or failed, or 15 s). */
  onReady?: (ready: boolean) => void;
}) {
  const read = useRead<unknown>(source);
  const ans = useMemo(() => (read.state === 'ready' ? parseFresh(read.value) : null), [read]);
  const [lookId, setLookId] = useState<'test_a' | 'test_b' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  // The panel stands beside the Earth on a wide screen and under it on a narrow one; the Earth fits the room left.
  const [room, setRoom] = useState({ left: 0, bottom: 0, stacked: false });
  const film = useMemo(inFilm, []);
  const [capBottom, setCapBottom] = useState(0);
  const [guideRoom, setGuideRoom] = useState(0);
  const roomRef = useGuideRoom(useCallback((px: number) => setGuideRoom(px), []));
  const keep = keepGuideRoom ?? caption;
  // In the film the Earth carries the world's fire under the squares, as bright as the years' (the cube's layer of
  // every MODIS detection since 2000), so the tested fires stand where fire burns.
  const backdrop = useWorldLayer(film ? '/api/cube/layers' : null, 'rows_modis');
  // In the film the picture appears whole: the squares and the panel wait for the Earth's fire, so a viewer never sees
  // them on black while the layer loads. A layer that fails, or takes more than 15 s, lets the picture stand without it.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (!film) return;
    const id = window.setTimeout(() => setWaited(true), 15000);
    return () => window.clearTimeout(id);
  }, [film]);
  const whole = read.state === 'ready' && (!film || backdrop.state !== 'loading' || waited);
  useEffect(() => {
    onReady?.(whole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whole]);
  const grid = useMemo<GridLayer[]>(
    () =>
      backdrop.state === 'ready'
        ? [
            { key: 'loaded', image: backdrop.layer.loaded, onLand: true, crispFromPx: 2 },
            { key: 'fire', image: backdrop.layer.image, halo: true, alpha: 0.6 },
          ]
        : [],
    [backdrop],
  );
  const [panelTop, setPanelTop] = useState(0);
  const [chartW, setChartW] = useState(560);
  const onCaption = useCallback((px: number) => setCapBottom(px), []);
  useLayoutEffect(() => {
    const el = panel.current;
    const rt = root.current;
    if (!el || !rt) return;
    const measure = () => {
      const r = rt.getBoundingClientRect();
      const p = el.getBoundingClientRect();
      const stacked = p.width > r.width * 0.7;
      const next = stacked
        ? { left: 0, bottom: Math.round(Math.max(0, r.bottom - p.top + 8)), stacked }
        : { left: Math.round(p.right - r.left + 24), bottom: 0, stacked };
      setRoom((o) => (o.left === next.left && o.bottom === next.bottom && o.stacked === next.stacked ? o : next));
      setPanelTop(el.offsetTop);
      // The overlap chart takes the panel's whole inner width: it keeps fixed room for its labels and its readout, so
      // its bars need the width they can have.
      const cs = getComputedStyle(el);
      const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      setChartW(Math.max(300, Math.floor(inner)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(rt);
    return () => ro.disconnect();
  }, [read.state]);

  if (read.state === 'loading') return <div className="world-sealed world-sealed--note">{TEST_WORDS.loading}</div>;
  if (read.state === 'failed' || !ans) return <div className="world-sealed world-sealed--note">{TEST_WORDS.failed}</div>;

  // The latest look first: test B when it is taken, else test A.
  const look: FreshLook | null = ans.looks.find((l) => l.id === lookId) ?? ans.looks[ans.looks.length - 1] ?? null;
  const kept = ans.kept.map((k) => TEST_WORDS.keptFire(k.name, k.ahead, k.judged));
  const fires = look?.fires.filter((f) => f.box) ?? [];
  if (control) {
    control.current = {
      nextFire: () => {
        const order = [...fires].sort((a, b) => a.key.localeCompare(b.key));
        if (!order.length) return;
        const at = order.findIndex((f) => f.key === open);
        setOpen(order[(at + 1) % order.length].key);
      },
    };
  }
  // The overlap with VIIRS fire pixels, exact (words version 16): the new model's, MODIS alone's and the first model's.
  const ov = look?.overlap ?? null;
  // The rows named as words version 16 names them (its panel's rows: MODIS alone, First model, New model).
  const overlap = look && read.state === 'ready' ? overlapFromEvidence(read.value, look.id, 'challenger_blend', TEST_WORDS.overlapRows) : null;
  const filmLine = ov?.first && ov.modis
    ? ov.second
      ? TEST_WORDS.filmB(percent1(ov.second.exact), percent1(ov.modis.exact), percent1(ov.first.exact))
      : TEST_WORDS.filmA(percent1(ov.first.exact), percent1(ov.modis.exact))
    : null;
  const captionLine = caption ? (film ? filmLine ?? TEST_WORDS.objective : TEST_WORDS.objective) : null;
  // With its own caption, the panel stands under it and above the guide's room, or under the Earth on a narrow screen.
  // Without its own caption but keeping the guide's room (the host), the panel keeps its place and ends above the room.
  const panelStyle: React.CSSProperties | undefined = caption
    ? room.stacked
      ? { bottom: guideRoom }
      : { top: capBottom + 16, maxHeight: `calc(100% - ${capBottom + 16 + guideRoom + 8}px)`, overflowY: 'auto' }
    : keep
      ? room.stacked
        ? { bottom: guideRoom }
        : { maxHeight: `calc(100% - ${panelTop + guideRoom + 8}px)`, overflowY: 'auto' }
      : undefined;

  return (
    <div className="world-earth" ref={root} data-whole={whole ? 'true' : 'false'}>
      <WorldCanvas label={TEST_WORDS.label} focus={TEST_VIEW} layers={grid} hatchLand={film} padLeft={room.left} padBottom={room.bottom + (keep && !room.stacked ? guideRoom : 0)} onClickMap={() => setOpen(null)}>
        {(p) => (
          <>
            {fires.map((f) => {
              const [x, y] = p.at(...centre(f.box!));
              return (
                <button
                  key={f.key}
                  type="button"
                  data-world-ui
                  className="world-gauge"
                  data-open={open === f.key ? 'true' : 'false'}
                  style={{ left: x, top: y, ...fill(0, 1) }}
                  aria-label={`${countryAt(...centre(f.box!)) ?? f.continent ?? ''}. ${TEST_WORDS.fireLine(f.year, f.continent, f.ahead, f.judged, f.looks)}`}
                  onClick={() => setOpen((o) => (o === f.key ? null : f.key))}
                />
              );
            })}
            {open &&
              (() => {
                const f = fires.find((x) => x.key === open);
                if (!f) return null;
                const [lon, lat] = centre(f.box!);
                const [x, y] = p.at(lon, lat);
                const right = x < p.w * 0.6;
                const where = [countryAt(lon, lat), f.year].filter(Boolean).join(', ');
                return (
                  <div data-world-ui className="world-card sys-plate" style={right ? { left: x + 18, top: Math.max(12, y - 30) } : { right: p.w - x + 18, top: Math.max(12, y - 30) }}>
                    <div className="world-card__title">{where || f.key}</div>
                    <div className="world-card__line">{TEST_WORDS.fireLine(f.year, f.continent, f.ahead, f.judged, f.looks)}</div>
                    {f.zone && <div className="world-board__sub">{TEST_WORDS.zones[f.zone] ?? f.zone}</div>}
                  </div>
                );
              })()}
          </>
        )}
      </WorldCanvas>
      {keep && <div className="world-guide-room" ref={roomRef} aria-hidden="true" />}
      <WorldCaption line={captionLine} onHeight={onCaption} />
      <div className="world-legend world-tests" data-world-ui data-captioned={caption ? 'true' : 'false'} ref={panel} style={panelStyle}>
        {ans.example && <div className="world-legend__fine world-legend__caution">{ans.example}</div>}
        {!look ? (
          <div className="world-legend__line">{TEST_WORDS.noLook}</div>
        ) : film && overlap ? (
          // The film's panel: the dataviz lane's overlap with VIIRS fire pixels, read at once; the rest is the page's.
          <div className="world-tests__film">
            <div className="world-tests__look">{TEST_WORDS.lookNames[look.id] ?? look.name}</div>
            <OverlapBars overlap={overlap} width={640} />
          </div>
        ) : (
          <>
            {ans.looks.length > 1 && (
              <div className="iso-choice" role="radiogroup">
                {ans.looks.map((l) => (
                  <button key={l.id} type="button" role="radio" aria-checked={l.id === look.id} className="iso-choice__opt" data-active={l.id === look.id} onClick={() => setLookId(l.id)}>
                    {TEST_WORDS.lookNames[l.id] ?? l.name ?? l.id}
                  </button>
                ))}
              </div>
            )}
            {ans.looks.length === 1 && <div className="world-tests__look">{TEST_WORDS.lookNames[look.id] ?? look.name}</div>}
            <div className="world-legend__line">{TEST_WORDS.title(fires.length, new Set(fires.map((f) => f.continent)).size)}</div>
            {/* The dataviz lane's overlap with VIIRS fire pixels, each method exact and within one pixel (its MOUNT.md):
                in place of the table of scores won, tied and lost (words version 16 counts no scores). */}
            {overlap && <OverlapBars overlap={overlap} width={chartW} />}
            {look.all?.interval && (
              <div className="world-legend__fine">{TEST_WORDS.held(look.all.interval.stated, look.all.interval.held, look.all.interval.looks)}</div>
            )}
            {look.notScored > 0 && <div className="world-legend__fine">{TEST_WORDS.notScored(look.notScored)}</div>}
          </>
        )}
        {kept.length > 0 && <div className="world-legend__fine world-tests__kept">{TEST_WORDS.kept(kept)}</div>}
      </div>
    </div>
  );
}
