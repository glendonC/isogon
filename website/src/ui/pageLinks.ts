import { useSyncExternalStore } from 'react';

/**
 * The page's few words at the right of every top bar (Search, Method, Sources), published once by the page so a screen
 * drawn from another folder (the pictures of the world) gives its bar the same: `links={usePageLinks()}`.
 */
export interface PageLink {
  label: string;
  onClick: () => void;
}

let links: PageLink[] = [];
const listeners = new Set<() => void>();

/** The page sets its links (App.tsx, once they are made). */
export function setPageLinks(next: PageLink[]): void {
  links = next;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The page's links for a top bar; empty until the page has set them. */
export function usePageLinks(): PageLink[] {
  return useSyncExternalStore(subscribe, () => links, () => links);
}
