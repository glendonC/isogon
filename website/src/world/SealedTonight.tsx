import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { countryAt, countryShapeAt, pointWords } from './countryAt';
import { placeLabels } from './labels';
import { closeGroup, parseLive, platformWords, type Live, type LiveFire, type LiveSeal } from './live';
import { type Box } from './projection';
import { useRead } from './read';
import { clockAt, clockOnly, dayAt, partAt, percent1 } from './words';
import { inFilm, useGuideRoom, WorldCaption } from './WorldCaption';
import { WorldCanvas } from './WorldCanvas';
import '../styles/world.css';

/**
 * Tonight's sealed predictions. It reads one answer, the live route's (`source`), and draws two things that say the
 * same fact in two ways. On the Earth, where the fires are. On the board, one row per fire with a line of time: the
 * white square where the prediction was written down and sealed, the ring where the sharp satellite passed, and the
 * stretch until its rows were published. On every row the square stands left of the ring: the prediction existed
 * before the answer did. Times are by the sun at the fire, with the part of the day; the digest is shortened, the
 * whole of it one click away.
 */

export interface SealedTonightProps {
  /** Address of the live answer. */
  source: string;
  /** The time the board is drawn at; the answer's own time when left out, so a recorded answer reads as it was. */
  now?: string | null;
  /** Hours of the line of time before and after now. */
  before?: number;
  after?: number;
  /**
   * The picture's own caption where the page's objective stands (the objective on the page, the film's caption in the
   * film presentation) and the guide's room kept clear at the bottom (`--world-guide-room`); on by default. A page
   * that frames the board with its own trail passes false.
   */
  caption?: boolean;
  /** The guide's room kept clear without a caption of its own (the host draws the caption): on with `caption`. */
  keepGuideRoom?: boolean;
}

const H = 3_600_000;
const t = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const PARTS: Record<string, string> = {
  africa: 'Africa',
  oceania: 'Oceania',
  south_america: 'South America',
  north_america: 'North America',
  europe: 'Europe',
  asia: 'Asia',
};

/** The board's notes, in the order they give way when the board runs short of room: the least needed first. */
const DROP = ['nrt', 'protocol', 'missed', 'listed'] as const;

