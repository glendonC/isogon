/*
 * A page for looking at the compare plane alone while developing it. It is served by the development server at
 * /src/compare/dev/harness.html and is not part of the build: the application mounts the plane itself.
 *
 *   ?use=ways     one fire three ways (region, start, frame, cut=0, revealed=1)
 *   ?use=places   the featured fires of the places registry
 *   ?use=players  one block per player of a round (region, start, answer=1)
 *   ?use=agent    the players, side by side, over the still of the stage (region, start, round=1|page|underway, looks,
 *                 revealed=1, speaks=1). speaks=1 tells a screen the guide speaks there.
 *   ?use=fires    the featured fires as the place screen mounts them, in a box the size of its slot (h, pick)
 *   ?use=reveal   one fire three ways as World model mounts it, inside a stand-in for the workspace (region, start, pass)
 *   ?use=record   The Record over a still of the stage, with stand-ins for the trail and the guide's strip
 *                 (region, box=w,s,e,n, marked, pick, counted=1, now=1, speaks=1, still=0, guide=0, events=1)
 *   ?use=place    Choose a Place over the same still, with the same stand-ins (current, repeat=N, still=0, guide=0,
 *                 events=1)
 */
import { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { assetUrl, getJson, postJson } from '../../lib/api';
import '../../styles/tokens.css';
import '../../styles/system.css';
import { WorkspaceProvider, type WorkspaceStore } from '../../app/store';
import { AgentBeat } from '../../beats/agent/AgentBeat';
import { openRound } from '../../beats/test-world/env';
import { usePlayersView } from '../../beats/agent/playersView';
import { openingStart, parsePlaces, type Box, type FeaturedFire, type Places } from '../../app/places';
import { boxWords, PlaceScreen } from '../../beats/calendar/PlaceScreen';
import type { FireRecord, RecordPlace } from '../../beats/calendar/record';
import { useRecordView } from '../../beats/calendar/recordView';
import { TheRecord } from '../../beats/calendar/TheRecord';
import { ComparePlane } from '../ComparePlane';
import { FeaturedFiresPlane } from '../FeaturedFiresPlane';
import { ThreeWaysPlane } from '../ThreeWaysPlane';
import { fireBlock, groundOfRun, roundBlocks, threeWays } from '../blocks';
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
  const tw = threeWays(run, open, { frame: frame ? Number(frame) : undefined, cut: Q.get('cut') !== '0' });
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
  const blocks = roundBlocks(groundOfRun(run), state, end, { seesTheAnswer: Q.get('answer') === '1' });
  return {
    title: run.region.name,
    line: `${day(state.episode.first_overpass_utc)}. The same round, ${state.episode.budget} looks each. Numbers give the order of the looks.`,
    blocks,
    foot: `The round starts at a score of ${Number(end?.reference?.score_start).toFixed(3)}. Outlines: MODIS detections every player could see. Filled: VIIRS detections a look revealed.`,
  };
}

/**
 * The players, side by side, over the still of the stage, with just enough of the workspace round them. With
 * `round=1` a round is played first through the routes (looks=5,-1,6,-1,9,-1,10 are the visitor's, a square or -1 for
 * each pass), so the picture is that round with the visitor's own looks; without it the picture asks for plays, and
 * what the looks found stays hidden until asked for (revealed=1 stands for a test already revealed).
 * `round=underway` stands for a round that is not over. The strip's words are the guide script's for this state,
 * and this page's own where the script has none.
 */
