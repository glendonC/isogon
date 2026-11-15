import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { OverlapEvidence } from '../content/calendar';
import type {
  EvidenceDoc,
  EvidenceFire,
  EvidenceFireTest,
  EvidenceMethodId,
  EvidenceScore,
  EvidenceState,
} from '../content/evidence';
import { utcSpan, type BlindTest, type ModelStatus } from '../content/realRuns';
import { API_BASE, getJson } from '../lib/api';
import { SensorDiagnosticModal } from '../stage/SensorDiagnosticModal';
import { Loader } from '../ui/Loader';
import type { SensorModelPayload } from '../ui/useSensorModel';
import {
  AlignedNumber,
  ScoresDocument,
  SideSheet,
  formatCountNone,
  formatCountWord,
  formatListAnd,
  formatSheetCount,
  formatSignedPoints,
  useOptionalWorkspace,
  type ViewerDocId,
  type ViewerNavItem,
} from './BlindScoreTable';
import { MethodDocument, ThisFireDocument, type MethodEvidence } from './MethodSheet';
import { SourcesSheet } from './SourcesSheet';
import '../styles/evidence.css';

export interface EvidenceSheetProps {
  open: boolean;
  onClose: () => void;
  /** The answer of `GET /api/evidence`; null until it arrives, or when it did not. */
  doc: EvidenceDoc | null;
  state: EvidenceState;
  /** Open on a section (the players' table, from the landing or Play). */
  focus?: 'next_look' | null;
}

interface ValidationAgentRuntime {
  id: string;
  label?: string;
  does?: string;
  mean_gain: number;
}

interface DiffIntervalRuntime {
  mean_difference: number;
  p05: number;
  p95: number;
}

interface OnValidationRuntime {
  episodes: number;
  budget: number;
  agents: ValidationAgentRuntime[];
  differences?: {
    learned_minus_least_sure?: DiffIntervalRuntime;
  };
}

const PLAIN_SCORE_META: Record<
  string,
  { name: string; measures: string; format: 'percent' | 'three_decimals' | 'ratio' }
> = {
  csi_strict_375m: {
    name: 'Agreement',
    measures: 'Share of burning squares that both the estimate and the sharp satellite mark. Higher is better.',
    format: 'percent',
  },
  csi_one_cell_tolerance: {
    name: 'Agreement, give or take one square',
    measures: 'The same share when a neighbouring square also counts. Higher is better.',
    format: 'percent',
  },
  hit_rate_at_equal_area: {
    name: 'Hits with the same number of squares',
    measures: 'Share of hidden burning squares hit when each method marks the same area. Higher is better.',
    format: 'percent',
  },
  brier: {
    name: 'The stated chance of fire',
    measures: 'Average squared gap between stated burn chance and what the sharp satellite saw. Lower is better.',
    format: 'three_decimals',
  },
  pixel_ratio_of_sums: {
    name: 'Detections, expected over real',
    measures: 'Ratio of expected detections to what the sharp satellite made; 1.00 is exact.',
    format: 'ratio',
  },
  frp_ratio_of_sums: {
    name: 'Heat in all, expected over real',
    measures: 'Ratio of expected total heat to what the sharp satellite measured; 1.00 is exact.',
    format: 'ratio',
  },
  frp_median_abs_relative_error: {
    name: 'How much heat, pass by pass',
    measures: 'Typical relative miss on one pass at a time. Lower is better.',
    format: 'percent',
  },
};

const PLAYER_ROWS: ReadonlyArray<{
  id: string;
  name: string;
  means: string;
  role: 'other' | 'rule' | 'learned';
}> = [
  {
    id: 'random',
    name: 'Chance',
    means: 'Looks at random squares.',
    role: 'other',
  },
  {
    id: 'latest_modis',
    name: 'Follow the Coarse Satellite',
    means: 'Looks where the coarse satellite last saw the most fire.',
    role: 'other',
  },
  {
    id: 'least_sure',
    name: 'Look Where Unsure',
    means: 'Looks where the model is least sure.',
    role: 'rule',
  },
  {
    id: 'learned',
    name: 'Learned Player',
    means: 'Learned from past fires where to look and at which pass.',
    role: 'learned',
  },
  {
    id: 'oracle',
    name: 'Sees the Answer',
    means: 'Is allowed to see the answer and takes the best square at evenly spaced passes. A player that also chooses its pass can gain more.',
    role: 'other',
  },
];

