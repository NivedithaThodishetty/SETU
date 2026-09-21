import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { streamExplain } from '../lib/api';
import { pathTo } from '../lib/layout';
import { BionicText } from '../lib/bionic';
import { resolveLanguage , langAttr, langDir } from '../lib/languages';
import { tts } from '../lib/tts';

/**
 * What happens when a branch is selected.
 *
 * Selecting a branch used to do one thing: read the label and the note already
 * written on it back to you, in whatever language that note happened to be in.
 * For a reader who chose Tamil that is not an accommodation — it is an English
 * sentence spoken at them. So selecting a branch now asks the engine to
 * *explain* it, in the language the user picked, and the audio follows the
 * explanation rather than the map text.
 *
 * Three decisions worth keeping:
 *
 *  - It streams. The explanation is requested the instant a branch is selected,
 *    and first words on screen in about a second is the difference between a
 *    reader following the thread and a reader losing it.
 *  - It caches per branch, per depth, per language. Clicking back and forth
 *    across a map is the normal way to use it, and paying for the same
 *    explanation twice is both slow and, on a metered key, expensive.
 *  - The map's own note stays visible underneath, quietly. The explanation is
 *    generated, and a reader is entitled to see what it was generated from.
 */

/** How long a branch must stay selected before it is worth explaining. */
const SETTLE_MS = 300;

const DEPTHS = [
  { key: 'simple', label: 'Simplest', hint: 'Two sentences, as if to a ten-year-old' },
  { key: 'plain', label: 'Plain', hint: 'Grade 6 language with an everyday comparison' },
  { key: 'detailed', label: 'Deeper', hint: 'Thorough, in short sentences, with an example' }
];

/**
 * Strip the markdown the explainer was asked not to emit.
 *
 * The prompt says prose only, and most of the time that holds — but a model
 * that slips a `**bold**` in renders as literal asterisks in a paragraph aimed
 * at someone who finds reading effortful, which is the worst possible audience
 * for stray punctuation. Cheap to strip, so it is stripped rather than trusted.
 */
