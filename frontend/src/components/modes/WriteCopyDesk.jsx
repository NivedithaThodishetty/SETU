import { BionicText } from '../../lib/bionic';
import { modeTexture } from '../../lib/modeCatalog';
import { ModeSection } from './ModeChrome';

/**
 * Write — the copy desk.
 *
 * A sub-editor does not hand back a clean page; they hand back your page with
 * the cuts visible. That distinction is the whole value here for someone with
 * dysgraphia: a silently rewritten draft teaches nothing and, worse, reads as a
 * verdict on the writing. Marked-up copy shows what changed and says why in the
 * margin, so the next draft can be better without this one being retyped.
 *
 * Hence the ruled paper, the struck-through original, and the reason set in the
 * gutter rather than underneath — it is a page from a desk, not a diff.
 */

export default function WriteCopyDesk({ mode, data, bionic }) {
  const grade = data.originalGradeLevel || data.readingGrade;
  const rewrite = data.improvedText || data.accessibleRewrite;
  const fixes = data.clarityFixes || [];
  const passives = data.passiveVoiceInstances || [];

  return (
    <div className="space-y-7">
      {/* --------------------------- Clean copy on paper --------------------------- */}
      {rewrite && (
        <div className="relative">
          {grade && (
            <span
              className="absolute -top-3 right-3 z-10 rounded-[2px] border-2 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em]"
              style={{
                color: mode.accent,
                borderColor: mode.accent,
                background: 'var(--color-bg)',
                transform: 'rotate(-3deg)'
              }}
            >
              {grade}
            </span>
          )}

          <div
            className="relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] py-4 pl-11 pr-5"
            style={modeTexture(mode, { alpha: 0.12 })}
          >
            <span className="kicker block" style={{ color: mode.accentDeep }}>
              Clean copy
            </span>
            <p className="mt-2 max-w-[64ch] text-[16px] leading-[1.7] text-[var(--color-text)]">
              <BionicText text={rewrite} enabled={bionic} />
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------ Marked-up cuts ------------------------------ */}
      {fixes.length > 0 && (
        <ModeSection
          label="The marked-up page"
          note="Struck through is what went. The margin says why."
          accent={mode.accent}
        >
          <div className="space-y-3">
            {fixes.map((fix, index) => (
              <article
                key={index}
                className="grid gap-x-4 gap-y-2 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]"
              >
                <div className="space-y-2">
                  {fix.originalSnippet && (
                    <p
                      className="text-[13.5px] leading-relaxed line-through"
                      style={{
                        color: 'color-mix(in srgb, var(--color-text) 48%, transparent)',
                        textDecorationColor: mode.accent,
                        textDecorationThickness: '1.5px'
                      }}
                    >
                      {fix.originalSnippet}
                    </p>
                  )}
                  <p className="flex gap-2.5 text-[15px] font-semibold leading-relaxed text-[var(--color-text)]">
                    <span aria-hidden style={{ color: mode.accent }}>
                      ⌐
                    </span>
                    <span>
                      <BionicText text={fix.suggestedSnippet} enabled={bionic} />
                    </span>
                  </p>
                </div>

                {fix.reason && (
                  <p
                    className="self-center border-l-[3px] pl-3 text-[12.5px] italic leading-snug lg:border-l lg:pl-4"
                    style={{
                      borderLeftColor: `color-mix(in srgb, ${mode.accent} 45%, transparent)`,
                      color: 'color-mix(in srgb, var(--color-text) 66%, transparent)'
                    }}
                  >
                    {fix.reason}
                  </p>
                )}
              </article>
            ))}
          </div>
        </ModeSection>
      )}

      {/* ------------------------------ Passive flags ------------------------------ */}
      {passives.length > 0 && (
        <ModeSection
          label="Sentences with no one in them"
          note="Passive voice hides who acts"
          accent={mode.accent}
        >
          <ul className="list-none space-y-1.5 pl-0">
            {passives.map((instance, index) => (
              <li
                key={index}
                className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border-l-[3px] bg-[var(--color-surface)] px-3 py-2 text-[13.5px] italic leading-snug text-[var(--color-text)]"
                style={{ borderLeftColor: mode.accent }}
              >
                <i
                  className="ph-duotone ph-flag mt-[3px] text-[13px]"
                  style={{ color: mode.accent }}
                  aria-hidden
                ></i>
                <span>“{instance}”</span>
              </li>
            ))}
          </ul>
        </ModeSection>
      )}
    </div>
  );
}
