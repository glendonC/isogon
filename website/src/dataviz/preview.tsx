/**
 * Every data display on live data, for the lanes that mount them: served by the dev server at
 * /src/dataviz/preview.html, never part of the build. It reads the routes the page reads.
 */
import { StrictMode, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/system.css';
import './dataviz.css';
import { API_BASE } from '../lib/api';
import { LiveTable } from './LiveTable';
import { OverlapBars } from './OverlapBars';
import { RecordGrid } from './RecordGrid';
import { YearBars } from './YearBars';
import { rowsFromLive } from './liveRows';
import { seriesFromCube } from './yearSeries';
import { overlapFromEvidence } from './overlapRows';
import { cellsFromCalendar, heldOutFromCalendar } from './recordCells';

function useJson(path: string): unknown {
  const [data, setData] = useState<unknown>(null);
  useEffect(() => {
    let live = true;
    fetch(`${API_BASE}${path}`)
      .then((r) => r.json())
      .then((j) => live && setData(j))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [path]);
  return data;
}

function Screen({ children }: { children: ReactNode }) {
  return <section style={{ width: 1440, height: 900, boxSizing: 'border-box', padding: '140px 40px 40px', position: 'relative' }}>{children}</section>;
}

function Preview() {
  const calendar = useJson('/api/calendar?region_id=plumas_ca&source=firms');
  const evidence = useJson('/api/evidence');
  const [picked, setPicked] = useState('2012-08');
  const record = cellsFromCalendar(calendar);
  const overlap = overlapFromEvidence(evidence);
  const years = seriesFromCube(useJson('/api/cube/years'));
  const live = rowsFromLive(useJson('/api/live'));
  return (
    <main style={{ color: 'var(--dv-ink)', fontFamily: 'var(--dv-font)', background: 'var(--dv-ground)' }}>
      <Screen>
        <div style={{ marginLeft: 260 }}>{record ? <RecordGrid record={record} selected={picked} onPick={setPicked} heldOut={heldOutFromCalendar(calendar)} /> : null}</div>
      </Screen>
      <Screen>{overlap ? <OverlapBars overlap={overlap} /> : null}</Screen>
      <Screen>
        {years ? <YearBars series={years} upTo={2012} current={2012} /> : null}
        <div style={{ height: 60 }} />
        {years ? <YearBars series={years} oneScale /> : null}
      </Screen>
      <Screen>{live ? <LiveTable table={live} /> : null}</Screen>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
