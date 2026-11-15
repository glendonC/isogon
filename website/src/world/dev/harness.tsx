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
 */
import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../../styles/tokens.css';
import '../../styles/system.css';
import { parsePlaces, type Places } from '../../app/places';
import { GuideStrip } from '../../guide/GuideStrip';
import { Trail } from '../../guide/Trail';
import { ChooseOnEarth } from '../ChooseOnEarth';
import { IntervalBand } from '../IntervalBand';
import { SealedTonight } from '../SealedTonight';
import { WorldTest } from '../WorldTest';
import type { Box } from '../projection';
import { useRead } from '../read';

const Q = new URLSearchParams(location.search);
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
      <div style={Q.get('w') ? { position: 'absolute', left: 40, top: 160, width: Number(Q.get('w')), height: Number(Q.get('h') ?? 600) } : { position: 'absolute', inset: 0 }}>
      <ChooseOnEarth
        layers={Q.get('layers') ?? `${SAMPLE}/cube-layers/layers.json`}
        factor={Q.get('factor') ?? `${SAMPLE}/world-factor.json`}
        places={places.places}
        currentFire={places.default?.featured_fire ?? null}
        limits={places.boxCalendar}
        startBox={boxParam(Q.get('box'))}
        startOpen={Q.get('open')}
        startOnFactor={Q.get('onfactor') === '1'}
        startDrawing={Q.get('draw') === '1'}
        focus={boxParam(Q.get('focus')) ?? undefined}
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
      <div style={{ position: 'absolute', inset: '96px 0 150px 0' }}>
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
      <WorldTest source={Q.get('test') ?? `${SAMPLE}/test-closed.json`} />
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

function App() {
  if (USE === 'earth') return <Earth />;
  if (USE === 'sealed') return <Sealed />;
  if (USE === 'test') return <Test />;
  if (USE === 'band') return <Band />;
  return <p style={{ padding: 24 }}>Unknown use {USE}</p>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
