import { useEffect, useRef, useState } from 'react';
import { BionicText } from '../../lib/bionic';
import { tts } from '../../lib/tts';
import { AccentChip, ModeSection, ProgressRing, useChecklist } from './ModeChrome';

/**
 * Start — the launch pad.
 *
 * Everything else in the app helps you understand something. This one exists
 * for the minutes before you can make yourself begin, so the layout is built
 * around a single ignition: one action, big enough to read from across the
 * room, with a real ten-minute clock attached to it.
 *
 * The ladder underneath is the only place in the app where a checklist is drawn
 * with a filling rail rather than as rows. Executive freeze is not a list
 * problem — it is a "how far in am I" problem, and a rail answers that without
 * counting.
 */

const TEN_MINUTES = 10 * 60;

function useCountdown(seconds) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (running && remaining === 0 && !finishedRef.current) {
      finishedRef.current = true;
      setRunning(false);
      tts.playCelebrationChime();
    }
  }, [running, remaining]);

  const reset = () => {
    finishedRef.current = false;
    setRunning(false);
    setRemaining(seconds);
  };

  return { remaining, running, start: () => setRunning(true), pause: () => setRunning(false), reset };
}

const clock = (total) =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

export default function StartLaunchpad({ mode, data, bionic, resetKey }) {
  const steps = data.microSteps || [];
  const { checked, toggle, done } = useChecklist(resetKey);
  const timer = useCountdown(TEN_MINUTES);

  const meter = data.confidenceMeter || {};
  const progress = steps.length ? done / steps.length : 0;

  return (
    <div className="space-y-7">
      {/* ------------------------------ Ignition ------------------------------ */}
      <div
        className="relative overflow-hidden rounded-[var(--radius-lg)] p-5 sm:p-6"
        style={{ background: '#201e1d', color: '#f3f2f2' }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1.5"
          style={{ background: `linear-gradient(90deg, ${mode.accent}, transparent)` }}
        />

        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-[16rem] flex-1">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ color: mode.accent }}
            >
              Your first ten minutes
            </span>
            {/* The schema requires this field; the fallback is honest about a
                malformed answer rather than inventing an instruction and
                presenting it as advice. */}
            <p className="mt-2 max-w-[38ch] text-[20px] font-bold leading-snug sm:text-[23px]">
              {data.immediateTenMinuteAction ? (
                <BionicText text={data.immediateTenMinuteAction} enabled={bionic} />
              ) : (
                <span style={{ color: 'rgba(243,242,242,0.6)' }}>
                  No first action came back. Run it again, or describe the task in a bit more detail.
                </span>
              )}
            </p>
            {data.supportiveMessage && (
              <p className="mt-3 max-w-[54ch] border-l-2 pl-3 text-[13.5px] italic leading-relaxed"
                 style={{ borderColor: mode.accent, color: 'rgba(243,242,242,0.72)' }}>
                {data.supportiveMessage}
              </p>
            )}
          </div>

          {/* The clock */}
          <div className="flex shrink-0 flex-col items-center gap-2.5">
            <span
              className="font-mono text-[38px] font-bold leading-none tabular-nums"
              style={{ color: timer.running ? mode.accent : 'rgba(243,242,242,0.55)' }}
            >
              {clock(timer.remaining)}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={timer.running ? timer.pause : timer.start}
                className="btn !min-h-[32px] !px-4 text-[12.5px] font-bold"
                style={{ background: mode.accent, borderColor: mode.accent, color: '#201e1d' }}
              >
                <i className={`ph-duotone ${timer.running ? 'ph-pause' : 'ph-play'}`}></i>
                {timer.running ? 'Pause' : timer.remaining === TEN_MINUTES ? 'Start' : 'Resume'}
              </button>
              <button
                onClick={timer.reset}
                className="btn !min-h-[32px] !px-2 text-[12.5px]"
                style={{
                  background: 'transparent',
                  borderColor: 'rgba(243,242,242,0.25)',
                  color: 'rgba(243,242,242,0.8)'
                }}
                aria-label="Reset the ten-minute clock"
              >
                <i className="ph-duotone ph-arrow-counter-clockwise"></i>
              </button>
            </div>
            <span className="text-[11px]" style={{ color: 'rgba(243,242,242,0.5)' }}>
              {timer.remaining === 0 ? 'Ten minutes done. Stop here if you want.' : 'Ten minutes, then stop'}
            </span>
          </div>
        </div>
      </div>

      {/* --------------------------- Confidence read --------------------------- */}
      {(meter.effortLevel || meter.anxietyLevel || meter.estimatedTimeMinutes) && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <MeterCell label="Effort" value={meter.effortLevel} accent={mode.accent} />
          <MeterCell label="Anxiety" value={meter.anxietyLevel} accent={mode.accent} />
          <MeterCell
            label="Time"
            value={meter.estimatedTimeMinutes ? `${meter.estimatedTimeMinutes} min` : null}
            accent={mode.accent}
          />
          <div className="flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-2">
            <ProgressRing
              value={done}
              total={steps.length || 1}
              accent={mode.accent}
              label={`of ${steps.length} steps`}
            />
          </div>
        </div>
      )}

      {/* ------------------------------ The ladder ------------------------------ */}
      {steps.length > 0 && (
        <ModeSection
          label="The ladder"
          note="One rung at a time. Nothing below matters yet."
          accent={mode.accent}
        >
          <div className="relative pl-[26px]">
            {/* Rail — the empty track, then the filled part on top of it */}
            <div
              aria-hidden
              className="absolute bottom-4 left-[9px] top-4 w-[3px] rounded-full"
              style={{ background: 'color-mix(in srgb, var(--color-text) 10%, transparent)' }}
            />
            <div
              aria-hidden
              className="absolute left-[9px] top-4 w-[3px] rounded-full"
              style={{
                background: mode.accent,
                height: `calc((100% - 2rem) * ${progress})`,
                transition: 'height 0.45s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            />

            <ul className="list-none space-y-2 pl-0">
              {steps.map((step, index) => {
                const id = `start-rung-${index}`;
                const isDone = checked.has(id);

                return (
                  <li key={id} className="relative">
                    <span
                      aria-hidden
                      className="absolute -left-[26px] top-[15px] grid h-[21px] w-[21px] -translate-x-[1px] place-items-center rounded-full border-[3px] text-[10px] font-bold transition-colors"
                      style={{
                        borderColor: isDone ? mode.accent : 'color-mix(in srgb, var(--color-text) 18%, transparent)',
                        background: isDone ? mode.accent : 'var(--color-bg)',
                        color: isDone ? '#fff' : 'transparent'
                      }}
                    >
                      <i className="ph-duotone ph-check"></i>
                    </span>

                    <button
                      type="button"
                      onClick={() => toggle(id)}
                      aria-pressed={isDone}
                      className="flex w-full cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-3 text-left transition-all"
                      style={{
                        background: isDone
                          ? `color-mix(in srgb, ${mode.accent} 9%, var(--color-surface))`
                          : 'var(--color-surface)',
                        borderColor: isDone
                          ? `color-mix(in srgb, ${mode.accent} 40%, transparent)`
                          : 'var(--color-divider)'
                      }}
                    >
                      <span
                        className={`text-[14.5px] leading-relaxed ${
                          isDone
                            ? 'text-[color-mix(in_srgb,var(--color-text)_55%,transparent)] line-through'
                            : 'font-medium text-[var(--color-text)]'
                        }`}
                      >
                        <BionicText text={step} enabled={bionic && !isDone} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </ModeSection>
      )}

      {/* -------------------------- Question worth asking -------------------------- */}
      {data.clarifyingQuestion && (
        <div
          className="rounded-[var(--radius-md)] border p-4"
          style={{
            borderColor: `color-mix(in srgb, ${mode.accent} 35%, transparent)`,
            background: `color-mix(in srgb, ${mode.accent} 7%, transparent)`
          }}
        >
          <AccentChip accent={mode.accentDeep}>
            <i className="ph-duotone ph-question"></i>
            Worth answering first
          </AccentChip>
          <p className="mt-2 text-[14.5px] italic leading-relaxed text-[var(--color-text)]">
            <BionicText text={data.clarifyingQuestion} enabled={bionic} />
          </p>
        </div>
      )}
    </div>
  );
}

function MeterCell({ label, value, accent }) {
  if (!value) return null;
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-2.5">
      <span className="block text-[10px] font-bold uppercase tracking-[0.09em] text-[color-mix(in_srgb,var(--color-text)_50%,transparent)]">
        {label}
      </span>
      <span className="mt-0.5 block text-[16px] font-bold" style={{ color: accent }}>
        {value}
      </span>
    </div>
  );
}
