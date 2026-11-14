import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../ui/useDialogFocus';
import type {
  EvidenceClass,
  EvidenceCount,
  EvidenceDoc,
  EvidenceFire,
  EvidenceFireTest,
  EvidenceMethodId,
  EvidenceNextLook,
  EvidenceScore,
  EvidenceState,
  EvidenceValidation,
} from '../content/evidence';
import '../styles/evidence.css';

export interface EvidenceSheetProps {
  open: boolean;
  onClose: () => void;
  /** The answer of `GET /api/evidence`; null until it arrives, or when it did not. */
  doc: EvidenceDoc | null;
  state: EvidenceState;
  /** Open on a section (the agents' table, from the landing's third part). */
  focus?: 'next_look' | null;
}

const METHODS: readonly EvidenceMethodId[] = ['reconstruction', 'painted_modis', 'overlap_ratio'];
const METHOD_HEAD: Record<EvidenceMethodId, string> = {
  reconstruction: 'Isogon',
  painted_modis: 'Painted MODIS',
  overlap_ratio: 'Overlap ratio',
};
const METHOD_NAME: Record<EvidenceMethodId, string> = {
  reconstruction: 'Isogon',
  painted_modis: 'painted MODIS',
  overlap_ratio: 'overlap ratio',
};
/** The agents' table: the settings in use beside the first. */
const TABLES = [
  { key: 'new', label: 'In use' },
  { key: 'old', label: 'First' },
] as const;

/** One column of a fire's tables: a look on record. */
interface FireColumn {
  key: string;
  label: string;
  test: EvidenceFireTest;
  /** The final look reads at full ink; earlier looks one step quieter. */
  tone: 'new' | 'old';
}

/** Every look on record, in order; a document without them gives the first and the final look. */
function columnsOf(fire: EvidenceFire): FireColumn[] {
  if (Array.isArray(fire.looks) && fire.looks.length > 0) {
    const last = fire.looks.length - 1;
    return fire.looks.map((l, i) => ({ key: `look${l.look}`, label: `Look ${l.look}`, test: l, tone: i === last ? 'new' : 'old' }));
  }
  return [
    { key: 'old', label: 'First look', test: fire.old, tone: 'old' },
    { key: 'new', label: 'Final look', test: fire.new, tone: 'new' },
  ];
}

const TIMES = ['no times', 'once', 'twice', 'three times', 'four times', 'five times'];

