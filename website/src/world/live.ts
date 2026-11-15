/**
 * The answer of the sealed predictions (`live.json`, served by the live route): the fires followed tonight, chosen
 * from coarse rows alone; every prediction sealed with its digest and time before the sharp satellite's pass; its
 * state; and, once the pass's rows are complete, its scores. Read as served; a key the answer lacks reads null and
 * the line that would name it is not said.
 */

export type SealState = 'sealed' | 'waiting_for_the_pass' | 'waiting_for_the_rows' | 'scored' | 'not_scored';

export interface LiveFire {
  id: string;
  box: [number, number, number, number];
  centre: [number, number];
  part: string | null;
  rank: number | null;
  modisRows48h: number | null;
  chosenUtc: string | null;
}

export interface LiveSeal {
  sha256: string;
  fireId: string;
  platform: string | null;
  state: SealState | string;
  reason: string | null;
  sealedUtc: string | null;
  predictedPassUtc: string | null;
  predictedSpanUtc: [string, string] | null;
  realPassUtc: string | null;
  minutesBefore: number | null;
  rowsExpectedUtc: string | null;
  rowsRetrievedUtc: string | null;
  decidedUtc: string | null;
  aheadOfBothOn: number | null;
  judged: number | null;
  /** The sharp satellite's fire pixels in the box at the pass, as scored (0: it saw no fire there). */
  hiddenPixels: number | null;
}

export interface Live {
  what: string | null;
  writtenUtc: string | null;
  rowsNote: string | null;
  protocol: { sha256: string | null; version: number | null; writtenUtc: string | null; name: string | null } | null;
  states: Record<string, string>;
  fires: LiveFire[];
  seals: LiveSeal[];
  notSealed: Array<{ fireId: string; platform: string | null; predictedUtc: string | null; reason: string | null }>;
  /** Over the fires scored, judged with an interval: how many scores were ahead, tied and behind. Null until two. */
  overFires: { fires: number | null; ahead: number | null; tied: number | null; behind: number | null; scores: number | null } | null;
  firesScored: number | null;
  /** Said in the caution colour when the answer is an example written for a frame. */
  example: string | null;
}

type Obj = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const box4 = (v: unknown): [number, number, number, number] | null => {
  const a = arr(v).map(num);
  return a.length === 4 && a.every((x) => x !== null) ? (a as [number, number, number, number]) : null;
};

export function parseLive(body: unknown): Live {
  const o = (body ?? {}) as Obj;
  const p = (o.protocol ?? null) as Obj | null;
  const fires = arr(o.fires).flatMap((f): LiveFire[] => {
    const x = f as Obj;
    const box = box4(x.box);
    const id = str(x.id);
    if (!box || !id) return [];
    const c = arr(x.centre).map(num);
    return [
      {
        id,
        box,
        centre: c.length === 2 && c[0] !== null && c[1] !== null ? [c[0], c[1]] : [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2],
        part: str(x.part),
        rank: num(x.rank),
        modisRows48h: num(x.modis_rows_48h),
        chosenUtc: str(x.chosen_utc),
      },
    ];
  });
  const seals = arr(o.seals).flatMap((s): LiveSeal[] => {
    const x = s as Obj;
    const t = (x.times ?? {}) as Obj;
    const sc = (x.scores ?? null) as Obj | null;
    const sha = str(x.sha256);
    const fireId = str(x.fire_id);
    if (!sha || !fireId) return [];
    const span = arr(t.predicted_span_utc).map(str);
    return [
      {
        sha256: sha,
        fireId,
        platform: str(x.platform),
        state: str(x.state) ?? 'sealed',
        reason: str(x.reason),
        sealedUtc: str(t.sealed_utc),
        predictedPassUtc: str(t.predicted_pass_utc),
        predictedSpanUtc: span.length === 2 && span[0] && span[1] ? [span[0], span[1]] : null,
        realPassUtc: str(t.real_pass_utc),
        minutesBefore: num(t.minutes_sealed_before_the_pass),
        rowsExpectedUtc: str(t.rows_expected_utc),
        rowsRetrievedUtc: str(t.rows_retrieved_utc),
        decidedUtc: str(t.decided_utc),
        aheadOfBothOn: sc ? num(sc.ahead_of_both_on) : null,
        judged: sc ? num(sc.judged) : null,
        hiddenPixels: sc ? num(sc.hidden_pixels_in_box) : null,
      },
    ];
  });
  return {
    what: str(o.what),
    writtenUtc: str(o.written_utc),
    rowsNote: str(o.rows_note),
    protocol: p ? { sha256: str(p.sha256), version: num(p.version), writtenUtc: str(p.written_utc), name: str(p.name) } : null,
    states: Object.fromEntries(Object.entries((o.states ?? {}) as Obj).filter(([, v]) => typeof v === 'string')) as Record<string, string>,
    fires,
    seals,
    notSealed: arr(o.not_sealed).map((m) => {
      const x = m as Obj;
      return { fireId: str(x.fire_id) ?? '', platform: str(x.platform), predictedUtc: str(x.predicted_time_utc), reason: str(x.reason) };
    }),
    example: str(o.example),
    ...runningCount(o.running_count),
  };
}

function runningCount(v: unknown): Pick<Live, 'overFires' | 'firesScored'> {
  const r = (v ?? null) as Obj | null;
  if (!r) return { overFires: null, firesScored: null };
  const over = (r.over_fires ?? null) as Obj | null;
  const cls = (over?.classes ?? null) as Obj | null;
  return {
    firesScored: num(r.fires_scored),
    overFires: cls
      ? {
          fires: num(r.fires_scored),
          ahead: num(cls.ahead),
          tied: num(cls.tie ?? cls.tied),
          behind: num(cls.behind),
          scores: over?.scores && typeof over.scores === 'object' ? Object.keys(over.scores as Obj).length : null,
        }
      : null,
  };
}

/** A platform as the page says it: "VIIRS_NOAA20" is "NOAA-20". */
export function platformWords(p: string | null): string | null {
  if (!p) return null;
  const m = /NOAA[-_]?(\d+)/i.exec(p);
  if (m) return `NOAA-${m[1]}`;
  if (/SNPP|SUOMI/i.test(p)) return 'Suomi NPP';
  return p;
}
