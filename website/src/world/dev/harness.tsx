/*
 * A page for looking at the pictures of the world alone while developing them. Served by the development server at
 * /src/world/dev/harness.html; not part of the build: the application mounts the pictures itself. The objective,
 * the trail and the guide's strip here are stand-ins for the page's own, so a frame shows where words sit; their
 * sentences are this page's, not the script's.
 *
 *   ?use=earth    Choose on the Earth (layers=<base>, factor=<address>, places=<address>, box=w,s,e,n, open=<id>,
 *                 onfactor=1, draw=1, guide=0)
 *   ?use=sealed   Tonight's sealed predictions (seals=<address>, now=<iso>)
 *   ?use=test     The test across the world (test=<address>)
 *   ?use=band     The band of the Record's interval on a month and on a year (record=<address>, month=YYYY-MM)
 *   ?use=years    The Earth plays the years (years=<index>, mode=detected|harmonized, year=YYYY, play=1)
 *   ?use=cube     A drawn box's Record summed here from the public cube (cube=<folder>) against the cube route's answer
 *                 (route=<origin>), for boxes=w,s,e,n;w,s,e,n: times and the largest difference
 */
import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../../styles/tokens.css';
import '../../styles/system.css';
import '../../styles/film.css';
import { parsePlaces, type Places } from '../../app/places';
import { GuideStrip } from '../../guide/GuideStrip';
import { Trail } from '../../guide/Trail';
import { ChooseOnEarth } from '../ChooseOnEarth';
import { IntervalBand } from '../IntervalBand';
import { SealedTonight } from '../SealedTonight';
import { WorldTest } from '../WorldTest';
import { EarthYears } from '../EarthYears';
import type { Box } from '../projection';
import { useRead } from '../read';
import { loadPublicCube } from '../publicCube';
import { publicRecord } from '../boxRecord';

const Q = new URLSearchParams(location.search);
// The film presentation, as the page takes it from `film` in its address.
if (Q.has('film')) document.documentElement.classList.add('iso-film');
const USE = Q.get('use') ?? 'earth';
const SAMPLE = 'http://127.0.0.1:9488';
const boxParam = (s: string | null): Box | null => {
  const v = (s ?? '').split(',').map(Number);
  return v.length === 4 && v.every(Number.isFinite) ? (v as Box) : null;
};

function Frame({ objective, lines, actions, word = 'Record', children }: { objective: string; lines: string[]; actions: string[]; word?: 'Record' | 'Test'; children: React.ReactNode }) {
  const guide = Q.get('guide') !== '0';
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {children}
      {guide && <Trail objective={objective} current={word} context={null} onWord={() => {}} closed={{}} onPlace={() => {}} />}
      {guide && <GuideStrip lines={lines} actions={actions.map((label, i) => ({ label, command: String(i), key: null }) as never)} onAction={() => {}} />}
    </div>
  );
}

