import { useEffect, useState } from 'react';
import { getJson } from '../lib/api';

/**
 * One reader for every picture of the world: a route path goes through the site's client (live or recorded), an
 * absolute address is fetched as it is. Each picture reads one address.
 */
export async function readJson<T>(address: string): Promise<T> {
  if (/^https?:\/\//.test(address)) {
    const r = await fetch(address);
    if (!r.ok) throw new Error(`${address} answered ${r.status}`);
    return (await r.json()) as T;
  }
  const [path, q] = address.split('?');
  const query: Record<string, string> = {};
  if (q) new URLSearchParams(q).forEach((v, k) => (query[k] = v));
  return getJson<T>(path, query);
}

export type Read<T> = { state: 'loading' } | { state: 'failed'; why: string } | { state: 'ready'; value: T };

// A read that fails is tried again four times, waiting one second more each time (1, 2, 3, 4), before the picture says
// it did not load: a backend that blinks or is busy while a picture opens (or a film's take begins) does not leave it
// empty. A recorded answer that is not held fails the same way each time, so it is said after the tries.
const TRIES = 5;
const PAUSE_MS = 1000;

export function useRead<T>(address: string | null): Read<T> {
  const [s, setS] = useState<Read<T>>({ state: 'loading' });
  useEffect(() => {
    if (!address) return;
    let live = true;
    let timer = 0;
    setS({ state: 'loading' });
    const attempt = (n: number) => {
      readJson<T>(address)
        .then((value) => live && setS({ state: 'ready', value }))
        .catch((e: unknown) => {
          if (!live) return;
          if (n + 1 < TRIES) timer = window.setTimeout(() => attempt(n + 1), PAUSE_MS * (n + 1));
          else setS({ state: 'failed', why: e instanceof Error ? e.message : String(e) });
        });
    };
    attempt(0);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [address]);
  return s;
}