export const SEAL_WORDS = {
  // The product lane's words (WORDS-wider.json version 4, world_pictures, sealed_open; version 14 for the film's caption).
  objective: 'See predictions written before the pass',
  film: 'Live: predictions locked before NASA publishes the data.',
  label: 'The Earth, with the fires whose predictions are sealed tonight',
  loading: "Loading tonight's sealed predictions.",
  failed: "Tonight's sealed predictions did not load.",
  none: 'No fire is followed yet tonight.',
  protocol: (sha: string, at: string | null) => `Every prediction here is sealed under the rules with digest ${sha.slice(0, 10)}${at ? `, written ${at}` : ''}, before the first seal.`,
  keySeal: 'Written down and sealed',
  keyPass: 'VIIRS passes',
  keyRows: 'Its detections published',
  keyScored: 'Scored',
  now: 'Now',
  ago: (h: number) => (h === 1 ? '1 hour ago' : `${h} hours ago`),
  ahead: (h: number) => (h === 1 ? 'in 1 hour' : `in ${h} hours`),
  chosen: (rows: number | null) => (rows !== null ? `Chosen from ${rows} MODIS detections in 48 hours; no pass sealed yet` : 'No pass sealed yet'),
  sealed: (at: string | null, mins: number | null, pass: string | null, part: string | null) =>
    `Sealed${at ? ` at ${at}` : ''}${mins !== null ? `, ${Math.round(mins)} minutes before the pass` : ''}${pass ? ` at about ${pass}` : ''}${part ? ` ${part}` : ''}`,
  waitingPass: (pass: string | null) => `Pass due${pass ? ` at ${pass}` : ''}; not yet listed by NASA`,
  waitingRows: (pass: string | null, by: string | null) => `Passed${pass ? ` at ${pass}` : ''}; detections ${by ? `expected by ${by}` : 'not all published yet'}`,
  // Words version 16: no count of scores; each row opens its result, the overlap with VIIRS fire pixels.
  scored: (_a: number | null, _of: number | null, none: boolean) => (none ? 'Scored; VIIRS saw no fire in the box' : 'Scored'),
  result: (model: string, modis: string) => `Overlap with VIIRS fire pixels: the model ${model} percent, MODIS alone ${modis}.`,
  resultWithin: (model: string, modis: string) => `Within one pixel: the model ${model} percent, MODIS alone ${modis}.`,
  notScored: (why: string | null) => `Not scored${why ? `: ${why}` : ''}`,
  title: (platform: string | null, day: string | null, point: string) => [platform ? `Predicted pass of ${platform}` : null, day, point].filter(Boolean).join(', '),
  // The judge's two readings of the board, from the answer's own figures (the first in the product lane's words).
  listed: (followed: number, sealed: number, scored: number) =>
    `Of the ${followed} fires followed, the ${sealed} with a sealed pass are listed here, and ${scored} of them are scored.`,
  // The film's one proof (the fresh judge, JUDGE-1 item 4): one scored prediction's fingerprint and how long before the
  // pass it was sealed.
  proofLabel: 'The fingerprint of one sealed prediction',
  proofLine: (minutes: number, where: string) =>
    `Written down and sealed ${Math.round(minutes)} minutes before VIIRS passed over ${where}, then scored.`,
  close: (k: number, n: number, where: string) => `${k} of the ${n} fires scored lie close together in ${where}, so they are not ${n} separate tests.`,
  /** Sealed fires past what the board has room for, said in one line under the rows. */
  more: (items: string[]) => `Also sealed: ${items.join(', ')}`,
  rest: (items: string[], any: boolean) => `${any ? 'Also followed' : 'Followed tonight'}, no pass sealed yet: ${items.join(', ')}`,
  restAbout: 'Each was chosen from MODIS alone, by its detections in the last 48 hours.',
  digest: 'Digest',
  whole: 'The whole digest of this seal',
  copy: 'Copy',
  copied: 'Copied',
  nrt: (note: string) => `Scored on ${note}.`,
  missed: (n: number, why: string | null) =>
    `${n === 1 ? 'One pass was' : `${n} passes were`} not sealed in time and will not be scored${why ? `: ${why}` : ''}.`,
};

function latest(seals: LiveSeal[]): LiveSeal | null {
  return seals.reduce<LiveSeal | null>((a, s) => (!a || t(s.sealedUtc) > t(a.sealedUtc) ? s : a), null);
}

/** The seal a fire's row speaks of: its latest scored one, else one that could not be scored, else its latest. */
function telling(seals: LiveSeal[]): LiveSeal | null {
  return latest(seals.filter((s) => s.state === 'scored')) ?? latest(seals.filter((s) => s.state === 'not_scored')) ?? latest(seals);
}

function words(f: LiveFire, s: LiveSeal | null): string {
  const lon = f.centre[0];
  if (!s) return SEAL_WORDS.chosen(f.modisRows48h);
  const pass = clockAt(s.realPassUtc ?? s.predictedPassUtc, lon);
  switch (s.state) {
    case 'sealed':
      return SEAL_WORDS.sealed(clockOnly(s.sealedUtc, lon), s.minutesBefore, clockOnly(s.realPassUtc ?? s.predictedPassUtc, lon), partAt(s.realPassUtc ?? s.predictedPassUtc, lon));
    case 'waiting_for_the_pass':
      return SEAL_WORDS.waitingPass(pass);
    case 'waiting_for_the_rows':
      return SEAL_WORDS.waitingRows(pass, clockAt(s.rowsExpectedUtc, lon));
    case 'scored':
      return SEAL_WORDS.scored(s.aheadOfBothOn, s.judged, s.hiddenPixels === 0);
    case 'not_scored':
      return SEAL_WORDS.notScored(s.reason);
    default:
      return s.state;
  }
}

