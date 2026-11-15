import { useMemo, useState } from 'react';
import { localDayRange } from '../guide/formats';
import { countryAt } from './countryAt';
import { placeLabels } from './labels';
import type { Box } from './projection';
import { useRead } from './read';
import { WorldCanvas } from './WorldCanvas';
import '../styles/world.css';

/**
 * The test across the world: one mark per tested fire, where it burned. A mark is a square filled from the bottom by
 * the share of the scores on which the estimate beat both simple methods, so a fire it lost on is an empty square,
 * drawn the same size and the same ink as a fire it won on. Beside the Earth, the fires counted by that number, every
 * column drawn, the empty ones too. A fire's own figures open on demand at its mark. It reads one answer (`source`).
 */

export interface TestFire {
  id: string;
  name: string | null;
  box: Box;
  continent: string | null;
  zone: string | null;
  first: string | null;
  last: string | null;
  ahead: number;
  judged: number;
  aheadOn: string[];
  /** A recorded test fire: its record is shown and it is never scored again. */
  closed: boolean;
}

export interface WorldTestAnswer {
  look: string | null;
  what: string | null;
  scoreLabels: Record<string, string>;
  fires: TestFire[];
  notScored: Array<{ id: string; reason: string | null }>;
  example: string | null;
}

type Obj = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function parseWorldTest(body: unknown): WorldTestAnswer {
  const o = (body ?? {}) as Obj;
  const labels: Record<string, string> = {};
  for (const s of arr(o.scores)) {
    const x = s as Obj;
    if (str(x.id) && str(x.label)) labels[str(x.id)!] = str(x.label)!;
  }
  const fires = arr(o.fires).flatMap((f): TestFire[] => {
    const x = f as Obj;
    const b = arr(x.box).map(num);
    const ahead = num(x.ahead_of_both_on);
    const judged = num(x.scores_judged ?? x.judged);
    if (b.length !== 4 || b.some((v) => v === null) || ahead === null || judged === null || !str(x.id)) return [];
    return [
      {
        id: str(x.id)!,
        name: str(x.name),
        box: b as Box,
        continent: str(x.continent),
        zone: str(x.zone),
        first: str(x.first_overpass_utc),
        last: str(x.last_overpass_utc),
        ahead,
        judged,
        aheadOn: arr(x.ahead_on).filter((v): v is string => typeof v === 'string'),
        closed: x.closed === true,
      },
    ];
  });
  return {
    look: str(o.look),
    what: str(o.what),
    scoreLabels: labels,
    fires,
    notScored: arr(o.not_scored).map((n) => ({ id: str((n as Obj).id) ?? '', reason: str((n as Obj).reason) })),
    example: str(o.example),
  };
}

export const TEST_WORDS = {
  label: 'The Earth, with every fire the estimate was tested on',
  loading: 'Loading the test across the world.',
  failed: 'The test across the world did not load.',
  none: 'No fire has been tested across the world yet.',
  tallyTitle: (n: number) => (n === 1 ? 'One fire, by how many scores the estimate won' : `${n} fires, by how many scores the estimate won`),
  tallyAxis: (of: number) => `Scores ahead of both simple methods, of ${of}`,
  tallyKey: 'A full square: ahead on every score. An empty square: ahead on none.',
  count: (n: number) => (n === 1 ? '1 fire' : `${n} fires`),
  ahead: (a: number, of: number) => `Ahead of both simple methods on ${a} of ${of} scores`,
  on: (labels: string[]) => (labels.length ? `Ahead on: ${labels.join(', ')}` : 'Ahead on no score'),
  closed: 'A recorded test fire: its record is shown, and it is never scored again.',
  notScored: (n: number) => (n === 1 ? 'One chosen fire could not be scored; the reason is in the record.' : `${n} chosen fires could not be scored; the reasons are in the record.`),
};

function gaugeStyle(a: number, of: number): React.CSSProperties {
  return { ['--fill' as string]: `${of > 0 ? (a / of) * 100 : 0}%` };
}

