import { useEffect, useState } from 'react';
import { BionicText } from '../../lib/bionic';
import { tts } from '../../lib/tts';
import { ModeSection } from './ModeChrome';

/**
 * Practice — the rehearsal room.
 *
 * A hard conversation is a sequence, not a document, so this mode renders as
 * one: their line arrives as an incoming message, and your possible replies sit
 * where your replies would sit. Reading a suggested script in a bulleted list
 * does not rehearse anything; seeing it in the shape of the actual exchange
 * does.
 *
 * Tone is a switch rather than a stack. The alternatives are the same reply at
 * different temperatures, and showing them all at once invites comparison when
 * what is wanted is a choice.
 */

export default function PracticeStage({ mode, data, bionic, resetKey }) {
  const responses = data.suggestedResponses || [];
  const [toneIndex, setToneIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [speakingLine, setSpeakingLine] = useState(null);

  useEffect(() => {
    setToneIndex(0);
    setCopied(false);
  }, [resetKey]);

  useEffect(() => {
    const unsubscribe = tts.subscribe((state) => {
      if (!state.isPlaying) setSpeakingLine(null);
    });
    return unsubscribe;
  }, []);

  const reply = responses[toneIndex] || null;

  const speak = (id, text) => {
    if (speakingLine === id) {
      tts.stop();
      setSpeakingLine(null);
      return;
    }
    setSpeakingLine(id);
    tts.speak(text);
  };

  const copyReply = async () => {
    if (!reply?.text) return;
    try {
      await navigator.clipboard.writeText(reply.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (_) {
      // Clipboard writes are permission-gated. The text is on screen and
      // selectable either way, so failing quietly is the right outcome.
    }
  };

  return (
    <div className="space-y-6">
      {data.scenarioContext && (
        <p className="max-w-[62ch] text-[14px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_72%,transparent)]">
          <BionicText text={data.scenarioContext} enabled={bionic} />
        </p>
      )}

      {/* ------------------------------- The exchange ------------------------------- */}
      <div
        className="relative overflow-hidden rounded-[var(--radius-lg)] border p-4 sm:p-5"
        style={{
          borderColor: `color-mix(in srgb, ${mode.accent} 28%, transparent)`,
          background: `linear-gradient(180deg, color-mix(in srgb, ${mode.accent} 9%, var(--color-bg)) 0%, var(--color-bg) 60%)`
        }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: mode.accentDeep }}
        >
          Rehearsal · nobody else can see this
        </span>

        {/* Their line */}
        {data.openingLine && (
          <div className="mt-4 flex items-end gap-2.5">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[15px]"
              style={{ background: 'color-mix(in srgb, var(--color-text) 12%, transparent)' }}
              aria-hidden
            >
              <i className="ph-duotone ph-user"></i>
            </span>
            <div className="max-w-[80%]">
              <div
                className="px-4 py-3 text-[15px] leading-relaxed text-[var(--color-text)]"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-divider)',
                  borderRadius: '2px var(--radius-lg) var(--radius-lg) var(--radius-lg)'
                }}
              >
                <BionicText text={data.openingLine} enabled={bionic} />
              </div>
              <button
                type="button"
                onClick={() => speak('their-line', data.openingLine)}
                className="mt-1.5 flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[11.5px] font-semibold text-[color-mix(in_srgb,var(--color-text)_58%,transparent)] hover:text-[var(--color-accent-700)]"
              >
                <i className={`ph-duotone ${speakingLine === 'their-line' ? 'ph-stop-circle' : 'ph-speaker-high'}`}></i>
                {speakingLine === 'their-line' ? 'Stop' : 'Hear how it might sound'}
              </button>
            </div>
          </div>
        )}

        {/* Your reply */}
        {reply && (
          <div className="mt-5">
            {/* Tone switch */}
            {responses.length > 1 && (
              <div
                className="mb-2 flex flex-wrap justify-end gap-1.5"
                role="radiogroup"
                aria-label="Reply tone"
              >
                {responses.map((option, index) => (
                  <button
                    key={index}
                    type="button"
                    role="radio"
                    aria-checked={toneIndex === index}
                    onClick={() => setToneIndex(index)}
                    className="cursor-pointer rounded-full px-3 py-1 text-[11.5px] font-bold transition-colors"
                    style={
                      toneIndex === index
                        ? { background: mode.accent, color: mode.ink, border: `1px solid ${mode.accent}` }
                        : {
                            background: 'transparent',
                            color: 'color-mix(in srgb, var(--color-text) 62%, transparent)',
                            border: '1px solid var(--color-divider)'
                          }
                    }
                  >
                    {option.tone || `Option ${index + 1}`}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-end justify-end gap-2.5">
              <div className="max-w-[82%]">
                <div
                  key={toneIndex}
                  className="animate-setu-rise px-4 py-3 text-[15px] leading-relaxed"
                  style={{
                    background: mode.accent,
                    color: mode.ink,
                    borderRadius: 'var(--radius-lg) var(--radius-lg) 2px var(--radius-lg)'
                  }}
                >
                  {reply.text}
                </div>
                <div className="mt-1.5 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => speak(`reply-${toneIndex}`, reply.text)}
                    className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[11.5px] font-semibold text-[color-mix(in_srgb,var(--color-text)_58%,transparent)] hover:text-[var(--color-accent-700)]"
                  >
                    <i
                      className={`ph-duotone ${speakingLine === `reply-${toneIndex}` ? 'ph-stop-circle' : 'ph-speaker-high'}`}
                    ></i>
                    {speakingLine === `reply-${toneIndex}` ? 'Stop' : 'Say it back to me'}
                  </button>
                  <button
                    type="button"
                    onClick={copyReply}
                    className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[11.5px] font-semibold text-[color-mix(in_srgb,var(--color-text)_58%,transparent)] hover:text-[var(--color-accent-700)]"
                  >
                    <i className={`ph-duotone ${copied ? 'ph-check-circle' : 'ph-copy'}`}></i>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-bold"
                style={{ background: mode.accentDeep, color: mode.ink }}
                aria-hidden
              >
                You
              </span>
            </div>
          </div>
        )}
      </div>

      {/* --------------------------------- Coaching --------------------------------- */}
      {data.coachingTip && (
        <ModeSection label="One thing that changes how this lands" accent={mode.accent}>
          <div
            className="flex items-start gap-3 rounded-[var(--radius-md)] border p-3.5"
            style={{
              borderColor: `color-mix(in srgb, ${mode.accent} 34%, transparent)`,
              background: `color-mix(in srgb, ${mode.accent} 7%, transparent)`
            }}
          >
            <i
              className="ph-duotone ph-lightbulb mt-[2px] text-[19px]"
              style={{ color: mode.accent }}
              aria-hidden
            ></i>
            <p className="text-[14px] leading-relaxed text-[var(--color-text)]">
              <BionicText text={data.coachingTip} enabled={bionic} />
            </p>
          </div>
        </ModeSection>
      )}
    </div>
  );
}
