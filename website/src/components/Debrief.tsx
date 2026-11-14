import { useState, type ReactNode } from 'react';
import { SCORE_NAMES, platformName, utcSpan, type BlindTest, type BlindVerdict, type ModelStatus } from '../content/realRuns';

/** The judged scores in reading order; any other id the run sends follows. */
const ORDER = [
  'csi_one_cell_tolerance',
  'csi_strict_375m',
  'hit_rate_at_equal_area',
  'brier',
  'pixel_count_error_of_sums',
  'frp_error_of_sums',
  'frp_median_abs_relative_error',
];

const NAMES: Record<string, string> = {
  reconstruction: 'Isogon',
  painted_modis: 'MODIS as detected',
  overlap_ratio: 'the overlap ratio',
  painted_viirs: 'VIIRS as detected',
  viirs_ratio: 'the VIIRS ratio',
};
const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The value as shown, and the number compared at that precision, so "ahead" never names two equal-looking values. */
function shown(id: string, v: number): { text: string; at: number } {
  if (id.startsWith('csi')) return { text: v.toFixed(2), at: Math.round(v * 100) };
  if (id === 'brier') return { text: v.toFixed(3), at: Math.round(v * 1000) };
  return { text: `${Math.round(v * 100)}%`, at: Math.round(v * 100) };
}

function rowWord(v: BlindVerdict, methods: string[]): string {
  const vals = methods.filter((m) => m in v.values).map((m) => ({ m, at: shown(v.id, v.values[m]).at }));
  if (vals.length < 2) return '';
  const best = v.better === 'higher' ? Math.max(...vals.map((x) => x.at)) : Math.min(...vals.map((x) => x.at));
  const win = vals.filter((x) => x.at === best).map((x) => x.m);
  if (win.length === vals.length) return 'All tie';
  if (win.length === 1) return sentence(`${NAMES[win[0]] ?? win[0]} ahead`);
  return sentence(`${win.map((m) => NAMES[m] ?? m).join(' and ')} tie ahead`);
}

/** The first sentence of a note, and the rest. */
function split(note: string): [string, string] {
  const t = sentence(note.trim());
  const i = t.search(/[.:;]\s/);
  return i < 0 ? [t, ''] : [t.slice(0, i + 1), t.slice(i + 2)];
}

interface DebriefProps {
  score: BlindTest;
  model: ModelStatus | null;
  place: string;
  onBack: () => void;
  /** The next step (your look), when this place has one. */
  onNext: (() => void) | null;
  onEvidence: () => void;
  /** Terra's morning pass, the other test on this fire (S6), when there is one. */
  terra: ReactNode | null;
  terraOpen: boolean;
  onToggleTerra: () => void;
}

/**
 * W1, step 3's end: the blind test's score as its own screen (reference-study.md, Death Stranding's results). One
 * verdict, the seven scores the test judges with who is ahead on each, the interval, then the next step. It folds in
 * the lead's six small fixes: every judged score shown, the baselines' tie said, the protocol note in sentence case
 * and folded instead of clipped.
 */
