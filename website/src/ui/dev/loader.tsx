/*
 * Development story for Loader, served at /src/ui/dev/loader.html.
 *
 *   ?line=Loading+this+fire's+satellite+passes   override the status line
 *   ?surface=inline                              render inline inside a quiet frame
 */
import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../../styles/tokens.css';
import '../../styles/system.css';
import { Loader } from '../Loader';

const params = new URLSearchParams(window.location.search);
const initialLine = params.get('line') ?? "Loading this fire's satellite passes";
const initialSurface = params.get('surface') === 'inline' ? 'inline' : 'screen';

const PRESETS = [
  "Loading this fire's satellite passes",
  'Loading real fire detections from NASA satellites',
  'Loading every test on record',
];

function LoaderStory() {
  const [line, setLine] = useState(initialLine);
  const [surface, setSurface] = useState<'screen' | 'inline'>(initialSurface);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--sys-night)' }}>
      {surface === 'screen' ? (
        <Loader line={line} surface="screen" />
      ) : (
        <div style={{ padding: 'var(--sys-s8) var(--sys-s7)' }}>
          <div className="sys-title" style={{ marginBottom: 'var(--sys-s3)' }}>
            Inline loader inside a sheet
          </div>
          <Loader line={line} surface="inline" />
        </div>
      )}

      {params.get('controls') === '1' && (
        <div
          style={{
            position: 'fixed',
            left: 'var(--sys-s5)',
            bottom: 'var(--sys-s5)',
            zIndex: 90,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--sys-s4)',
            alignItems: 'baseline',
          }}
        >
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="sys-ctl"
              onClick={() => setLine(preset)}
              style={{ fontWeight: line === preset ? 'var(--sys-weight-strong)' : 'var(--sys-weight)' }}
            >
              {preset}
            </button>
          ))}
          <button
            type="button"
            className="sys-ctl"
            onClick={() => setSurface((s) => (s === 'screen' ? 'inline' : 'screen'))}
          >
            {surface === 'screen' ? 'Show inline' : 'Show full screen'}
          </button>
        </div>
      )}
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<LoaderStory />);
}