export function SealedTonight({ source, now = null, before = 6, after, caption = true, keepGuideRoom }: SealedTonightProps) {
  const keep = keepGuideRoom ?? caption;
  const read = useRead<unknown>(source);
  const live: Live | null = read.state === 'ready' ? parseLive(read.value) : null;
  const [open, setOpen] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const film = useMemo(inFilm, []);
  // In the film the line of hours ends 3 hours ahead, where nothing is due yet, so what has happened takes its width.
  after = after ?? (film ? 3 : 9);
  const [capBottom, setCapBottom] = useState(0);
  const [guideRoom, setGuideRoom] = useState(0);
  const roomRef = useGuideRoom(useCallback((px: number) => setGuideRoom(px), []));
  // The board keeps clear of where the guide speaks: when it runs past the room left above the guide, its lesser notes
  // give way, then its last rows join one line, then its last notes. Fitted again when the screen resizes or the answer
  // changes.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<{ drop: number; rows: number }>({ drop: 0, rows: Infinity });
  const onCaption = useCallback((px: number) => setCapBottom(px), []);

  const nowMs = t(now ?? live?.writtenUtc ?? null) || Date.now();
  const t0 = nowMs - before * H;
  const t1 = nowMs + after * H;
  const x = (iso: string | null | undefined) => {
    const v = t(iso);
    return Number.isFinite(v) ? Math.min(Math.max((v - t0) / (t1 - t0), 0), 1) * 100 : null;
  };

  const fires = useMemo(() => (live ? [...live.fires].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)) : []), [live]);
  const byFire = useMemo(() => {
    const m = new Map<string, LiveSeal[]>();
    for (const s of live?.seals ?? []) m.set(s.fireId, [...(m.get(s.fireId) ?? []), s]);
    return m;
  }, [live]);
  const focus = useMemo<Box | undefined>(() => {
    if (!fires.length) return undefined;
    const w = Math.min(...fires.map((f) => f.box[0]));
    const e = Math.max(...fires.map((f) => f.box[2]));
    const s = Math.min(...fires.map((f) => f.box[1]));
    const n = Math.max(...fires.map((f) => f.box[3]));
    const padX = Math.max(25, (e - w) * 0.12);
    const padY = Math.max(18, (n - s) * 0.2);
    return [w - padX, s - padY, e + padX, n + padY];
  }, [fires]);

  // Fitted again from the start when the screen's size or the answer changes.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let w = el.clientWidth;
    let h = el.clientHeight;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === w && el.clientHeight === h) return;
      w = el.clientWidth;
      h = el.clientHeight;
      setFit({ drop: 0, rows: Infinity });
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
  useLayoutEffect(() => setFit({ drop: 0, rows: Infinity }), [read]);
  // After each layout: if the board runs past the room above the guide, one more note gives way, then a row.
  useLayoutEffect(() => {
    const el = rootRef.current;
    const board = boardRef.current;
    if (!el || !board || !live) return;
    const floor = el.getBoundingClientRect().bottom - (keep || caption ? guideRoom : 0);
    const last = board.lastElementChild?.getBoundingClientRect().bottom ?? board.getBoundingClientRect().bottom;
    if (last <= floor + 1) return;
    // The three lesser notes first; then rows, down to six, join the one line; then the judge's line and the count
    // over the scored fires; then rows down to three.
    const rowsN = Math.min(fit.rows, live.fires.filter((f) => byFire.has(f.id)).length);
    if (fit.drop < 3) setFit({ drop: fit.drop + 1, rows: fit.rows });
    else if (rowsN > 6) setFit({ drop: fit.drop, rows: rowsN - 1 });
    else if (fit.drop < DROP.length) setFit({ drop: fit.drop + 1, rows: fit.rows });
    else if (rowsN > 3) setFit({ drop: fit.drop, rows: rowsN - 1 });
  });

  if (read.state === 'loading') return <div className="world-sealed world-sealed--note">{SEAL_WORDS.loading}</div>;
  if (read.state === 'failed' || !live) return <div className="world-sealed world-sealed--note">{SEAL_WORDS.failed}</div>;
  if (!fires.length) return <div className="world-sealed world-sealed--note">{SEAL_WORDS.none}</div>;

  const whereOf = (f: LiveFire) => countryAt(f.centre[0], f.centre[1]) ?? (f.part ? PARTS[f.part] ?? f.part : pointWords(f.centre[0], f.centre[1]));
  const numbered = fires.map((f, i) => ({ f, i }));
  // Fires with no seal yet share one line, so the board is the height of what has happened.
  const sealedAll = numbered.filter(({ f }) => byFire.has(f.id));
  const shown = sealedAll.slice(0, fit.rows);
  const more = sealedAll.slice(fit.rows);
  const rest = numbered.filter(({ f }) => !byFire.has(f.id));
  const note = (name: (typeof DROP)[number]) => DROP.indexOf(name) >= fit.drop;

  const ticks: Array<{ at: number; text: string; minor: boolean }> = [];
  for (let h = -before; h <= after; h += 3)
    ticks.push({ at: ((h + before) / (before + after)) * 100, text: h === 0 ? SEAL_WORDS.now : h < 0 ? SEAL_WORDS.ago(-h) : SEAL_WORDS.ahead(h), minor: h % 6 !== 0 });

  // The film's caption once a score exists and the count over the fires stands; before that, the objective.
  const scored = live.seals.filter((s) => s.state === 'scored').length;
  const o = live.overFires;
  const filmLine = scored > 0 && o && o.ahead !== null && o.tied !== null && o.behind !== null ? SEAL_WORDS.film : null;
  const captionLine = caption ? (film ? filmLine ?? SEAL_WORDS.objective : SEAL_WORDS.objective) : null;
  // The fires scored, and whether most of them lie close together (one weather, one day: not separate tests).
  const scoredFires = fires.filter((f) => (byFire.get(f.id) ?? []).some((x) => x.state === 'scored'));
  const group = closeGroup(scoredFires);
  const groupWhere = (() => {
    if (!group) return null;
    const c: [number, number] = [group.reduce((a, f) => a + f.centre[0], 0) / group.length, group.reduce((a, f) => a + f.centre[1], 0) / group.length];
    const shape = countryShapeAt(c[0], c[1]) ?? countryShapeAt(group[0].centre[0], group[0].centre[1]);
    if (!shape) return whereOf(group[0]);
    // Northern or southern where the group lies in the country's top or bottom third.
    const at = (c[1] - shape.box[1]) / (shape.box[3] - shape.box[1] || 1);
    return `${at > 2 / 3 ? 'northern ' : at < 1 / 3 ? 'southern ' : ''}${shape.name}`;
  })();

  // In the film, once a score stands: the caption and one proof, the latest scored seal; the rows are the page's.
  const proof = latest(live.seals.filter((x) => x.state === 'scored' && x.minutesBefore !== null && x.sha256));
  const proofFire = proof ? fires.find((f) => f.id === proof.fireId) ?? null : null;
  const filmProof = film && filmLine !== null && proof !== null && proofFire !== null;

  return (
    <div
      className="world-sealed"
      ref={rootRef}
      data-captioned={caption ? 'true' : 'false'}
      data-room={keep ? 'true' : 'false'}
      style={caption ? { paddingTop: capBottom + 12, paddingBottom: guideRoom } : keep ? { paddingBottom: guideRoom } : undefined}
    >
      {keep && <div className="world-guide-room" ref={roomRef} aria-hidden="true" />}
      <WorldCaption line={captionLine} onHeight={onCaption} />
      <div className="world-sealed__earth">
        <WorldCanvas label={SEAL_WORDS.label} focus={focus}>
          {(p) => {
            const items = fires.map((f, i) => {
              const [mx, my] = p.at(f.centre[0], f.centre[1]);
              return { id: f.id, x: mx, y: my, text: String(i + 1), rank: i };
            });
            // In the film's proof the marks stand without their numbers: the rows that name them are the page's.
            const placed = placeLabels(filmProof ? [] : items, p.w, p.h, { mark: 5 });
            return (
              <>
                <svg className="world-leaders" width={p.w} height={p.h} aria-hidden="true">
                  {placed.map((l) => (l.shown ? <line key={l.id} x1={l.from[0]} y1={l.from[1]} x2={l.to[0]} y2={l.to[1]} /> : null))}
                </svg>
                {items.map((m, i) => {
                  const s = telling(byFire.get(m.id) ?? []);
                  return (
                    <div key={m.id}>
                      <span
                        className="world-seal-mark"
                        data-sealed={s ? 'true' : 'false'}
                        data-over={over === m.id || (filmProof && proofFire?.id === m.id) ? 'true' : 'false'}
                        style={{ left: m.x, top: m.y }}
                        aria-hidden="true"
                      />
                      {placed[i]?.shown && (
                        <span className="world-label world-label--num" style={{ left: placed[i].left, top: placed[i].top }} data-over={over === m.id ? 'true' : 'false'}>
                          {m.text}
                        </span>
                      )}
                    </div>
                  );
                })}
              </>
            );
          }}
        </WorldCanvas>
      </div>
      {filmProof && proof && proofFire ? (
        <div className="world-proof">
          <div className="world-proof__label">{SEAL_WORDS.proofLabel}</div>
          <div className="world-proof__sha world-mono">{proof.sha256.slice(0, 12)}</div>
          <div className="world-proof__line">{SEAL_WORDS.proofLine(proof.minutesBefore!, whereOf(proofFire))}</div>
        </div>
      ) : (
      <div className="world-board" ref={boardRef}>
        {live.protocol?.sha256 && note('protocol') && <div className="world-board__rule">{SEAL_WORDS.protocol(live.protocol.sha256, null)}</div>}
        {live.example && <div className="world-board__rule world-legend__caution">{live.example}</div>}
        <div className="world-board__head">
          <span />
          <span className="world-board__key">
            <span className="world-key-seal" aria-hidden="true" />
            {SEAL_WORDS.keySeal}
            <span className="world-key-pass" aria-hidden="true" />
            {SEAL_WORDS.keyPass}
            <span className="world-key-rows" aria-hidden="true" />
            {SEAL_WORDS.keyRows}
            {live.seals.some((x) => x.state === 'scored') && (
              <>
                <span className="world-key-pass world-key-pass--scored" aria-hidden="true" />
                {SEAL_WORDS.keyScored}
              </>
            )}
          </span>
          <span className="world-board__axis">
            {ticks.map((k) => (
              <span key={k.at} style={{ left: `${k.at}%` }} data-now={k.text === SEAL_WORDS.now ? 'true' : 'false'} data-minor={k.minor ? 'true' : 'false'}>
                {k.text}
              </span>
            ))}
          </span>
          <span />
        </div>
        <ol className="world-board__rows">
          {shown.map(({ f, i }) => {
            const seals = (byFire.get(f.id) ?? []).sort((a, b) => t(a.sealedUtc) - t(b.sealedUtc));
            const s = telling(seals);
            const point = pointWords(f.centre[0], f.centre[1]);
            return (
              <li
                key={f.id}
                className="world-board__row"
                data-over={over === f.id ? 'true' : 'false'}
                data-opens={s ? 'true' : 'false'}
                onPointerEnter={() => setOver(f.id)}
                onPointerLeave={() => setOver(null)}
                onClick={() => s && setOpen((o) => (o === s.sha256 ? null : s.sha256))}
              >
                <span className="world-board__num">{i + 1}</span>
                <span className="world-board__where" title={point}>
                  {whereOf(f)}
                </span>
                <span className="world-board__words" title={s ? SEAL_WORDS.title(platformWords(s.platform), dayAt(s.sealedUtc, f.centre[0]), point) : point}>
                  {words(f, s)}
                </span>
                <span className="world-board__track" aria-hidden="true">
                  <span className="world-board__now" style={{ left: `${((nowMs - t0) / (t1 - t0)) * 100}%` }} />
                  {seals.map((sl) => {
                    const xs = x(sl.sealedUtc);
                    const xp = x(sl.realPassUtc ?? sl.predictedPassUtc);
                    const xr = x(sl.rowsRetrievedUtc);
                    const xe = x(sl.rowsExpectedUtc);
                    return (
                      <span key={sl.sha256}>
                        {xs !== null && xp !== null && <span className="world-track-wait" style={{ left: `${xs}%`, width: `${Math.max(0, xp - xs)}%` }} />}
                        {xp !== null && (xr !== null || xe !== null) && (
                          <span className="world-track-rows" data-done={xr !== null ? 'true' : 'false'} style={{ left: `${xp}%`, width: `${Math.max(0, (xr ?? xe ?? xp) - xp)}%` }} />
                        )}
                        {xp !== null && (
                          <span className="world-track-pass" data-real={sl.realPassUtc ? 'true' : 'false'} data-scored={sl.state === 'scored' ? 'true' : 'false'} style={{ left: `${xp}%` }} />
                        )}
                        {xs !== null && <span className="world-track-seal" style={{ left: `${xs}%` }} />}
                      </span>
                    );
                  })}
                </span>
                <span className="world-board__digest">
                  {s && (
                    <button type="button" className="world-act" aria-expanded={open === s.sha256} aria-label={`${SEAL_WORDS.digest} ${s.sha256}`}>
                      <span className="world-mono">{s.sha256.slice(0, 10)}</span>
                    </button>
                  )}
                </span>
                {s && open === s.sha256 && s.overlap && (
                  <span className="world-board__whole">
                    <span>{SEAL_WORDS.result(percent1(s.overlap.model.exact), percent1(s.overlap.modis.exact))}</span>
                    <span className="world-board__sub">{SEAL_WORDS.resultWithin(percent1(s.overlap.model.within), percent1(s.overlap.modis.within))}</span>
                  </span>
                )}
                {s && open === s.sha256 && (
                  <span className="world-board__whole">
                    <span className="world-board__sub">{SEAL_WORDS.whole}</span>
                    <span className="world-mono world-select">{s.sha256}</span>
                    <button
                      type="button"
                      className="world-act world-act--quiet"
                      onClick={(e) => {
                        e.stopPropagation();
                        void navigator.clipboard?.writeText(s.sha256);
                        setCopied(s.sha256);
                      }}
                    >
                      {copied === s.sha256 ? SEAL_WORDS.copied : SEAL_WORDS.copy}
                    </button>
                  </span>
                )}
              </li>
            );
          })}
          {more.length > 0 && (
            <li className="world-board__row world-board__row--rest">
              <span />
              <span className="world-board__rest">{SEAL_WORDS.more(more.map(({ f, i }) => `${i + 1} ${whereOf(f)}`))}</span>
            </li>
          )}
          {rest.length > 0 && (
            <li className="world-board__row world-board__row--rest">
              <span />
              <span className="world-board__rest">
                {SEAL_WORDS.rest(
                  rest.map(({ f, i }) => `${i + 1} ${whereOf(f)}`),
                  shown.length > 0,
                )}
                {shown.length === 0 && <span className="world-board__restabout">{SEAL_WORDS.restAbout}</span>}
              </span>
            </li>
          )}
        </ol>
        {scoredFires.length > 0 && note('listed') && (
          <div className="world-board__rule">
            {SEAL_WORDS.listed(fires.length, sealedAll.length, scoredFires.length)}
            {group && groupWhere ? ` ${SEAL_WORDS.close(group.length, scoredFires.length, groupWhere)}` : ''}
          </div>
        )}
        {note('missed') && live.notSealed.length > 0 && (
          <div className="world-board__rule">{SEAL_WORDS.missed(live.notSealed.length, live.notSealed.length === 1 ? live.notSealed[0].reason : null)}</div>
        )}
        {note('nrt') && live.rowsNote && <div className="world-board__rule">{SEAL_WORDS.nrt(live.rowsNote)}</div>}
      </div>
      )}
    </div>
  );
}