function AgentHarness() {
  const [store, setStore] = useState<WorkspaceStore | null>(null);
  const [event, setEvent] = useState('none');
  const [failed, setFailed] = useState<string | null>(null);
  const view = usePlayersView();
  useEffect(() => {
    void (async () => {
      const { regionId, start } = await defaults();
      if (start.startsWith('2021')) throw new Error('this page does not ask for a 2021 window');
      const run = await heldOutRun(regionId, start);
      const places = parsePlaces(await getJson<unknown>('/api/regions'));
      let round: Any = { state: null, start: null, end: null };
      if (Q.get('round') === 'underway') round = { state: {}, start: null, end: null };
      else if (Q.get('round') === 'page') {
        // The round as the page plays and keeps it: through its own round module, in its own shapes
        const env = await openRound(regionId, start);
        const mine = (Q.get('looks') ?? '5,6,9,10').split(',').map(Number);
        let decision: number | null = env.start.looks[0]?.index ?? 0;
        for (const tile of mine) {
          if (decision === null) break;
          const r = await env.look(decision, tile);
          decision = r.next_decision;
        }
        round = { state: {}, start: env.start, end: await env.end() };
      }
      else if (Q.get('round') === '1') {
        const state = await postJson<Any>('/api/env/next_look/reset', { region_id: regionId, start });
        const mine = (Q.get('looks') ?? '5,-1,6,-1,9,-1,10').split(',').map(Number);
        let end: Any | null = null;
        for (let d = 0; d < state.looks.length && !end; d++) {
          const step = await postJson<Any>('/api/env/next_look/step', { round_id: state.round_id, decision: d, action: mine[d] ?? -1 });
          if (step.done) end = step.end;
        }
        for (let tries = 0; tries < 60 && !(end && end.reference); tries++) {
          await new Promise((r) => setTimeout(r, 3000));
          end = (await getJson<Any>('/api/env/next_look/state', { round_id: state.round_id })).end ?? end;
        }
        round = { state: {}, start: state, end };
      }
      const fire = places.places.flatMap((p) => p.featured_fires).find((f) => f.region_id === regionId && f.default_start === start);
      setStore({
        places,
        currentFire: fire?.id ?? null,
        place: { regionId, title: run.region.name },
        run: { active: run, isReal: true, realStart: start },
        round,
        test: { revealed: Q.get('revealed') === '1' },
        goStep: (step: string) => setEvent(`step ${step}`),
        openModel: () => setEvent('model'),
      } as unknown as WorkspaceStore);
    })().catch((e: unknown) => setFailed(e instanceof Error ? e.message : String(e)));
  }, []);
  const played = view.from === 'round';
  const same = view.players.find((p) => p.id === 'learned')?.sameLooksAs ?? null;
  const said =
    view.state !== 'ready'
      ? [failed ?? view.line ?? 'Loading this fire.']
      : played
        ? [
            'Each small terrain is one player on the round you just played. Lit squares are where it looked, in order, and filled marks are what its looks found.',
            ...(same ? [`On this round the Learned Player made the same looks as ${same}.`] : []),
          ]
        : [`Each small terrain is one player on this fire's round. Lit squares are where it looked, in order.${view.foundShown ? ' Filled marks are what its looks found.' : ''}`];
  return (
    <StandIn
      objective="See where the other players looked"
      trail={3}
      said={said}
      actions={
        view.state !== 'ready'
          ? []
          : [
              ...(view.canReveal ? [{ id: 'reveal', key: 'Enter', words: 'Reveal what their looks found', act: view.reveal }] : [{ id: 'finish', key: 'Enter', words: 'Finish' }]),
              { id: 'watch', key: 'W', words: 'Watch them play', act: view.watch },
              { id: 'again', key: 'R', words: 'Play again' },
            ]
      }
      event={event}
    >
      {store && (
        <WorkspaceProvider value={store}>
          <AgentBeat guideSpeaks={Q.get('speaks') === '1'} />
        </WorkspaceProvider>
      )}
    </StandIn>
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

/**
 * The Record over a still of the stage. The still is a capture of the stage, not the stage: a file kept out of the
 * repository at build/dev-stills/stage-still.png, and the page does without it when it is absent. The trail and the strip
 * are stand-ins for the page's own: the strip reads the Record's view, as the guide will, and its sentences are the
 * first wording, not the Record's. Showing a fire asks for nothing here; the strip says what would be shown.
 */
function RecordHarness() {
  const [places, setPlaces] = useState<Places | null>(null);
  const [event, setEvent] = useState('none');
  const view = useRecordView();
  useEffect(() => {
    void getJson<unknown>('/api/regions').then((body) => setPlaces(parsePlaces(body)));
  }, []);
  const box = Q.get('box');
  const regionId = Q.get('region') ?? places?.default?.region_id ?? null;
  const place: RecordPlace | null = useMemo(() => {
    if (box) {
      const b = box.split(',').map(Number) as Box;
      return { kind: 'box', box: b, name: boxWords(b) };
    }
    const p = places?.places.find((x) => x.id === regionId);
    return p ? { kind: 'region', regionId: p.id, name: p.name } : null;
  }, [box, regionId, places]);
  const marked = Q.get('marked') ?? (box || !places || !regionId ? null : openingStart(places, regionId)?.slice(0, 7) ?? null);
  const ready = view.state === 'ready';
  useEffect(() => {
    if (!ready) return;
    const pick = Q.get('pick');
    if (pick) view.pick(pick);
    if (Q.get('counted') === '1') view.showAsCounted(true);
    if (Q.get('now') === '1') view.askNow();
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const canOpen = (ym: string, rec: FireRecord) => rec.place.kind === 'region' && rec.runStarts.some((st) => st.start.startsWith(ym));
  // The stand-ins below follow the page's frames: the place, the objective and the trail top left, the guide's
  // sentences and at most three actions bottom centre. Their words are the guide script's, with the view's figures.
  const times = view.correction.ratio === null ? null : (Math.round(view.correction.ratio * 10) / 10).toFixed(1);
  const said: string[] = view.picked
    ? [
        view.picked.rank !== null && view.picked.rankOf !== null
          ? `Counting from the most fire, ${view.picked.words} is number ${view.picked.rank} of ${view.picked.rankOf} for its month of the year.`
          : `${view.picked.words}.`,
      ]
    : ready
      ? [
          `This is every fire NASA's satellites detected around ${view.place} since ${view.firstYear}. Each square is one month, and brighter means more fire.`,
          ...(times ? [`The newer satellite sees about ${times} times as many fires as the older ones, so recent years would look worse than they were. Here that jump is taken out and every year is on one scale.`] : []),
        ]
      : view.state === 'loading'
        ? [`Loading the fire record of ${view.place}.`]
        : view.state === 'not loaded'
          ? // The guide's own state for a drawn area, whose first line names a first year this area does not have
            ["A fire can be shown pass by pass and tested only where the satellites' passes are stored."]
          : ['The record did not load.'];
  return (
    <StandIn
      objective={box ? 'Read the fire record of the area you drew' : `Read the fire record of ${view.place || place?.name || ''}`}
      said={said}
      actions={
        ready
          ? [
              ...(view.marked ? [{ id: 'show', key: 'Enter', words: `Show the fire of ${view.marked.words}`, act: () => view.show(view.marked!.ym) }] : []),
              { id: 'browse', key: 'M', words: 'Pick a month', act: () => view.browse() },
              { id: 'place', key: 'P', words: 'Choose another place' },
            ]
          : []
      }
      event={event}
    >
      {place && (
        <TheRecord
          place={place}
          markedMonth={marked}
          canOpen={canOpen}
          onOpenMonth={(ym) => setEvent(`show ${ym}`)}
          onClose={() => setEvent('close')}
          guideSpeaks={Q.get('speaks') === '1'}
        />
      )}
    </StandIn>
  );
}

interface StandInAction {
  id: string;
  key: string;
  words: string;
  act?: () => void;
}

/**
 * What stands round a screen of this lane on the page, as stand-ins: a still of the stage under it, the objective and
 * the trail top left, the guide's sentences and at most three actions bottom centre, the first one the next step.
 */
function StandIn({
  objective,
  said,
  actions,
  event,
  trail = 0,
  children,
}: {
  objective: string;
  said: string[];
  actions: StandInAction[];
  event: string;
  /** Which of the trail's four words is the current one. */
  trail?: number;
  children: React.ReactNode;
}) {
  const quiet = { font: 'inherit', background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' } as const;
  const key = { font: 'var(--sys-weight) var(--sys-size-fine) / 1 var(--sys-mono)', color: 'var(--sys-ink-3)', marginRight: 8 } as const;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--sys-night)' }}>
      {Q.get('still') !== '0' && (
        <img
          src="/build/dev-stills/stage-still.png"
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.14)', transformOrigin: '100% 100%' }}
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      )}
      {children}
      {Q.get('guide') !== '0' && (
        <>
          <div style={{ position: 'absolute', zIndex: 3, left: 'var(--sys-gutter)', top: 28, display: 'grid', gap: 6 }}>
            <span style={{ font: 'var(--sys-weight-strong) 20px / 26px var(--sys-font)', color: 'var(--sys-ink)' }}>{objective}</span>
            <div style={{ display: 'flex', gap: 'var(--sys-s4)', alignItems: 'baseline' }}>
              {['Record', 'Estimate', 'Test', 'Play'].map((w, i) => (
                <span
                  key={w}
                  className="sys-label"
                  style={i === trail ? { color: 'var(--sys-ink)', borderBottom: '1px solid var(--sys-ink)', paddingBottom: 2 } : { color: 'var(--sys-ink-3)' }}
                >
                  {w}
                </span>
              ))}
            </div>
          </div>
          <div style={{ position: 'absolute', zIndex: 3, left: 0, right: 0, bottom: 0, padding: '0 var(--sys-gutter) 30px', display: 'grid', justifyItems: 'center', gap: 'var(--sys-s3)', pointerEvents: 'none' }}>
            <p style={{ margin: 0, font: 'var(--sys-weight) 17px / 25px var(--sys-font)', color: 'var(--sys-ink)', maxWidth: 1040, textAlign: 'center' }}>{said.join(' ')}</p>
            <div className="sys-body" style={{ display: 'flex', gap: 'var(--sys-s6)', alignItems: 'baseline', pointerEvents: 'auto' }}>
              {actions.map((a, i) => (
                <button key={a.id} id={a.id} type="button" style={i === 0 ? { ...quiet, fontWeight: 500, color: 'var(--sys-ink)' } : quiet} onClick={a.act}>
                  <span style={key}>{a.key}</span>
                  {a.words}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {Q.get('events') === '1' && (
        <span id="events" className="sys-unit" style={{ position: 'absolute', zIndex: 3, right: 8, top: 4, opacity: 0.6 }}>
          {event}
        </span>
      )}
    </div>
  );
}

/**
 * Choose a Place over the still of the stage. The guide script has no state for this screen yet: the objective and
 * the sentence in the strip are this page's stand-ins, with counts taken from the registry.
 */
function PlaceHarness() {
  const [places, setPlaces] = useState<Places | null>(null);
  const [event, setEvent] = useState('none');
  useEffect(() => {
    void getJson<unknown>('/api/regions').then((body) => {
      const read = parsePlaces(body);
      // repeat=N: the registry's places N times over, each copy moved on the map, to see a plane of many fires.
      // For this page only: a copy is the same fire and run under another id, never shown as a place of its own.
      const n = Math.max(1, Number(Q.get('repeat') ?? 1));
      const copies = Array.from({ length: n }, (_, k) =>
        read.places.map((p) =>
          k === 0
            ? p
            : {
                ...p,
                id: `${p.id}~${k}`,
                box: [p.box[0] + 40 * k, p.box[1] - 9 * k, p.box[2] + 40 * k, p.box[3] - 9 * k] as typeof p.box,
                featured_fires: p.featured_fires.map((f) => ({ ...f, id: `${f.id}~${k}` })),
              },
        ),
      ).flat();
      setPlaces({ ...read, places: copies });
    });
  }, []);
  const withFires = places?.places.filter((p) => p.rows === 'firms' && p.featured_fires.length > 0) ?? [];
  const fires = withFires.reduce((n, p) => n + p.featured_fires.length, 0);
  const word = (n: number) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n] ?? String(n);
  const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
  return (
    <StandIn
      objective="Choose a place and a fire"
      said={places ? [`${cap(word(fires))} fires in ${word(withFires.length)} places can be shown pass by pass. Pick one, or draw your own area to read its fire record.`] : ['Loading the places.']}
      actions={[]}
      event={event}
    >
      {places && (
        <PlaceScreen
          places={places}
          currentFire={Q.get('current') ?? places.default?.featured_fire ?? null}
          onFire={(_, fire) => setEvent(`show ${fire.id}`)}
          onBox={(b) => setEvent(`box ${b.join(',')}`)}
          onClose={() => setEvent('close')}
        />
      )}
    </StandIn>
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
    USE === 'record' ? (
      <RecordHarness />
    ) : USE === 'place' ? (
      <PlaceHarness />
    ) : USE === 'agent' ? (
      <AgentHarness />
    ) : USE === 'fires' ? (
      <FiresHarness />
    ) : USE === 'reveal' ? (
      <RevealHarness />
    ) : (
      <Harness />
    ),
  );
}
