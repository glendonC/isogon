import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Control } from '../identity/Control';
import '../styles/viewport-boundary.css';

/**
 * The screens past the first one are made for a computer's window. On a phone (narrow, or a short window on a touch
 * screen) the first screen stays as it is, with its sheets and its search; once the page goes past it (the Earth, a
 * place, a fire, Play) one notice stands over everything with one way back to the start.
 */
export const SMALL_SCREEN = '(max-width: 760px), (max-height: 480px) and (pointer: coarse)';

const WORDS = {
  title: 'Isogon needs a wider screen from here',
  line: 'The fire, the Earth and the game are made for a computer. Open this page on one to go on.',
  back: 'Back to the start',
};

/** The first screen is on show while its composition is in the page. */
const onFirstScreen = () => document.querySelector('.iso-land') !== null;

function useSmallScreen(): boolean {
  const [small, setSmall] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(SMALL_SCREEN).matches === true);
  useEffect(() => {
    const mq = window.matchMedia?.(SMALL_SCREEN);
    if (!mq) return;
    const on = () => setSmall(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return small;
}

export function ViewportBoundary({ children }: { children: ReactNode }) {
  const small = useSmallScreen();
  const [past, setPast] = useState(false);
  const backRef = useRef<HTMLDivElement | null>(null);

  // Whether the page has gone past the first screen, read from the page itself: the first screen's composition is
  // out of the page once it does. Watched only on a small screen.
  useEffect(() => {
    if (!small) {
      setPast(false);
      return;
    }
    let frame = 0;
    const read = () => {
      frame = 0;
      setPast(!onFirstScreen() && document.querySelector('.iso-app') !== null);
    };
    read();
    const watch = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(read);
    });
    watch.observe(document.body, { childList: true, subtree: true });
    return () => {
      watch.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [small]);

  const blocked = small && past;

  // While the notice stands, the page under it takes no pointer, key or reader, and the notice's action has focus.
  useEffect(() => {
    const app = document.querySelector<HTMLElement>('.iso-app');
    if (!app) return;
    if (blocked) {
      app.setAttribute('inert', '');
      backRef.current?.querySelector('button')?.focus();
    } else app.removeAttribute('inert');
    return () => app.removeAttribute('inert');
  }, [blocked]);

  const back = () => {
    // The path's first word is the way back to the start on every inner screen; a page with none starts again.
    const home = document.querySelector<HTMLButtonElement>('.id-bar__home');
    if (home) {
      document.querySelector('.iso-app')?.removeAttribute('inert');
      home.click();
      return;
    }
    window.location.assign(import.meta.env.BASE_URL || '/');
  };

  return (
    <>
      {children}
      {blocked &&
        createPortal(
          <div className="iso-boundary" role="dialog" aria-modal="true" aria-labelledby="iso-boundary-title">
            <div className="iso-boundary__say">
              <h2 id="iso-boundary-title" className="iso-boundary__title">
                {WORDS.title}
              </h2>
              <p className="iso-boundary__line">{WORDS.line}</p>
            </div>
            <div className="iso-boundary__act" ref={backRef}>
              <Control variant="primary" onClick={back}>
                {WORDS.back}
              </Control>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
