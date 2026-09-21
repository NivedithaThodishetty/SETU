import { BionicText } from '../../lib/bionic';
import { AccentChip, ModeSection } from './ModeChrome';

/**
 * Simplify — the translation bench.
 *
 * The result here is a *comparison*, so the layout is a comparison: the text
 * you handed over on one side, the plain version on the other, and a gutter
 * between them that makes the direction of travel obvious. Showing only the
 * rewrite — which is what this mode used to do — asks the reader to take on
 * faith that nothing was dropped.
 *
 * The dial is the second signal. "Grade 6" means very little as a phrase and a
 * great deal as a needle that has swung left.
 */

/** Pull a grade number out of whatever phrasing the model used. */
function readGrade(text) {
  const match = String(text || '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? Math.min(16, Math.max(1, value)) : null;
}

function GradeDial({ grade, accent }) {
  // 1–16 mapped onto a 180° sweep. Lower is easier, so the needle resting left
  // is the good outcome.
  const ratio = ((grade ?? 6) - 1) / 15;
  const angle = -90 + ratio * 180;

  return (
    <svg width="132" height="78" viewBox="0 0 132 78" role="img" aria-label={`Reading level: grade ${grade}`}>
      <path
        d="M 14 68 A 52 52 0 0 1 118 68"
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        stroke="color-mix(in srgb, var(--color-text) 11%, transparent)"
      />
      <path
        d="M 14 68 A 52 52 0 0 1 118 68"
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        stroke={accent}
        strokeDasharray="164"
        strokeDashoffset={164 * (1 - ratio)}
        style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
      />
      <line
        x1="66"
        y1="68"
        x2="66"
        y2="26"
        stroke="var(--color-text)"
        strokeWidth="2.5"
        strokeLinecap="round"
        transform={`rotate(${angle} 66 68)`}
        style={{ transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
      />
      <circle cx="66" cy="68" r="4" fill="var(--color-text)" />
      <text x="14" y="78" textAnchor="middle" style={{ fontSize: 9, fill: 'color-mix(in srgb, var(--color-text) 50%, transparent)' }}>
        easy
      </text>
      <text x="118" y="78" textAnchor="middle" style={{ fontSize: 9, fill: 'color-mix(in srgb, var(--color-text) 50%, transparent)' }}>
        dense
      </text>
    </svg>
  );
}

export default function SimplifyBench({ mode, data, bionic, sourceText }) {
  const grade = readGrade(data.readabilityGrade);
  const original = (sourceText || '').trim();

  return (
    <div className="space-y-7">
      {/* ------------------------------ The bench ------------------------------ */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.15fr)] lg:items-stretch">
        {/* Before */}
        <div className="flex flex-col rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-4">
          <span className="kicker block text-[color-mix(in_srgb,var(--color-text)_50%,transparent)]">
            As it was written
          </span>
          <p className="mt-2 max-h-[19rem] overflow-y-auto text-[13.5px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_62%,transparent)]">
            {original || 'Paste a dense passage above and it will appear here beside the rewrite.'}
          </p>
        </div>

        {/* Gutter */}
        <div className="flex items-center justify-center lg:w-11">
          <span
            className="grid h-9 w-9 place-items-center rounded-full text-[15px]"
            style={{ background: mode.accent, color: mode.ink }}
            aria-hidden
          >
            <i className="ph-duotone ph-arrow-down lg:hidden"></i>
            <i className="ph-duotone ph-arrow-right hidden lg:inline"></i>
          </span>
        </div>

        {/* After */}
        <div
          className="flex flex-col rounded-[var(--radius-md)] border p-4"
          style={{
            borderColor: `color-mix(in srgb, ${mode.accent} 42%, transparent)`,
            background: `color-mix(in srgb, ${mode.accent} 6%, var(--color-bg))`
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="kicker block" style={{ color: mode.accentDeep }}>
              In plain words
            </span>
            {data.readabilityGrade && (
              <AccentChip accent={mode.accentDeep}>{data.readabilityGrade}</AccentChip>
            )}
          </div>
          <p className="mt-2.5 text-[16px] leading-[1.65] text-[var(--color-text)]">
            <BionicText text={data.plainLanguageRewrite} enabled={bionic} />
          </p>
        </div>
      </div>

      {/* ---------------------------- Takeaways + dial ---------------------------- */}
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        {data.keyTakeaways?.length > 0 && (
          <ModeSection label="What it actually asks of you" accent={mode.accent}>
            <ol className="list-none space-y-2 pl-0">
              {data.keyTakeaways.map((point, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-3"
                >
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold"
                    style={{ background: mode.accent, color: mode.ink }}
                  >
                    {index + 1}
                  </span>
                  <span className="text-[14.5px] leading-relaxed text-[var(--color-text)]">
                    <BionicText text={point} enabled={bionic} />
                  </span>
                </li>
              ))}
            </ol>
          </ModeSection>
        )}

        {grade !== null && (
          <div className="flex flex-col items-center rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-3">
            <span className="kicker block" style={{ color: mode.accentDeep }}>
              Reading level
            </span>
            <GradeDial grade={grade} accent={mode.accent} />
          </div>
        )}
      </div>

      {/* ------------------------------- Reading tips ------------------------------- */}
      {data.sensoryTips?.length > 0 && (
        <ModeSection label="How to read it without losing the thread" accent={mode.accent}>
          <ul className="flex flex-wrap gap-2 pl-0">
            {data.sensoryTips.map((tip, index) => (
              <li
                key={index}
                className="max-w-[42ch] rounded-[var(--radius-md)] border border-dashed px-3 py-2 text-[13px] leading-snug text-[color-mix(in_srgb,var(--color-text)_75%,transparent)]"
                style={{ borderColor: `color-mix(in srgb, ${mode.accent} 40%, transparent)` }}
              >
                <BionicText text={tip} enabled={bionic} />
              </li>
            ))}
          </ul>
        </ModeSection>
      )}
    </div>
  );
}
