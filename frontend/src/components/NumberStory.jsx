import { useEffect, useMemo, useRef, useState } from 'react';
import { tts } from '../lib/tts';

/**
 * Concrete-object arithmetic.
 *
 * Implements the special-education method the project was advised to use: a sum
 * is explained by putting countable things on a table inside a short story, not
 * by notation. So the drawn objects are the explanation here and the sentence is
 * only narration — which is why every step renders an actual quantity rather
 * than a description of one, and why the step advances one at a time.
 *
 * One step on screen at a time is the working-memory accommodation: working
 * memory is impaired in this group while long-term memory is not, so nothing is
 * ever asked to be carried between steps — the table always shows the current
 * truth.
 */

/**
 * Above this many objects the grid stops being countable and starts being
 * wallpaper, which defeats the purpose. Past it we show a representative row
 * plus the number in words.
 */
const MAX_DRAWN = 60;

export default function NumberStory({ data, onSolved, autoNarrate = true }) {
  const [stepIndex, setStepIndex] = useState(0);
  /**
   * Narration is on by default for a sum the user actually asked for — the
   * objects only work when they are spoken over. It is off for the worked
   * example, because that one appears the instant someone clicks "Numbers" in
   * the rail, and a screen that starts talking at a glance is startling rather
   * than helpful.
   */
  const [narrate, setNarrate] = useState(autoNarrate);
  const solvedRef = useRef(false);

  const steps = useMemo(() => (Array.isArray(data?.steps) ? data.steps : []), [data]);
  const step = steps[stepIndex] || null;
  const isLast = stepIndex >= steps.length - 1;

  // Reset when a different problem arrives, so a new sum never opens half-solved.
  useEffect(() => {
    setStepIndex(0);
    setNarrate(autoNarrate);
    solvedRef.current = false;
  }, [data, autoNarrate]);

  // Speak the current step. The brief was explicit that graphical material only
  // works for this audience when paired with audio on interaction, so narration
  // is on by default rather than hidden behind a button.
  useEffect(() => {
    if (!step || !narrate) return undefined;
    tts.speak(step.narration);
    return () => tts.stop();
  }, [step, narrate]);

  useEffect(() => () => tts.stop(), []);

  if (!data || !steps.length) return null;

  const emoji = data.objectEmoji || '🔵';
  const plural = data.objectNamePlural || data.objectName || 'objects';

  const advance = () => {
    if (isLast) {
      if (!solvedRef.current) {
        solvedRef.current = true;
        onSolved?.();
      }
      return;
    }
    setStepIndex((current) => Math.min(steps.length - 1, current + 1));
  };

  return (
    <div className="space-y-5">
      {/* The story */}
      <div className="rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-4">
        <span className="kicker block">The same question, in plain words</span>
        <p className="mt-1.5 text-[17px] font-semibold leading-snug text-[var(--color-text)]">
          {data.plainQuestion}
        </p>
        <p className="mt-2 text-[14.5px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_78%,transparent)]">
          {data.story}
        </p>
      </div>

      {/* The table */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-divider)] bg-[var(--color-bg)] p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="kicker">
            Step {stepIndex + 1} of {steps.length}
          </span>
          <button
            onClick={() => {
              // Playback is started outside the updater so a double invocation
              // cannot begin the narration twice over itself.
              const next = !narrate;
              setNarrate(next);
              if (next) tts.speak(step.narration);
              else tts.stop();
            }}
            className={`btn !min-h-[28px] !px-2.5 text-xs font-semibold ${
              narrate ? 'btn-primary' : 'btn-ghost'
            }`}
            aria-pressed={narrate}
          >
            <i className={`ph-duotone ${narrate ? 'ph-speaker-high' : 'ph-speaker-slash'}`}></i>
            {narrate ? 'Reading aloud' : 'Silent'}
          </button>
        </div>

        {/* Progress pips — visible position without a number to hold in mind */}
        <div className="mb-4 flex gap-1" aria-hidden>
          {steps.map((_, index) => (
            <span
              key={index}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                index <= stepIndex ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-divider)]'
              }`}
            />
          ))}
        </div>

        <p className="text-[16px] font-semibold leading-snug text-[var(--color-text)]">
          {step.narration}
        </p>

        <ObjectTable step={step} emoji={emoji} plural={plural} />

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--color-divider)] pt-3">
          <button
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            disabled={stepIndex === 0}
            className="btn btn-ghost !min-h-[34px] text-[13px]"
          >
            <i className="ph-duotone ph-arrow-left"></i>
            Back
          </button>
          <button
            onClick={advance}
            className="btn btn-primary !min-h-[34px] text-[13px]"
            disabled={isLast && solvedRef.current}
          >
            {isLast ? 'Show me the answer' : 'Next step'}
            <i className={`ph-duotone ${isLast ? 'ph-check' : 'ph-arrow-right'}`}></i>
          </button>
          <button
            onClick={() => tts.speak(step.narration)}
            className="btn btn-quiet !min-h-[34px] text-[13px]"
            aria-label="Say this step again"
          >
            <i className="ph-duotone ph-repeat"></i>
            Say it again
          </button>
        </div>
      </div>

      {/* Answer, revealed only at the end */}
      {isLast && (
        <div className="animate-setu-rise rounded-[var(--radius-lg)] border-l-[3.5px] border border-[var(--color-accent)] bg-[var(--color-accent-100)] p-4">
          <span className="kicker block">The answer</span>
          <p className="mt-1 font-mono text-[34px] font-bold leading-none text-[var(--color-accent-900)]">
            {data.answer}
          </p>
          <button
            onClick={() =>
              tts.speak(`The answer is ${data.answer}. ${data.checkIt} ${data.realLife}`)
            }
            className="btn btn-secondary !min-h-[30px] mt-3 text-[12.5px]"
          >
            <i className="ph-duotone ph-speaker-high"></i>
            Hear the answer
          </button>

          <div className="mt-4 space-y-3 border-t border-[var(--color-accent-300)] pt-3">
            <div>
              <span className="kicker block">Check it yourself</span>
              <p className="mt-1 text-[14px] leading-relaxed text-[var(--color-accent-900)]">
                {data.checkIt}
              </p>
            </div>
            <div>
              <span className="kicker block">Where this shows up</span>
              <p className="mt-1 text-[14px] leading-relaxed text-[var(--color-accent-900)]">
                {data.realLife}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------- Object rendering --------------------------- */

/**
 * Work out whether a step should be drawn as piles rather than a single row.
 *
 * Multiplication and division are the two operations where the *arrangement*
 * carries the meaning — "four piles of five" is the insight, not "twenty" — so
 * grouping steps get piles and everything else gets a flat, countable row.
 * Returns null when the data does not describe a grouping cleanly, which keeps a
 * malformed model response falling back to a plain row instead of drawing
 * nonsense.
 */
function pilesFor(step) {
  const groupSize = Number(step.groupSize) || 0;
  if (groupSize <= 0) return null;

  const total = Math.max(0, Math.round(Number(step.runningTotal) || 0));
  const count = Math.max(0, Math.round(Number(step.count) || 0));

  if (step.operation === 'split') {
    // Dealt into `groupSize` piles; each pile ends with `runningTotal` in it.
    return { piles: groupSize, pileSize: total };
  }
  if (step.operation === 'group') {
    // The piles exist but may still be empty at the setup step.
    return { piles: count || groupSize, pileSize: total > 0 ? groupSize : 0 };
  }
  if (total > 0) {
    return { piles: Math.max(1, Math.round(total / groupSize)), pileSize: groupSize };
  }
  return null;
}

function ObjectTable({ step, emoji, plural }) {
  const grouping = pilesFor(step);
  const total = Math.max(0, Math.round(Number(step.runningTotal) || 0));
  const count = Math.max(0, Math.round(Number(step.count) || 0));

  if (grouping && grouping.piles > 0 && grouping.piles * Math.max(1, grouping.pileSize) <= MAX_DRAWN) {
    return (
      <div className="mt-4">
        <div className="flex flex-wrap gap-2.5">
          {Array.from({ length: Math.min(grouping.piles, 12) }, (_, pileIndex) => (
            <div
              key={pileIndex}
              className="min-w-[62px] rounded-[var(--radius-md)] border border-dashed border-[var(--color-accent-300)] bg-[var(--color-surface)] p-2 text-center"
            >
              <div className="flex flex-wrap justify-center gap-0.5">
                {Array.from({ length: grouping.pileSize }, (_, index) => (
                  <Countable key={index} emoji={emoji} />
                ))}
              </div>
              {grouping.pileSize > 0 && (
                <span className="mt-1 block font-mono text-[11px] font-bold text-[var(--color-accent-700)]">
                  {grouping.pileSize}
                </span>
              )}
            </div>
          ))}
        </div>
        <Caption>
          {grouping.piles} pile{grouping.piles === 1 ? '' : 's'}
          {grouping.pileSize > 0 && ` of ${grouping.pileSize}`} · {total} {plural} altogether
        </Caption>
      </div>
    );
  }

  // A removal keeps the taken-away objects on screen, struck through, because
  // seeing what left is what makes subtraction concrete rather than magical.
  const removed = step.operation === 'remove' ? count : 0;
  // On an addition, the arriving objects are tinted so the change is visible
  // without recounting the whole row from scratch.
  const added = step.operation === 'add' ? Math.min(count, total) : 0;

  const drawn = Math.min(total, MAX_DRAWN);
  const truncated = total > MAX_DRAWN;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-1">
        {Array.from({ length: drawn }, (_, index) => (
          <Countable key={index} emoji={emoji} fresh={index >= drawn - added && added > 0} />
        ))}
        {Array.from({ length: Math.min(removed, 20) }, (_, index) => (
          <Countable key={`gone_${index}`} emoji={emoji} gone />
        ))}
      </div>
      <Caption>
        {truncated ? `showing ${MAX_DRAWN} of ` : ''}
        {total} {plural} on the table
        {removed > 0 && ` · ${removed} taken away`}
      </Caption>
    </div>
  );
}

function Countable({ emoji, fresh = false, gone = false }) {
  return (
    <span
      role="img"
      aria-hidden
      className={`grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-[19px] leading-none transition-all ${
        gone
          ? 'opacity-30 grayscale'
          : fresh
            ? 'bg-[var(--color-accent-100)] ring-1 ring-[var(--color-accent-300)]'
            : ''
      }`}
      style={gone ? { textDecoration: 'line-through' } : undefined}
    >
      {emoji}
    </span>
  );
}

function Caption({ children }) {
  return (
    <p className="mt-2 font-mono text-[11.5px] text-[color-mix(in_srgb,var(--color-text)_58%,transparent)]">
      {children}
    </p>
  );
}
