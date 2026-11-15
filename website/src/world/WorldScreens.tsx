import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GuideStrip } from '../guide/GuideStrip';
import { LocatorBar } from '../identity/LocatorBar';
import { usePageLinks } from '../ui/pageLinks';
import { useWorkspace } from '../app/store';
import { StoryLine } from '../identity/StoryLine';
import type { StoryPart } from '../identity/story';
import { SHARP_FROM } from './yearsData';
import type { ScriptAction } from '../guide/script';
import { Trail, type TrailWord } from '../guide/Trail';
import { EarthYears, type YearsControl, type YearsState } from './EarthYears';
import { parseFresh } from './freshTest';
import { useWorldKeys } from './keys';
import { parseLive } from './live';
import { useRead } from './read';
import { closeWorldScreen, useWorldScreen, type WorldScreen } from './screens';
import { SealedTonight } from './SealedTonight';
import { oneDecimal, percent1, SCREEN_WORDS as S } from './words';
import { WorldTest, type WorldTestControl } from './WorldTest';
import '../styles/world.css';

/**
 * The pictures of the world over the whole page, one at a time: the Earth's years, the test across the world and
 * tonight's sealed predictions. The page mounts this once; `openWorldScreen` (screens.ts) or the address
 * (`?world=years|test|sealed`) opens a picture, Escape closes it back to what was under it.
 *
 * Each picture stands with its objective where the page's objective stands, the four words of the trail under it,
 * and the guide's sentence and actions at the bottom, in the product lane's words. While a picture shows, its keys
 * are its own and the page under it hears none. In the film presentation the film's caption stands in the objective's
 * place and the guide's sentence is left out; the Earth's years play as the address says.
 *
 * Every answer is read through the page's client, so a page of recorded answers shows the pictures it recorded.
 */
export function WorldScreens({ onWord }: { onWord?: (word: TrailWord) => void }) {
  const screen = useWorldScreen();
  if (!screen) return null;
  return <Host key={screen.name} screen={screen} onWord={onWord} />;
}

/** The page's own way back to its first screen (the workspace store's), or none where the page gives no store. */
function useFirstScreen(): (() => void) | null {
  try {
    return useWorkspace().toFirstScreen;
  } catch {
    return null;
  }
}

const isFilm = () => typeof document !== 'undefined' && document.documentElement.classList.contains('iso-film');

function Host({ screen, onWord }: { screen: WorldScreen; onWord?: (word: TrailWord) => void }) {
  const film = useMemo(isFilm, []);
  // Escape closes; every other key stays with the picture, so nothing under it acts.
  useWorldKeys(
    (e) => {
      if (e.key === 'Escape') {
        closeWorldScreen();
        return true;
      }
      return !(e.metaKey || e.ctrlKey || e.altKey) && e.key !== 'Tab';
    },
    'host',
  );
  const toWord = (w: TrailWord) => {
    closeWorldScreen();
    onWord?.(w);
  };
  return (
    <div className="world-screen" data-name={screen.name} data-film={film ? 'true' : 'false'} role="dialog" aria-modal="true">
      {screen.name === 'years' && <Years screen={screen} film={film} toWord={toWord} />}
      {screen.name === 'test' && <Test film={film} toWord={toWord} />}
      {screen.name === 'sealed' && <Sealed film={film} toWord={toWord} />}
    </div>
  );
}

type Part = { film: boolean; toWord: (w: TrailWord) => void };

/**
 * A picture's frame. On the page, the plan's look (the ux lane's pieces, as the page itself mounts them): the top bar
 * with the path and the place finder's window (its first step closes the picture), the story along the bottom edge,
 * and the guide's title and line. In the film presentation, the shot's caption where the objective stands.
 */
