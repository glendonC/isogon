/*
 * A page for looking at the compare plane alone while developing it. It is served by the development server at
 * /src/compare/dev/harness.html and is not part of the build: the application mounts the plane itself.
 *
 *   ?use=ways     one fire three ways (region, start, frame, cut=0, revealed=1)
 *   ?use=places   the featured fires of the places registry
 *   ?use=players  one block per player of a round (region, start, answer=1)
 *   ?use=agent    the Agent part's picture, inside a stand-in for the workspace (region, start)
 *   ?use=fires    the featured fires as the place screen mounts them, in a box the size of its slot (h, pick)
 *   ?use=reveal   one fire three ways as World model mounts it, inside a stand-in for the workspace (region, start, pass)
 */
import { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { assetUrl, getJson, postJson } from '../../lib/api';
import { platformName } from '../../content/realRuns';
import '../../styles/tokens.css';
import '../../styles/system.css';
import { WorkspaceProvider, type WorkspaceStore } from '../../app/store';
import { AgentPicture } from '../../beats/agent/AgentPicture';
import { parsePlaces, type FeaturedFire, type Places } from '../../app/places';
import { ComparePlane } from '../ComparePlane';
import { FeaturedFiresPlane } from '../FeaturedFiresPlane';
import { ThreeWaysPlane } from '../ThreeWaysPlane';
import { fireBlock, groundOfRun, playerBlocks, threeWays } from '../blocks';
import type { CompareBlock, DetectionRow } from '../types';

const Q = new URLSearchParams(location.search);
const USE = Q.get('use') ?? 'ways';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const day = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

type Any = Record<string, any>;

/** A real run with the sharp satellite hidden. This page never asks for a window of 2021. */
function heldOutRun(regionId: string, start: string, reveal = false): Promise<Any> {
  if (start.startsWith('2021')) throw new Error('this page does not ask for a 2021 window');
  return postJson<Any>('/api/reconstruct', { region_id: regionId, source: 'firms', start, holdout_viirs: true, ...(reveal ? { reveal: true } : {}) });
}

interface View {
  title: string;
  line: string;
  blocks: CompareBlock[];
  foot?: string | null;
  perRow?: number;
}

async function defaults(): Promise<{ regionId: string; start: string }> {
  const listing = await getJson<Any>('/api/regions');
  return { regionId: Q.get('region') ?? listing.default.region_id, start: Q.get('start') ?? listing.default.start };
}

async function waysView(revealed: boolean): Promise<View> {
  const { regionId, start } = await defaults();
  const run = await heldOutRun(regionId, start);
  const open = revealed ? await heldOutRun(regionId, start, true) : null;
  const frame = Q.get('frame');
  const tw = threeWays(run, open, { platformName, frame: frame ? Number(frame) : undefined, cut: Q.get('cut') !== '0' });
  if (!tw) throw new Error('this run has no hidden pass to compare at');
  return {
    title: run.region.name,
    line: `${day(tw.timeUtc)}. The same fire at one pass, on the same ground three times.`,
    blocks: tw.blocks,
    foot: tw.scoreLine,
  };
}

/** The rows of a file route, read through the client's address so a recorded page would work the same way. */
async function modisRows(regionId: string, from: string, to: string, box: number[]): Promise<DetectionRow[]> {
  const end = new Date(Date.parse(to) + 86400000).toISOString().slice(0, 10);
  const url = await assetUrl(`/api/calendar/rows.csv?region_id=${regionId}&start=${from.slice(0, 10)}&end=${end}&platforms=Terra,Aqua`);
  if (!url) return [];
  const text = await (await fetch(url)).text();
  const lines = text.trim().split('\n');
  const head = lines[0].split(',');
  const at = (name: string) => head.indexOf(name);
  const rows: DetectionRow[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const lon = Number(c[at('longitude')]);
    const lat = Number(c[at('latitude')]);
    const t = Date.parse(c[at('_acq_utc')]);
    if (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3]) continue;
    if (t < Date.parse(from) - 60000 || t > Date.parse(to) + 60000) continue;
    rows.push({ lon, lat, scanKm: Number(c[at('scan')]), trackKm: Number(c[at('track')]) });
  }
  return rows;
}

