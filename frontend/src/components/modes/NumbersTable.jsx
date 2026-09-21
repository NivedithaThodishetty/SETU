import NumberStory from '../NumberStory';
import { modeTexture } from '../../lib/modeCatalog';

/**
 * Numbers — the table.
 *
 * `NumberStory` already does the thing that matters: it puts countable objects
 * on screen one step at a time and narrates them, which is how special
 * education teaches arithmetic to a dyscalculic learner. What it lacked was a
 * surface. Floating the objects on the same grey panel every other mode uses
 * made a physical method look like another text result, so the story now sits
 * on squared paper with the method named above it.
 *
 * Nothing from the story is repeated here — the answer, the check, and the
 * real-life note are all rendered by `NumberStory` itself, and duplicating them
 * on the way out would put the answer on screen twice.
 */

export default function NumbersTable({ mode, data, onSolved, isWorkedExample }) {
  if (!data) return null;

  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] px-3.5 py-2"
        style={{ background: `color-mix(in srgb, ${mode.accent} 10%, transparent)` }}
      >
        <i className="ph-duotone ph-hand-pointing text-[17px]" style={{ color: mode.accent }} aria-hidden></i>
        <span className="text-[12.5px] font-semibold" style={{ color: mode.accentDeep }}>
          Objects on a table, one step at a time — the way it is taught, not the way it is written.
        </span>
      </div>

      <div
        className="rounded-[var(--radius-lg)] border p-4 sm:p-5"
        style={{
          borderColor: `color-mix(in srgb, ${mode.accent} 30%, transparent)`,
          ...modeTexture(mode, { alpha: 0.11 }),
          backgroundColor: 'var(--color-bg)'
        }}
      >
        <NumberStory data={data} onSolved={onSolved} autoNarrate={!isWorkedExample} />
      </div>
    </div>
  );
}
