import { BionicText } from '../../lib/bionic';
import { AccentChip, ModeSection, ProgressRing, useChecklist } from './ModeChrome';

/**
 * Meet — the ledger.
 *
 * A meeting produces one thing worth keeping: who owes what, by when. So this
 * mode is the only one in the app that renders a real table, with the owner and
 * the deadline in their own columns instead of trailing the task as chips. The
 * point is to be scannable down a column — "which of these are mine" is the
 * question people actually bring to their own notes.
 *
 * The table degrades to stacked rows under 640px rather than scrolling
 * sideways: a horizontal scrollbar is exactly the interaction this audience
 * loses track in.
 */

const PRIORITY_TONE = {
  High: { bg: '#fce4ef', fg: '#a30052', border: '#f8c0db' },
  Medium: { bg: '#fdf3d6', fg: '#8a5e00', border: '#f4e3ad' },
  Low: { bg: '#e6f4f1', fg: '#115e59', border: '#c3e5df' }
};

function initialsOf(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export default function MeetLedger({ mode, data, bionic, resetKey }) {
  const actions = data.actionItems || [];
  const { checked, toggle, done } = useChecklist(resetKey);

  return (
    <div className="space-y-7">
      {/* -------------------------------- Minutes -------------------------------- */}
      {data.summary && (
        <div
          className="rounded-[var(--radius-md)] border p-4"
          style={{
            borderColor: `color-mix(in srgb, ${mode.accent} 32%, transparent)`,
            background: `color-mix(in srgb, ${mode.accent} 6%, var(--color-surface))`
          }}
        >
          <span className="kicker block" style={{ color: mode.accentDeep }}>
            What the meeting was actually about
          </span>
          <p className="mt-2 text-[15px] leading-[1.65] text-[var(--color-text)]">
            <BionicText text={data.summary} enabled={bionic} />
          </p>
        </div>
      )}

      {/* ------------------------------ Action ledger ------------------------------ */}
      {actions.length > 0 && (
        <ModeSection
          label="Who owes what"
          note="Tick a row when it is genuinely done"
          accent={mode.accent}
        >
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-divider)]">
            {/* Column headings — only worth showing where the columns exist */}
            <div
              className="hidden grid-cols-[28px_minmax(0,1fr)_120px_120px_88px] items-center gap-3 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.09em] sm:grid"
              style={{ background: `color-mix(in srgb, ${mode.accent} 11%, transparent)`, color: mode.accentDeep }}
            >
              <span aria-hidden />
              <span>Task</span>
              <span>Owner</span>
              <span>Due</span>
              <span>Priority</span>
            </div>

            <ul className="list-none pl-0">
              {actions.map((item, index) => {
                const id = `meet-row-${index}`;
                const isDone = checked.has(id);
                const tone = PRIORITY_TONE[item.priority] || null;

                return (
                  <li
                    key={id}
                    className="border-t border-[var(--color-divider)] first:border-t-0"
                    style={{
                      background: isDone
                        ? `color-mix(in srgb, ${mode.accent} 6%, var(--color-bg))`
                        : index % 2
                          ? 'var(--color-surface)'
                          : 'var(--color-bg)'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(id)}
                      aria-pressed={isDone}
                      className="grid w-full cursor-pointer grid-cols-[28px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 border-0 bg-transparent px-3.5 py-3 text-left sm:grid-cols-[28px_minmax(0,1fr)_120px_120px_88px] sm:items-center"
                    >
                      <span
                        aria-hidden
                        className="mt-0.5 grid h-[19px] w-[19px] place-items-center rounded-[3px] border-2 text-[11px] sm:mt-0"
                        style={{
                          borderColor: isDone ? mode.accent : 'color-mix(in srgb, var(--color-text) 26%, transparent)',
                          background: isDone ? mode.accent : 'transparent',
                          color: '#fff'
                        }}
                      >
                        {isDone && <i className="ph-duotone ph-check"></i>}
                      </span>

                      <span
                        className={`text-[14px] font-semibold leading-snug ${
                          isDone
                            ? 'text-[color-mix(in_srgb,var(--color-text)_52%,transparent)] line-through'
                            : 'text-[var(--color-text)]'
                        }`}
                      >
                        <BionicText text={item.task} enabled={bionic && !isDone} />
                      </span>

                      {/* Owner */}
                      <span className="col-start-2 flex items-center gap-2 sm:col-start-auto">
                        {item.owner ? (
                          <>
                            <span
                              className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[10px] font-bold"
                              style={{ background: mode.accent, color: mode.ink }}
                              aria-hidden
                            >
                              {initialsOf(item.owner)}
                            </span>
                            <span className="truncate text-[12.5px] text-[color-mix(in_srgb,var(--color-text)_75%,transparent)]">
                              {item.owner}
                            </span>
                          </>
                        ) : (
                          <span className="text-[12.5px] text-[color-mix(in_srgb,var(--color-text)_45%,transparent)]">
                            Unassigned
                          </span>
                        )}
                      </span>

                      {/* Due */}
                      <span className="col-start-2 text-[12.5px] text-[color-mix(in_srgb,var(--color-text)_70%,transparent)] sm:col-start-auto">
                        {item.deadline || '—'}
                      </span>

                      {/* Priority */}
                      <span className="col-start-2 sm:col-start-auto">
                        {tone ? (
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                            style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}` }}
                          >
                            {item.priority}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div
              className="flex items-center justify-between gap-3 border-t border-[var(--color-divider)] px-3.5 py-2"
              style={{ background: `color-mix(in srgb, ${mode.accent} 7%, transparent)` }}
            >
              <span className="text-[12px] font-semibold" style={{ color: mode.accentDeep }}>
                {done} of {actions.length} cleared
              </span>
              <ProgressRing value={done} total={actions.length} accent={mode.accent} size={34} />
            </div>
          </div>
        </ModeSection>
      )}

      {/* ------------------------------- Decisions ------------------------------- */}
      {data.keyDecisions?.length > 0 && (
        <ModeSection label="Settled — do not reopen" accent={mode.accent}>
          <ul className="list-none space-y-2 pl-0">
            {data.keyDecisions.map((decision, index) => (
              <li
                key={index}
                className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] px-3.5 py-2.5"
              >
                <i
                  className="ph-duotone ph-seal-check mt-[2px] text-[17px]"
                  style={{ color: mode.accent }}
                  aria-hidden
                ></i>
                <span className="text-[14px] leading-relaxed text-[var(--color-text)]">
                  <BionicText text={decision} enabled={bionic} />
                </span>
              </li>
            ))}
          </ul>
        </ModeSection>
      )}

      {/* -------------------------------- Glossary -------------------------------- */}
      {data.jargonDecoded?.length > 0 && (
        <ModeSection
          label="Words nobody explained"
          note="Decoded so you do not have to ask afterwards"
          accent={mode.accent}
        >
          <dl className="grid gap-2 sm:grid-cols-2">
            {data.jargonDecoded.map((entry, index) => (
              <div
                key={index}
                className="rounded-[var(--radius-md)] border-l-[3px] bg-[var(--color-surface)] px-3.5 py-2.5"
                style={{ borderLeftColor: mode.accent }}
              >
                <dt className="text-[13px] font-bold" style={{ color: mode.accentDeep }}>
                  {entry.term}
                </dt>
                <dd className="mt-0.5 text-[13px] leading-snug text-[color-mix(in_srgb,var(--color-text)_76%,transparent)]">
                  <BionicText text={entry.plainMeaning} enabled={bionic} />
                </dd>
              </div>
            ))}
          </dl>
        </ModeSection>
      )}

      {actions.length === 0 && !data.summary && (
        <AccentChip accent={mode.accent}>Nothing actionable came out of that transcript.</AccentChip>
      )}
    </div>
  );
}
