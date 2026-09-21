import { useCallback, useEffect, useRef, useState } from 'react';
import { INPUT_SHEET, modeTexture } from '../../lib/modeCatalog';
import { award } from '../../lib/progress';
import { tts } from '../../lib/tts';
import VoiceInputButton from '../VoiceInputButton';

/**
 * Furniture shared by all eight mode workspaces.
 *
 * Everything in here is the part that *should* be identical between modes —
 * how the ask is made, how progress is counted, how a heading is set. The part
 * that must not be identical (the result layout) lives in one file per mode.
 */

/* -------------------------------------------------------------------------- */
/* Section heading                                                            */
/* -------------------------------------------------------------------------- */

export function ModeSection({ label, note, accent, children, className = '' }) {
  return (
    <section className={`space-y-2.5 ${className}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3
          className="text-[11px] font-bold uppercase tracking-[0.09em]"
          style={{ color: accent }}
        >
          {label}
        </h3>
        {note && (
          <span className="text-[11.5px] text-[color-mix(in_srgb,var(--color-text)_55%,transparent)]">
            {note}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Mode hero band                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The coloured band at the top of a mode.
 *
 * It is the single strongest signal that you have changed tools, which is why
 * it carries the accent at full strength rather than as a tint — you should be
 * able to tell Simplify from Practice out of the corner of your eye.
 */
export function ModeHero({ mode }) {
  return (
    <header
      className="relative overflow-hidden rounded-[var(--radius-lg)] px-5 py-5 sm:px-7 sm:py-6"
      style={{
        background: `linear-gradient(135deg, ${mode.accent} 0%, ${mode.accentDeep} 100%)`,
        color: mode.ink
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          ...modeTexture({ ...mode, accent: '#ffffff' }, { alpha: 0.18, scale: 1.4 })
        }}
      />

      <div className="relative flex flex-wrap items-start gap-4">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-md)] text-[26px]"
          style={{ background: 'rgba(255,255,255,0.17)', color: mode.ink }}
          aria-hidden
        >
          <i className={`ph-duotone ${mode.icon}`}></i>
        </span>

        <div className="min-w-0 flex-1">
          <span
            className="block text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{ color: 'rgba(255,255,255,0.78)' }}
          >
            {mode.kicker}
          </span>
          <h2 className="mt-0.5 text-[26px] font-bold leading-tight sm:text-[30px]" style={{ color: mode.ink }}>
            {mode.name}
          </h2>
          <p
            className="mt-1.5 max-w-[62ch] text-[14.5px] leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.9)' }}
          >
            {mode.blurb}
          </p>
        </div>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Composer                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The ask.
 *
 * Two shapes, because four modes want a sentence about you ("what are you
 * putting off?") and four want a wall of material pasted in. Rendering both as
 * the same six-row box made the short ones feel like an essay question and the
 * long ones feel cramped.
 */
export function ModeComposer({
  mode,
  value,
  onChange,
  onSubmit,
  onClear,
  onUpload,
  loading,
  error
}) {
  const isSheet = mode.input.kind === INPUT_SHEET;
  const [pasteState, setPasteState] = useState(null);
  const fieldRef = useRef(null);

  useEffect(() => {
    setPasteState(null);
  }, [mode.key]);

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text?.trim()) {
        setPasteState('empty');
        return;
      }
      onChange(text.slice(0, 60000));
      setPasteState('done');
      fieldRef.current?.focus();
    } catch (_) {
      // Clipboard read is permission-gated and simply unavailable in some
      // browsers. Saying so beats a button that appears to do nothing.
      setPasteState('denied');
    }
  };

  const appendTranscript = (text) => onChange(value ? `${value} ${text}` : text);

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div
        className="overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--color-surface)]"
        style={{ borderColor: `color-mix(in srgb, ${mode.accent} 32%, transparent)` }}
      >
        {/* Field header */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-2"
          style={{
            borderColor: `color-mix(in srgb, ${mode.accent} 20%, transparent)`,
            background: `color-mix(in srgb, ${mode.accent} 7%, transparent)`
          }}
        >
          <label
            htmlFor={`mode-field-${mode.key}`}
            className="text-[12.5px] font-bold"
            style={{ color: mode.accentDeep }}
          >
            {mode.input.label}
          </label>

          <div className="flex items-center gap-1.5">
            {isSheet && (
              <>
                <button
                  type="button"
                  onClick={pasteFromClipboard}
                  className="btn btn-quiet !min-h-[26px] !px-2 text-[11.5px]"
                  title="Paste the clipboard into this field"
                >
                  <i className="ph-duotone ph-clipboard-text text-sm"></i>
                  Paste
                </button>
                <button
                  type="button"
                  onClick={onUpload}
                  className="btn btn-quiet !min-h-[26px] !px-2 text-[11.5px]"
                  title="Load a PDF, Word file, or notes"
                >
                  <i className="ph-duotone ph-file-arrow-up text-sm"></i>
                  File
                </button>
              </>
            )}
            <VoiceInputButton onTranscript={appendTranscript} size="sm" title="Speak instead of typing" />
          </div>
        </div>

        {/* The field itself */}
        <div className="relative">
          <textarea
            id={`mode-field-${mode.key}`}
            ref={fieldRef}
            rows={mode.input.rows}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              // Ctrl/Cmd+Enter submits from anywhere in the field. Reaching for
              // a button after a long paste is a needless trip for anyone
              // working by keyboard.
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                onSubmit(event);
              }
            }}
            placeholder={mode.input.placeholder}
            aria-describedby={`mode-hint-${mode.key}`}
            className="block w-full resize-y border-0 bg-transparent px-3.5 py-3 text-[15px] leading-relaxed text-[var(--color-text)] outline-none placeholder:text-[color-mix(in_srgb,var(--color-text)_40%,transparent)]"
            style={isSheet ? modeTexture(mode, { alpha: 0.045 }) : undefined}
          />
          {isSheet && value.length > 0 && (
            <span className="pointer-events-none absolute bottom-2 right-3 font-mono text-[10.5px] text-[color-mix(in_srgb,var(--color-text)_45%,transparent)]">
              {value.length.toLocaleString()} chars
            </span>
          )}
        </div>
      </div>

      <p
        id={`mode-hint-${mode.key}`}
        className="text-[12px] leading-snug text-[color-mix(in_srgb,var(--color-text)_58%,transparent)]"
      >
        {mode.input.hint}
        {pasteState === 'denied' && ' · Your browser blocked clipboard access — press Ctrl+V instead.'}
        {pasteState === 'empty' && ' · The clipboard was empty.'}
      </p>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="btn text-[14px] font-bold"
          style={{
            background: loading ? mode.accentDeep : mode.accent,
            borderColor: loading ? mode.accentDeep : mode.accent,
            color: mode.ink,
            paddingInline: '20px'
          }}
        >
          {loading ? (
            <>
              <i className="ph-duotone ph-spinner animate-spin"></i>
              Working…
            </>
          ) : (
            <>
              <i className={`ph-duotone ${mode.icon}`}></i>
              {mode.verb}
            </>
          )}
        </button>

        <kbd className="hidden rounded border border-[var(--color-divider)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[color-mix(in_srgb,var(--color-text)_55%,transparent)] sm:inline-block">
          Ctrl + Enter
        </kbd>

        {value && !loading && (
          <button type="button" onClick={onClear} className="btn btn-quiet text-[13px]">
            Clear
          </button>
        )}
      </div>

      {loading && (
        <p
          role="status"
          className="flex items-center gap-2 text-[13px] font-semibold"
          style={{ color: mode.accentDeep }}
        >
          <span
            className="h-1.5 w-1.5 animate-setu-breathe rounded-full"
            style={{ background: mode.accent }}
          />
          {mode.loading}
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--color-accent-2)] bg-[var(--color-accent-2-100)] p-3 text-[13px] leading-snug text-[var(--color-accent-2-900)]"
        >
          {error}
        </div>
      )}
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Tick-off state for the modes that hand back a list of things to do.
 *
 * `resetKey` changes whenever a new answer arrives, which is the whole reason
 * this exists as a hook: the ticks used to live in a component that React kept
 * mounted across runs, so a fresh set of steps opened already half crossed off.
 */
export function useChecklist(resetKey) {
  const [checked, setChecked] = useState(() => new Set());

  useEffect(() => {
    setChecked(new Set());
  }, [resetKey]);

  const toggle = useCallback((id) => {
    let wasChecked = false;

    setChecked((current) => {
      wasChecked = current.has(id);
      const next = new Set(current);
      if (wasChecked) next.delete(id);
      else next.add(id);
      return next;
    });

    // Deliberately outside the updater: `award` writes storage and notifies the
    // toast host, and StrictMode runs updaters twice in development — which paid
    // out twice and chimed twice for one tick.
    if (!wasChecked) {
      tts.playCelebrationChime();
      award('stepChecked');
    }
  }, []);

  return { checked, toggle, done: checked.size };
}

/** A small circular completion dial. Used where "3 of 5" deserves a shape. */
export function ProgressRing({ value, total, accent, size = 46, label }) {
  const safeTotal = Math.max(1, total);
  const ratio = Math.min(1, value / safeTotal);
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} role="img" aria-label={`${value} of ${total} done`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="4"
          stroke="color-mix(in srgb, var(--color-text) 12%, transparent)"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="4"
          stroke={accent}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="font-bold"
          style={{ fontSize: size * 0.3, fill: 'var(--color-text)' }}
        >
          {value}
        </text>
      </svg>
      {label && (
        <span className="text-[11.5px] font-semibold leading-tight text-[color-mix(in_srgb,var(--color-text)_62%,transparent)]">
          {label}
        </span>
      )}
    </div>
  );
}

/** Rounded chip in the mode's own colour. */
export function AccentChip({ accent, children, solid = false, title }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold"
      title={title}
      style={
        solid
          ? { background: accent, color: '#fff' }
          : {
              background: `color-mix(in srgb, ${accent} 13%, transparent)`,
              color: accent,
              border: `1px solid color-mix(in srgb, ${accent} 34%, transparent)`
            }
      }
    >
      {children}
    </span>
  );
}
