import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { parsePlaces, type Box } from '../app/places';
import { parseCalendar, type OverlapEvidence } from '../content/calendar';
import type {
  EvidenceDoc,
  EvidenceFire,
  EvidenceFireTest,
  EvidenceMethodId,
  EvidenceScore,
  EvidenceState,
} from '../content/evidence';
import { utcSpan, type BlindTest, type ModelStatus } from '../content/realRuns';
import { localDayRange, localDayTime, midLon } from '../guide/formats';
import { API_BASE, getJson, publicUrl } from '../lib/api';
import { SensorDiagnosticModal } from '../stage/SensorDiagnosticModal';
import { Loader } from '../ui/Loader';
import type { SensorModelPayload, SensorModelSource } from '../ui/useSensorModel';
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
import {
  fetchCachedCalendarRaw,
  fetchCachedEvidenceDoc,
  fetchCachedRegionsRaw,
  MethodDocument,
  ThisFireDocument,
  type MethodEvidence,
} from './MethodSheet';
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

const sensorModelCache = new Map<string, Promise<SensorModelPayload | null>>();

function fetchCachedSensorModel(runId: string | null | undefined): Promise<SensorModelPayload | null> {
  const key = runId ?? '__default__';
  const existing = sensorModelCache.get(key);
  if (existing) return existing;
  const endpoints: Array<{ load: () => Promise<unknown>; source: SensorModelSource }> = [
    {
      load: () => getJson<unknown>('/api/sensor-model', runId ? { run_id: runId } : undefined),
      source: 'api',
    },
    {
      load: async () => {
        const res = await fetch(publicUrl('generated/fields/sensor_model_diagnostics.json'));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      },
      source: 'static_artifact',
    },
  ];
  const req = (async (): Promise<SensorModelPayload | null> => {
    for (const ep of endpoints) {
      try {
        const raw: unknown = await ep.load();
        const id = (raw as Record<string, unknown> | null)?.benchmark_gates_run_id;
        return { raw, source: ep.source, gatesRunId: typeof id === 'string' ? id : null };
      } catch {
        // Try fallback artifact.
      }
    }
    sensorModelCache.delete(key);
    return null;
  })();
  sensorModelCache.set(key, req);
  return req;
}

const PLAIN_SCORE_META: Record<
  string,
  { name: string; measures: string; format: 'percent' | 'three_decimals' | 'ratio_error' | 'ratio' }
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
    name: 'How many detections',
    measures:
      'Total detections expected over all hidden passes against what the sharp satellite made: the miss as a share of that. Lower is better.',
    format: 'ratio_error',
  },
  pixel_count_error_of_sums: {
    name: 'How many detections',
    measures:
      'Total detections expected over all hidden passes against what the sharp satellite made: the miss as a share of that. Lower is better.',
    format: 'ratio_error',
  },
  frp_ratio_of_sums: {
    name: 'How much heat in all',
    measures:
      "The fire's heat output expected over all hidden passes against what the sharp satellite measured: the miss as a share of that. Lower is better.",
    format: 'ratio_error',
  },
  frp_error_of_sums: {
    name: 'How much heat in all',
    measures:
      "The fire's heat output expected over all hidden passes against what the sharp satellite measured: the miss as a share of that. Lower is better.",
    format: 'ratio_error',
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
  const fmt = meta?.format ?? (score.better === 'nearest_one' ? 'ratio_error' : 'percent');
  if (fmt === 'three_decimals') {
    const [i, f] = val.toFixed(3).split('.');
    return { intPart: i, fracPart: f ? `.${f}` : '', unit: 'gap' };
  }
  if (fmt === 'ratio_error') {
    const pct = Math.round(Math.abs(val - 1) * 100);
    return { intPart: pct.toLocaleString('en-US'), fracPart: '', unit: '%' };
  }
  if (fmt === 'ratio') {
    const [i, f] = val.toFixed(2).split('.');
    return { intPart: i, fracPart: f ? `.${f}` : '', unit: 'x' };
  }
  return { intPart: Math.round(val * 100).toLocaleString('en-US'), fracPart: '', unit: '%' };
}

