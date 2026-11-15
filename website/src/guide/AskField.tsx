import { useState } from 'react';
import { answerOf, match, questionsFor, type Answer, type ScriptQuestion } from './ask';
import type { Conditions, Fields } from './script';
import '../styles/guide.css';

/** The field's own words: the script has none for it yet. */
const PLACEHOLDER = 'Ask about what you see';

/**
 * Asking, bottom right: a line to write on. Enter matches the question to the script's written answers and the guide
 * says the answer; a question with a command carries it out too. While the field has the focus and is empty, the
 * step's questions are offered as a short list above it; with no answer, the questions the script offers instead.
 */
export function AskField({
  step,
  fields,
  conds,
  onAnswer,
  inputRef,
}: {
  step: string | null;
  fields: Fields;
  conds: Conditions;
  onAnswer: (a: Answer) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [offers, setOffers] = useState<ScriptQuestion[]>([]);
  const ask = (q: ScriptQuestion | null) => {
    // A question whose answer cannot be filled here, and that carries out nothing, is the script's "no answer".
    let a = answerOf(q, fields, conds);
    if (q && a.lines.length === 0 && !a.command) a = answerOf(null, fields, conds);
    setOffers(a.offers);
    onAnswer(a);
    setText('');
  };
  const listed = text === '' ? (offers.length > 0 ? offers : open ? questionsFor(step).slice(0, 5) : []) : [];
  return (
    <div className="guide-ask">
      {listed.length > 0 && (
        <ul className="guide-ask__list" aria-label="Questions">
          {listed.map((q) => (
            <li key={q.id}>
              <button
                type="button"
                className="guide-ask__question"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => ask(q)}
              >
                {q.ask}
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        className="guide-ask__input"
        value={text}
        placeholder={PLACEHOLDER}
        aria-label={PLACEHOLDER}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setOffers([]);
        }}
        onChange={(e) => {
          setText(e.target.value);
          setOffers([]);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && text.trim() !== '') {
            e.preventDefault();
            ask(match(text, step));
          } else if (e.key === 'Escape') {
            setText('');
            setOffers([]);
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