async function placesView(): Promise<View> {
  const listing = await getJson<Any>('/api/regions');
  const blocks: CompareBlock[] = [];
  for (const place of listing.places as Any[]) {
    if (!Array.isArray(place.featured_fires)) continue;
    for (const fire of place.featured_fires as Any[]) {
      if (!fire.blind_test_fire) {
        const block = fireBlock(place, fire, await heldOutRun(place.id, fire.default_start));
        if (block) blocks.push(block);
        continue;
      }
      // A recorded test fire. The application opens it with its own held-out run; this page asks for no run on
      // such a window, so it takes the ground from the region and the MODIS rows of the start's window from the
      // record's file, and builds the block by hand. Nothing is scored.
      const ground = groundOfRun(await postJson<Any>('/api/reconstruct', { region_id: place.id }));
      const starts = await getJson<Any>('/api/runs/starts', { region_id: place.id });
      const st = (starts.starts as Any[]).find((x) => x.start === fire.default_start);
      if (!ground || !st) continue;
      const rows = await modisRows(place.id, st.first_overpass_utc, st.last_overpass_utc, place.box);
      blocks.push({
        id: fire.id,
        ground,
        night: true,
        marks: [{ kind: 'detections', instrument: 'modis', ink: 'detection', draw: 'wash', rows }],
        label: { title: fire.label, lines: [place.name, `${rows.length} MODIS detections in ${Math.round(st.span_hours)} hours`, 'recorded test fire'] },
      });
    }
  }
  return { title: 'Choose a place', line: 'The featured fires of the places registry, each on its own ground at one scale.', blocks };
}

async function playersView(): Promise<View> {
  const { regionId, start } = await defaults();
  if (start.startsWith('2021')) throw new Error('this page does not ask for a 2021 window');
  const run = await heldOutRun(regionId, start);
  const state = await postJson<Any>('/api/env/next_look/reset', { region_id: regionId, start });
  let end: Any | null = null;
  for (let d = 0; d < state.looks.length && !end; d++) {
    const step = await postJson<Any>('/api/env/next_look/step', { round_id: state.round_id, decision: d, action: -1 });
    if (step.done) end = step.end;
  }
  for (let tries = 0; tries < 60 && !(end && end.reference); tries++) {
    await new Promise((r) => setTimeout(r, 3000));
    end = (await getJson<Any>('/api/env/next_look/state', { round_id: state.round_id })).end ?? end;
  }
  const blocks = playerBlocks(groundOfRun(run), state, end, { seesTheAnswer: Q.get('answer') === '1' });
  return {
    title: run.region.name,
    line: `${day(state.episode.first_overpass_utc)}. The same round, ${state.episode.budget} looks each. Numbers give the order of the looks.`,
    blocks,
    foot: `The round starts at a score of ${Number(end?.reference?.score_start).toFixed(3)}. Outlines: MODIS detections every player could see. Filled: VIIRS detections a look revealed.`,
  };
}

/** The Agent part's picture with just enough of the workspace around it: the place and the run on show. */
function AgentHarness() {
  const [store, setStore] = useState<WorkspaceStore | null>(null);
  useEffect(() => {
    void defaults().then(async ({ regionId, start }) => {
      const run = await heldOutRun(regionId, start);
      setStore({
        place: { regionId, title: run.region.name },
        run: { active: run, isReal: true, realStart: start },
        round: { state: null, end: null },
      } as unknown as WorkspaceStore);
    });
  }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--sys-night)' }}>
      {store && (
        <WorkspaceProvider value={store}>
          <AgentPicture />
        </WorkspaceProvider>
      )}
    </div>
  );
}