export function Debrief({ score, model, place, onBack, onNext, onEvidence, terra, terraOpen, onToggleTerra }: DebriefProps) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);
  const methods = score.methods.map((m) => m.id);
  const judged = [...score.verdict].sort((a, b) => {
    const ia = ORDER.indexOf(a.id);
    const ib = ORDER.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const ahead = judged.filter((v) => v.ahead).length;
  const hidden = score.hiddenPlatforms.length > 0 ? score.hiddenPlatforms.map(platformName).join(' and ') : 'VIIRS';
  const span = score.firstUtc && score.lastUtc ? utcSpan(score.firstUtc, score.lastUtc) : null;
  const baselines = methods.filter((m) => m !== 'reconstruction');
  const cellScores = judged.filter((v) => v.id.startsWith('csi') || v.id === 'hit_rate_at_equal_area' || v.id === 'brier');
  const baselinesTie =
    baselines.length === 2 &&
    cellScores.length > 0 &&
    cellScores.every((v) => v.values[baselines[0]] !== undefined && v.values[baselines[0]] === v.values[baselines[1]]);
  const corrected = score.protocolVersion !== null && score.protocolVersion >= 2;
  const [noteHead, noteRest] = corrected && score.protocolNote ? split(score.protocolNote) : ['', ''];
  const intervals = score.methods.filter((m) => m.intervalLevel !== null && m.intervalN);
  const noInterval = score.methods.filter((m) => m.intervalLevel === null).map((m) => NAMES[m.id] ?? m.label);

  return (
    <section className="iso-debrief" aria-labelledby="iso-debrief-title">
      <header className="iso-debrief__head">
        <h2 id="iso-debrief-title" className="iso-debrief__title">
          The blind test, scored
        </h2>
        <button type="button" className="iso-key" onClick={onBack}>
          <kbd>Esc</kbd>
          <span>Back to the terrain</span>
        </button>
      </header>

      <p className="iso-debrief__verdict">
        Ahead of both baselines on {ahead} of the {judged.length} scores the test judges.
      </p>
      <p className="iso-debrief__what">
        {place}
        {span ? `, ${span}` : ''}. {hidden} {score.hiddenPlatforms.length > 1 ? 'were' : 'was'} hidden; the estimate saw MODIS alone
        {score.scoredOverpasses !== null ? ` and was scored on ${score.scoredOverpasses} passes` : ''}.
      </p>

      <table className="iso-table iso-debrief__table">
        <thead>
          <tr>
            <th scope="col">Judged score</th>
            {score.methods.map((m) => (
              <th key={m.id} scope="col" data-model={m.id === 'reconstruction' ? 'true' : undefined}>
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {judged.map((v) => (
            <tr key={v.id}>
              <th scope="row">
                {sentence(SCORE_NAMES[v.id] ?? v.id.replace(/_/g, ' '))}
                <span className="iso-score__verdict">
                  {rowWord(v, methods)}, {v.better === 'higher' ? 'higher' : 'lower'} is better
                </span>
              </th>
              {score.methods.map((m) => (
                <td key={m.id} data-model={m.id === 'reconstruction' ? 'true' : undefined}>
                  {m.id in v.values ? shown(v.id, v.values[m.id]).text : 'none'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {intervals.length > 0 && (
        <p className="iso-debrief__line">
          Stated {Math.round((intervals[0].intervalLevel as number) * 100)}% interval, passes whose hidden total fell
          inside:{' '}
          {intervals
            .map((m) => {
              const held = (m.intervalCovered as number) / (m.intervalN as number) >= (m.intervalLevel as number) - 1e-9;
              return `${NAMES[m.id] ?? m.label} ${m.intervalCovered} of ${m.intervalN}${held ? ', held' : ', short'}`;
            })
            .join('; ')}
          {noInterval.length > 0 ? `. ${sentence(noInterval.join(' and '))} states none.` : '.'}
        </p>
      )}
      {baselinesTie && (
        <p className="iso-debrief__line">
          {sentence(NAMES[baselines[0]])} and {NAMES[baselines[1]]} mark the same cells, so they tie on every cell
          score; they differ in pixel count and fire power.
        </p>
      )}
      <p className="iso-debrief__line">
        Agreement is the share of burning cells that both the estimate and the hidden detections mark, out of all cells
        either one marks. The Brier score measures how far the stated burn chances sit from what happened.
      </p>

      {corrected && noteHead ? (
        <p className="iso-debrief__line iso-debrief__note">
          {noteHead}{' '}
          {noteRest && (
            <>
              {noteOpen && <span>{noteRest} </span>}
              <button type="button" className="iso-debrief__more" aria-expanded={noteOpen} onClick={() => setNoteOpen((o) => !o)}>
                {noteOpen ? 'Less' : 'More'}
              </button>
            </>
          )}
        </p>
      ) : !corrected ? (
        <p className="iso-debrief__line iso-debrief__note">
          Under correction: an audit found the hidden satellite influenced which passes were tested. A corrected run is
          pending.
        </p>
      ) : null}

      {model && model.parts.length > 0 && (
        <div className="iso-debrief__parts">
          <button type="button" className="iso-debrief__more" aria-expanded={partsOpen} onClick={() => setPartsOpen((o) => !o)}>
            The model is {model.status}: {partsOpen ? 'hide' : 'show'} its parts
          </button>
          {partsOpen && (
            <table className="iso-table iso-score__parts">
              <tbody>
                {model.parts.map((p) => (
                  <tr key={p.name} data-status={p.status}>
                    <th scope="row">{sentence(p.name)}</th>
                    <td>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {terraOpen && terra}

      <footer className="iso-debrief__foot">
        <div className="iso-debrief__links">
          <button type="button" className="iso-key" onClick={onEvidence}>
            <span>Every test fire and look</span>
          </button>
          {terra && (
            <button type="button" className="iso-key" data-active={terraOpen ? 'true' : 'false'} onClick={onToggleTerra}>
              <kbd>T</kbd>
              <span>After Terra</span>
            </button>
          )}
        </div>
        {onNext && (
          <button type="button" className="iso-action" onClick={onNext}>
            <kbd>Enter</kbd>
            <span>Next: your look</span>
          </button>
        )}
      </footer>
    </section>
  );
}