function Frame({ objective, word, lines, actions, onAction, film, trail = true, toWord, where, story, figures }: Part & {
  objective: string | null;
  word: TrailWord;
  /** The years a picture spans; the page's title says them. */
  context?: string | null;
  lines: string[];
  actions: ScriptAction[];
  onAction: (command: string) => void;
  trail?: boolean;
  /** The name in view, the last step of the top bar's path. */
  where: string;
  /** Where the picture stands in the story. */
  story: StoryPart;
  figures?: { jumpYear?: number | null; testedFires?: number | null };
}) {
  // The page's Search, Method and Sources (ui/pageLinks.ts), as on every other top bar, and its way back to the start.
  const pageLinks = usePageLinks();
  const firstScreen = useFirstScreen();
  // The pictures keep clear of this guide: its height (from the bottom of the page) is the room they keep.
  useLayoutEffect(() => {
    const host = document.querySelector<HTMLElement>('.world-screen');
    const strip = host?.querySelector<HTMLElement>('.guide-strip');
    if (!host) return;
    if (!strip) {
      host.style.removeProperty('--world-guide-room');
      return;
    }
    const measure = () => host.style.setProperty('--world-guide-room', `${Math.ceil(host.getBoundingClientRect().bottom - strip.getBoundingClientRect().top + 12)}px`);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(strip);
    ro.observe(host);
    return () => ro.disconnect();
  }, [film, lines.length, actions.length]);
  if (film) return <>{trail && <Trail objective={objective} current={word} context={null} onWord={toWord} closed={{}} onPlace={() => {}} />}</>;
  // Method and Sources open on the page, under the picture, so the picture closes first. Search opens over the picture
  // and keeps it under it until a place is chosen (a link marked `over`), so it runs as it is.
  const barLinks = pageLinks.map((l) => (l.over ? l : { label: l.label, onClick: () => { closeWorldScreen(); l.onClick(); } }));
  // The path's first part, the product's name, goes back to the first screen: the picture closes and the page leaves
  // what it had open.
  const onHome = firstScreen ? () => { closeWorldScreen(); firstScreen(); } : undefined;
  return (
    <>
      <LocatorBar path={['World', where]} onHome={onHome} onTrail={() => closeWorldScreen()} links={barLinks} />
      <StoryLine current={story} jumpYear={figures?.jumpYear ?? null} testedFires={figures?.testedFires ?? null} />
      <GuideStrip title={objective} lines={lines} actions={actions} onAction={onAction} />
    </>
  );
}

/**
 * True once the page under a picture has gone a moment with no long task (or after `cap` ms): the page's stage loads
 * its ground under the picture at first, and a pass that plays starts after that, at its own pace.
 */
function useQuiet(quietMs = 700, cap = 5000): boolean {
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    let last = performance.now();
    let obs: PerformanceObserver | null = null;
    try {
      obs = new PerformanceObserver((l) => {
        for (const e of l.getEntries()) last = Math.max(last, e.startTime + e.duration);
      });
      obs.observe({ type: 'longtask', buffered: false });
    } catch {
      obs = null;
    }
    const began = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      if (now - last >= quietMs || now - began >= cap) {
        setQuiet(true);
        window.clearInterval(id);
      }
    }, 100);
    return () => {
      window.clearInterval(id);
      obs?.disconnect();
    };
  }, [quietMs, cap]);
  return quiet;
}

function Years({ screen, film, toWord }: Part & { screen: WorldScreen }) {
  const start = screen.years ?? {};
  const tested = useTestedFires(film);
  const quiet = useQuiet();
  const control = useRef<YearsControl | null>(null);
  const [st, setSt] = useState<YearsState | null>(null);
  const ratio = st?.ratio ? oneDecimal(st.ratio) : null;
  const oneScale = st?.mode === 'harmonized';
  const lines = st && ratio ? [oneScale ? S.years.oneScale : S.years.counted(ratio)] : [];
  const actions: ScriptAction[] = [
    { label: st?.playing ? S.years.stop : S.years.play, command: 'years:play', key: 'Enter' },
    ...(st?.oneScaleReady ? [{ label: oneScale ? S.years.toCounted : S.years.toOneScale, command: 'record:as_counted', key: 'Y' }] : []),
    { label: S.years.back, command: 'close', key: 'Esc' },
  ];
  // In the film the caption stands under the year: on one scale its line throughout; as counted, the step's line from
  // 2012, so a year before it is not captioned with 2012 (the line under the year says who counted it until then).
  const caption = film && st ? (oneScale ? S.years.filmOneScale(st.first) : ratio && st.year >= 2012 ? S.years.filmCounted(ratio) : null) : null;
  // What a film driver waits for: the pass begins once the page under it is quiet (`data-pass` on the host).
  const pass = !start.play ? 'none' : st?.playing ? 'playing' : quiet && st && st.year === (start.until ?? st.last) ? 'done' : 'waiting';
  useEffect(() => {
    document.querySelector('.world-screen')?.setAttribute('data-pass', pass);
  }, [pass]);
  return (
    <>
      <EarthYears
        mode={start.view === 'onescale' ? 'harmonized' : 'detected'}
        year={start.from}
        until={start.until}
        autoplay={(start.play ?? false) && quiet}
        loop={start.play !== false}
        captionLine={caption}
        stepLabel={!film}
        ownPlay={false}
        control={control}
        onState={setSt}
      />
      <Frame
        film={film}
        toWord={toWord}
        trail={!film}
        objective={st ? S.years.objective(st.first) : null}
        where={S.years.where}
        story="world"
        figures={{ jumpYear: SHARP_FROM, testedFires: tested }}
        word="Record"
        context={st ? S.years.context(st.first, st.last) : null}
        lines={lines}
        actions={actions}
        onAction={(c) => {
          if (c === 'years:play') control.current?.play();
          else if (c === 'record:as_counted') control.current?.flip();
          else if (c === 'close') closeWorldScreen();
        }}
      />
    </>
  );
}

/** The tested fires' count for the story line, as the page's own story line gives it ("57 fires"), so the part has one
 * name on every screen. The film shows no story line and reads nothing for it. */
