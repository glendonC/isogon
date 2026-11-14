import { useEffect, useState } from 'react';
import { assetUrl } from './api';

/**
 * The address of a route's file for a link (a CSV, a GeoJSON), through the page's client: the route itself when the
 * page is live, the recorded file on the public page, or null when the recording does not hold it (the link is then
 * left out).
 */
export function useAssetUrl(path: string | null): string | null {
  const [hit, setHit] = useState<{ path: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!path) return;
    let live = true;
    assetUrl(path)
      .then((url) => live && setHit({ path, url }))
      .catch(() => live && setHit({ path, url: null }));
    return () => {
      live = false;
    };
  }, [path]);
  return path && hit?.path === path ? hit.url : null;
}
