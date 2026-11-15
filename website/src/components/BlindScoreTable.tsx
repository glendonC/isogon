import {
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useWorkspace, type WorkspaceStore } from '../app/store';
import { localDayRange, midLon } from '../guide/formats';
import { useDialogFocus } from '../ui/useDialogFocus';
import {
  platformName,
  utcSpan,
  type BlindMethod,
  type BlindTest,
  type BlindVerdict,
  type ModelStatus,
} from '../content/realRuns';
import { FurtherIn } from '../dataviz/FurtherIn';
import { OverlapBars } from '../dataviz/OverlapBars';
import type { Overlap } from '../dataviz/overlapRows';
import '../dataviz/dataviz.css';
import '../dataviz/sheets.css';
import '../identity/sheet.css';

export type ViewerDocId = 'fire' | 'scores' | 'tests' | 'sealed' | 'method' | 'sensors' | 'sources';

export interface ViewerNavItem {
  id: ViewerDocId;
  label: string;
  meta?: string;
}

const WORD_ZERO_TO_TWELVE = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
] as const;

const FULL_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Safe workspace hook for components that may also render outside WorkspaceProvider in isolated stories. */
export function useOptionalWorkspace(): WorkspaceStore | null {
  try {
    return useWorkspace();
  } catch {
    return null;
  }
}

export function formatSheetCount(n: number | null | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.round(n).toLocaleString('en-US');
}

export function formatCountWord(n: number | null | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const whole = Math.round(n);
  if (whole >= 0 && whole <= 12) return WORD_ZERO_TO_TWELVE[whole];
  return whole.toLocaleString('en-US');
}

export function formatCountNone(n: number | null | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const whole = Math.round(n);
  return whole === 0 ? 'none' : whole.toLocaleString('en-US');
}

export function formatPercentWhole(v: number | null | undefined): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.round(v * 100);
}

export function formatSignedPoints(v: number | null | undefined): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const pts = v * 100;
  const rounded = Math.round(pts * 10) / 10;
  const sign = rounded < 0 ? '-' : '+';
  return `${sign}${Math.abs(rounded).toFixed(1)}`;
}

export function formatOneDecimal(v: number | null | undefined): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v.toFixed(1);
}

export function formatThreeDecimals(v: number | null | undefined): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v.toFixed(3);
}

export function formatMetresFromKm(km: number | null | undefined): string | null {
  if (typeof km !== 'number' || !Number.isFinite(km)) return null;
  return Math.round(km * 1000).toLocaleString('en-US');
}

export function formatYearOf(ymOrIso: string | null | undefined): string | null {
  if (typeof ymOrIso !== 'string' || ymOrIso.length < 4) return null;
  const y = ymOrIso.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : null;
}