const LOOKS_EXPLAINED: readonly string[] = [
  "The first look: the hidden satellite's own passes still decided which days were scored and how large a square counted.",
  'The second look: a correction of the rules, so that the days are chosen without the hidden satellite.',
  "The final look: taken once, with the rules and the model's values fixed beforehand, at every real pass of the sharp satellite.",
];

const capFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function readOnValidation(doc: EvidenceDoc): OnValidationRuntime | null {
  const nl = doc.next_look as unknown as Record<string, unknown>;
  const ov = nl?.on_validation;
  if (!ov || typeof ov !== 'object' || Array.isArray(ov)) return null;
  const rec = ov as Record<string, unknown>;
  if (typeof rec.episodes !== 'number' || typeof rec.budget !== 'number' || !Array.isArray(rec.agents)) {
    return null;
  }
  return rec as unknown as OnValidationRuntime;
}

function didEstimateWinScore(fireTest: EvidenceFireTest, score: EvidenceScore): boolean {
  const recWithList = fireTest as unknown as { ahead_on?: unknown };
  if (Array.isArray(recWithList.ahead_on)) {
    return recWithList.ahead_on.includes(score.id);
  }
  const r = fireTest.scores.reconstruction?.[score.id];
  const pm = fireTest.scores.painted_modis?.[score.id];
  const or = fireTest.scores.overlap_ratio?.[score.id];
  if (typeof r !== 'number' || typeof pm !== 'number' || typeof or !== 'number') return false;
  if (score.better === 'higher') return r > pm && r > or;
  if (score.better === 'lower') return r < pm && r < or;
  return Math.abs(r - 1) < Math.abs(pm - 1) && Math.abs(r - 1) < Math.abs(or - 1);
}

function formatTestFireCell(score: EvidenceScore, val: number | undefined): {
  intPart: string;
  fracPart: string;
  unit: string;
} | null {
  if (typeof val !== 'number' || !Number.isFinite(val)) return null;
  const meta = PLAIN_SCORE_META[score.id];
  const fmt = meta?.format ?? (score.better === 'nearest_one' ? 'ratio' : 'percent');
  if (fmt === 'three_decimals') {
    const [i, f] = val.toFixed(3).split('.');
    return { intPart: i, fracPart: f ? `.${f}` : '', unit: '' };
  }
  if (fmt === 'ratio') {
    const [i, f] = val.toFixed(2).split('.');
    return { intPart: i, fracPart: f ? `.${f}` : '', unit: 'x' };
  }
  return { intPart: String(Math.round(val * 100)), fracPart: '', unit: '%' };
}

function splitPointsCell(signedPts: string): { intPart: string; fracPart: string; unit: string } {
  const [i, f] = signedPts.split('.');
  return { intPart: i, fracPart: f ? `.${f}` : '', unit: '' };
}

