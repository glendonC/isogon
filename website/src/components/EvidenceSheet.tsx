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
  EvidenceValidation,
} from '../content/demo/evidence';
import '../styles/evidence.css';

export interface EvidenceSheetProps {
  open: boolean;
  onClose: () => void;
  doc: EvidenceDoc;
  /** `demo` reads content/demo/evidence.ts; `live` is `GET /api/evidence`. The label beside the title says which. */
  source: 'demo' | 'live';
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
const TESTS = [
  { key: 'new', label: 'Corrected' },
  { key: 'old', label: 'First' },
] as const;
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
  const { fires, scores, interval_level: level, hidden, note } = doc.test_fires;
  const [fireId, setFireId] = useState<string | null>(null);
  const fire: EvidenceFire | null = fires.find((f) => f.region_id === fireId) ?? fires[0] ?? null;
  const pct = Math.round(level * 100);

  return (
    <section className="iso-evidence__section" aria-labelledby="iso-evidence-fires">
      <h3 id="iso-evidence-fires" className="iso-evidence__heading">
        The blind test on the three 2021 fires
      </h3>
      <p className="iso-evidence__text">
        Isogon hides {hidden}, rebuilds each fire from MODIS alone and scores the rebuild against what was hidden,
        beside two baselines, painted MODIS and the overlap ratio. Each row shows the corrected test (protocol
        version {fire?.new.protocol_version ?? 2}) above the first (version {fire?.old.protocol_version ?? 1}).
        These fires were scored once before, so this is {note}.
      </p>
      {fires.length > 0 && (
        <p className="iso-evidence__text">
          Under the corrected test Isogon is ahead of both baselines on{' '}
          {list(
            fires.map(
              (f, i) => `${f.new.ahead_of_both_on} of ${scores.length}${i === 0 ? ' scores' : ''} on ${f.name}`,
            ),
          )}{' '}
          ({list(fires.map((f) => String(f.old.ahead_of_both_on)))} under the first).
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
                  {TESTS.map((t) => (
                    <th key={t.key} scope="col" className="iso-evidence__val">
                      {t.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Window, UTC</th>
                  {TESTS.map((t) => (
                    <td key={t.key} className="iso-evidence__val" data-test={t.key}>
                      <span className="iso-evidence__when">{utc(fire[t.key].first_overpass_utc)} to</span>{' '}
                      <span className="iso-evidence__when">{utc(fire[t.key].last_overpass_utc)}</span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Scored overpasses</th>
                  {TESTS.map((t) => (
                    <td key={t.key} className="iso-evidence__val" data-test={t.key}>
                      {fire[t.key].scored_overpasses}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Hidden pixels</th>
                  {TESTS.map((t) => (
                    <td key={t.key} className="iso-evidence__val" data-test={t.key}>
                      {fire[t.key].hidden_pixels.toLocaleString('en-US')}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Isogon ahead of both</th>
                  {TESTS.map((t) => (
                    <td key={t.key} className="iso-evidence__val" data-test={t.key}>
                      {fire[t.key].ahead_of_both_on} of {scores.length}
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
                    Test
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
                  {TESTS.map((t, i) => (
                    <tr key={t.key} data-test={t.key}>
                      {i === 0 && (
                        <th scope="rowgroup" rowSpan={TESTS.length}>
                          {s.label}
                          <span className="iso-evidence__hint">{BETTER[s.better]}</span>
                        </th>
                      )}
                      <td className="iso-evidence__test">{t.label}</td>
                      {METHODS.map((m) => (
                        <td key={m} className="iso-evidence__num">
                          {fixed4(value(fire[t.key], m, s))}
                        </td>
                      ))}
                      <td className="iso-evidence__who">{scoreVerdict(s, fire[t.key])}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
              <tbody>
                {TESTS.map((t, i) => (
                  <tr key={t.key} data-test={t.key}>
                    {i === 0 && (
                      <th scope="rowgroup" rowSpan={TESTS.length}>
                        {pct} percent FRP interval
                        <span className="iso-evidence__hint">overpasses inside it</span>
                      </th>
                    )}
                    <td className="iso-evidence__test">{t.label}</td>
                    {METHODS.map((m) => (
                      <td key={m} className="iso-evidence__num">
                        {count(fire[t.key].frp_interval[m])}
                      </td>
                    ))}
                    <td className="iso-evidence__who">{intervalVerdict(fire[t.key], level)}</td>
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
        {v.scored_overpasses} scored overpasses, under the corrected test, Isogon is ahead of both baselines beyond
        the noise on {v.classes.ahead} scores, tied on {v.classes.tied} and behind on{' '}
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
        In the next-look game an agent may uncover the hidden VIIRS {n.looks} times, each time in one tile of a{' '}
        {n.tiles_per_side} by {n.tiles_per_side} grid at one scheduled pass, and is scored on the {n.score} of what
        stays hidden. It is played on {n.test_episodes.new} test episodes ({n.test_episodes.old} under the first
        test), windows of the three test fires, so this too is a second look.
      </p>
      <div className="iso-evidence__scroll">
        <table className="iso-table iso-table--sheet">
          <thead>
            <tr>
              <th scope="col">Agent</th>
              <th scope="col" className="iso-evidence__test">
                Test
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
              {TESTS.map((t, i) => (
                <tr key={t.key} data-test={t.key}>
                  {i === 0 && (
                    <th scope="rowgroup" rowSpan={TESTS.length}>
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
        {n.mean_start_score.old.toFixed(4)} under the first). {n.holds_in_both}
      </p>
    </section>
  );
}

/**
 * The evidence sheet (S2): the blind test on the three 2021 test fires under the corrected protocol beside the
 * first, what the outside audit found, the validation verdict per part, the next-look reference table and the
 * limits, all from one `EvidenceDoc` (GET /api/evidence, or its demo stand-in). Opened from the workspace; Escape
 * closes it.
 */
export function EvidenceSheet({ open, onClose, doc, source }: EvidenceSheetProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus(open, sheetRef, closeRef);

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
            <span className="iso-evidence__source">{source === 'demo' ? 'Demo data' : 'NASA FIRMS'}</span>
          </div>
          <button ref={closeRef} type="button" className="iso-key" onClick={onClose}>
            <kbd>Esc</kbd>
            <span>Close</span>
          </button>
        </div>

        <p className="iso-sheet__lede">
          {source === 'demo'
            ? `Real results from fire-model unit ${doc.unit} (commit ${doc.commit}), shown as a stand-in until the backend publishes this sheet.`
            : `Results from fire-model unit ${doc.unit}, commit ${doc.commit}.`}
        </p>

        <TestFires doc={doc} />

        <section className="iso-evidence__section" aria-labelledby="iso-evidence-audit">
          <h3 id="iso-evidence-audit" className="iso-evidence__heading">
            What the outside audit found
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
              {doc.limits.slice(0, 5).map((l, i) => (
                <li key={l}>
                  <span className="iso-evidence__limit-num">{i + 1}</span>
                  <span>{l}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