export function formatMonthYearOf(ym: string | null | undefined): string | null {
  if (typeof ym !== 'string') return null;
  const m = /^(\d{4})-(\d{2})/.exec(ym.trim());
  if (!m) return null;
  const monthIdx = Number(m[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  return `${FULL_MONTHS[monthIdx]} ${m[1]}`;
}

export function formatListAnd(items: readonly string[]): string {
  const clean = items.filter((s) => s.trim() !== '');
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}

export function plainBackendText(note: string): string {
  return note
    .replace(/\s*\([^)]*(?:backend[./]|\.py\b|\.json\b)[^)]*\)/g, '')
    .replace(/\b(in|from)\s+backend\/[\w./-]+/g, '$1 the record')
    .replace(/\s+([:;,.])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Decimal-aligned monospace value cell. Integer digits sit right-aligned in the first track and fractional
 * digits (including the decimal point) sit left-aligned in the second track, so every row lines up on the point.
 */
export function AlignedNumber({
  intPart,
  fracPart = '',
  unit = '',
  compact = false,
  flush = false,
  integerOnly = false,
}: {
  intPart: string;
  fracPart?: string;
  unit?: string;
  compact?: boolean;
  flush?: boolean;
  integerOnly?: boolean;
}) {
  if (integerOnly) {
    return (
      <span className="iso-num iso-num--int">
        <span className="iso-num__int">{intPart}</span>
      </span>
    );
  }
  const displayUnit = unit ? (/^[%°]/.test(unit) ? unit : ` ${unit}`) : '';
  const mod = flush ? ' iso-num--flush' : compact ? ' iso-num--compact' : '';
  return (
    <span className={`iso-num${mod}`}>
      <span className="iso-num__int">{intPart}</span>
      <span className="iso-num__frac">
        {fracPart}
        {displayUnit && <span className="iso-num__unit">{displayUnit}</span>}
      </span>
    </span>
  );
}

/**
 * Side-opening document viewer over the stage.
 * Anchors to the stage's fire projection when visible on the left terrain and moves slightly with the camera.
 */
export function SideSheet({
  open,
  title,
  onClose,
  navItems,
  activeNav,
  onSelectNav,
  railFooter,
  scrollKey,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  navItems?: readonly ViewerNavItem[];
  activeNav?: ViewerDocId;
  onSelectNav?: (id: ViewerDocId) => void;
  railFooter?: ReactNode;
  scrollKey?: string;
  children: ReactNode;
}) {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus(open, viewerRef, viewerRef);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: 0 });
  }, [open, activeNav, scrollKey]);

  if (!open || typeof document === 'undefined') return null;

  const single = !navItems || navItems.length === 0;

  return createPortal(
    <div className="iso-viewer-layer dv-sheet" role="presentation">
      <button
        type="button"
        className="iso-viewer-scrim"
        aria-label="Close document"
        tabIndex={-1}
        onClick={onClose}
      />

      <div
        ref={viewerRef}
        tabIndex={-1}
        className={`iso-viewer${single ? ' iso-viewer--single' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="iso-viewer__top">
          {!single && navItems ? (
            <nav className="iso-viewer__trail" aria-label="Documents">
              {navItems.map((item) => {
                const isCurrent = item.id === activeNav;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="iso-viewer__trail-btn"
                    data-active={isCurrent ? 'true' : 'false'}
                    aria-current={isCurrent ? 'page' : undefined}
                    onClick={() => onSelectNav?.(item.id)}
                  >
                    <span>{item.label}</span>
                    {item.meta && <span className="iso-viewer__trail-meta">{item.meta}</span>}
                  </button>
                );
              })}
            </nav>
          ) : (
            <span />
          )}
          <button type="button" className="iso-plain-action iso-viewer__close" onClick={onClose}>
            <span>Close</span>
          </button>
        </header>

        <div ref={scrollRef} className="iso-viewer__scroll">
          <h2 className="iso-viewer__title">{title}</h2>
          {children}
          {railFooter}
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface ScoreRowSpec {
  id: string;
  name: string;
  measures: string;
  format: 'percent' | 'three_decimals';
  better: 'higher' | 'lower';
}

const SCORE_ROW_SPECS: readonly ScoreRowSpec[] = [
  {
    id: 'csi_strict_375m',
    name: 'Agreement',
    measures:
      'Of all the squares that the estimate or the sharp satellite marks as burning, the share both mark; a round of Play is scored on this. Higher is better.',
    format: 'percent',
    better: 'higher',
  },
  {
    id: 'csi_one_cell_tolerance',
    name: 'Agreement, give or take one square',
    measures:
      'The same share when a square also counts if the other marks the square next to it. Higher is better.',
    format: 'percent',
    better: 'higher',
  },
  {
    id: 'hit_rate_at_equal_area',
    name: 'Hits with the same number of squares',
    measures:
      "Every method may mark the same number of squares: the share of the sharp satellite's burning squares it hits. Higher is better; it compares where the fire is put, not how much is marked.",
    format: 'percent',
    better: 'higher',
  },
  {
    id: 'brier',
    name: 'The stated chance of fire',
    measures:
      'How far the chance of fire stated for each square is from what the sharp satellite saw there, averaged over every square. Zero is perfect and lower is better.',
    format: 'three_decimals',
    better: 'lower',
  },
  {
    id: 'pixel_count_error_of_sums',
    name: 'How many detections',
    measures:
      'The number of detections expected over all hidden passes against the number the sharp satellite made: the miss as a share of that number. Lower is better.',
    format: 'percent',
    better: 'lower',
  },
  {
    id: 'frp_error_of_sums',
    name: 'How much heat in all',
    measures:
      "The fire's heat output expected over all hidden passes against what the sharp satellite measured: the miss as a share of that. Lower is better.",
    format: 'percent',
    better: 'lower',
  },
  {
    id: 'frp_median_abs_relative_error',
    name: 'How much heat, pass by pass',
    measures:
      'The same miss taken one pass at a time: the size of a typical one. Lower is better.',
    format: 'percent',
    better: 'lower',
  },
];

const METHOD_SHORT_NAMES: Record<string, string> = {
  reconstruction: 'The estimate',
  challenger_blend: 'Second model',
  challenger_gbdt: 'Second model',
  painted_modis: 'Coarse as is',
  overlap_ratio: 'Coarse scaled',
  painted_viirs: 'Sharp as is',
  viirs_ratio: 'Sharp scaled',
};

function formatScoreCell(spec: ScoreRowSpec, raw: number | undefined): {
  intPart: string;
  fracPart: string;
  unit: string;
  comparable: number | null;
} | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (spec.format === 'three_decimals') {
    const fixed = raw.toFixed(3);
    const [i, f] = fixed.split('.');
    return {
      intPart: i,
      fracPart: f ? `.${f}` : '',
      unit: 'gap',
      comparable: Math.round(raw * 1000),
    };
  }
  const pct = Math.round(raw * 100);
  return {
    intPart: pct.toLocaleString('en-US'),
    fracPart: '',
    unit: '%',
    comparable: pct,
  };
}

function whoWonRow(spec: ScoreRowSpec, v: BlindVerdict, methodIds: readonly string[]): {
  label: string;
  wonByEstimate: boolean;
  winners: string[];
} {
  const est = methodIds[0];
  const entries = methodIds
    .map((m) => ({ m, cell: formatScoreCell(spec, v.values[m]) }))
    .filter((e): e is { m: string; cell: NonNullable<ReturnType<typeof formatScoreCell>> } => e.cell !== null && e.cell.comparable !== null);

  if (entries.length < 2) {
    return { label: v.ahead ? 'The estimate' : '', wonByEstimate: v.ahead, winners: v.ahead ? [est] : [] };
  }

  // Use raw backend numbers when beats_every_baseline decided a narrow gap, otherwise compare at displayed precision
  // so two identical-looking cells are never called a win unless raw beats_every_baseline is true.
  const rawEntries = methodIds
    .filter((m) => typeof v.values[m] === 'number' && Number.isFinite(v.values[m]))
    .map((m) => ({ m, val: v.values[m] }));

  if (v.ahead) {
    return { label: 'The estimate', wonByEstimate: true, winners: [est] };
  }

  const bestShown =
    spec.better === 'higher'
      ? Math.max(...entries.map((e) => e.cell.comparable as number))
      : Math.min(...entries.map((e) => e.cell.comparable as number));
  const shownWinners = entries.filter((e) => e.cell.comparable === bestShown).map((e) => e.m);

  if (shownWinners.length === entries.length) {
    const bestRaw =
      spec.better === 'higher'
        ? Math.max(...rawEntries.map((e) => e.val))
        : Math.min(...rawEntries.map((e) => e.val));
    const rawWinners = rawEntries.filter((e) => e.val === bestRaw).map((e) => e.m);
    if (rawWinners.length === 1) {
      const w = rawWinners[0];
      return {
        label: w === est ? 'The estimate' : (METHOD_SHORT_NAMES[w] ?? w),
        wonByEstimate: w === est,
        winners: rawWinners,
      };
    }
    return { label: 'All three tie', wonByEstimate: false, winners: [] };
  }

  if (shownWinners.length === 1) {
    const w = shownWinners[0];
    return { label: METHOD_SHORT_NAMES[w] ?? w, wonByEstimate: false, winners: shownWinners };
  }

  const nonEstimate = shownWinners.every((m) => m !== est);
  if (nonEstimate && shownWinners.length === 2) {
    return { label: 'Both simple methods', wonByEstimate: false, winners: shownWinners };
  }
  return {
    label: formatListAnd(shownWinners.map((m) => (m === est ? 'The estimate' : (METHOD_SHORT_NAMES[m] ?? m)))),
    wonByEstimate: false,
    winners: shownWinners,
  };
}

function hiddenDetectionsFromRun(activeRun: unknown): number | null {
  if (!activeRun || typeof activeRun !== 'object') return null;
  const bt = (activeRun as Record<string, unknown>).blind_test;
  if (!bt || typeof bt !== 'object') return null;
  const n = (bt as Record<string, unknown>).hidden_rows_in_test_box;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function trackPosition(spec: ScoreRowSpec, val: number | undefined, maxVal: number): number | null {
  if (typeof val !== 'number' || !Number.isFinite(val)) return null;
  const denom = Math.max(maxVal, spec.format === 'three_decimals' ? 0.05 : 1);
  const ratio = Math.max(0, Math.min(1, val / denom));
  // Orient every track so rightward means stronger agreement / lower error.
  const goodness = spec.better === 'higher' ? ratio : 1 - ratio;
  return Math.round((6 + goodness * 88) * 10) / 10;
}

/**
 * Full document body for "The Scores", following SHEETS-copy.json.
 * Leads with the plain verdict figure and two sentences, shows a visual score comparison pane, then the aligned 7-row table.
 */
export function ScoresDocument({
  score,
  model,
  place,
  onNext,
  onEvidence,
  terra,
  terraOpen,
  onToggleTerra,
}: {
  score: BlindTest;
  model: ModelStatus | null;
  place?: string;
  onNext?: (() => void) | null;
  onEvidence?: () => void;
  terra?: ReactNode | null;
  terraOpen?: boolean;
  onToggleTerra?: () => void;
}) {
  const store = useOptionalWorkspace();

  const orderedRows = useMemo(() => {
    const byId = new Map(score.verdict.map((v) => [v.id, v]));
    const matched: Array<{ spec: ScoreRowSpec; verdict: BlindVerdict }> = [];
    for (const spec of SCORE_ROW_SPECS) {
      const v = byId.get(spec.id);
      if (v) matched.push({ spec, verdict: v });
    }
    for (const v of score.verdict) {
      if (!SCORE_ROW_SPECS.some((s) => s.id === v.id)) {
        matched.push({
          spec: {
            id: v.id,
            name: v.id.replace(/_/g, ' '),
            measures: v.better === 'higher' ? 'Higher is better.' : 'Lower is better.',
            format: 'percent',
            better: v.better,
          },
          verdict: v,
        });
      }
    }
    return matched;
  }, [score.verdict]);

  // The estimate on show is the method the verdict scores; the simple methods are the others but the estimate that
  // was in use, any challenger and the sharp satellite's own.
  const est = score.estimate;
  const baselines = score.methods.filter(
    (m) => m.id !== est && m.id !== 'reconstruction' && !m.id.startsWith('challenger') && !m.id.includes('viirs'),
  );
  const simpleMethodsWord = formatCountWord(baselines.length > 0 ? baselines.length : 2) ?? 'two';
  const aheadCount = orderedRows.filter((r) => r.verdict.ahead).length;
  const scoresJudged = orderedRows.length;
  const hiddenPasses = formatSheetCount(score.scoredOverpasses);
  const rawHiddenDetections = hiddenDetectionsFromRun(store?.run.active);
  const sharpDetectionsAll = formatSheetCount(rawHiddenDetections);

  const reconMethod = score.methods.find((m) => m.id === est) ?? null;
  const limitHeld = formatSheetCount(reconMethod?.intervalCovered);
  const limitOf = formatSheetCount(reconMethod?.intervalN);

  const fireLon =
    midLon(store?.run.active?.region.bbox) ??
    midLon(store?.places.places.find((p) => p.id === store?.place.regionId)?.box);
  const spanText =
    score.firstUtc && score.lastUtc
      ? (localDayRange(score.firstUtc, score.lastUtc, fireLon) ?? utcSpan(score.firstUtc, score.lastUtc))
      : null;
  const methodIds = [est, 'painted_modis', 'overlap_ratio'] as const;

  // The result in plain percentages: overlap with VIIRS fire pixels, exact and within one pixel, for MODIS alone and
  // for the estimate on show. The full seven rows are one step further in.
  const overlapValue = (id: string, m: string): number | null => {
    const x = orderedRows.find((r) => r.spec.id === id)?.verdict.values[m];
    return typeof x === 'number' && Number.isFinite(x) ? x : null;
  };
  const ov = [
    overlapValue('csi_strict_375m', 'painted_modis'),
    overlapValue('csi_one_cell_tolerance', 'painted_modis'),
    overlapValue('csi_strict_375m', est),
    overlapValue('csi_one_cell_tolerance', est),
  ];
  const fireOverlap: Overlap | null = ov.every((x) => x !== null)
    ? {
        rows: [
          { key: 'modis', label: 'MODIS alone', exact: ov[0] as number, within: ov[1] as number },
          { key: 'in_use', label: est.startsWith('challenger') ? 'New model' : 'First model', exact: ov[2] as number, within: ov[3] as number },
        ],
        fires: null,
        looks: null,
      }
    : null;

  return (
    <FurtherIn
      more="all seven scores"
      lead={
        fireOverlap ? (
          <OverlapBars
            overlap={fireOverlap}
            width={640}
            words={{
              title: `Overlap with VIIRS fire pixels${place ? `, ${place}` : ''}`,
              line: 'Pixels both mark as fire, out of pixels either marks as fire. Higher is better.',
              exact: 'Exact',
              within: 'Within one pixel',
            }}
          />
        ) : null
      }
    >
      <section className="iso-doc-lead" aria-label="Summary">
        <div className="iso-doc-lead__hero">
          <span className="iso-doc-lead__figure">
            {aheadCount} of {scoresJudged}
          </span>
          <span className="iso-doc-lead__unit">
            scores won{place ? ` on ${place}` : ''}
            {spanText ? `, ${spanText}` : ''}
          </span>
        </div>

        {orderedRows.length > 0 && (
          <div className="iso-doc-lead__segments" aria-hidden="true">
            {orderedRows.map(({ spec, verdict }) => (
              <span
                key={spec.id}
                className="iso-doc-lead__seg"
                data-won={verdict.ahead ? 'true' : 'false'}
              />
            ))}
          </div>
        )}

        <p className="iso-doc-lead__p iso-doc-lead__p--strong">
          On this fire the estimate beat {simpleMethodsWord} simple methods on {aheadCount} of {scoresJudged} scores.
        </p>

        <p className="iso-doc-lead__p">
          Each row compares one thing with what the sharp satellite saw on its{' '}
          {hiddenPasses ? `${hiddenPasses} hidden passes` : 'hidden passes'}
          {sharpDetectionsAll ? `: ${sharpDetectionsAll} detections` : ''}. A row is won when the estimate&apos;s number
          is better than both others, however small the gap.
        </p>
      </section>

      <div className="iso-method-key" role="region" aria-label="Methods compared">
        <div className="iso-method-key__item">
          <span className="iso-method-key__head">
            <span className="iso-doc-swatch iso-doc-swatch--estimate" />
            The estimate
          </span>
          <p className="iso-method-key__desc">
            The model&apos;s estimate, made from the coarse satellite alone.
          </p>
        </div>
        <div className="iso-method-key__item">
          <span className="iso-method-key__head">
            <span className="iso-doc-swatch iso-doc-swatch--modis-hollow" />
            Coarse squares as they are
          </span>
          <p className="iso-method-key__desc">
            The first simple method: every square the coarse satellite flagged counts as burning, the whole of it.
          </p>
        </div>
        <div className="iso-method-key__item">
          <span className="iso-method-key__head">
            <span className="iso-doc-swatch iso-doc-swatch--modis" />
            Coarse squares, scaled up
          </span>
          <p className="iso-method-key__desc">
            The second simple method: the same squares, with the amount of fire multiplied by how much more the sharp
            satellite usually sees.
          </p>
        </div>
      </div>

      {orderedRows.length > 0 ? (
        <div className="iso-doc-table-wrap">
          <table className="iso-doc-table">
            <thead>
              <tr>
                <th scope="col">What is compared</th>
                <th
                  scope="col"
                  className="is-num"
                  title="The model's estimate, made from the coarse satellite alone."
                >
                  The estimate
                </th>
                <th
                  scope="col"
                  className="is-num"
                  title="The first simple method: every square the coarse satellite flagged counts as burning, the whole of it."
                >
                  Coarse squares as they are
                </th>
                <th
                  scope="col"
                  className="is-num"
                  title="The second simple method: the same squares, with the amount of fire multiplied by how much more the sharp satellite usually sees."
                >
                  Coarse squares, scaled up
                </th>
                <th
                  scope="col"
                  className="is-verdict"
                  title="Which of the three has the best number in this row."
                >
                  Won by
                </th>
              </tr>
            </thead>
            <tbody>
              {orderedRows.map(({ spec, verdict }) => {
                const win = whoWonRow(spec, verdict, methodIds);
                const vals = methodIds
                  .map((m) => verdict.values[m])
                  .filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
                const maxVal = vals.length > 0 ? Math.max(...vals) : 1;
                const estPos = trackPosition(spec, verdict.values[est], maxVal);
                const coarsePos = trackPosition(spec, verdict.values.painted_modis, maxVal);
                const scaledPos = trackPosition(spec, verdict.values.overlap_ratio, maxVal);
                return (
                  <tr key={spec.id} data-won={win.wonByEstimate ? 'true' : 'false'}>
                    <th scope="row">
                      <span className="iso-doc-table__row-name">{spec.name}</span>
                      <span className="iso-doc-table__row-desc">{spec.measures}</span>
                      {(estPos !== null || coarsePos !== null || scaledPos !== null) && (
                        <div className="iso-row-vernier" aria-hidden="true">
                          {coarsePos !== null && (
                            <span
                              className="iso-row-vernier__mark iso-row-vernier__mark--coarse"
                              style={{ left: `${coarsePos}%` }}
                            />
                          )}
                          {scaledPos !== null && (
                            <span
                              className="iso-row-vernier__mark iso-row-vernier__mark--scaled"
                              style={{ left: `${scaledPos}%` }}
                            />
                          )}
                          {estPos !== null && (
                            <span
                              className="iso-row-vernier__mark iso-row-vernier__mark--estimate"
                              style={{ left: `${estPos}%` }}
                            />
                          )}
                        </div>
                      )}
                    </th>
                    {methodIds.map((mId) => {
                      const cell = formatScoreCell(spec, verdict.values[mId]);
                      const isBest = win.winners.includes(mId);
                      return (
                        <td key={mId} className={`is-num${isBest ? ' is-best' : ''}`}>
                          {cell ? (
                            <AlignedNumber intPart={cell.intPart} fracPart={cell.fracPart} unit={cell.unit} />
                          ) : null}
                        </td>
                      );
                    })}
                    <td className="is-verdict">{win.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <BlindScoreTable score={score} model={model} />
      )}

      <section className="iso-doc-section" aria-label="Notes on the scores">
        <ul className="iso-doc-notes">
          <li>
            The two simple methods mark the same squares, so they tie on every row that is about squares. They differ in
            how many detections and how much heat they expect.
          </li>
          {limitHeld !== null && limitOf !== null && (
            <li>
              With each estimate the model also states an upper limit for the heat the sharp satellite will measure. On
              this fire the real amount stayed under it on {limitHeld} of {limitOf} hidden passes.
            </li>
          )}
          <li>
            What the sharp satellite saw is the measure here. It is another instrument&apos;s report, not the fire
            itself.
          </li>
          {score.testFire && (
            <li>
              This window belongs to one of the three closed test fires. Their recorded test is under{' '}
              {onEvidence ? (
                <button type="button" className="iso-inline-trigger" onClick={onEvidence}>
                  Every test
                </button>
              ) : (
                'Every test'
              )}
              .
            </li>
          )}
          {model && (
            <li>
              The model that makes the estimate is {model.status}.
            </li>
          )}
        </ul>

        {terraOpen && terra}

        {(onNext || onEvidence || terra) && (
          <div className="iso-plain-actions">
            {onNext && (
              <button type="button" className="iso-plain-action" data-primary="true" onClick={onNext}>
                <span className="iso-plain-action__key">Enter</span>
                <span>Play a round on this fire</span>
              </button>
            )}
            {onEvidence && (
              <button type="button" className="iso-plain-action" onClick={onEvidence}>
                <span>Every test</span>
              </button>
            )}
            {terra && onToggleTerra && (
              <button type="button" className="iso-plain-action" onClick={onToggleTerra}>
                <span className="iso-plain-action__key">T</span>
                <span>{terraOpen ? 'Hide morning pass check' : 'Morning pass check'}</span>
              </button>
            )}
          </div>
        )}
      </section>
    </FurtherIn>
  );
}

interface CompactRow {
  label: string;
  desc: string;
  cell: (m: BlindMethod) => { intPart: string; fracPart: string; unit: string; integerOnly?: boolean } | null;
  compare: ((m: BlindMethod) => number | null) | null;
  better: 'higher' | 'lower';
}

const COMPACT_ROWS: readonly CompactRow[] = [
  {
    label: 'Hits on burning squares',
    desc: 'Share of hidden burning squares the method marks. Higher is better.',
    cell: (m) => (m.hitRate === null ? null : { intPart: String(Math.round(m.hitRate * 100)), fracPart: '', unit: '%' }),
    compare: (m) => (m.hitRate === null ? null : Math.round(m.hitRate * 100)),
    better: 'higher',
  },
  {
    label: 'False alarms',
    desc: 'Share of marked squares where the hidden pass flagged no fire. Lower is better.',
    cell: (m) =>
      m.falseAlarmRatio === null
        ? null
        : { intPart: String(Math.round(m.falseAlarmRatio * 100)), fracPart: '', unit: '%' },
    compare: (m) => (m.falseAlarmRatio === null ? null : Math.round(m.falseAlarmRatio * 100)),
    better: 'lower',
  },
  {
    label: 'The same squares, give or take one',
    desc: 'Agreement when a neighbouring square also counts. Higher is better.',
    cell: (m) =>
      m.csiOneCell === null
        ? null
        : { intPart: String(Math.round(m.csiOneCell * 100)), fracPart: '', unit: '%' },
    compare: (m) => (m.csiOneCell === null ? null : Math.round(m.csiOneCell * 100)),
    better: 'higher',
  },
  {
    label: 'How much heat in all',
    desc: 'Miss in total heat output over all hidden passes. Lower is better.',
    cell: (m) => (m.frpError === null ? null : { intPart: String(Math.round(m.frpError * 100)), fracPart: '', unit: '%' }),
    compare: (m) => (m.frpError === null ? null : Math.round(m.frpError * 100)),
    better: 'lower',
  },
  {
    label: 'Upper limit held',
    desc: 'Hidden passes where measured heat stayed inside the stated range.',
    cell: (m) =>
      m.intervalCovered === null || m.intervalN === null
        ? null
        : { intPart: `${m.intervalCovered} of ${m.intervalN}`, fracPart: '', unit: '', integerOnly: true },
    compare: null,
    better: 'higher',
  },
];

/**
 * Compact score table used when embedded inside another panel such as TerraMorningPanel.
 */
export function BlindScoreTable({
  score,
  model,
  corner = 'What is compared',
  hiddenText,
}: {
  score: BlindTest;
  model: ModelStatus | null;
  corner?: string;
  hiddenText?: string;
}) {
  const store = useOptionalWorkspace();
  const fireLon =
    midLon(store?.run.active?.region.bbox) ??
    midLon(store?.places.places.find((p) => p.id === store?.place.regionId)?.box);
  const hidden =
    score.hiddenPlatforms.length > 0 ? formatListAnd(score.hiddenPlatforms.map(platformName)) : 'the sharp satellite';
  const span =
    score.firstUtc && score.lastUtc
      ? `, ${localDayRange(score.firstUtc, score.lastUtc, fireLon) ?? utcSpan(score.firstUtc, score.lastUtc)}`
      : '';
  const count = score.scoredOverpasses !== null ? `, ${score.scoredOverpasses} passes` : '';

  return (
    <div className="iso-blind-standalone">
      <div className="iso-doc-table-wrap">
        <table className="iso-doc-table">
          <thead>
            <tr>
              <th scope="col">{corner}</th>
              {score.methods.map((m) => (
                <th key={m.id} scope="col" className="is-num">
                  {METHOD_SHORT_NAMES[m.id] ?? m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPACT_ROWS.map((row) => {
              const vals = row.compare
                ? score.methods
                    .map((m) => ({ id: m.id, v: row.compare?.(m) ?? null }))
                    .filter((x): x is { id: string; v: number } => x.v !== null)
                : [];
              const best =
                vals.length >= 2
                  ? row.better === 'higher'
                    ? Math.max(...vals.map((x) => x.v))
                    : Math.min(...vals.map((x) => x.v))
                  : null;
              return (
                <tr key={row.label}>
                  <th scope="row">
                    <span className="iso-doc-table__row-name">{row.label}</span>
                    <span className="iso-doc-table__row-desc">{row.desc}</span>
                  </th>
                  {score.methods.map((m) => {
                    const c = row.cell(m);
                    const cmp = row.compare?.(m) ?? null;
                    const isBest = best !== null && cmp === best;
                    return (
                      <td key={m.id} className={`is-num${isBest ? ' is-best' : ''}`}>
                        {c ? (
                          <AlignedNumber
                            intPart={c.intPart}
                            fracPart={c.fracPart}
                            unit={c.unit}
                            integerOnly={c.integerOnly}
                          />
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="iso-doc-section__p">
        {hiddenText ?? `Hidden in this test: ${hidden}${count}${span}.`}
      </p>

      {model && <p className="iso-doc-section__p">The model is {model.status}.</p>}
    </div>
  );
}
