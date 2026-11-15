import '../styles/loader.css';

export interface LoaderProps {
  /** Plain status sentence shown while waiting on real data. */
  line?: string;
  /** Full dark viewport (`screen`) or inline inside a sheet or region (`inline`). */
  surface?: 'screen' | 'inline';
}

const DEFAULT_LINE = 'Loading real fire detections from NASA satellites';

export function Loader({ line = DEFAULT_LINE, surface = 'screen' }: LoaderProps) {
  return (
    <div
      className={`iso-loader ${surface === 'inline' ? 'iso-loader--inline' : 'iso-loader--screen'}`}
      role="status"
      aria-live="polite"
      data-surface={surface}
    >
      <p className="iso-loader__line">{line}</p>
    </div>
  );
}
