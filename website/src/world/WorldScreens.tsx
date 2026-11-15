import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GuideStrip } from '../guide/GuideStrip';
import type { ScriptAction } from '../guide/script';
import { Trail, type TrailWord } from '../guide/Trail';
import { EarthYears, type YearsControl, type YearsState } from './EarthYears';
import { parseFresh } from './freshTest';
import { useWorldKeys } from './keys';
import { parseLive } from './live';
import { useRead } from './read';
import { closeWorldScreen, useWorldScreen, type WorldScreen } from './screens';
import { SealedTonight } from './SealedTonight';
import { oneDecimal, SCREEN_WORDS as S } from './words';
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

function Frame({ objective, word, context, lines, actions, onAction, film, trail = true, toWord }: Part & {
  objective: string | null;
  word: TrailWord;
  context?: string | null;
  lines: string[];
  actions: ScriptAction[];
  onAction: (command: string) => void;
  trail?: boolean;
}) {
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
  return (
    <>
      {trail && <Trail objective={objective} current={word} context={film ? null : context ?? null} onWord={toWord} closed={{}} onPlace={() => {}} />}
      {!film && <GuideStrip lines={lines} actions={actions} onAction={onAction} />}
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

function Test({ film, toWord }: Part) {
  const read = useRead<unknown>('/api/evidence');
  const control = useRef<WorldTestControl | null>(null);
  const ans = useMemo(() => (read.state === 'ready' ? parseFresh(read.value) : null), [read]);
  const look = ans ? (ans.looks.find((l) => l.id === 'test_b') ?? ans.looks.find((l) => l.id === 'test_a') ?? null) : null;
  const c = look?.all?.classes ?? null;
  const fires = look?.fires.length ?? 0;
  const of = look?.fires.length ? Math.max(...look.fires.map((f) => f.judged)) : 7;
  const continents = new Set(look?.fires.map((f) => f.continent).filter(Boolean)).size;
  const strictBehind = look?.all?.scores?.csi_strict_375m === 'behind';
  const lines =
    look && c
      ? [
          strictBehind ? S.test.strictBehind(fires, continents, c.ahead, of, c.behind) : S.test.notStrictBehind(fires, continents, c.ahead, of, c.tied, c.behind),
          S.test.squares(of),
        ]
      : [];
  const caption = look && c ? (look.id === 'test_b' ? S.test.filmB(fires, c.ahead, of, c.behind) : S.test.filmA(fires, c.ahead, of, c.behind)) : null;
  return (
    <>
      <div className="world-screen__test">
        <WorldTest source="/api/evidence" control={control} caption={false} keepGuideRoom />
      </div>
      <Frame
        film={film}
        toWord={toWord}
        objective={film ? caption ?? S.test.objective : S.test.objective}
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
  const live = useMemo(() => (read.state === 'ready' ? parseLive(read.value) : null), [read]);
  const scored = live ? live.seals.filter((s) => s.state === 'scored').length : 0;
  const o = live?.overFires ?? null;
  const counted = o && o.ahead !== null && o.tied !== null && o.behind !== null;
  const lines = live ? [S.sealed.marks, ...(scored > 0 && counted ? [S.sealed.soFar(scored, o!.ahead!, o!.tied!, o!.behind!)] : [])] : [];
  const caption = scored > 0 && counted ? S.sealed.film(o!.ahead!, o!.behind!) : null;
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
        word="Test"
        lines={lines}
        actions={[{ label: S.sealed.back, command: 'close', key: 'Enter' }]}
        onAction={() => closeWorldScreen()}
      />
    </>
  );
}