/** The featured fires in a box the size of the place screen's slot, with the plane's default: no recorded test fire. */
function FiresHarness() {
  const [places, setPlaces] = useState<Places | null>(null);
  const [current, setCurrent] = useState<string | null>(Q.get('pick'));
  useEffect(() => {
    void getJson<unknown>('/api/regions').then((body) => setPlaces(parsePlaces(body)));
  }, []);
  const standing = (f: FeaturedFire) => (f as unknown as { to_the_world_model?: string | null }).to_the_world_model ?? null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--sys-night)', display: 'grid', alignContent: 'end' }}>
      <div data-slot="featured-fires" style={{ height: Number(Q.get('h') ?? 340) }}>
        {places && (
          <FeaturedFiresPlane places={places} currentFire={current} onFire={(_, fire) => setCurrent(fire.id)} standing={standing} />
        )}
      </div>
      <span id="events" className="sys-unit" style={{ padding: 'var(--sys-s3) var(--sys-s5)' }}>
        open {current ?? 'none'}
      </span>
    </div>
  );
}

/** One fire three ways with just enough of the workspace around it: the run on show, the test's state, the pass. */
function RevealHarness() {
  const [run, setRun] = useState<Any | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [where, setWhere] = useState<{ regionId: string; start: string } | null>(null);
  useEffect(() => {
    void defaults().then(async (d) => {
      setWhere(d);
      setRun(await heldOutRun(d.regionId, d.start));
    });
  }, []);
  const reveal = async () => {
    if (!where) return;
    setRun(await heldOutRun(where.regionId, where.start, true));
    setRevealed(true);
  };
  const store = run
    ? ({
        run: { active: run, isReal: true, realStart: where?.start },
        test: { revealed, hidden: !revealed },
        time: { pass: Number(Q.get('pass') ?? 23) },
      } as unknown as WorkspaceStore)
    : null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--sys-night)', display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto' }}>
      {store && (
        <WorkspaceProvider value={store}>
          <ThreeWaysPlane />
        </WorkspaceProvider>
      )}
      <div style={{ padding: 'var(--sys-s3) var(--sys-s5)' }}>
        {!revealed && (
          <button id="reveal" type="button" className="sys-ctl" onClick={() => void reveal()}>
            Reveal VIIRS
          </button>
        )}
      </div>
    </div>
  );
}

function Harness() {
  const [revealed, setRevealed] = useState(Q.get('revealed') === '1');
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(Q.get('pick'));

  useEffect(() => {
    let live = true;
    const make = USE === 'places' ? placesView() : USE === 'players' ? playersView() : waysView(revealed);
    make.then((v) => live && setView(v)).catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [revealed]);

  // The picked block takes the selected mark; on the place screen the others step back
  const blocks = useMemo(
    () =>
      (view?.blocks ?? []).map((b) =>
        picked && b.state !== 'withheld' ? { ...b, state: b.id === picked ? ('selected' as const) : USE === 'places' ? ('dimmed' as const) : b.state } : b,
      ),
    [view, picked],
  );

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', background: 'var(--sys-night)' }}>
      <header style={{ padding: 'var(--sys-s6) var(--sys-s7) 0' }}>
        <div className="sys-title">{view?.title ?? ' '}</div>
        <div className="sys-body">{error ?? view?.line ?? ' '}</div>
      </header>
      <ComparePlane
        blocks={blocks}
        perRow={view?.perRow}
        ariaLabel={view?.title}
        onHover={setHover}
        onPick={(id) => setPicked((was) => (was === id ? null : id))}
      />
      <footer style={{ display: 'flex', gap: 'var(--sys-s5)', alignItems: 'baseline', padding: '0 var(--sys-s7) var(--sys-s5)' }}>
        {USE === 'ways' && !revealed && (
          <button id="reveal" type="button" className="sys-ctl" onClick={() => setRevealed(true)}>
            <span className="sys-key">R</span> Reveal VIIRS
          </button>
        )}
        <span className="sys-label">{view?.foot ?? ''}</span>
        <span id="events" className="sys-unit" style={{ marginLeft: 'auto' }}>
          hover {hover ?? 'none'} pick {picked ?? 'none'}
        </span>
      </footer>
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    USE === 'agent' ? <AgentHarness /> : USE === 'fires' ? <FiresHarness /> : USE === 'reveal' ? <RevealHarness /> : <Harness />,
  );
}