function cleanExplanation(text) {
  return String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/`{1,3}/g, '')
    .replace(new RegExp('\\n{3,}', 'g'), '\\n\\n');
}

/** Compose the passage handed to the explainer. */
function buildPrompt(node, map) {
  const trail = map?.root ? pathTo(map.root, node.id) : null;
  const lines = [
    `Explain one idea taken from a mind map about "${map?.title || node.label}".`,
    '',
    `Idea: ${node.label}`
  ];

  if (trail && trail.length > 1) {
    lines.push(`Where it sits: ${trail.join(' → ')}`);
  }
  if (node.detail) {
    lines.push(`Note already on the map: ${node.detail}`);
  }

  lines.push(
    '',
    'Explain the idea itself — what it means, why it matters here, and one everyday comparison.',
    'Do not describe the mind map or mention that you were given a note.'
  );

  return lines.join('\n');
}

export default function NodeInsightPanel({
  node,
  map,
  language = 'en-IN',
  bionicEnabled = false,
  onClose,
  onAsk,
  onDeeper
}) {
  const [depth, setDepth] = useState('plain');
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const [showSourceNote, setShowSourceNote] = useState(false);

  const cacheRef = useRef(new Map());
  const abortRef = useRef(null);
  const bodyRef = useRef(null);

  const lang = resolveLanguage(language);
  const cacheKey = node ? `${node.id}|${depth}|${lang.code}` : null;

  const prompt = useMemo(() => (node ? buildPrompt(node, map) : ''), [node, map]);

  /* Mirror the shared speech engine so the transport button is honest even when
     something else on the page started the audio. */
  useEffect(() => {
    const unsubscribe = tts.subscribe((state) => setSpeaking(state.isPlaying && !state.isPaused));
    return unsubscribe;
  }, []);

  const run = useCallback(
    async ({ force = false } = {}) => {
      if (!node || !cacheKey) return;

      abortRef.current?.abort();

      if (!force && cacheRef.current.has(cacheKey)) {
        setText(cacheRef.current.get(cacheKey));
        setStreaming(false);
        setError(null);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      setText('');
      setError(null);
      setStreaming(true);

      let collected = '';

      try {
        await streamExplain(
          { text: prompt, style: depth, language: lang.code },
          {
            onChunk: (chunk) => {
              collected += chunk;
              // Cleaned on the way in as well as at the end, so a stray `**`
              // never flashes on screen mid-stream.
              if (!controller.signal.aborted) setText(cleanExplanation(collected));
            },
            onError: (payload) => setError(payload.message || payload.error || 'Explanation failed.')
          },
          controller.signal
        );

        if (controller.signal.aborted) return;

        const finished = cleanExplanation(collected).trim();
        if (finished) {
          cacheRef.current.set(cacheKey, finished);
          setText(finished);
        }
        else setError('The engine returned an empty explanation. Try again.');
      } catch (err) {
        if (err.name !== 'AbortError' && !controller.signal.aborted) {
          setError(err.message || 'Could not reach the SETU engine.');
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (!controller.signal.aborted) setStreaming(false);
      }
    },
    [node, cacheKey, prompt, depth, lang.code]
  );

  /**
   * Explain on selection, on depth change, and when the language changes.
   *
   * Held back briefly first. Exploring a map means clicking across several
   * branches in a couple of seconds, and firing a model call per click both
   * wastes quota and walks straight into the engine's own AI rate limit — so
   * only the branch a reader actually settles on gets explained. Answers
   * already in the cache still appear instantly, because `run` returns from
   * the cache without touching the network.
   */
  useEffect(() => {
    if (!node) return undefined;

    const timer = setTimeout(run, SETTLE_MS);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [node, run]);

  /* A new branch scrolls the reader back to the top of the explanation rather
     than leaving them mid-paragraph in the previous one. */
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [node?.id]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      tts.stop();
    },
    []
  );

  if (!node) return null;

  const toggleSpeech = () => {
    if (speaking) {
      tts.stop();
      return;
    }
    // Speak what is on screen, not the map's note — the explanation *is* the
    // answer now, and reading the two out of sync is how a listener loses trust
    // in the audio.
    tts.speak(text || node.detail || node.label);
  };

  const activeDepth = DEPTHS.find((entry) => entry.key === depth) || DEPTHS[1];

  return (
    <aside
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-divider)] bg-[var(--color-surface)] shadow-[var(--shadow-md)] animate-setu-rise"
      aria-label={`Explanation of ${node.label}`}
    >
      {/* ------------------------------- Header ------------------------------- */}
      <header className="flex items-start justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-3">
        <div className="min-w-0">
          <span className="kicker block">Selected branch</span>
          <h3 className="mt-0.5 truncate text-[17px] font-bold leading-tight text-[var(--color-text)]">
            {node.emoji ? `${node.emoji} ` : ''}
            {node.label}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="btn btn-quiet !min-h-[28px] !px-2 shrink-0"
          aria-label="Close explanation"
        >
          <i className="ph-duotone ph-x text-base"></i>
        </button>
      </header>

      {/* --------------------------- Language & depth --------------------------- */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-divider)] px-4 py-2.5">
        <span
          className="tag tag-accent"
          title={`Explanations are written and spoken in ${lang.name}. Change this in Settings.`}
        >
          <i className="ph-duotone ph-translate"></i>
          <span lang={langAttr(lang.code)}>{lang.native}</span>
        </span>

        <div
          className="ml-auto flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-bg)] p-0.5"
          role="radiogroup"
          aria-label="Explanation depth"
        >
          {DEPTHS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="radio"
              aria-checked={depth === entry.key}
              title={entry.hint}
              onClick={() => setDepth(entry.key)}
              className={`cursor-pointer rounded-[var(--radius-sm)] border-0 px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                depth === entry.key
                  ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                  : 'bg-transparent text-[color-mix(in_srgb,var(--color-text)_65%,transparent)] hover:text-[var(--color-text)]'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {/*
        ------------------------------- Explanation -------------------------------

        The live region wraps the WHOLE explanation area, not just the loading
        skeleton. It used to sit on the skeleton alone, which meant a screen
        reader announced "Explaining X in Hindi…" and then went permanently
        silent: the moment the first token arrived React swapped the skeleton for
        a plain <p>, the live region unmounted with it, and the text that
        actually mattered was never announced at all. A user selected a branch,
        heard a promise, and got nothing.

        `aria-busy` carries the in-flight state so assistive technology can hold
        its announcement until the stream settles rather than re-reading a
        growing paragraph on every token. `aria-live="polite"` waits for a pause
        in speech instead of interrupting — this panel opens while the user is
        still navigating the map, and "assertive" would talk over them.
      */}
      <div
        ref={bodyRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5 text-left"
        role="region"
        aria-label={`Explanation of ${node.label}`}
        aria-live="polite"
        aria-busy={streaming}
      >
        {error && !text ? (
          <div className="space-y-2.5">
            <p className="rounded-[var(--radius-md)] border border-[var(--color-accent-2)] bg-[var(--color-accent-2-100)] p-3 text-[13px] leading-snug text-[var(--color-accent-2-900)]">
              {error}
            </p>
            <button onClick={() => run({ force: true })} className="btn btn-secondary !min-h-[30px] text-[12px]">
              <i className="ph-duotone ph-arrow-clockwise"></i>
              Try again
            </button>
          </div>
        ) : !text && streaming ? (
          <div className="space-y-2.5">
            <span className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--color-accent-700)]">
              <i className="ph-duotone ph-sparkle animate-spin"></i>
              Explaining “{node.label}” in {lang.name}…
            </span>
            {[92, 100, 78].map((width) => (
              <div
                key={width}
                className="h-3 animate-setu-breathe rounded-full bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)]"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        ) : (
          <p
            lang={langAttr(lang.code)}
            dir={langDir(lang.code)}
            className="max-w-[62ch] whitespace-pre-wrap text-[15px] leading-[1.65] text-[var(--color-text)]"
          >
            <BionicText text={text} enabled={bionicEnabled && lang.code === 'en-IN'} />
            {streaming && (
              <span
                className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-setu-breathe bg-[var(--color-accent)]"
                aria-hidden
              />
            )}
          </p>
        )}

        {/* The note the explanation was built from, available but not shouting. */}
        {node.detail && (
          <div className="mt-4 border-t border-[var(--color-divider)] pt-3">
            <button
              onClick={() => setShowSourceNote((prev) => !prev)}
              aria-expanded={showSourceNote}
              className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[11.5px] font-semibold text-[color-mix(in_srgb,var(--color-text)_58%,transparent)] hover:text-[var(--color-accent-700)]"
            >
              <i className={`ph-duotone ${showSourceNote ? 'ph-caret-down' : 'ph-caret-right'}`}></i>
              The note on the map
            </button>
            {showSourceNote && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_66%,transparent)]">
                {node.detail}
              </p>
            )}
          </div>
        )}
      </div>

      {/* -------------------------------- Actions -------------------------------- */}
      <footer className="flex flex-wrap items-center gap-2 border-t border-[var(--color-divider)] bg-[var(--color-bg)] px-4 py-2.5">
        <button
          onClick={toggleSpeech}
          disabled={!text && !node.detail}
          className={`btn !min-h-[32px] text-[12px] ${speaking ? 'btn-primary' : 'btn-secondary'}`}
          title={`Hear this explanation in ${lang.name}`}
        >
          <i className={`ph-duotone ${speaking ? 'ph-stop-circle' : 'ph-speaker-high'}`}></i>
          {speaking ? 'Stop' : 'Hear it'}
        </button>

        <button
          onClick={() => run({ force: true })}
          disabled={streaming}
          className="btn btn-ghost !min-h-[32px] !px-2.5 text-[12px]"
          title={`Explain again — ${activeDepth.hint}`}
        >
          <i className={`ph-duotone ph-arrow-clockwise ${streaming ? 'animate-spin' : ''}`}></i>
          Again
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => onAsk?.(node)}
            className="btn btn-ghost !min-h-[32px] !px-2.5 text-[12px]"
            title="Ask a follow-up question about this branch"
          >
            <i className="ph-duotone ph-chats-circle"></i>
            Ask
          </button>
          <button
            onClick={() => onDeeper?.(node)}
            className="btn btn-ghost !min-h-[32px] !px-2.5 text-[12px]"
            title="Research this branch one level deeper on the map"
          >
            <i className="ph-duotone ph-tree-structure"></i>
            Go deeper
          </button>
        </div>
      </footer>
    </aside>
  );
}