function Earth() {
  const read = useRead<unknown>(Q.get('places') ?? `${SAMPLE}/places-sample.json`);
  const [said, setSaid] = useState<string | null>(null);
  if (read.state !== 'ready') return <p style={{ padding: 24 }}>{read.state === 'failed' ? read.why : 'Loading the places'}</p>;
  const places: Places = parsePlaces(read.value);
  const featured = places.places.filter((p) => p.featured_fires.length > 0);
  return (
    <Frame
      objective="Choose a place on Earth"
      lines={[said ?? `Brighter means more fire detected since 2000. ${featured.length} places have a fire you can follow pass by pass; or draw an area anywhere to read its fire record.`]}
      actions={['Show the fire of August 2012', 'Draw an area', 'Back']}
    >
      {Q.get('stage') && (
        // The site's own page, its stage running, beside the Earth: for measuring the Earth's frames beside the stage.
        <iframe title="stage" src={Q.get('stage') === '1' ? '/' : Q.get('stage')!} style={{ position: 'absolute', top: 0, right: 0, width: '50%', height: '100%', border: 0 }} />
      )}
      <div
        style={
          Q.get('w')
            ? { position: 'absolute', left: 40, top: 160, width: Number(Q.get('w')), height: Number(Q.get('h') ?? 600) }
            : Q.get('stage')
              ? { position: 'absolute', top: 0, left: 0, width: '50%', height: '100%' }
              : { position: 'absolute', inset: 0 }
        }
      >
      <ChooseOnEarth
        layers={Q.get('layers') ?? `${SAMPLE}/cube-layers/layers.json`}
        factor={Q.get('factor') ?? `${SAMPLE}/harmonize-maps/maps.json`}
        places={places.places}
        currentFire={places.default?.featured_fire ?? null}
        limits={places.boxCalendar}
        startBox={boxParam(Q.get('box'))}
        startOpen={Q.get('open')}
        startOnFactor={Q.get('onfactor') === '1'}
        startDrawing={Q.get('draw') === '1'}
        focus={boxParam(Q.get('focus')) ?? undefined}
        roomRight={Number(Q.get('room') ?? 0)}
        onFire={(p, f) => setSaid(`Chosen: ${f.label}, ${p.name}.`)}
        onPlace={(p) => setSaid(`Chosen: the fire record of ${p.name}.`)}
        onBox={(b) => setSaid(`Chosen: the area ${b.map((v) => v.toFixed(2)).join(', ')}.`)}
      />
      </div>
    </Frame>
  );
}

function Sealed() {
  return (
    <Frame
      word="Test"
      objective="Check predictions sealed before the satellite passed"
      lines={['Each prediction was written down and sealed before the sharp satellite passed over the fire. The white square always stands before the ring.']}
      actions={['Show a sealed prediction', 'Back to the test']}
    >
      <div style={{ position: 'absolute', inset: 'var(--film-room-top, 96px) 0 var(--film-room-bottom, 150px) 0' }}>
        <SealedTonight source={Q.get('seals') ?? `${SAMPLE}/live-example.json`} now={Q.get('now')} />
      </div>
    </Frame>
  );
}

function Test() {
  return (
    <Frame
      word="Test"
      objective="See where the estimate was tested"
      lines={['Each square is one fire the estimate was tested on, filled by how many of seven scores it won. An empty square is a fire it lost on.']}
      actions={["Show a fire's scores", 'Back to the test']}
    >
      <WorldTest source={Q.get('test') ?? `${SAMPLE}/test-example.json`} />
    </Frame>
  );
}

function Band() {
  const read = useRead<Record<string, any>>(Q.get('record') ?? `${SAMPLE}/calendar-plumas_ca.json`);
  if (read.state !== 'ready') return <p style={{ padding: 24 }}>{read.state === 'failed' ? read.why : 'Loading the record'}</p>;
  const cal = read.value;
  const ym = Q.get('month') ?? '2012-08';
  const r = (cal.records as Array<Record<string, any>>).find((x) => x.year_month === ym)!;
  const per = cal.harmonization_method.validation.per_year as Array<{ inside_interval: boolean }>;
  const held = { held: per.filter((y) => y.inside_interval).length, of: per.length, what: 'years' as const };
  const unit = 'detections per 1,000 square kilometres a day';
  return (
    <Frame objective="Read the fire record of a place" lines={['The band under a month is how far its figure could be off after the correction for the change of satellite.']} actions={['Show the fire of August 2012', 'Pick a month']}>
      <div style={{ position: 'absolute', left: 120, top: 220, display: 'grid', gap: 48 }}>
        <div className="sys-plate" style={{ padding: '12px 16px', width: 340, display: 'grid', gap: 8 }}>
          <div className="sys-label" style={{ color: 'var(--sys-ink)' }}>August 2012, the busiest month here</div>
          <div className="sys-value">{r.harmonized_mean.toFixed(2)} <span className="sys-unit">{unit}</span></div>
          <IntervalBand value={r.harmonized_mean} low={r.harmonized_p10} high={r.harmonized_p90} unit={unit} held={held} />
        </div>
        <div className="sys-plate" style={{ padding: '12px 16px', width: 220, display: 'grid', gap: 8 }}>
          <div className="sys-label" style={{ color: 'var(--sys-ink)' }}>August 2012, narrow</div>
          <IntervalBand value={r.harmonized_mean} low={r.harmonized_p10} high={r.harmonized_p90} unit="a day per 1,000 km²" compact />
        </div>
      </div>
    </Frame>
  );
}

