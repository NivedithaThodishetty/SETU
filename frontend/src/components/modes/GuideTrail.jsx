import { BionicText } from '../../lib/bionic';
import { ModeSection, ProgressRing, useChecklist } from './ModeChrome';

/**
 * Guide — the trail.
 *
 * A numbered list tells you the order. It does not tell you where you are, and
 * "where am I" is the question that gets lost halfway through setting up SSH
 * keys or filing a claim. So the steps are drawn as stations on a rail with the
 * completed length filled in, and the next station is marked.
 *
 * Every station carries its success signal as a separate, differently-styled
 * row. That is the piece people actually need and the piece a plain list buries
 * in the same paragraph as the instruction: not "what do I type" but "how do I
 * know it worked".
 */

export default function GuideTrail({ mode, data, bionic, resetKey }) {
  const steps = data.steps || [];
  const heading = data.workflowName || data.goal;
  const { checked, toggle, done } = useChecklist(resetKey);

  const nextIndex = steps.findIndex((_, index) => !checked.has(`guide-station-${index}`));
  const progress = steps.length ? done / steps.length : 0;

  return (
    <div className="space-y-6">
      {/* --------------------------------- Header --------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <span className="kicker block" style={{ color: mode.accentDeep }}>
            {steps.length || data.totalSteps || 0} stations
          </span>
          {heading && (
            <h3 className="mt-0.5 text-[20px] font-bold leading-tight text-[var(--color-text)]">
              <BionicText text={heading} enabled={bionic} />
            </h3>
          )}
        </div>
        {steps.length > 0 && (
          <ProgressRing
            value={done}
            total={steps.length}
            accent={mode.accent}
            size={52}
            label={done === steps.length ? 'All done' : 'stations cleared'}
          />
        )}
      </div>

      {/* --------------------------------- The rail --------------------------------- */}
      {steps.length > 0 && (
        <div className="relative pl-[38px]">
          <div
            aria-hidden
            className="absolute bottom-6 left-[15px] top-6 w-[2px]"
            style={{ background: 'color-mix(in srgb, var(--color-text) 12%, transparent)' }}
          />
          <div
            aria-hidden
            className="absolute left-[15px] top-6 w-[2px]"
            style={{
              background: mode.accent,
              height: `calc((100% - 3rem) * ${progress})`,
              transition: 'height 0.45s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          />

          <ol className="list-none space-y-3 pl-0">
            {steps.map((step, index) => {
              const id = `guide-station-${index}`;
              const isDone = checked.has(id);
              const isNext = index === nextIndex;

              return (
                <li key={id} className="relative">
                  {/* Station marker */}
                  <span
                    aria-hidden
                    className="absolute -left-[38px] top-4 grid h-[32px] w-[32px] place-items-center rounded-full border-2 text-[12px] font-bold transition-colors"
                    style={{
                      background: isDone ? mode.accent : 'var(--color-bg)',
                      borderColor: isDone || isNext ? mode.accent : 'color-mix(in srgb, var(--color-text) 18%, transparent)',
                      color: isDone ? mode.ink : isNext ? mode.accent : 'color-mix(in srgb, var(--color-text) 50%, transparent)',
                      boxShadow: isNext && !isDone ? `0 0 0 4px color-mix(in srgb, ${mode.accent} 16%, transparent)` : 'none'
                    }}
                  >
                    {isDone ? <i className="ph-duotone ph-check"></i> : step.stepNumber || index + 1}
                  </span>

                  <div
                    className="rounded-[var(--radius-md)] border p-4 transition-all"
                    style={{
                      background: isDone
                        ? `color-mix(in srgb, ${mode.accent} 5%, var(--color-bg))`
                        : 'var(--color-surface)',
                      borderColor: isNext && !isDone
                        ? `color-mix(in srgb, ${mode.accent} 45%, transparent)`
                        : 'var(--color-divider)'
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h4
                        className={`text-[15.5px] font-bold leading-snug ${
                          isDone
                            ? 'text-[color-mix(in_srgb,var(--color-text)_52%,transparent)] line-through'
                            : 'text-[var(--color-text)]'
                        }`}
                      >
                        <BionicText
                          text={step.title || `Step ${step.stepNumber || index + 1}`}
                          enabled={bionic && !isDone}
                        />
                      </h4>
                      {isNext && !isDone && (
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                          style={{ background: mode.accent, color: mode.ink }}
                        >
                          You are here
                        </span>
                      )}
                    </div>

                    <p
                      className={`mt-1.5 text-[14px] leading-relaxed ${
                        isDone
                          ? 'text-[color-mix(in_srgb,var(--color-text)_50%,transparent)]'
                          : 'text-[color-mix(in_srgb,var(--color-text)_84%,transparent)]'
                      }`}
                    >
                      <BionicText text={step.actionRequired || step.action} enabled={bionic && !isDone} />
                    </p>

                    {(step.tip || step.successSignal) && (
                      <div
                        className="mt-3 flex items-start gap-2.5 rounded-[var(--radius-sm)] px-3 py-2"
                        style={{ background: `color-mix(in srgb, ${mode.accent} 8%, transparent)` }}
                      >
                        <span
                          className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: mode.accent }}
                          aria-hidden
                        />
                        <p className="text-[12.5px] leading-snug text-[color-mix(in_srgb,var(--color-text)_78%,transparent)]">
                          <strong style={{ color: mode.accentDeep }}>You will know it worked when </strong>
                          <BionicText text={step.tip || step.successSignal} enabled={bionic} />
                        </p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => toggle(id)}
                      aria-pressed={isDone}
                      className="btn !min-h-[30px] mt-3 text-[12.5px] font-semibold"
                      style={
                        isDone
                          ? {
                              background: 'transparent',
                              borderColor: 'var(--color-divider)',
                              color: 'color-mix(in srgb, var(--color-text) 60%, transparent)'
                            }
                          : { background: mode.accent, borderColor: mode.accent, color: mode.ink }
                      }
                    >
                      <i className={`ph-duotone ${isDone ? 'ph-arrow-counter-clockwise' : 'ph-check'}`}></i>
                      {isDone ? 'Not done after all' : 'Done — next station'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {done === steps.length && steps.length > 0 && (
        <ModeSection label="Trail complete" accent={mode.accent}>
          <p
            className="rounded-[var(--radius-md)] border p-3.5 text-[14px] leading-relaxed"
            style={{
              borderColor: `color-mix(in srgb, ${mode.accent} 40%, transparent)`,
              background: `color-mix(in srgb, ${mode.accent} 8%, transparent)`,
              color: 'var(--color-text)'
            }}
          >
            Every station cleared. That is the whole workflow finished — nothing left waiting on you.
          </p>
        </ModeSection>
      )}
    </div>
  );
}