const judgedOf = (test: EvidenceFireTest, fallback: number) => test.scores_judged ?? fallback;
const BETTER: Record<EvidenceScore['better'], string> = {
  higher: 'higher is better',
  lower: 'lower is better',
  nearest_one: 'nearest 1 is best',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "a", "a and b", "a, b and c". */
function list(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "22 Jul 21:13" in UTC. */
function utc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

const value = (test: EvidenceFireTest, m: EvidenceMethodId, score: EvidenceScore): number | null => {
  const v = test.scores[m]?.[score.id];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

const fixed4 = (v: number | null) => (v === null ? 'not sent' : v.toFixed(4));
const signed4 = (v: number) => `${v < 0 ? '-' : '+'}${Math.abs(v).toFixed(4)}`;
const count = (c: EvidenceCount | null) => (c === null ? 'none' : `${c.held} of ${c.of}`);

/**
 * Who is ahead on one score, in plain words, at the precision the table shows (four decimals), so "ahead" never
 * names two equal-looking numbers. Every row says it, the rows Isogon loses as plainly as the rows it wins.
 */
function scoreVerdict(score: EvidenceScore, test: EvidenceFireTest): string {
  const ranked = METHODS.flatMap((m) => {
    const v = value(test, m, score);
    if (v === null) return [];
    const shown = Math.round(v * 10000);
    const goodness = score.better === 'higher' ? shown : score.better === 'lower' ? -shown : -Math.abs(shown - 10000);
    return [{ m, goodness }];
  });
  if (ranked.length < 2) return 'Not enough values';
  const best = Math.max(...ranked.map((r) => r.goodness));
  const winners = ranked.filter((r) => r.goodness === best).map((r) => r.m);
  if (winners.length === ranked.length) return 'Tie';
  const remark = test.remarks?.[score.id];
  if (winners.length === 1 && winners[0] === 'reconstruction') return remark ? `Isogon ahead ${remark}` : 'Isogon ahead';
  if (!winners.includes('reconstruction') && winners.length === 2) return 'Both baselines ahead';
  return `${sentence(list(winners.map((m) => METHOD_NAME[m])))} ahead`;
}

/** Intervals are not ranked: each stated interval is read against the level it states. */
function intervalVerdict(test: EvidenceFireTest, level: number): string {
  const stated = METHODS.filter((m) => test.frp_interval[m] !== null);
  if (stated.length === 0) return 'No method states one';
  const kept = stated.filter((m) => {
    const c = test.frp_interval[m];
    return c !== null && c.of > 0 && c.held / c.of >= level - 1e-9;
  });
  const missed = stated.filter((m) => !kept.includes(m));
  const under = `under ${Math.round(level * 100)} percent`;
  if (missed.length === 0) return `${sentence(list(kept.map((m) => METHOD_NAME[m])))} held`;
  if (kept.length === 0) return `${sentence(list(missed.map((m) => METHOD_NAME[m])))} ${under}`;
  return `${sentence(list(kept.map((m) => METHOD_NAME[m])))} held, ${list(missed.map((m) => METHOD_NAME[m]))} ${under}`;
}

function TestFires({ doc }: { doc: EvidenceDoc }) {
  const { fires, scores, interval_level: level, hidden, note, looks = [] } = doc.test_fires;
  const [fireId, setFireId] = useState<string | null>(null);
  const fire: EvidenceFire | null = fires.find((f) => f.region_id === fireId) ?? fires[0] ?? null;
  const pct = Math.round(level * 100);
  const columns = fire ? columnsOf(fire) : [];

  return (
    <section className="iso-evidence__section" aria-labelledby="iso-evidence-fires">
      <h3 id="iso-evidence-fires" className="iso-evidence__heading">
        The blind test on the three 2021 fires
      </h3>
      <p className="iso-evidence__text">
        Isogon hides {hidden}, rebuilds each fire from MODIS alone and scores the rebuild against what was hidden,
        beside two baselines, painted MODIS and the overlap ratio. These fires have been looked at{' '}
        {looks.length > 0 ? `${TIMES[looks.length] ?? `${looks.length} times`}` : 'more than once'}, and every look is shown. The last is {note}.
      </p>
      {looks.length > 0 && (
        <dl className="iso-evidence__looks">
          {looks.map((l) => (
            <div key={l.look}>
              <dt>
                Look {l.look}, protocol version {l.protocol_version}
              </dt>
              <dd>{sentence(l.what)}.</dd>
            </div>
          ))}
        </dl>
      )}
      {fires.length > 0 && (
        <p className="iso-evidence__text">
          On the final look Isogon is ahead of both baselines on{' '}
          {list(
            fires.map(
              (f, i) =>
                `${f.new.ahead_of_both_on} of ${judgedOf(f.new, scores.length)}${i === 0 ? ' scores' : ''} on ${f.name}`,
            ),
          )}{' '}
          ({list(fires.map((f) => String(f.old.ahead_of_both_on)))} on the first).
        </p>
      )}

      {fires.length > 1 && (
        <div className="iso-choice iso-evidence__choice" role="group" aria-label="Test fire">
          <span className="iso-choice__label">Fire</span>
          {fires.map((f) => (
            <button
              key={f.region_id}
              type="button"
              className="iso-choice__opt"
              data-active={String(f === fire)}
              aria-pressed={f === fire}
              onClick={() => setFireId(f.region_id)}
            >
              {sentence(f.name)}
            </button>
          ))}
        </div>
      )}

      {fire && (
        <>
          <div className="iso-evidence__scroll">
            <table className="iso-table iso-table--sheet">
              <thead>
                <tr>
                  <th scope="col">{sentence(fire.name)}</th>
                  {columns.map((t) => (
                    <th key={t.key} scope="col" className="iso-evidence__val">
                      {t.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Window, UTC</th>
                  {columns.map((t) => (
                    <td key={t.key} className="iso-evidence__val" data-test={t.tone}>
                      <span className="iso-evidence__when">{utc(t.test.first_overpass_utc)} to</span>{' '}
                      <span className="iso-evidence__when">{utc(t.test.last_overpass_utc)}</span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Scored overpasses</th>
                  {columns.map((t) => (
                    <td key={t.key} className="iso-evidence__val" data-test={t.tone}>
                      {t.test.scored_overpasses}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Hidden pixels</th>
                  {columns.map((t) => (
                    <td key={t.key} className="iso-evidence__val" data-test={t.tone}>
                      {t.test.hidden_pixels.toLocaleString('en-US')}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Isogon ahead of both</th>
                  {columns.map((t) => (
                    <td key={t.key} className="iso-evidence__val" data-test={t.tone}>
                      {t.test.ahead_of_both_on} of {judgedOf(t.test, scores.length)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="iso-evidence__scroll">
            <table className="iso-table iso-table--sheet">
              <thead>
                <tr>
                  <th scope="col">Score</th>
                  <th scope="col" className="iso-evidence__test">
                    Look
                  </th>
                  {METHODS.map((m) => (
                    <th key={m} scope="col" className="iso-evidence__num">
                      {METHOD_HEAD[m]}
                    </th>
                  ))}
                  <th scope="col" className="iso-evidence__who">
                    Who is ahead
                  </th>
                </tr>
              </thead>
              {scores.map((s) => (
                <tbody key={s.id}>
                  {columns.map((t, i) => (
                    <tr key={t.key} data-test={t.tone}>
                      {i === 0 && (
                        <th scope="rowgroup" rowSpan={columns.length}>
                          {s.label}
                          <span className="iso-evidence__hint">{BETTER[s.better]}</span>
                        </th>
                      )}
                      <td className="iso-evidence__test">{t.label}</td>
                      {METHODS.map((m) => (
                        <td key={m} className="iso-evidence__num">
                          {fixed4(value(t.test, m, s))}
                        </td>
                      ))}
                      <td className="iso-evidence__who">{scoreVerdict(s, t.test)}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
              <tbody>
                {columns.map((t, i) => (
                  <tr key={t.key} data-test={t.tone}>
                    {i === 0 && (
                      <th scope="rowgroup" rowSpan={columns.length}>
                        {pct} percent FRP interval
                        <span className="iso-evidence__hint">overpasses inside it</span>
                      </th>
                    )}
                    <td className="iso-evidence__test">{t.label}</td>
                    {METHODS.map((m) => (
                      <td key={m} className="iso-evidence__num">
                        {count(t.test.frp_interval[m])}
                      </td>
                    ))}
                    <td className="iso-evidence__who">{intervalVerdict(t.test, level)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

const CLASS_WORD: Record<EvidenceClass, string> = { ahead: 'ahead on', tied: 'tied on', behind: 'behind on' };

/** "ahead on CSI within one cell and Brier; tied on ..." for one validated part. */
function partScores(scores: EvidenceValidation['parts'][number]['scores']): string {
  return (['ahead', 'tied', 'behind'] as const)
    .map((c) => ({ c, labels: scores.filter((s) => s.class === c).map((s) => s.label) }))
    .filter((g) => g.labels.length > 0)
    .map((g) => `${CLASS_WORD[g.c]} ${list(g.labels)}`)
    .join('; ');
}

function Validation({ v }: { v: EvidenceValidation }) {
  const ratio = v.frp_interval.of > 0 ? v.frp_interval.held / v.frp_interval.of : null;

  return (
    <section className="iso-evidence__section" aria-labelledby="iso-evidence-validation">
      <h3 id="iso-evidence-validation" className="iso-evidence__heading">
        Validation on other fires
      </h3>
      <p className="iso-evidence__text">
        Fires of {list(v.years.map(String))} decide what is switched on. On {v.episodes} episodes with{' '}
        {v.scored_overpasses} scored overpasses, under protocol version {v.protocol_version}, Isogon is ahead of both
        baselines beyond the noise on {v.classes.ahead} scores, tied on {v.classes.tied} and behind on{' '}
        {v.classes.behind === 0 ? 'none' : v.classes.behind}.
      </p>
      <table className="iso-table iso-table--sheet iso-evidence__parts">
        <tbody>
          <tr>
            <th scope="row">
              Fitted values
              <span className="iso-evidence__hint">{v.fitted_values.note}</span>
            </th>
            <td>{v.fitted_values.status}</td>
          </tr>
          {v.parts.map((p) => (
            <tr key={p.name}>
              <th scope="row">
                {sentence(p.name)}
                <span className="iso-evidence__hint">{partScores(p.scores)}</span>
              </th>
              <td>{p.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="iso-evidence__text">
        The {Math.round(v.frp_interval.stated * 100)} percent FRP interval held for {v.frp_interval.held} of{' '}
        {v.frp_interval.of} overpasses
        {ratio !== null ? ` (${ratio.toFixed(3)} against a stated ${v.frp_interval.stated.toFixed(2)})` : ''}.
      </p>
    </section>
  );
}

function NextLook({ n }: { n: EvidenceNextLook }) {
  return (
    <section className="iso-evidence__section" aria-labelledby="iso-evidence-next">
      <h3 id="iso-evidence-next" className="iso-evidence__heading">
        Choosing where to look next
      </h3>
      <p className="iso-evidence__text">
        In the next-look game an agent may uncover the hidden VIIRS {TIMES[n.looks] ?? `${n.looks} times`}, each time in one tile of a{' '}
        {n.tiles_per_side} by {n.tiles_per_side} grid at one scheduled pass, and is scored on the {n.score} of what
        stays hidden{n.reward ? `; a look is rewarded with the ${n.reward}` : ''}. It is played on{' '}
        {n.test_episodes.new} test episodes ({n.test_episodes.old} in the first table), windows of the three test
        fires{n.not_the_same_game_twice ? `. This table is a ${n.not_the_same_game_twice.replace(/\.\s*$/, '')}` : ''}.
      </p>
      <div className="iso-evidence__scroll">
        <table className="iso-table iso-table--sheet">
          <thead>
            <tr>
              <th scope="col">Agent</th>
              <th scope="col" className="iso-evidence__test">
                Table
              </th>
              <th scope="col" className="iso-evidence__num">
                Mean final
              </th>
              <th scope="col" className="iso-evidence__num">
                Mean gain
              </th>
              <th scope="col" className="iso-evidence__num">
                Share of the oracle&apos;s gain
              </th>
            </tr>
          </thead>
          {n.agents.map((a) => (
            <tbody key={a.id}>
              {TABLES.map((t, i) => (
                <tr key={t.key} data-test={t.key}>
                  {i === 0 && (
                    <th scope="rowgroup" rowSpan={TABLES.length}>
                      {a.label}
                      <span className="iso-evidence__hint">{a.does}</span>
                    </th>
                  )}
                  <td className="iso-evidence__test">{t.label}</td>
                  <td className="iso-evidence__num">{a[t.key].mean_final.toFixed(4)}</td>
                  <td className="iso-evidence__num">{signed4(a[t.key].mean_gain)}</td>
                  <td className="iso-evidence__num">{a[t.key].share_of_oracle_gain.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="iso-evidence__text">
        The mean start score, before any look, is {n.mean_start_score.new.toFixed(4)} (
        {n.mean_start_score.old.toFixed(4)} in the first). {n.holds_in_both}
      </p>
    </section>
  );
}

/**
 * The evidence sheet: every look at the three 2021 test fires, what the first protocol let the hidden instrument
 * decide, the validation verdict per part, the next-look reference table and the limits, all from one `EvidenceDoc`
 * (GET /api/evidence). Until the route answers, or when it does not, no figure is shown. Escape closes it.
 */
export function EvidenceSheet({ open, onClose, doc, state, focus = null }: EvidenceSheetProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus(open, sheetRef, closeRef);

  useEffect(() => {
    if (!open || focus !== 'next_look' || !doc) return;
    const t = window.setTimeout(() => document.getElementById('iso-evidence-next')?.scrollIntoView({ block: 'start' }), 60);
    return () => window.clearTimeout(t);
  }, [open, focus, doc]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="iso-backdrop iso-backdrop--center" onClick={onClose} role="presentation">
      <div
        ref={sheetRef}
        className="iso-sheet iso-evidence"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="iso-evidence-title"
      >
        <div className="iso-sheet__head">
          <div className="iso-evidence__name">
            <h2 id="iso-evidence-title" className="iso-sheet__title">
              Evidence
            </h2>
            {doc && <span className="iso-evidence__source">NASA FIRMS</span>}
          </div>
          <button ref={closeRef} type="button" className="iso-key" onClick={onClose}>
            <kbd>Esc</kbd>
            <span>Close</span>
          </button>
        </div>

        <p className="iso-sheet__lede">
          {!doc
            ? state === 'failed'
              ? 'The evidence route did not answer, so no figure is shown.'
              : 'Waiting for the evidence route.'
            : 'Results as the backend reports them.'}
        </p>

        {doc && <EvidenceBody doc={doc} />}
      </div>
    </div>
  );
}

function EvidenceBody({ doc }: { doc: EvidenceDoc }) {
  return (
    <>
        <TestFires doc={doc} />

        <section className="iso-evidence__section" aria-labelledby="iso-evidence-audit">
          <h3 id="iso-evidence-audit" className="iso-evidence__heading">
            What the first protocol let through
          </h3>
          <p className="iso-evidence__text">{doc.audit}</p>
        </section>

        <Validation v={doc.validation} />

        <NextLook n={doc.next_look} />

        {doc.limits.length > 0 && (
          <section className="iso-evidence__section" aria-labelledby="iso-evidence-limits">
            <h3 id="iso-evidence-limits" className="iso-evidence__heading">
              What is weak
            </h3>
            <ol className="iso-evidence__limits">
              {doc.limits.map((l, i) => (
                <li key={l}>
                  <span className="iso-evidence__limit-num">{i + 1}</span>
                  <span>{l}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
    </>
  );
}
