import type { ReactNode } from 'react';
import { useAssetUrl } from './useAssetUrl';

/**
 * A download link to a route's file, through the page's client: the route when the page is live, the recorded file on
 * the public page, and nothing at all when the recording does not hold it.
 */
export function RouteLink({ path, className, title, children }: { path: string; className?: string; title?: string; children: ReactNode }) {
  const href = useAssetUrl(path);
  if (!href) return null;
  return (
    <a className={className} href={href} download title={title}>
      {children}
    </a>
  );
}