export function WorldTest({ source }: { source: string }) {
  const read = useRead<unknown>(source);
  const ans = read.state === 'ready' ? parseWorldTest(read.value) : null;
  const [open, setOpen] = useState<string | null>(null);
  const of = useMemo(() => (ans && ans.fires.length ? Math.max(...ans.fires.map((f) => f.judged)) : 7), [ans]);
  const tally = useMemo(() => {
    const t = Array.from({ length: of + 1 }, () => 0);
    for (const f of ans?.fires ?? []) t[Math.min(f.ahead, of)] += 1;
    return t;
  }, [ans, of]);

  if (read.state === 'loading') return <div className="world-sealed world-sealed--note">{TEST_WORDS.loading}</div>;
  if (read.state === 'failed' || !ans) return <div className="world-sealed world-sealed--note">{TEST_WORDS.failed}</div>;
  if (!ans.fires.length) return <div className="world-sealed world-sealed--note">{TEST_WORDS.none}</div>;
  const most = Math.max(1, ...tally);

  return (
    <div className="world-earth">
      <WorldCanvas label={TEST_WORDS.label} onClickMap={() => setOpen(null)}>
        {(p) => {
          const items = ans.fires.map((f) => {
            const [x, y] = p.at((f.box[0] + f.box[2]) / 2, (f.box[1] + f.box[3]) / 2);
            return { id: f.id, x, y, text: f.name ?? '', rank: f.closed ? 0 : 1 };
          });
          const labelled = items.filter((i) => i.text);
          const placed = placeLabels(labelled, p.w, p.h);
          return (
            <>
              <svg className="world-leaders" width={p.w} height={p.h} aria-hidden="true">
                {placed.map((l) => (l.shown ? <line key={l.id} x1={l.from[0]} y1={l.from[1]} x2={l.to[0]} y2={l.to[1]} /> : null))}
              </svg>
              {ans.fires.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  data-world-ui
                  className="world-gauge"
                  data-open={open === f.id ? 'true' : 'false'}
                  style={{ left: items[i].x, top: items[i].y, ...gaugeStyle(f.ahead, f.judged) }}
                  aria-label={`${f.name ?? countryAt((f.box[0] + f.box[2]) / 2, (f.box[1] + f.box[3]) / 2) ?? f.id}: ${TEST_WORDS.ahead(f.ahead, f.judged)}`}
                  onClick={() => setOpen((o) => (o === f.id ? null : f.id))}
                />
              ))}
              {placed.map((l, i) =>
                l.shown && open !== labelled[i].id ? (
                  <span key={l.id} className="world-label" style={{ left: l.left, top: l.top }}>
                    {labelled[i].text}
                  </span>
                ) : null,
              )}
              {open &&
                (() => {
                  const f = ans.fires.find((x) => x.id === open)!;
                  const [x, y] = p.at((f.box[0] + f.box[2]) / 2, (f.box[1] + f.box[3]) / 2);
                  const lon = (f.box[0] + f.box[2]) / 2;
                  const right = x < p.w * 0.6;
                  const where = [countryAt(lon, (f.box[1] + f.box[3]) / 2), f.zone].filter(Boolean).join(', ');
                  return (
                    <div data-world-ui className="world-card sys-plate" style={right ? { left: x + 20, top: Math.max(12, y - 30) } : { right: p.w - x + 20, top: Math.max(12, y - 30) }}>
                      <div className="world-card__title">{f.name ?? where}</div>
                      <div className="world-board__sub">{[f.name ? where : null, localDayRange(f.first, f.last, lon)].filter(Boolean).join(', ')}</div>
                      <div className="world-card__line">{TEST_WORDS.ahead(f.ahead, f.judged)}</div>
                      <div className="world-board__sub">{TEST_WORDS.on(f.aheadOn.map((id) => ans.scoreLabels[id] ?? id))}</div>
                      {f.closed && <div className="world-board__sub">{TEST_WORDS.closed}</div>}
                    </div>
                  );
                })()}
            </>
          );
        }}
      </WorldCanvas>
      <div className="world-legend world-tally" data-world-ui>
        <div className="world-legend__line">{TEST_WORDS.tallyTitle(ans.fires.length)}</div>
        {ans.example && <div className="world-legend__fine world-legend__caution">{ans.example}</div>}
        <div className="world-tally__cols" style={{ gridTemplateColumns: `repeat(${of + 1}, 1fr)` }}>
          {tally.map((n, k) => (
            <div key={k} className="world-tally__col">
              <span className="world-tally__n">{n}</span>
              <span className="world-tally__bar" style={{ height: `${(n / most) * 56}px` }} data-zero={n === 0 ? 'true' : 'false'} />
              <span className="world-gauge world-gauge--key" style={gaugeStyle(k, of)} aria-hidden="true" />
              <span className="world-tally__k">{k}</span>
            </div>
          ))}
        </div>
        <div className="world-legend__fine">{TEST_WORDS.tallyAxis(of)}</div>
        <div className="world-legend__fine">{TEST_WORDS.tallyKey}</div>
        {ans.notScored.length > 0 && <div className="world-legend__fine">{TEST_WORDS.notScored(ans.notScored.length)}</div>}
      </div>
    </div>
  );
}