// Every number of two answers, leaf by leaf, where both hold it: the largest difference.
function largestDifference(a: unknown, b: unknown): { leaves: number; largest: number } {
  let leaves = 0;
  let largest = 0;
  const walk = (x: unknown, y: unknown) => {
    if (typeof x === 'number' && typeof y === 'number') {
      leaves += 1;
      largest = Math.max(largest, Math.abs(x - y));
    } else if (x && y && typeof x === 'object' && typeof y === 'object') {
      for (const k of Object.keys(x as object)) {
        if (k in (y as object) && !['cube', 'public_cube', 'downloaded_firms_rows', 'day', 'night', 'frp_mw', 'frp_mw_day', 'frp_mw_night'].includes(k)) {
          walk((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k]);
        }
      }
    }
  };
  walk(a, b);
  return { leaves, largest };
}

function Cube() {
  const base = Q.get('cube') ?? `${SAMPLE}/cube/public/`;
  const route = Q.get('route') ?? 'http://127.0.0.1:8788';
  const boxes = (Q.get('boxes') ?? '-122.37,43.12,-120.81,44.93;95,55,114.5,64.8;148.2,-37.9,150.8,-35;-60.37,-34.81,-59.94,-34.43')
    .split(';')
    .map((t) => t.split(',').map(Number) as [number, number, number, number]);
  const [lines, setLines] = useState<string[]>(['Loading the public cube']);
  useEffect(() => {
    (async () => {
      const t0 = performance.now();
      const cube = await loadPublicCube(base);
      const out = [`Public cube ${cube.manifest.source.cube_build}: fetched, unpacked and indexed in ${Math.round(performance.now() - t0)} ms`];
      setLines([...out]);
      for (const b of boxes) {
        const t1 = performance.now();
        const mine = publicRecord(cube, b, { fitted: null });
        const ms = performance.now() - t1;
        const resp = await fetch(`${route}/api/cube/record?box=${b.join(',')}`);
        const theirs = await resp.json();
        const d = largestDifference(theirs, mine);
        out.push(`${b.join(', ')}: summed in ${Math.round(ms)} ms; ${d.leaves} numbers against the route, largest difference ${d.largest}`);
        setLines([...out]);
      }
      out.push('Done');
      setLines([...out]);
    })().catch((err) => setLines((l) => [...l, `Failed: ${err instanceof Error ? err.message : String(err)}`]));
  }, []);
  return (
    <div style={{ padding: 32, color: '#e5e7eb', font: '15px/1.6 system-ui', background: '#0b0f16', minHeight: '100vh' }}>
      {lines.map((l) => (
        <p key={l} data-line style={{ margin: '0 0 6px' }}>{l}</p>
      ))}
    </div>
  );
}

function Years() {
  const mode = Q.get('mode') === 'harmonized' ? 'harmonized' : 'detected';
  const y = Number(Q.get('year'));
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <EarthYears
        source={Q.get('years') ?? 'http://127.0.0.1:8788/api/cube/years'}
        mode={mode}
        year={Number.isFinite(y) && y > 0 ? y : undefined}
        autoplay={Q.has('play') ? Q.get('play') !== '0' : undefined}
      />
    </div>
  );
}

function App() {
  if (USE === 'years') return <Years />;
  if (USE === 'cube') return <Cube />;
  if (USE === 'earth') return <Earth />;
  if (USE === 'sealed') return <Sealed />;
  if (USE === 'test') return <Test />;
  if (USE === 'band') return <Band />;
  return <p style={{ padding: 24 }}>Unknown use {USE}</p>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