function splitPointsCell(signedPts: string): { intPart: string; fracPart: string; unit: string } {
  const [i, f] = signedPts.split('.');
  return { intPart: i, fracPart: f ? `.${f}` : '', unit: 'pts' };
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
      <div className="iso-viewer__trail" role="group" aria-label="Choose test fire">
        {fires.map((f) => {
          const active = f.region_id === fire.region_id;
          return (
            <button
              key={f.region_id}
              type="button"
              className="iso-viewer__trail-btn"
              data-active={active ? 'true' : 'false'}
              aria-pressed={active}
              onClick={() => setSelectedId(f.region_id)}
            >
              <span>{capFirst(f.name)}</span>
              <span className="iso-viewer__trail-meta">
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
              <th scope="col">All {scores.length} scores on {capFirst(fire.name)} (final look)</th>
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
              let winnerIds: EvidenceMethodId[] = ['reconstruction'];
              if (!won) {
                if (typeof pm === 'number' && typeof or === 'number') {
                  if (pm === or) {
                    winnerText = 'Both simple methods';
                    winnerIds = ['painted_modis', 'overlap_ratio'];
                  } else {
                    const pmBetter =
                      s.better === 'higher'
                        ? pm > or
                        : s.better === 'lower'
                          ? pm < or
                          : Math.abs(pm - 1) < Math.abs(or - 1);
                    winnerText = pmBetter ? 'Coarse as is' : 'Coarse scaled';
                    winnerIds = [pmBetter ? 'painted_modis' : 'overlap_ratio'];
                  }
                } else {
                  winnerText = 'Simple method';
                  winnerIds = [];
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
                    const isBest = winnerIds.includes(m.id);
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

interface FreshLookGroupRuntime {
  episodes?: number;
  scored_looks?: number;
  interval?: {
    stated_level?: number;
    held?: number;
    looks?: number;
  } | null;
  ahead?: number;
  tied?: number;
  behind?: number;
  classes?: Record<string, string>;
  why_no_interval?: string;
}

interface FreshLookRuntime {
  look_name?: string;
  episodes_in_plan?: number;
  episodes_scored?: number;
  not_scored?: number;
  all?: FreshLookGroupRuntime;
  by_continent?: Record<string, FreshLookGroupRuntime>;
  by_zone?: Record<string, FreshLookGroupRuntime>;
  clear_looks?: string | Record<string, unknown> | null;
  fuel?: string | null;
}

interface FreshPlanRuntime {
  episodes_found?: number;
  counts?: Record<string, Record<string, number>>;
  countries_read?: number;
  countries_left_out?: string[];
  places_by_role?: Record<string, number>;
  thin?: string | null;
}

interface FreshRefitRuntime {
  decision?: string;
  validation_episodes?: number;
}

interface FreshPlayersRuntime {
  episodes?: number;
  /** Each player's mean gain, a fraction: a number, or `{ mean_gain }` as the record gives it. */
  mean_gain?: Record<string, number | { mean_gain?: number }>;
  differences?: Record<string, DiffIntervalRuntime>;
}

interface FreshTestRuntime {
  state?: string;
  plan?: FreshPlanRuntime | null;
  test_a?: FreshLookRuntime | null;
  refit?: FreshRefitRuntime | null;
  test_b?: FreshLookRuntime | null;
  players?: FreshPlayersRuntime | null;
}

interface LiveFireRuntime {
  id: string;
  rank?: number;
  part?: string;
  box?: Box;
  centre?: [number, number];
  modis_rows_48h?: number;
}

interface LiveSealRuntime {
  sha256: string;
  fire_id: string;
  part?: string;
  box?: Box;
  platform?: string;
  state?: string;
  reason?: string | null;
  times?: {
    sealed_utc?: string | null;
    predicted_pass_utc?: string | null;
    real_pass_utc?: string | null;
    minutes_sealed_before_the_pass?: number | null;
    rows_retrieved_utc?: string | null;
    decided_utc?: string | null;
  };
  scores?: {
    ahead_of_both_on?: number;
    scores_judged?: number;
  } | null;
}

interface LiveDocRuntime {
  written_utc?: string;
  protocol?: {
    sha256?: string;
    written_utc?: string;
    version?: number;
  };
  counts?: {
    seals?: number;
    sealed?: number;
    waiting_for_the_pass?: number;
    waiting_for_the_rows?: number;
    scored?: number;
    not_scored?: number;
    passes_not_sealed?: number;
  };
  fires?: LiveFireRuntime[];
  seals?: LiveSealRuntime[];
  running_count?: {
    fires_scored?: number;
    looks_scored?: number;
    over_fires?: {
      classes?: {
        ahead?: number;
        tie?: number;
        tied?: number;
        behind?: number;
      };
    } | null;
  };
}

const CONTINENT_ORDER = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'Oceania',
  'South America',
] as const;

const ZONE_ORDER: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'tropical', label: 'Tropical' },
  { id: 'subtropical', label: 'Subtropical' },
  { id: 'temperate', label: 'Temperate' },
  { id: 'boreal', label: 'Boreal' },
];

const LIVE_PART_NAMES: Record<string, string> = {
  africa: 'Africa',
  asia: 'Asia',
  europe: 'Europe',
  north_america: 'North America',
  south_america: 'South America',
  oceania: 'Oceania',
};

const LIVE_NOT_SCORED_REASONS: Record<string, string> = {
  'no pass': 'no pass of the satellite was found near the time foreseen',
  'partial swath': "the satellite's view held only part of the fire's box",
  'began before the seal': 'the real pass began before the prediction was sealed',
  'no rows': "NASA's detections for the pass did not arrive in time",
};

const SHORT_UTC_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

let cachedLiveRequest: { at: number; promise: Promise<LiveDocRuntime | null> } | null = null;

function fetchCachedLiveDoc(): Promise<LiveDocRuntime | null> {
  const now = Date.now();
  if (cachedLiveRequest && now - cachedLiveRequest.at < 30_000) {
    return cachedLiveRequest.promise;
  }
  const promise = getJson<unknown>('/api/live')
    .then((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const obj = raw as Record<string, unknown>;
      if (!Array.isArray(obj.fires) && !Array.isArray(obj.seals)) return null;
      return obj as unknown as LiveDocRuntime;
    })
    .catch(() => {
      cachedLiveRequest = null;
      return null;
    });
  cachedLiveRequest = { at: now, promise };
  return promise;
}

function readFreshTest(doc: EvidenceDoc): FreshTestRuntime | null {
  const raw = (doc as unknown as { fresh_test?: unknown }).fresh_test;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as FreshTestRuntime;
}

function formatUtcInstant(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const day = d.getUTCDate();
  const mon = SHORT_UTC_MONTHS[d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day} ${mon}, ${hh}:${mm} UTC`;
}

function formatMinutesBefore(mins: number | null | undefined): string | null {
  if (typeof mins !== 'number' || !Number.isFinite(mins) || mins < 0) return null;
  const whole = Math.round(mins);
  if (whole < 60) return `${whole} ${whole === 1 ? 'minute' : 'minutes'}`;
  const hrs = Math.floor(whole / 60);
  const rem = whole % 60;
  const hrWord = `${hrs} ${hrs === 1 ? 'hour' : 'hours'}`;
  return rem > 0 ? `${hrWord} ${rem} min` : hrWord;
}

function formatCoordPoint(centre: [number, number] | undefined, box?: Box): string {
  const lon = centre ? centre[0] : box ? (box[0] + box[2]) / 2 : null;
  const lat = centre ? centre[1] : box ? (box[1] + box[3]) / 2 : null;
  if (lon === null || lat === null || !Number.isFinite(lon) || !Number.isFinite(lat)) return '';
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

function formatLiveCraft(platform: string | undefined): string {
  if (!platform) return 'the sharp satellite';
  if (platform.includes('NOAA20')) return 'NOAA-20';
  if (platform.includes('NOAA21')) return 'NOAA-21';
  if (platform.includes('SNPP')) return 'Suomi NPP';
  return platform;
}

function formatSealStateWords(seal: LiveSealRuntime): string {
  switch (seal.state) {
    case 'sealed':
      return 'Sealed; the pass has not begun';
    case 'waiting_for_the_pass':
      return 'The pass is due or has happened; NASA has not listed it yet';
    case 'waiting_for_the_rows':
      return 'NASA has listed the pass; its detections are not all published yet';
    case 'scored': {
      const a = seal.scores?.ahead_of_both_on;
      const of = seal.scores?.scores_judged;
      return typeof a === 'number' && typeof of === 'number'
        ? `Scored: ahead of both simple methods on ${a} of ${of} scores`
        : 'Scored';
    }
    case 'not_scored': {
      const r = seal.reason ? (LIVE_NOT_SCORED_REASONS[seal.reason] ?? seal.reason) : null;
      return r ? `Not scored: ${r}` : 'Not scored';
    }
    default:
      return seal.state ?? 'Sealed';
  }
}

function scoreNamesByClass(classes: Record<string, string> | undefined, target: 'ahead' | 'tie' | 'behind'): string {
  if (!classes) return '';
  const matches: string[] = [];
  for (const [id, cls] of Object.entries(classes)) {
    const normalized = cls === 'tied' ? 'tie' : cls;
    if (normalized === target) {
      matches.push(PLAIN_SCORE_META[id]?.name ?? id);
    }
  }
  return formatListAnd(matches);
}

function FreshWorldTestSection({
  freshTest,
  otherAhead,
  otherBehind,
}: {
  freshTest: FreshTestRuntime;
  otherAhead: string;
  otherBehind: string;
}) {
  const testA = freshTest.test_a ?? null;
  const testB = freshTest.test_b ?? null;
  const plan = freshTest.plan ?? null;
  const refit = freshTest.refit ?? null;
  const freshPlayers = freshTest.players ?? null;
  const gainOf = (id: string): string | null => {
    const g = freshPlayers?.mean_gain?.[id];
    return formatSignedPoints(typeof g === 'number' ? g : typeof g?.mean_gain === 'number' ? g.mean_gain : null);
  };
  const unsureGain = gainOf('least_sure');
  const chanceGain = gainOf('random');

  if (!testA) {
    return (
      <section id="iso-ev-world-test" className="iso-doc-section" aria-labelledby="iso-ev-world-title">
        <h3 id="iso-ev-world-title" className="iso-doc-section__title">
          The Test Across the World
        </h3>
        <p className="iso-doc-section__p">
          No look of the test across the world has been taken yet, and its plan of fires is written before any score.
        </p>
      </section>
    );
  }

  const allA = testA.all;
  const aFires = formatSheetCount(testA.episodes_scored ?? allA?.episodes) ?? '0';
  const aPlanFires = formatSheetCount(testA.episodes_in_plan);
  const aLooks = formatSheetCount(allA?.scored_looks);
  const byContA = testA.by_continent ?? {};
  const scoredContCount = Object.values(byContA).filter(
    (c) => (c?.episodes ?? 0) > 0,
  ).length;
  const contCountWord = formatCountWord(scoredContCount) ?? String(scoredContCount);

  const aAheadNum = allA?.ahead ?? 0;
  const aLevelNum = allA?.tied ?? 0;
  const aBehindNum = allA?.behind ?? 0;
  const aAhead = formatSheetCount(aAheadNum) ?? '0';
  const aLevel = formatSheetCount(aLevelNum) ?? '0';
  const aBehind = formatCountNone(aBehindNum) ?? 'none';

  const aheadScoreNames = scoreNamesByClass(allA?.classes, 'ahead');
  const levelScoreNames = scoreNamesByClass(allA?.classes, 'tie');
  const behindScoreNames = scoreNamesByClass(allA?.classes, 'behind');

  const ivA = allA?.interval;
  const ivHeldCount =
    ivA && typeof ivA.held === 'number' && typeof ivA.looks === 'number'
      ? formatSheetCount(Math.round(ivA.held * ivA.looks))
      : null;
  const ivLooksCount = ivA && typeof ivA.looks === 'number' ? formatSheetCount(ivA.looks) : null;
  const ivStatedPct =
    ivA && typeof ivA.stated_level === 'number' ? Math.round(ivA.stated_level * 100) : null;
  const ivShort =
    ivA && typeof ivA.held === 'number' && typeof ivA.stated_level === 'number'
      ? ivA.held < ivA.stated_level
      : false;

  const byZoneA = testA.by_zone ?? {};
  const zoneRows = ZONE_ORDER.filter((z) => Boolean(byZoneA[z.id]));

  const planTestBCnts = plan?.counts?.test_b ?? null;
  const planTestBTotal = planTestBCnts
    ? Object.values(planTestBCnts).reduce((acc, n) => acc + (typeof n === 'number' ? n : 0), 0)
    : null;

  const refitUsed = Boolean(refit?.decision && /\buse\b|\bused\b|\badopt/i.test(refit.decision) && !/\bnot\b/i.test(refit.decision));
  const refitNotUsed = Boolean(refit?.decision && !refitUsed);
  const fitCountTotal = plan?.counts?.fitting
    ? formatSheetCount(Object.values(plan.counts.fitting).reduce((acc, n) => acc + n, 0))
    : null;

  const allB = testB?.all;
  const bFires = testB ? formatSheetCount(testB.episodes_scored ?? allB?.episodes) : null;
  const bAhead = allB ? formatSheetCount(allB.ahead) : null;
  const bLevel = allB ? formatSheetCount(allB.tied) : null;
  const bBehind = allB ? formatCountNone(allB.behind) : null;

  return (
    <section id="iso-ev-world-test" className="iso-doc-section" aria-labelledby="iso-ev-world-title">
      <h3 id="iso-ev-world-title" className="iso-doc-section__title">
        The Test Across the World
      </h3>

      <div className="iso-ev-val-trio" aria-hidden="true">
        <div className="iso-ev-val-stat">
          <span className="iso-ev-val-stat__num">{aAhead}</span>
          <span className="iso-ev-val-stat__label">ahead</span>
        </div>
        <div className="iso-ev-val-stat">
          <span className="iso-ev-val-stat__num">{aLevel}</span>
          <span className="iso-ev-val-stat__label">level</span>
        </div>
        <div className="iso-ev-val-stat">
          <span className="iso-ev-val-stat__num" data-behind={aBehindNum > 0 ? 'true' : 'false'}>
            {aBehindNum === 0 ? '0' : formatSheetCount(aBehindNum)}
          </span>
          <span className="iso-ev-val-stat__label">behind</span>
        </div>
      </div>

      <p className="iso-doc-section__p">
        On {aFires} fires across {contCountWord} continents, chosen by a rule before any was looked at, the estimate was
        ahead of the simple methods on {aAhead} scores, level on {aLevel} and behind on {aBehind}, counting a score only
        when the gap is too large to be luck.
      </p>

      {(aheadScoreNames || levelScoreNames || behindScoreNames) && (
        <p className="iso-doc-section__p">
          {aheadScoreNames ? `Ahead: ${aheadScoreNames}. ` : ''}
          {levelScoreNames ? `Level: ${levelScoreNames}. ` : ''}
          {behindScoreNames ? `Behind: ${behindScoreNames}.` : ''}
        </p>
      )}

      {ivHeldCount && ivLooksCount && ivStatedPct !== null && (
        <p className="iso-doc-section__p">
          The range it states for the total heat held on {ivHeldCount} of {ivLooksCount} passes,{' '}
          {ivShort ? `short of the ${ivStatedPct} percent it states` : `against the ${ivStatedPct} percent it states`}.
        </p>
      )}

      <p className="iso-doc-section__p">
        On these fires it did worse than on the fires it was checked on before, where it was ahead on {otherAhead}{' '}
        scores and behind on {otherBehind}. The model remains experimental.
      </p>

      {plan?.thin && <p className="iso-doc-section__p">{plan.thin}</p>}

      <p className="iso-doc-section__p">
        No ground of a place this page lets you explore is in the validation or either test, so nothing you can open on
        the page shows a test fire before its look.
        {aPlanFires && aLooks
          ? testA.not_scored && testA.not_scored > 0
            ? ` ${formatSheetCount(testA.not_scored)} of ${aPlanFires} planned fires in Test A could not be scored.`
            : ` Every planned fire in Test A (${aFires} of ${aPlanFires}) was scored across ${aLooks} passes of the sharp satellite.`
          : ''}
      </p>

      <div className="iso-doc-table-wrap">
        <table className="iso-doc-table">
          <thead>
            <tr>
              <th scope="col">Test A by continent</th>
              <th scope="col" className="is-num">
                Fires
              </th>
              <th scope="col" className="is-num">
                Ahead
              </th>
              <th scope="col" className="is-num">
                Level
              </th>
              <th scope="col" className="is-num">
                Behind
              </th>
            </tr>
          </thead>
          <tbody>
            {CONTINENT_ORDER.map((cont) => {
              const row = byContA[cont];
              const plannedZero = !row && plan?.counts?.test_a?.[cont] === 0;
              if (!row && !plannedZero) return null;
              const ep = row?.episodes ?? 0;
              const hasJudged = row && typeof row.ahead === 'number';
              return (
                <tr key={cont}>
                  <th scope="row">
                    <span className="iso-doc-table__row-name">{cont}</span>
                  </th>
                  <td className="is-num">
                    <AlignedNumber intPart={formatSheetCount(ep) ?? '0'} integerOnly />
                  </td>
                  {hasJudged ? (
                    <>
                      <td className="is-num">
                        <AlignedNumber intPart={String(row.ahead ?? 0)} integerOnly />
                      </td>
                      <td className="is-num">
                        <AlignedNumber intPart={String(row.tied ?? 0)} integerOnly />
                      </td>
                      <td className="is-num">
                        <AlignedNumber intPart={String(row.behind ?? 0)} integerOnly />
                      </td>
                    </>
                  ) : (
                    <td colSpan={3} className="is-num">
                      {ep === 0 ? 'No fires in Test A' : 'Too few fires to judge'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {zoneRows.length > 0 && (
        <>
          <p className="iso-doc-section__p">
            Four bands of latitude stand in for fuel across the test, since no map of fuels was read.
          </p>
          <div className="iso-doc-table-wrap">
            <table className="iso-doc-table">
              <thead>
                <tr>
                  <th scope="col">Test A by latitude band</th>
                  <th scope="col" className="is-num">
                    Fires
                  </th>
                  <th scope="col" className="is-num">
                    Ahead
                  </th>
                  <th scope="col" className="is-num">
                    Level
                  </th>
                  <th scope="col" className="is-num">
                    Behind
                  </th>
                </tr>
              </thead>
              <tbody>
                {zoneRows.map((z) => {
                  const row = byZoneA[z.id];
                  if (!row) return null;
                  return (
                    <tr key={z.id}>
                      <th scope="row">
                        <span className="iso-doc-table__row-name">{z.label}</span>
                      </th>
                      <td className="is-num">
                        <AlignedNumber intPart={formatSheetCount(row.episodes) ?? '0'} integerOnly />
                      </td>
                      <td className="is-num">
                        <AlignedNumber intPart={String(row.ahead ?? 0)} integerOnly />
                      </td>
                      <td className="is-num">
                        <AlignedNumber intPart={String(row.tied ?? 0)} integerOnly />
                      </td>
                      <td className="is-num">
                        <AlignedNumber intPart={String(row.behind ?? 0)} integerOnly />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {testB && bFires && bAhead && bLevel && bBehind ? (
        <p className="iso-doc-section__p">
          {refitUsed && fitCountTotal
            ? `Tuned again on ${fitCountTotal} fires, the estimate was looked at once on ${bFires} fires that nothing had touched: ahead on ${bAhead} scores, level on ${bLevel} and behind on ${bBehind}.`
            : refitNotUsed
              ? `Tuning it again on the wider set did not pass its check on the validation fires, so it was not used. On ${bFires} fires that nothing had touched, the estimate as it was before was ahead on ${bAhead} scores, level on ${bLevel} and behind on ${bBehind}.`
              : `On ${bFires} fires of Test B that nothing had touched: ahead on ${bAhead} scores, level on ${bLevel} and behind on ${bBehind}.`}
        </p>
      ) : (
        planTestBTotal !== null && (
          <p className="iso-doc-section__p">
            Test B ({formatSheetCount(planTestBTotal)} other fires in the plan, across places kept separate from Test A)
            remains closed until after the wider tuning is checked on the validation fires.
          </p>
        )
      )}

      {freshPlayers && typeof freshPlayers.episodes === 'number' && unsureGain !== null && chanceGain !== null && (
        <p className="iso-doc-section__p">
          On {formatSheetCount(freshPlayers.episodes)} rounds of the second test&apos;s fires, Look Where Unsure gained{' '}
          {unsureGain} points on average and Chance {chanceGain}.
        </p>
      )}
    </section>
  );
}

/**
 * Full document body for "Sealed Before the Pass", reading GET /api/live (WORDS-wider.json).
 */
export function SealedDocument({
  liveDoc,
  liveState,
}: {
  liveDoc: LiveDocRuntime | null;
  liveState: EvidenceState;
}) {
  const [expandedHash, setExpandedHash] = useState<string | null>(null);

  if (!liveDoc) {
    return liveState === 'failed' ? (
      <section className="iso-doc-lead">
        <p className="iso-doc-lead__p">Tonight&apos;s sealed predictions did not load, so no figure is shown.</p>
      </section>
    ) : (
      <Loader surface="inline" line="Loading predictions sealed before the pass" />
    );
  }

  const fires = liveDoc.fires ?? [];
  const seals = [...(liveDoc.seals ?? [])].sort(
    (a, b) => (Date.parse(b.times?.sealed_utc ?? '') || 0) - (Date.parse(a.times?.sealed_utc ?? '') || 0),
  );
  const fireById = new Map(fires.map((f) => [f.id, f]));

  const counts = liveDoc.counts ?? {};
  const waitingCount =
    (counts.sealed ?? 0) + (counts.waiting_for_the_pass ?? 0) + (counts.waiting_for_the_rows ?? 0);
  const scoredCount = counts.scored ?? 0;
  const missedCount = counts.passes_not_sealed ?? 0;

  const rc = liveDoc.running_count;
  const firesScored = rc?.fires_scored ?? 0;
  const overClasses = rc?.over_fires?.classes ?? null;
  const twoFiresScored = firesScored >= 2 && overClasses !== null;

  const liveAhead = formatSheetCount(overClasses?.ahead) ?? '0';
  const liveLevel = formatSheetCount(overClasses?.tie ?? overClasses?.tied) ?? '0';
  const liveBehind = formatCountNone(overClasses?.behind) ?? 'none';

  const distinctPartsCount = new Set(fires.map((f) => f.part).filter(Boolean)).size;
  const partsWord = formatCountWord(distinctPartsCount) ?? String(distinctPartsCount);
  const distinctCrafts = Array.from(new Set(seals.map((s) => formatLiveCraft(s.platform))));
  const craftsPhrase = formatListAnd(distinctCrafts);

  return (
    <>
      <section className="iso-doc-lead" aria-label="Summary">
        <div className="iso-doc-lead__hero">
          {twoFiresScored ? (
            <>
              <span className="iso-doc-lead__figure">{liveAhead}</span>
              <span className="iso-doc-lead__unit">
                scores ahead across {formatSheetCount(firesScored)} scored fires ({liveLevel} level, {liveBehind}{' '}
                behind)
              </span>
            </>
          ) : (
            <>
              <span className="iso-doc-lead__figure">{formatSheetCount(waitingCount || seals.length) ?? '0'}</span>
              <span className="iso-doc-lead__unit">
                {waitingCount === 1 ? 'prediction' : 'predictions'} sealed before the pass across{' '}
                {formatSheetCount(fires.length) ?? '0'} followed fires
              </span>
            </>
          )}
        </div>
        <p className="iso-doc-lead__p iso-doc-lead__p--strong">
          Each prediction here was written down, with a fingerprint of its contents and the time, before NASA published
          what the sharp satellite saw on that pass.
        </p>
        <p className="iso-doc-lead__p">
          It is scored against NASA&apos;s first detections of the pass, published within hours of the overpass, which
          are not the checked archive that replaces them later.
        </p>
      </section>

      <section className="iso-doc-section" aria-labelledby="iso-seal-status-title">
        <h3 id="iso-seal-status-title" className="iso-doc-section__title">
          Running Count
        </h3>
        {twoFiresScored ? (
          <p className="iso-doc-section__p">
            So far {formatSheetCount(scoredCount) ?? '0'} predictions on {formatSheetCount(firesScored) ?? '0'} fires
            are scored: counting a score only when the gap is too large to be luck, ahead of both simple methods on{' '}
            {liveAhead}, level on {liveLevel} and behind on {liveBehind}.
          </p>
        ) : (
          <p className="iso-doc-section__p">
            {waitingCount > 0
              ? `No result yet: ${formatSheetCount(waitingCount)} ${waitingCount === 1 ? 'prediction is' : 'predictions are'} sealed and wait for their pass or for NASA's detections of it.`
              : `No result yet: ${formatSheetCount(fires.length) ?? '0'} burning fires are followed and wait for the next pass window to seal.`}
          </p>
        )}
        <p className="iso-doc-section__p">
          The count of detections is not judged here, because the second simple method needs a fire record of the place
          and these fires have none yet.
        </p>
        {missedCount > 0 && (
          <p className="iso-doc-section__p">
            {capFirst(formatCountWord(missedCount) ?? String(missedCount))}{' '}
            {missedCount === 1 ? 'pass went by before its' : 'passes went by before their'} prediction was sealed, and
            each is listed as missed with the reason; none was sealed late.
          </p>
        )}
      </section>

      {seals.length > 0 && (
        <section className="iso-doc-section" aria-labelledby="iso-seal-table-title">
          <h3 id="iso-seal-table-title" className="iso-doc-section__title">
            Sealed Predictions
          </h3>
          <div className="iso-doc-table-wrap">
            <table className="iso-doc-table">
              <thead>
                <tr>
                  <th scope="col">Fire and pass</th>
                  <th scope="col" className="is-num">
                    Sealed ahead
                  </th>
                  <th scope="col">Status and UTC log times</th>
                  <th scope="col" className="is-num">
                    Fingerprint
                  </th>
                </tr>
              </thead>
              <tbody>
                {seals.map((seal) => {
                  const fire = fireById.get(seal.fire_id);
                  const partKey = seal.part ?? fire?.part ?? '';
                  const partName = LIVE_PART_NAMES[partKey] ?? (partKey ? capFirst(partKey) : 'Fire');
                  const coords = formatCoordPoint(fire?.centre, seal.box ?? fire?.box);
                  const lon = fire?.centre ? fire.centre[0] : midLon(seal.box ?? fire?.box);
                  const passIso = seal.times?.real_pass_utc ?? seal.times?.predicted_pass_utc ?? null;
                  const localPass = localDayTime(passIso, lon);
                  const craft = formatLiveCraft(seal.platform);
                  const beforeStr = formatMinutesBefore(seal.times?.minutes_sealed_before_the_pass);
                  const sealedUtc = formatUtcInstant(seal.times?.sealed_utc);
                  const passUtc = formatUtcInstant(passIso);
                  const scoredUtc = formatUtcInstant(seal.times?.decided_utc);
                  const isOpen = expandedHash === seal.sha256;

                  return (
                    <tr key={seal.sha256}>
                      <th scope="row">
                        <span className="iso-doc-table__row-name">
                          {partName}
                          {coords ? `, ${coords}` : ''}
                        </span>
                        <span className="iso-doc-table__row-desc">
                          {craft}
                          {localPass ? `, ${localPass} at the fire` : ''}
                        </span>
                      </th>
                      <td className="is-num">{beforeStr ?? ''}</td>
                      <td>
                        <div>{formatSealStateWords(seal)}.</div>
                        {(sealedUtc || passUtc) && (
                          <div className="iso-doc-table__row-desc">
                            {sealedUtc ? `Sealed at ${sealedUtc}` : ''}
                            {passUtc ? `${sealedUtc ? ', ' : ''}pass at ${passUtc}` : ''}
                            {scoredUtc ? `, scored at ${scoredUtc}` : ''}.
                          </div>
                        )}
                        {isOpen && (
                          <div className="iso-seal-fp-full">
                            Fingerprint: change one character of the prediction and it no longer matches.
                            <span className="iso-seal-fp-hash">{seal.sha256}</span>
                          </div>
                        )}
                      </td>
                      <td className="is-num">
                        <button
                          type="button"
                          className="iso-seal-fp-btn"
                          aria-expanded={isOpen}
                          aria-label={`Fingerprint ${seal.sha256.slice(0, 12)}, show full fingerprint`}
                          onClick={() => setExpandedHash((prev) => (prev === seal.sha256 ? null : seal.sha256))}
                        >
                          {seal.sha256.slice(0, 12)}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="iso-doc-section" aria-labelledby="iso-seal-how-title">
        <h3 id="iso-seal-how-title" className="iso-doc-section__title">
          How the Fires Are Chosen
        </h3>
        {fires.length > 0 && (
          <p className="iso-doc-section__p">
            Every day a fixed rule picks {formatSheetCount(fires.length)} fires burning now, spread over {partsWord}{' '}
            {distinctPartsCount === 1 ? 'part' : 'parts'} of the world, from the coarse satellite&apos;s detections
            alone.
          </p>
        )}
        {craftsPhrase && (
          <p className="iso-doc-section__p">
            A coming pass is foreseen from the sharp satellite&apos;s repeating ground track; the passes predicted here
            are {craftsPhrase}&apos;s.
          </p>
        )}
        {liveDoc.protocol?.sha256 && (
          <p className="iso-doc-section__p">
            Every prediction is sealed under the live rules whose SHA-256 fingerprint begins with{' '}
            <code>{liveDoc.protocol.sha256.slice(0, 12)}</code>, written before the first seal.
          </p>
        )}
      </section>
    </>
  );
}

/**
 * Full document body for "Every Test on Record", following SHEETS-copy.json and WORDS-wider.json.
 */
export function EvidenceDocument({
  doc,
  state,
  focus = null,
  liveDoc = null,
  onOpenSealed,
}: {
  doc: EvidenceDoc | null;
  state: EvidenceState;
  focus?: 'next_look' | null;
  liveDoc?: LiveDocRuntime | null;
  onOpenSealed?: () => void;
}) {
  const store = useOptionalWorkspace();
  const [detailOpen, setDetailOpen] = useState(false);
  const [fallbackBoxes, setFallbackBoxes] = useState<Record<string, Box>>({});

  useEffect(() => {
    if (store && store.places.places.length > 0) return;
    let cancelled = false;
    fetchCachedRegionsRaw()
      .then((raw) => {
        if (cancelled) return;
        const parsed = parsePlaces(raw);
        const map: Record<string, Box> = {};
        for (const p of parsed.places) {
          map[p.id] = p.box;
        }
        setFallbackBoxes(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [store]);

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

  const fireDaysFor = (f: EvidenceFire): string => {
    const storeBox = store?.places.places.find((p) => p.id === f.region_id)?.box;
    const box = storeBox ?? fallbackBoxes[f.region_id];
    return (
      localDayRange(f.new.first_overpass_utc, f.new.last_overpass_utc, midLon(box)) ??
      utcSpan(f.new.first_overpass_utc, f.new.last_overpass_utc)
    );
  };

  const fires = doc.test_fires.fires;
  const scores = doc.test_fires.scores;
  const testFiresWord = capFirst(formatCountWord(fires.length) ?? String(fires.length));
  const testFireNames = formatListAnd(fires.map((f) => capFirst(f.name)));
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
  const closedRoundsN =
    onVal &&
    typeof doc.next_look.test_episodes?.new === 'number' &&
    doc.next_look.test_episodes.new !== onVal.episodes
      ? formatSheetCount(doc.next_look.test_episodes.new)
      : null;

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

  const freshTest = readFreshTest(doc);

  const liveCounts = liveDoc?.counts;
  const liveWaiting = liveCounts
    ? (liveCounts.sealed ?? 0) + (liveCounts.waiting_for_the_pass ?? 0) + (liveCounts.waiting_for_the_rows ?? 0)
    : 0;
  const liveScored = liveCounts?.scored ?? 0;
  const liveFiresTotal = liveDoc?.fires?.length ?? 0;

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
                    <span className="iso-ev-fire__name">{capFirst(f.name)}</span>
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
                  <span className="iso-ev-fire__meta">{fireDaysFor(f)}</span>
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
                Score level or behind
              </span>
            </span>
            <span>Local solar dates at each fire on the final look</span>
          </figcaption>
        </figure>
      )}

      <section className="iso-doc-section" aria-labelledby="iso-ev-final-look">
        <h3 id="iso-ev-final-look" className="iso-doc-section__title">
          The Final Look
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
                      <span className="iso-doc-table__row-name">{capFirst(f.name)}</span>
                    </th>
                    <td>{fireDaysFor(f)}</td>
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
          Every Look at Them
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
                      <span className="iso-doc-table__row-name">{capFirst(f.name)}</span>
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

      {freshTest && (
        <FreshWorldTestSection freshTest={freshTest} otherAhead={otherAhead} otherBehind={otherBehind} />
      )}

      <section className="iso-doc-section" aria-label="Validation on other fires">
        <h3 className="iso-doc-section__title">Validation on Earlier Fires</h3>
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
          Mean Gain Over Those Rounds
        </h3>

        {roundsN && roundLooksWord && (
          <p className="iso-doc-section__p">
            The game, across {roundsN} four-day rounds drawn from those {otherFiresWord} fires of {otherYears} (
            {roundLooksWord} looks per round): the mean gain of each player is in the table below, in points. One point
            equals one percentage point of burning-square agreement.
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

        {closedRoundsN && (
          <p className="iso-doc-section__p">
            An earlier check across {closedRoundsN} rounds on the closed 2021 test-fire windows, scored before the
            game&apos;s reward was tied to burning-square agreement, also stays in the record and is not run again.
          </p>
        )}
      </section>

      {liveDoc && (
        <section className="iso-doc-section" aria-labelledby="iso-ev-live-seal">
          <h3 id="iso-ev-live-seal" className="iso-doc-section__title">
            Sealed Before the Pass
          </h3>
          <p className="iso-doc-section__p">
            {liveScored > 0
              ? `On ${formatSheetCount(liveFiresTotal)} fires burning now, ${formatSheetCount(liveScored)} ${liveScored === 1 ? 'prediction sealed' : 'predictions sealed'} before the sharp satellite passed ${liveScored === 1 ? 'has' : 'have'} been scored and ${formatSheetCount(liveWaiting)} more wait for their pass or NASA's detections.`
              : `On ${formatSheetCount(liveFiresTotal)} fires burning now, ${formatSheetCount(liveWaiting)} ${liveWaiting === 1 ? 'prediction is' : 'predictions are'} sealed with a SHA-256 fingerprint before the sharp satellite passes and ${liveWaiting === 1 ? 'waits' : 'wait'} for NASA's detections.`}
          </p>
          {onOpenSealed && (
            <div className="iso-plain-actions">
              <button type="button" className="iso-plain-action" onClick={onOpenSealed}>
                <span>Open Sealed Before the Pass</span>
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}

const DOC_TITLES: Record<ViewerDocId, string> = {
  fire: 'This Fire',
  scores: 'The Scores',
  tests: 'Every Test on Record',
  sealed: 'Sealed Before the Pass',
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
  const [fetchedLive, setFetchedLive] = useState<{ doc: LiveDocRuntime | null; state: EvidenceState }>({
    doc: null,
    state: 'loading',
  });
  const [fallbackSensorModel, setFallbackSensorModel] = useState<SensorModelPayload | null>(null);
  const [fallbackOverlap, setFallbackOverlap] = useState<{
    regionId: string;
    overlap: OverlapEvidence | null;
    place: string | null;
  } | null>(null);

  useEffect(() => {
    if (open) setActiveDoc(initialDoc);
  }, [open, initialDoc]);

  const effectiveScore = score ?? store?.test.score ?? null;
  const effectiveModel = model ?? store?.run.model ?? methodEvidence?.model ?? null;
  const effectivePlace = place ?? regionName ?? store?.place.title ?? 'Feather River & Plumas, CA';
  const effectiveRegionId = regionId ?? store?.place.regionId ?? 'plumas_ca';
  const effectiveApiBase = apiBase ?? API_BASE;
  const activeRunId = store?.run.active?.run_id ?? null;

  const providedEvDoc = evidenceDoc ?? store?.model.evidence ?? null;
  useEffect(() => {
    if (!open || providedEvDoc || evidenceState === 'failed') return;
    let cancelled = false;
    setFetchedEv({ doc: null, state: 'loading' });
    fetchCachedEvidenceDoc()
      .then((doc) => {
        if (cancelled) return;
        setFetchedEv(doc ? { doc, state: 'ready' } : { doc: null, state: 'failed' });
      })
      .catch(() => {
        if (!cancelled) setFetchedEv({ doc: null, state: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [open, providedEvDoc, evidenceState]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFetchedLive((prev) => (prev.doc ? prev : { doc: null, state: 'loading' }));
    fetchCachedLiveDoc()
      .then((doc) => {
        if (cancelled) return;
        setFetchedLive(doc ? { doc, state: 'ready' } : { doc: null, state: 'failed' });
      })
      .catch(() => {
        if (!cancelled) setFetchedLive({ doc: null, state: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || sensorModel !== null) return;
    let cancelled = false;
    fetchCachedSensorModel(activeRunId)
      .then((m) => {
        if (!cancelled) setFallbackSensorModel(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, sensorModel, activeRunId]);

  const cal = store?.calendar.state.cal && !store.calendar.state.cal.simulated ? store.calendar.state.cal : null;
  const directOverlap = overlap ?? methodEvidence?.overlap ?? cal?.overlap ?? null;

  useEffect(() => {
    if (!open || directOverlap) return;
    let cancelled = false;
    fetchCachedCalendarRaw(effectiveRegionId)
      .then((raw) => {
        if (cancelled) return;
        const parsed = parseCalendar(raw);
        if (parsed && !parsed.simulated) {
          setFallbackOverlap({
            regionId: effectiveRegionId,
            overlap: parsed.overlap,
            place: parsed.regionName.split(',')[0] ?? parsed.regionName,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, directOverlap, effectiveRegionId]);

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

  const effectiveSensorModel = sensorModel ?? fallbackSensorModel;
  const matchedFallbackOverlap =
    fallbackOverlap && fallbackOverlap.regionId === effectiveRegionId ? fallbackOverlap : null;
  const resolvedOverlap = directOverlap ?? matchedFallbackOverlap?.overlap ?? null;
  const resolvedOverlapPlace =
    overlapPlace ??
    methodEvidence?.overlapPlace ??
    (cal ? cal.regionName.split(',')[0] : null) ??
    matchedFallbackOverlap?.place ??
    null;

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
    items.push({ id: 'sealed', label: 'Sealed Before the Pass' });
    items.push({ id: 'method', label: 'Method and Data' });
    items.push({ id: 'sensors', label: 'Sensor Geometry' });
    items.push({ id: 'sources', label: 'Sources' });
    return items;
  }, [store?.run.active, effectiveScore]);

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
        <EvidenceDocument
          doc={resolvedEvDoc}
          state={resolvedEvState}
          focus={focus}
          liveDoc={fetchedLive.doc}
          onOpenSealed={() => handleSelect('sealed')}
        />
      )}

      {activeDoc === 'sealed' && (
        <SealedDocument liveDoc={fetchedLive.doc} liveState={fetchedLive.state} />
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
          model={effectiveSensorModel}
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
