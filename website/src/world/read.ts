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

export function useRead<T>(address: string | null): Read<T> {
  const [s, setS] = useState<Read<T>>({ state: 'loading' });
  useEffect(() => {
    if (!address) return;
    let live = true;
    setS({ state: 'loading' });
    readJson<T>(address)
      .then((value) => live && setS({ state: 'ready', value }))
      .catch((e: unknown) => live && setS({ state: 'failed', why: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
  }, [address]);
  return s;
}