function useTestedFires(film: boolean): number | null {
  const read = useRead<unknown>(film ? null : '/api/evidence');
  return useMemo(() => (read.state === 'ready' ? parseFresh(read.value)?.looks.find((l) => l.id === 'test_b')?.fires.length ?? null : null), [read]);
}

function Test({ film, toWord }: Part) {
  const read = useRead<unknown>('/api/evidence');
  // In the film the caption arrives with the picture, once it is whole (WorldTest's onReady); the host says so on itself.
  const [whole, setWhole] = useState(false);
  useEffect(() => {
    document.querySelector('.world-screen')?.setAttribute('data-ready', whole ? 'true' : 'false');
  }, [whole]);
  const control = useRef<WorldTestControl | null>(null);
  const ans = useMemo(() => (read.state === 'ready' ? parseFresh(read.value) : null), [read]);
  // The guide says test B's sentence first once test B's record is served, then test A's (GUIDE-script.json version 23);
  // the film's caption takes test B's line by itself then (the panel shows test B's look too).
  const testA = ans?.looks.find((l) => l.id === 'test_a') ?? null;
  const testB = ans?.looks.find((l) => l.id === 'test_b') ?? null;
  // The overlap with VIIRS fire pixels, exact, as plain percentages (words version 16): test B's first, then test A's.
  const ob = testB?.overlap;
  const oa = testA?.overlap;
  const lineB = testB && ob?.second && ob.modis && ob.first ? S.test.overlapB(testB.fires.length, percent1(ob.second.exact), percent1(ob.modis.exact), percent1(ob.first.exact)) : null;
  const lineA = testA && oa?.first && oa.modis ? S.test.overlapA(testA.fires.length, percent1(oa.first.exact), percent1(oa.modis.exact)) : null;
  const lines = [lineB, lineA].filter((l): l is string => l !== null);
  const caption =
    ob?.second && ob.modis && ob.first
      ? S.test.filmOverlapB(percent1(ob.second.exact), percent1(ob.modis.exact), percent1(ob.first.exact))
      : oa?.first && oa.modis
        ? S.test.filmOverlapA(percent1(oa.first.exact), percent1(oa.modis.exact))
        : null;
  return (
    <>
      <div className="world-screen__test">
        <WorldTest source="/api/evidence" control={control} caption={false} keepGuideRoom onReady={setWhole} />
      </div>
      <Frame
        film={film}
        toWord={toWord}
        trail={!film || whole}
        objective={film ? caption ?? S.test.objective : S.test.objective}
        where={S.test.where(testB?.fires.length ?? testA?.fires.length ?? null)}
        story="tested"
        figures={{ jumpYear: SHARP_FROM, testedFires: testB?.fires.length ?? null }}
        word="Test"
        lines={lines}
        actions={[
          { label: S.test.fireScores, command: 'world:fire_scores', key: 'Enter' },
          { label: S.test.back, command: 'close', key: 'Esc' },
        ]}
        onAction={(cmd) => {
          if (cmd === 'world:fire_scores') control.current?.nextFire();
          else if (cmd === 'close') closeWorldScreen();
        }}
      />
      <TestKeys onEnter={() => control.current?.nextFire()} />
    </>
  );
}

function TestKeys({ onEnter }: { onEnter: () => void }) {
  useWorldKeys((e) => {
    if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey) return false;
    onEnter();
    return true;
  });
  return null;
}

function Sealed({ film, toWord }: Part) {
  const read = useRead<unknown>('/api/live');
  const tested = useTestedFires(film);
  const live = useMemo(() => (read.state === 'ready' ? parseLive(read.value) : null), [read]);
  const scored = live ? live.seals.filter((s) => s.state === 'scored').length : 0;
  const o = live?.overFires ?? null;
  const counted = o && o.ahead !== null && o.tied !== null && o.behind !== null;
  // "So far N are scored" counts fires, as the marks and the board do (the won, tied and lost are over those fires).
  const lines = live ? [S.sealed.marks, ...(scored > 0 && counted ? [S.sealed.soFar(o!.fires ?? scored)] : [])] : [];
  const caption = scored > 0 && counted ? S.sealed.film : null;
  useWorldKeys((e) => {
    if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey) return false;
    closeWorldScreen();
    return true;
  });
  return (
    <>
      <div className="world-screen__sealed">
        <SealedTonight source="/api/live" caption={false} keepGuideRoom />
      </div>
      <Frame
        film={film}
        toWord={toWord}
        objective={film ? caption ?? S.sealed.objective : S.sealed.objective}
        where={S.sealed.where}
        story="live"
        figures={{ jumpYear: SHARP_FROM, testedFires: tested }}
        word="Test"
        lines={lines}
        actions={[{ label: S.sealed.back, command: 'close', key: 'Enter' }]}
        onAction={() => closeWorldScreen()}
      />
    </>
  );
}