function PerFireDetailTable({
  fires,
  scores,
}: {
  fires: readonly EvidenceFire[];
  scores: readonly EvidenceScore[];
}) {
  const [selectedId, setSelectedId] = useState<string>(fires[0]?.region_id ?? '');
  const fire = fires.find((f) => f.region_id === selectedId) ?? fires[0] ?? null;
  if (!fire) return null;

  const methods: ReadonlyArray<{ id: EvidenceMethodId; label: string }> = [
    { id: 'reconstruction', label: 'The estimate' },
    { id: 'painted_modis', label: 'Coarse squares as they are' },
    { id: 'overlap_ratio', label: 'Coarse squares, scaled up' },
  ];

  return (
    <div className="iso-doc-section">
      <div className="iso-plain-actions" role="group" aria-label="Choose test fire">
        {fires.map((f) => {
          const active = f.region_id === fire.region_id;
          return (
            <button
              key={f.region_id}
              type="button"
              className="iso-plain-action"
              data-primary={active ? 'true' : 'false'}
              aria-pressed={active}
              onClick={() => setSelectedId(f.region_id)}
            >
              <span>{f.name}</span>
              <span className="iso-plain-action__key">
                {f.new.ahead_of_both_on}/{f.new.scores_judged ?? scores.length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="iso-doc-table-wrap">
        <table className="iso-doc-table">
          <thead>
            <tr>
              <th scope="col">All {scores.length} scores on {fire.name} (final look)</th>
              {methods.map((m) => (
                <th key={m.id} scope="col" className="is-num">
                  {m.label}
                </th>
              ))}
              <th scope="col" className="is-verdict">
                Won by
              </th>
            </tr>
          </thead>
          <tbody>
            {scores.map((s) => {
              const meta = PLAIN_SCORE_META[s.id];
              const won = didEstimateWinScore(fire.new, s);
              const pm = fire.new.scores.painted_modis?.[s.id];
              const or = fire.new.scores.overlap_ratio?.[s.id];
              let winnerText = 'The estimate';
              if (!won) {
                if (typeof pm === 'number' && typeof or === 'number') {
                  if (pm === or) winnerText = 'Both simple methods';
                  else {
                    const pmBetter =
                      s.better === 'higher'
                        ? pm > or
                        : s.better === 'lower'
                          ? pm < or
                          : Math.abs(pm - 1) < Math.abs(or - 1);
                    winnerText = pmBetter ? 'Coarse as is' : 'Coarse scaled';
                  }
                } else {
                  winnerText = 'Simple method';
                }
              }
              return (
                <tr key={s.id} data-won={won ? 'true' : 'false'}>
                  <th scope="row">
                    <span className="iso-doc-table__row-name">{meta?.name ?? s.label}</span>
                    {meta?.measures && <span className="iso-doc-table__row-desc">{meta.measures}</span>}
                  </th>
                  {methods.map((m) => {
                    const cell = formatTestFireCell(s, fire.new.scores[m.id]?.[s.id]);
                    const isBest = m.id === 'reconstruction' && won;
                    return (
                      <td key={m.id} className={`is-num${isBest ? ' is-best' : ''}`}>
                        {cell ? (
                          <AlignedNumber intPart={cell.intPart} fracPart={cell.fracPart} unit={cell.unit} />
                        ) : null}
                      </td>
                    );
                  })}
                  <td className="is-verdict">{winnerText}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Full document body for "Every Test on Record", following SHEETS-copy.json.
 */
export function EvidenceDocument({
  doc,
  state,
  focus = null,
}: {
  doc: EvidenceDoc | null;
  state: EvidenceState;
  focus?: 'next_look' | null;
}) {
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    if (focus !== 'next_look' || !doc) return;
    const t = window.setTimeout(() => {
      document.getElementById('iso-evidence-next')?.scrollIntoView({ block: 'start' });
    }, 60);
    return () => window.clearTimeout(t);
  }, [focus, doc]);

  if (!doc) {
    return state === 'failed' ? (
      <section className="iso-doc-lead">
        <p className="iso-doc-lead__p">The test record did not answer, so no figure is shown.</p>
      </section>
    ) : (
      <Loader surface="inline" line="Loading every test on record" />
    );
  }

  const fires = doc.test_fires.fires;
  const scores = doc.test_fires.scores;
  const testFiresWord = capFirst(formatCountWord(fires.length) ?? String(fires.length));
  const testFireNames = formatListAnd(fires.map((f) => f.name));
  const testScoresN = fires[0]?.new.scores_judged ?? scores.length;
  const looksList = doc.test_fires.looks ?? [];
  const looksWord = formatCountWord(looksList.length > 0 ? looksList.length : 3) ?? 'three';
  const fireScoresSummary = formatListAnd(fires.map((f) => String(f.new.ahead_of_both_on)));

  const minAhead = fires.length > 0 ? Math.min(...fires.map((f) => f.new.ahead_of_both_on)) : 0;
  const notAlwaysAhead = minAhead < testScoresN;

  const v = doc.validation;
  const otherFiresWord = formatCountWord(v.episodes) ?? String(v.episodes);
  const otherYears = formatListAnd(v.years.map(String));
  const otherAhead = formatSheetCount(v.classes.ahead) ?? '0';
  const otherLevel = formatSheetCount(v.classes.tied) ?? '0';
  const otherBehind = formatCountNone(v.classes.behind) ?? 'none';
  const noPartSwitchedOn = !v.parts.some((p) => p.status === 'on');
  const otherLimitHeld = formatSheetCount(v.frp_interval.held);
  const otherLimitOf = formatSheetCount(v.frp_interval.of);

  const onVal = readOnValidation(doc);
  const roundsN = formatSheetCount(onVal ? onVal.episodes : doc.next_look.test_episodes.new);
  const roundLooksWord = formatCountWord(onVal ? onVal.budget : doc.next_look.looks);

  const diffLearned =
    onVal?.differences?.learned_minus_least_sure ??
    ((doc.next_look as unknown as {
      differences?: { new?: { learned_minus_least_sure?: DiffIntervalRuntime } };
    }).differences?.new?.learned_minus_least_sure ??
      null);
  const learnedBeatsRule = Boolean(diffLearned && diffLearned.p05 > 0);
  const learnedMinusRule = formatSignedPoints(diffLearned?.mean_difference);
  const learnedLow = formatSignedPoints(diffLearned?.p05);
  const learnedHigh = formatSignedPoints(diffLearned?.p95);

  const playerValues = PLAYER_ROWS.map((row) => {
    const valAgent = onVal?.agents.find((a) => a.id === row.id);
    const fallbackAgent = doc.next_look.agents.find((a) => a.id === row.id);
    const gain = valAgent ? valAgent.mean_gain : (fallbackAgent?.new.mean_gain ?? null);
    return { ...row, gain };
  });
  const maxGain = Math.max(0.001, ...playerValues.map((p) => (typeof p.gain === 'number' ? p.gain : 0)));

  return (
    <>
      <section className="iso-doc-lead" aria-label="Summary">
        {fires.length > 0 && (
          <div className="iso-doc-lead__hero">
            <span className="iso-doc-lead__figure">
              {fireScoresSummary} of {testScoresN}
            </span>
            <span className="iso-doc-lead__unit">scores won on the final look</span>
          </div>
        )}
        <p className="iso-doc-lead__p iso-doc-lead__p--strong">
          {testFiresWord} fires were never used to tune the model and are kept as its test: {testFireNames}.
        </p>
        <p className="iso-doc-lead__p">
          They have been looked at {looksWord} times and every look is listed here. The last is the one that counts, and
          the fires are not run again.
        </p>
      </section>

      {fires.length > 0 && (
        <figure className="iso-doc-media" aria-label="Scores won across the closed test fires">
          <div className="iso-ev-fires">
            {fires.map((f) => {
              const judged = f.new.scores_judged ?? testScoresN;
              const low = f.new.ahead_of_both_on * 2 < judged;
              return (
                <div key={f.region_id} className="iso-ev-fire">
                  <div className="iso-ev-fire__head">
                    <span className="iso-ev-fire__name">{f.name}</span>
                    <span className="iso-ev-fire__count" data-low={low ? 'true' : 'false'}>
                      {f.new.ahead_of_both_on} of {judged}
                    </span>
                  </div>
                  <div className="iso-ev-fire__cells" aria-hidden="true">
                    {scores.map((s) => (
                      <span
                        key={s.id}
                        className="iso-ev-fire__cell"
                        data-won={didEstimateWinScore(f.new, s) ? 'true' : 'false'}
                        data-low={low ? 'true' : 'false'}
                      />
                    ))}
                  </div>
                  <span className="iso-ev-fire__meta">
                    {utcSpan(f.new.first_overpass_utc, f.new.last_overpass_utc)}
                  </span>
                </div>
              );
            })}
          </div>
          <figcaption className="iso-doc-media__caption">
            <span className="iso-doc-legend">
              <span className="iso-doc-legend__item">
                <span className="iso-doc-swatch iso-doc-swatch--ink" />
                Score won against both simple methods
              </span>
              <span className="iso-doc-legend__item">
                <span className="iso-doc-swatch iso-doc-swatch--rule" />
                Score tied or lost
              </span>
            </span>
            <span>UTC dates of the final look</span>
          </figcaption>
        </figure>
      )}

      <section className="iso-doc-section" aria-labelledby="iso-ev-final-look">
        <h3 id="iso-ev-final-look" className="iso-doc-section__title">
          The final look
        </h3>
        <div className="iso-doc-table-wrap">
          <table className="iso-doc-table">
            <thead>
              <tr>
                <th scope="col">Fire</th>
                <th scope="col">Days</th>
                <th
                  scope="col"
                  className="is-num"
                  title="Its passes over the fire in those days, each compared with the estimate."
                >
                  Passes of the sharp satellite
                </th>
                <th scope="col" className="is-num">
                  Detections it made
                </th>
                <th
                  scope="col"
                  className="is-num"
                  title="Rows of The Scores on which the estimate was better than both simple methods."
                >
                  Scores won, of {testScoresN}
                </th>
                <th
                  scope="col"
                  className="is-num"
                  title="Passes on which the measured heat stayed under the limit the model stated, of the passes checked."
                >
                  Upper limit held
                </th>
              </tr>
            </thead>
            <tbody>
              {fires.map((f) => {
                const interval = f.new.frp_interval.reconstruction;
                const wonHalf = f.new.ahead_of_both_on * 2 >= (f.new.scores_judged ?? testScoresN);
                return (
                  <tr key={f.region_id} data-won={wonHalf ? 'true' : 'false'}>
                    <th scope="row">
                      <span className="iso-doc-table__row-name">{f.name}</span>
                    </th>
                    <td>{utcSpan(f.new.first_overpass_utc, f.new.last_overpass_utc)}</td>
                    <td className="is-num">
                      <AlignedNumber intPart={formatSheetCount(f.new.scored_overpasses) ?? ''} integerOnly />
                    </td>
                    <td className="is-num">
                      <AlignedNumber intPart={formatSheetCount(f.new.hidden_pixels) ?? ''} integerOnly />
                    </td>
                    <td className="is-num is-verdict">
                      <AlignedNumber intPart={String(f.new.ahead_of_both_on)} integerOnly />
                    </td>
                    <td className="is-num">
                      {interval ? `${interval.held} of ${interval.of}` : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="iso-plain-actions">
          <button
            type="button"
            className="iso-plain-action"
            aria-expanded={detailOpen}
            onClick={() => setDetailOpen((o) => !o)}
          >
            <span>{detailOpen ? 'Hide individual scores per fire' : 'Show all seven scores per fire'}</span>
          </button>
        </div>

        {detailOpen && <PerFireDetailTable fires={fires} scores={scores} />}
      </section>

      <section className="iso-doc-section" aria-labelledby="iso-ev-every-look">
        <h3 id="iso-ev-every-look" className="iso-doc-section__title">
          Every look at them
        </h3>
        <div className="iso-doc-table-wrap">
          <table className="iso-doc-table">
            <thead>
              <tr>
                <th scope="col">Fire</th>
                <th scope="col" className="is-num">
                  Scores won at each look, in order
                </th>
              </tr>
            </thead>
            <tbody>
              {fires.map((f) => {
                const perLook =
                  Array.isArray(f.looks) && f.looks.length > 0
                    ? f.looks.map((l) => String(l.ahead_of_both_on))
                    : [String(f.old.ahead_of_both_on), String(f.new.ahead_of_both_on)];
                return (
                  <tr key={f.region_id}>
                    <th scope="row">
                      <span className="iso-doc-table__row-name">{f.name}</span>
                    </th>
                    <td className="is-num">{formatListAnd(perLook)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="iso-doc-notes">
          {LOOKS_EXPLAINED.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="iso-doc-section" aria-label="Validation on other fires">
        <div className="iso-ev-val-trio" aria-hidden="true">
          <div className="iso-ev-val-stat">
            <span className="iso-ev-val-stat__num">{otherAhead}</span>
            <span className="iso-ev-val-stat__label">ahead</span>
          </div>
          <div className="iso-ev-val-stat">
            <span className="iso-ev-val-stat__num">{otherLevel}</span>
            <span className="iso-ev-val-stat__label">level</span>
          </div>
          <div className="iso-ev-val-stat">
            <span className="iso-ev-val-stat__num">{otherBehind}</span>
            <span className="iso-ev-val-stat__label">behind</span>
          </div>
        </div>

        {notAlwaysAhead && <p className="iso-doc-section__p">It does not always win.</p>}

        <p className="iso-doc-section__p">
          On {otherFiresWord} fires of {otherYears}, also never used to tune it, counting a score only when the gap is
          too large to be luck: ahead on {otherAhead}, level on {otherLevel}, behind on {otherBehind}.
        </p>

        {noPartSwitchedOn && (
          <p className="iso-doc-section__p">
            That is not enough to switch any part of the model on. It is experimental.
          </p>
        )}

        {otherLimitHeld !== null && otherLimitOf !== null && (
          <p className="iso-doc-section__p">
            The stated upper limit held on {otherLimitHeld} of {otherLimitOf} passes of those fires. It was made
            narrower after the final look, so the figures of the test fires above belong to the wider limit of their
            time.
          </p>
        )}
      </section>

      <section id="iso-evidence-next" className="iso-doc-section" aria-labelledby="iso-ev-players">
        <h3 id="iso-ev-players" className="iso-doc-section__title">
          Mean gain over those rounds
        </h3>

        {roundsN && roundLooksWord && (
          <p className="iso-doc-section__p">
            The game, on {roundsN} rounds of {otherYears} with {roundLooksWord} looks each: the mean gain of each player
            is in the table below, in points of the burning ground on which the estimate and the sharp satellite agree.
          </p>
        )}

        {!learnedBeatsRule && learnedMinusRule && learnedLow && learnedHigh && (
          <p className="iso-doc-section__p">
            The learned player does not beat the simple rule: the difference is {learnedMinusRule} points, most likely
            between {learnedLow} and {learnedHigh}.
          </p>
        )}

        <div className="iso-doc-table-wrap">
          <table className="iso-doc-table">
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col" className="is-num">
                  Mean gain, in points
                </th>
              </tr>
            </thead>
            <tbody>
              {playerValues.map((p) => {
                const formatted = formatSignedPoints(p.gain);
                const split = formatted ? splitPointsCell(formatted) : null;
                const widthPct =
                  typeof p.gain === 'number' && p.gain > 0
                    ? Math.max(3, Math.min(100, (p.gain / maxGain) * 100))
                    : 0;
                const isBestRule = p.id === 'least_sure';
                return (
                  <tr key={p.id}>
                    <th scope="row">
                      <span className="iso-doc-table__row-name">{p.name}</span>
                      <span className="iso-doc-table__row-desc">{p.means}</span>
                    </th>
                    <td className={`is-num${isBestRule ? ' is-best' : ''}`}>
                      {split ? (
                        <div className="iso-ev-gain-cell">
                          <div className="iso-ev-gain-bar" data-role={p.role} aria-hidden="true">
                            <span style={{ width: `${widthPct.toFixed(1)}%` }} />
                          </div>
                          <AlignedNumber
                            intPart={split.intPart}
                            fracPart={split.fracPart}
                            unit={split.unit}
                            compact
                          />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const DOC_TITLES: Record<ViewerDocId, string> = {
  fire: 'This Fire',
  scores: 'The Scores',
  tests: 'Every Test on Record',
  method: 'Method and Data',
  sensors: 'Sensor Geometry',
  sources: 'Sources',
};

export interface UnifiedDocumentViewerProps {
  open: boolean;
  initialDoc: ViewerDocId;
  onClose: () => void;
  onDocChange?: (doc: ViewerDocId) => void;
  focus?: 'next_look' | null;
  scrollCredits?: boolean;
  evidenceDoc?: EvidenceDoc | null;
  evidenceState?: EvidenceState;
  score?: BlindTest | null;
  model?: ModelStatus | null;
  place?: string;
  onNext?: (() => void) | null;
  terra?: ReactNode | null;
  terraOpen?: boolean;
  onToggleTerra?: () => void;
  methodEvidence?: MethodEvidence;
  imageryCredit?: string;
  verticalExaggeration?: number | null;
  apiBase?: string;
  regionId?: string;
  regionName?: string;
  sensorModel?: SensorModelPayload | null;
  overlap?: OverlapEvidence | null;
  overlapPlace?: string | null;
}

/**
 * One side-opening document viewer shared by Every Test on Record, The Scores, Method and Data, Sensor Geometry and Sources.
 */
export function UnifiedDocumentViewer({
  open,
  initialDoc,
  onClose,
  onDocChange,
  focus = null,
  scrollCredits = false,
  evidenceDoc,
  evidenceState,
  score,
  model,
  place,
  onNext,
  terra,
  terraOpen,
  onToggleTerra,
  methodEvidence,
  imageryCredit,
  verticalExaggeration,
  apiBase,
  regionId,
  regionName,
  sensorModel = null,
  overlap,
  overlapPlace,
}: UnifiedDocumentViewerProps) {
  const store = useOptionalWorkspace();
  const [activeDoc, setActiveDoc] = useState<ViewerDocId>(initialDoc);
  const [fetchedEv, setFetchedEv] = useState<{ doc: EvidenceDoc | null; state: EvidenceState }>({
    doc: null,
    state: 'loading',
  });

  useEffect(() => {
    if (open) setActiveDoc(initialDoc);
  }, [open, initialDoc]);

  const effectiveScore = score ?? store?.test.score ?? null;
  const effectiveModel = model ?? store?.run.model ?? methodEvidence?.model ?? null;
  const effectivePlace = place ?? regionName ?? store?.place.title ?? 'Feather River & Plumas, CA';
  const effectiveRegionId = regionId ?? store?.place.regionId ?? 'plumas_ca';
  const effectiveApiBase = apiBase ?? API_BASE;

  const providedEvDoc = evidenceDoc ?? store?.model.evidence ?? null;
  useEffect(() => {
    if (!open || providedEvDoc || evidenceState === 'failed') return;
    const controller = new AbortController();
    setFetchedEv({ doc: null, state: 'loading' });
    getJson<unknown>('/api/evidence', undefined, { signal: controller.signal })
      .then((d) => {
        if (controller.signal.aborted) return;
        if (d && typeof d === 'object' && 'test_fires' in d) {
          setFetchedEv({ doc: d as EvidenceDoc, state: 'ready' });
        } else {
          setFetchedEv({ doc: null, state: 'failed' });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFetchedEv({ doc: null, state: 'failed' });
      });
    return () => controller.abort();
  }, [open, providedEvDoc, evidenceState]);

  useEffect(() => {
    if (!open || activeDoc !== 'sources' || !scrollCredits) return;
    const t = window.setTimeout(() => {
      document.getElementById('iso-sources-credits')?.scrollIntoView({ block: 'start' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [open, activeDoc, scrollCredits]);

  const resolvedEvDoc = providedEvDoc ?? fetchedEv.doc;
  const resolvedEvState: EvidenceState = providedEvDoc
    ? 'ready'
    : (evidenceState ?? fetchedEv.state);

  const cal = store?.calendar.state.cal && !store.calendar.state.cal.simulated ? store.calendar.state.cal : null;
  const resolvedOverlap = overlap ?? methodEvidence?.overlap ?? cal?.overlap ?? null;
  const resolvedOverlapPlace =
    overlapPlace ?? methodEvidence?.overlapPlace ?? (cal ? cal.regionName.split(',')[0] : null);

  const reconInterval = effectiveScore?.methods.find((m) => m.id === 'reconstruction');
  const resolvedMethodEvidence: MethodEvidence = methodEvidence ?? {
    real: Boolean(store?.run.isReal),
    model: effectiveModel,
    overlap: resolvedOverlap,
    overlapPlace: resolvedOverlapPlace,
    interval:
      reconInterval && reconInterval.intervalCovered !== null && reconInterval.intervalN !== null
        ? {
            covered: reconInterval.intervalCovered,
            n: reconInterval.intervalN,
            level: reconInterval.intervalLevel,
          }
        : null,
  };

  const resolvedCredit = imageryCredit ?? '';

  const navItems = useMemo<ViewerNavItem[]>(() => {
    const items: ViewerNavItem[] = [];
    if (store?.run.active) {
      items.push({ id: 'fire', label: 'This Fire' });
    }
    if (effectiveScore) {
      items.push({ id: 'scores', label: 'The Scores' });
    }
    items.push({ id: 'tests', label: 'Every Test on Record' });
    items.push({ id: 'method', label: 'Method and Data' });
    if (sensorModel !== null || initialDoc === 'sensors') {
      items.push({ id: 'sensors', label: 'Sensor Geometry' });
    }
    items.push({ id: 'sources', label: 'Sources' });
    return items;
  }, [store?.run.active, effectiveScore, sensorModel, initialDoc]);

  const handleSelect = (next: ViewerDocId) => {
    setActiveDoc(next);
    onDocChange?.(next);
  };

  return (
    <SideSheet
      open={open}
      title={DOC_TITLES[activeDoc]}
      onClose={onClose}
      navItems={navItems}
      activeNav={activeDoc}
      onSelectNav={handleSelect}
      scrollKey={scrollCredits && activeDoc === 'sources' ? 'sources-credits' : activeDoc}
    >
      {activeDoc === 'fire' && (
        <ThisFireDocument
          onSelectScores={effectiveScore ? () => handleSelect('scores') : undefined}
          onSelectTests={() => handleSelect('tests')}
        />
      )}

      {activeDoc === 'scores' &&
        (effectiveScore ? (
          <ScoresDocument
            score={effectiveScore}
            model={effectiveModel}
            place={effectivePlace}
            onNext={onNext}
            onEvidence={() => handleSelect('tests')}
            terra={terra}
            terraOpen={terraOpen}
            onToggleTerra={onToggleTerra}
          />
        ) : (
          <section className="iso-doc-lead">
            <p className="iso-doc-lead__p">
              Hide the sharp satellite on a fire and reveal it to score the estimate here.
            </p>
          </section>
        ))}

      {activeDoc === 'tests' && (
        <EvidenceDocument doc={resolvedEvDoc} state={resolvedEvState} focus={focus} />
      )}

      {activeDoc === 'method' && (
        <MethodDocument
          evidence={resolvedMethodEvidence}
          imageryCredit={resolvedCredit}
          verticalExaggeration={verticalExaggeration}
          onOpenTests={() => handleSelect('tests')}
        />
      )}

      {activeDoc === 'sensors' && (
        <SensorDiagnosticModal
          open
          embedded
          onClose={onClose}
          model={sensorModel}
          overlap={resolvedOverlap}
          overlapPlace={resolvedOverlapPlace}
        />
      )}

      {activeDoc === 'sources' && (
        <SourcesSheet
          open
          embedded
          includeCredits
          onClose={onClose}
          apiBase={effectiveApiBase}
          regionId={effectiveRegionId}
          regionName={effectivePlace}
          imageryCredit={resolvedCredit}
        />
      )}
    </SideSheet>
  );
}

export function EvidenceSheet({ open, onClose, doc, state, focus = null }: EvidenceSheetProps) {
  return (
    <UnifiedDocumentViewer
      open={open}
      initialDoc="tests"
      onClose={onClose}
      focus={focus}
      evidenceDoc={doc}
      evidenceState={state}
    />
  );
}
