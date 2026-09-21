import { useEffect, useMemo, useState } from 'react';
import { BionicText } from '../../lib/bionic';
import { award } from '../../lib/progress';
import { tts } from '../../lib/tts';
import { AccentChip, ModeSection } from './ModeChrome';

/**
 * Learn — the study deck.
 *
 * The quiz used to render as a stack of every question with every option
 * visible at once, which is precisely the wall of text this app exists to
 * remove. Here it is a deck: one card face up, the rest counted as dots, and
 * the next card only after this one is answered. Working memory is the impaired
 * faculty in this group — a screen holding eight questions asks the reader to
 * carry seven of them.
 *
 * Only the first answer to a card scores, so flipping through the options
 * cannot farm points.
 */

export default function LearnDeck({ mode, data, bionic, resetKey }) {
  const quiz = useMemo(() => (Array.isArray(data.quiz) ? data.quiz : []), [data]);
  const branches = data.mindMap?.branches || [];

  const [cardIndex, setCardIndex] = useState(0);
  const [answers, setAnswers] = useState({});

  // A fresh set of questions must never open half answered.
  useEffect(() => {
    setCardIndex(0);
    setAnswers({});
  }, [resetKey]);

  const card = quiz[cardIndex] || null;
  const chosen = answers[cardIndex];
  const answered = chosen !== undefined;
  const correctIndex = card ? card.answerIndex ?? card.correctAnswerIndex ?? 0 : 0;

  const score = Object.entries(answers).filter(
    ([index, option]) => option === (quiz[index]?.answerIndex ?? quiz[index]?.correctAnswerIndex ?? 0)
  ).length;

  const choose = (optionIndex) => {
    if (answered) return;
    setAnswers((current) => ({ ...current, [cardIndex]: optionIndex }));
    if (optionIndex === correctIndex) {
      tts.playCelebrationChime();
      award('quizCorrect');
    }
  };

  return (
    <div className="space-y-7">
      {/* ------------------------------- Summary card ------------------------------- */}
      {data.summary && (
        <div
          className="relative rounded-[var(--radius-md)] border-l-[5px] bg-[var(--color-surface)] p-4 pl-5"
          style={{ borderLeftColor: mode.accent, borderTop: '1px solid var(--color-divider)', borderRight: '1px solid var(--color-divider)', borderBottom: '1px solid var(--color-divider)' }}
        >
          <span className="kicker block" style={{ color: mode.accentDeep }}>
            The whole thing, in one paragraph
          </span>
          <p className="mt-2 text-[15.5px] leading-[1.65] text-[var(--color-text)]">
            <BionicText text={data.summary} enabled={bionic} />
          </p>
        </div>
      )}

      {/* --------------------------------- Cards --------------------------------- */}
      {branches.length > 0 && (
        <ModeSection
          label={data.mindMap?.rootNode || 'Concept cards'}
          note={`${branches.length} cards`}
          accent={mode.accent}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {branches.map((branch, index) => (
              <article
                key={index}
                className="group relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-4 pl-5 transition-shadow hover:shadow-[var(--shadow-md)]"
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[5px]"
                  style={{ background: mode.accent, opacity: 0.35 + (index % 3) * 0.22 }}
                />
                <h4 className="text-[14.5px] font-bold leading-snug text-[var(--color-text)]">
                  <BionicText text={branch.topic} enabled={bionic} />
                </h4>
                <ul className="mt-2 list-none space-y-1.5 pl-0">
                  {(branch.details || []).map((detail, detailIndex) => (
                    <li
                      key={detailIndex}
                      className="flex gap-2 text-[13px] leading-snug text-[color-mix(in_srgb,var(--color-text)_74%,transparent)]"
                    >
                      <span aria-hidden style={{ color: mode.accent }}>
                        —
                      </span>
                      <BionicText text={detail} enabled={bionic} />
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </ModeSection>
      )}

      {/* -------------------------------- The quiz -------------------------------- */}
      {quiz.length > 0 && card && (
        <ModeSection
          label="Check yourself"
          note="One card at a time — nothing to hold in your head"
          accent={mode.accent}
        >
          <div
            className="overflow-hidden rounded-[var(--radius-lg)] border shadow-[var(--shadow-sm)]"
            style={{ borderColor: `color-mix(in srgb, ${mode.accent} 35%, transparent)` }}
          >
            {/* Deck header */}
            <div
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
              style={{ background: `color-mix(in srgb, ${mode.accent} 10%, transparent)` }}
            >
              <div className="flex items-center gap-1.5" aria-label={`Card ${cardIndex + 1} of ${quiz.length}`}>
                {quiz.map((_, index) => {
                  const state =
                    answers[index] === undefined
                      ? 'todo'
                      : answers[index] === (quiz[index].answerIndex ?? quiz[index].correctAnswerIndex ?? 0)
                        ? 'right'
                        : 'wrong';
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setCardIndex(index)}
                      aria-label={`Go to card ${index + 1}`}
                      aria-current={index === cardIndex}
                      className="h-2.5 w-2.5 cursor-pointer rounded-full border-0 p-0 transition-transform"
                      style={{
                        background:
                          state === 'right'
                            ? mode.accent
                            : state === 'wrong'
                              ? 'color-mix(in srgb, var(--color-text) 30%, transparent)'
                              : 'color-mix(in srgb, var(--color-text) 14%, transparent)',
                        transform: index === cardIndex ? 'scale(1.55)' : 'none'
                      }}
                    />
                  );
                })}
              </div>

              <AccentChip accent={mode.accentDeep}>
                <i className="ph-duotone ph-target"></i>
                {Object.keys(answers).length === 0
                  ? 'Nothing answered yet'
                  : `${score} right of ${Object.keys(answers).length}`}
              </AccentChip>
            </div>

            {/* Face-up card */}
            <div className="bg-[var(--color-surface)] p-4 sm:p-5">
              <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-[color-mix(in_srgb,var(--color-text)_45%,transparent)]">
                Card {cardIndex + 1} of {quiz.length}
              </span>
              <p className="mt-1.5 text-[17px] font-bold leading-snug text-[var(--color-text)]">
                <BionicText text={card.question} enabled={bionic} />
              </p>

              <div className="mt-3.5 space-y-2">
                {(card.options || []).map((option, optionIndex) => {
                  const isCorrect = optionIndex === correctIndex;
                  const isChosen = chosen === optionIndex;

                  let style = {
                    background: 'var(--color-bg)',
                    borderColor: 'var(--color-divider)',
                    color: 'var(--color-text)'
                  };
                  if (answered && isCorrect) {
                    style = { background: `color-mix(in srgb, ${mode.accent} 13%, var(--color-bg))`, borderColor: mode.accent, color: mode.accentDeep };
                  } else if (answered && isChosen) {
                    style = { background: 'var(--color-bg)', borderColor: 'color-mix(in srgb, var(--color-text) 34%, transparent)', color: 'color-mix(in srgb, var(--color-text) 60%, transparent)' };
                  } else if (answered) {
                    style = { ...style, opacity: 0.5 };
                  }

                  return (
                    <button
                      key={optionIndex}
                      type="button"
                      onClick={() => choose(optionIndex)}
                      disabled={answered}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border px-3.5 py-2.5 text-left text-[14px] transition-all disabled:cursor-default"
                      style={style}
                    >
                      <span
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold"
                        style={{
                          borderColor: 'currentColor',
                          background: answered && isCorrect ? mode.accent : 'transparent',
                          color: answered && isCorrect ? '#fff' : 'inherit'
                        }}
                      >
                        {answered && isCorrect ? (
                          <i className="ph-duotone ph-check"></i>
                        ) : answered && isChosen ? (
                          <i className="ph-duotone ph-x"></i>
                        ) : (
                          String.fromCharCode(65 + optionIndex)
                        )}
                      </span>
                      <BionicText text={option} enabled={bionic} />
                    </button>
                  );
                })}
              </div>

              {answered && card.explanation && (
                <p
                  className="mt-3.5 animate-setu-rise rounded-[var(--radius-md)] border-l-[3px] p-3 text-[13.5px] leading-relaxed"
                  style={{
                    borderLeftColor: mode.accent,
                    background: `color-mix(in srgb, ${mode.accent} 7%, transparent)`,
                    color: 'var(--color-text)'
                  }}
                >
                  <BionicText text={card.explanation} enabled={bionic} />
                </p>
              )}
            </div>

            {/* Deck controls */}
            <div className="flex items-center justify-between gap-2 border-t border-[var(--color-divider)] bg-[var(--color-bg)] px-4 py-2.5">
              <button
                type="button"
                onClick={() => setCardIndex((index) => Math.max(0, index - 1))}
                disabled={cardIndex === 0}
                className="btn btn-quiet !min-h-[30px] text-[12.5px]"
              >
                <i className="ph-duotone ph-caret-left"></i>
                Back
              </button>

              {cardIndex < quiz.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCardIndex((index) => Math.min(quiz.length - 1, index + 1))}
                  className="btn !min-h-[30px] text-[12.5px] font-bold"
                  style={{ background: mode.accent, borderColor: mode.accent, color: mode.ink }}
                >
                  Next card
                  <i className="ph-duotone ph-caret-right"></i>
                </button>
              ) : (
                <span className="text-[12.5px] font-semibold" style={{ color: mode.accentDeep }}>
                  {Object.keys(answers).length === quiz.length
                    ? `Deck finished — ${score} of ${quiz.length} right.`
                    : 'Last card.'}
                </span>
              )}
            </div>
          </div>
        </ModeSection>
      )}
    </div>
  );
}
