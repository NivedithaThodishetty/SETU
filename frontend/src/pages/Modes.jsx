import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MODES, getMode, modeTexture } from '../lib/modeCatalog';
import { getPrefs, savePrefs } from '../lib/storage';
import { award } from '../lib/progress';
import { tts } from '../lib/tts';
import FileUploadModal from '../components/FileUploadModal';
import { ModeComposer, ModeHero } from '../components/modes/ModeChrome';
import StartLaunchpad from '../components/modes/StartLaunchpad';
import SimplifyBench from '../components/modes/SimplifyBench';
import LearnDeck from '../components/modes/LearnDeck';
import MeetLedger from '../components/modes/MeetLedger';
import PracticeStage from '../components/modes/PracticeStage';
import WriteCopyDesk from '../components/modes/WriteCopyDesk';
import NumbersTable from '../components/modes/NumbersTable';
import GuideTrail from '../components/modes/GuideTrail';

/**
 * The eight cognitive modes.
 *
 * This page is only a switchboard. Everything that makes a mode look like
 * itself — its plate colour, its background texture, the shape of its ask, and
 * above all the layout of its answer — lives in `lib/modeCatalog.js` and in one
 * component per mode under `components/modes/`.
 *
 * That split is the point of the rewrite. All eight used to render through one
 * shared column: same textarea, same button, same stack of headed paragraphs.
 * They do genuinely different jobs, and printing them on identical stationery
 * made the app look like one feature with a dropdown — and hid the
 * accommodation, because nothing on screen said that Numbers works differently
 * from Simplify.
 */

/** Per-mode result renderers. Adding a mode means adding a stage here. */
const STAGES = {
  launchpad: StartLaunchpad,
  bench: SimplifyBench,
  deck: LearnDeck,
  ledger: MeetLedger,
  rehearsal: PracticeStage,
  copydesk: WriteCopyDesk,
  table: NumbersTable,
  trail: GuideTrail
};

/**
 * What "read this to me" means for each mode.
 *
 * Each mode's answer has a different spine, so a generic walk of the object
 * would read out JSON keys. These pick the parts worth hearing end to end,
 * which is not the same as the parts worth seeing.
 */
function speakableSummary(key, data) {
  if (!data) return '';

  switch (key) {
    case 'start':
      return [
        data.supportiveMessage,
        data.immediateTenMinuteAction && `Start with: ${data.immediateTenMinuteAction}`,
        (data.microSteps || []).join('. ')
      ]
        .filter(Boolean)
        .join('. ');

    case 'simplify':
      return [data.plainLanguageRewrite, (data.keyTakeaways || []).join('. ')].filter(Boolean).join('. ');

    case 'learn':
      return data.summary || '';

    case 'meet':
      return [
        data.summary,
        (data.actionItems || [])
          .map((item) => `${item.task}, ${item.owner ? `assigned to ${item.owner}` : 'unassigned'}`)
          .join('. ')
      ]
        .filter(Boolean)
        .join('. ');

    case 'practice':
      return [data.scenarioContext, data.openingLine && `They open with: ${data.openingLine}`]
        .filter(Boolean)
        .join('. ');

    case 'write':
      return data.improvedText || data.accessibleRewrite || '';

    case 'guide':
      return [
        data.workflowName,
        (data.steps || []).map((step) => `${step.title}. ${step.actionRequired || step.action}`).join('. ')
      ]
        .filter(Boolean)
        .join('. ');

    case 'numbers':
      return [
        data.plainQuestion,
        data.story,
        (data.steps || []).map((step) => step.narration).join('. '),
        data.answer && `The answer is ${data.answer}.`
      ]
        .filter(Boolean)
        .join('. ');

    default:
      return '';
  }
}

export default function Modes() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeKey, setActiveKey] = useState(() => {
    const requested = searchParams.get('mode');
    return MODES.some((mode) => mode.key === requested) ? requested : MODES[0].key;
  });

  /** Drafts, answers, and the text each answer came from — all kept per mode. */
  const [drafts, setDrafts] = useState({});
  const [results, setResults] = useState({});
  const [sources, setSources] = useState({});
  const [runCounts, setRunCounts] = useState({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bionic, setBionic] = useState(() => getPrefs().bionicReading === true);
  const [speaking, setSpeaking] = useState(false);

  const resultRef = useRef(null);

  const mode = getMode(activeKey);
  const Stage = STAGES[mode.stage] || StartLaunchpad;

  const result = results[activeKey] || mode.workedExample;
  const isWorkedExample = !results[activeKey];
  const draft = drafts[activeKey] || '';

  /* A new answer must reset the tick-off and quiz state inside the stage; the
     run counter is what tells it something genuinely changed. */
  const resetKey = `${activeKey}:${runCounts[activeKey] || 0}`;

  /* Deep links (`/modes?mode=numbers`) and the command palette both arrive here. */
  useEffect(() => {
    const requested = searchParams.get('mode');
    if (requested && MODES.some((entry) => entry.key === requested) && requested !== activeKey) {
      setActiveKey(requested);
    }
  }, [searchParams, activeKey]);

  useEffect(() => {
    const unsubscribe = tts.subscribe((state) => setSpeaking(state.isPlaying && !state.isPaused));
    return () => {
      unsubscribe();
      tts.stop();
    };
  }, []);

  const selectMode = useCallback(
    (key) => {
      if (key === activeKey) return;
      tts.stop();
      setActiveKey(key);
      setError(null);

      // Keep the URL honest so the screen can be linked to and reloaded, without
      // pushing a history entry for every glance at a different tool.
      const next = new URLSearchParams(searchParams);
      next.set('mode', key);
      setSearchParams(next, { replace: true });
    },
    [activeKey, searchParams, setSearchParams]
  );

  const setDraft = useCallback(
    (value) => setDrafts((current) => ({ ...current, [activeKey]: value })),
    [activeKey]
  );

  const handleRun = async (event) => {
    event?.preventDefault();
    const value = draft.trim();
    if (!value || loading) return;

    tts.stop();
    setLoading(true);
    setError(null);

    try {
      const data = await mode.run(value);
      setResults((current) => ({ ...current, [activeKey]: data }));
      setSources((current) => ({ ...current, [activeKey]: value }));
      setRunCounts((current) => ({ ...current, [activeKey]: (current[activeKey] || 0) + 1 }));
      award('modeRun');

      // Bring the answer into view. Someone who has just pasted six paragraphs
      // is looking at the bottom of a text field, not at the result.
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (err) {
      setError(
        err.message || 'Could not reach the SETU engine. Make sure the backend is running (npm start in /backend).'
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleBionic = () => {
    const next = !bionic;
    setBionic(next);
    // Persisted so the choice survives a reload and matches every other screen,
    // rather than silently resetting each time this page is opened.
    savePrefs({ bionicReading: next });
  };

  const toggleReadAloud = () => {
    if (speaking) {
      tts.stop();
      return;
    }
    const text = speakableSummary(activeKey, result);
    if (text) tts.speak(text);
  };

  const canSpeak = useMemo(() => Boolean(speakableSummary(activeKey, result)), [activeKey, result]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--color-bg)] text-left lg:flex-row">
      {/* ============================== The plate rail ============================== */}
      <ModeRail activeKey={activeKey} onSelect={selectMode} hasResult={(key) => Boolean(results[key])} />

      {/* ================================ Workspace ================================ */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        {/* A wash of the mode's own texture behind the whole workspace, so even
            the empty space belongs to the tool you are in. */}
        <div
          className="min-h-full px-5 py-6 sm:px-8 sm:py-8"
          style={modeTexture(mode, { alpha: 0.035, scale: 1.8 })}
        >
          <div className="mx-auto max-w-[64rem] space-y-6">
            <ModeHero mode={mode} />

            <ModeComposer
              mode={mode}
              value={draft}
              onChange={setDraft}
              onSubmit={handleRun}
              onClear={() => {
                setDraft('');
                setError(null);
              }}
              onUpload={() => setUploadOpen(true)}
              loading={loading}
              error={error}
            />

            {/* -------------------------------- Result -------------------------------- */}
            <section
              ref={resultRef}
              className="space-y-4 pt-1"
              aria-live="polite"
              aria-busy={loading}
            >
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
                style={{ borderColor: `color-mix(in srgb, ${mode.accent} 25%, transparent)` }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                    style={
                      isWorkedExample
                        ? {
                            background: 'var(--color-surface)',
                            color: 'color-mix(in srgb, var(--color-text) 62%, transparent)',
                            border: '1px solid var(--color-divider)'
                          }
                        : { background: mode.accent, color: mode.ink }
                    }
                  >
                    <i className={`ph-duotone ${isWorkedExample ? 'ph-book-open' : 'ph-sparkle'}`}></i>
                    {isWorkedExample ? 'Worked example' : 'Your answer'}
                  </span>
                  {isWorkedExample && (
                    <span className="text-[12px] text-[color-mix(in_srgb,var(--color-text)_55%,transparent)]">
                      A real answer, hand-checked — so you can see the shape before you type.
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={toggleReadAloud}
                    disabled={!canSpeak}
                    className={`btn !min-h-[30px] !px-2.5 text-[12px] font-semibold ${
                      speaking ? 'btn-primary' : 'btn-ghost'
                    }`}
                    title="Read this answer aloud"
                  >
                    <i className={`ph-duotone ${speaking ? 'ph-stop-circle' : 'ph-speaker-high'}`}></i>
                    {speaking ? 'Stop' : 'Listen'}
                  </button>
                  <button
                    onClick={toggleBionic}
                    aria-pressed={bionic}
                    className={`btn !min-h-[30px] !px-2.5 text-[12px] font-semibold ${
                      bionic ? 'btn-primary' : 'btn-ghost'
                    }`}
                    title="Bold the first letters of each word. Helps some readers, not all — try it both ways."
                  >
                    <i className="ph-duotone ph-eye text-sm"></i>
                    Bionic
                  </button>
                </div>
              </div>

              <Stage
                key={resetKey}
                mode={mode}
                data={result}
                bionic={bionic}
                resetKey={resetKey}
                sourceText={sources[activeKey] || ''}
                isWorkedExample={isWorkedExample}
                onSolved={() => award('numbersSolved')}
              />
            </section>
          </div>
        </div>
      </main>

      <FileUploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        variant="text"
        attachLabel="Load this text into the field"
        onFileAttached={(doc) => {
          const text = doc.extractedText || doc.summary || '';
          setDraft(text.slice(0, 60000));
          setError(null);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The rail                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Mode picker.
 *
 * A vertical rail of colour plates on desktop, a horizontally scrolling row of
 * chips on narrow screens. Each entry carries its own accent at full strength
 * rather than a shared grey — the rail is the first place a person learns that
 * these eight are different tools, so it is the last place they should all look
 * alike.
 */
function ModeRail({ activeKey, onSelect, hasResult }) {
  return (
    <>
      {/* ------------------------------- Desktop rail ------------------------------- */}
      <aside className="hidden w-[264px] shrink-0 flex-col overflow-y-auto border-r border-[var(--color-divider)] bg-[var(--color-surface)] p-4 lg:flex">
        <div className="mb-4">
          <h1 className="text-[22px] font-bold leading-tight text-[var(--color-text)]">Cognitive modes</h1>
          <p className="mt-1 text-[12.5px] leading-snug text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
            Eight tools for reading, writing, numbers, and getting started. Each one works
            differently on purpose.
          </p>
        </div>

        <nav className="flex flex-col gap-1.5" aria-label="Cognitive modes">
          {MODES.map((mode) => {
            const isActive = mode.key === activeKey;
            return (
              <button
                key={mode.key}
                onClick={() => onSelect(mode.key)}
                aria-current={isActive ? 'page' : undefined}
                className="relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-[var(--radius-md)] border py-2.5 pl-4 pr-3 text-left transition-all"
                style={{
                  background: isActive
                    ? `color-mix(in srgb, ${mode.accent} 11%, var(--color-bg))`
                    : 'transparent',
                  borderColor: isActive
                    ? `color-mix(in srgb, ${mode.accent} 38%, transparent)`
                    : 'transparent',
                  boxShadow: isActive ? 'var(--shadow-sm)' : 'none'
                }}
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[4px] transition-opacity"
                  style={{ background: mode.accent, opacity: isActive ? 1 : 0.34 }}
                />

                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[17px] transition-colors"
                  style={
                    isActive
                      ? { background: mode.accent, color: mode.ink }
                      : {
                          background: `color-mix(in srgb, ${mode.accent} 13%, transparent)`,
                          color: mode.accent
                        }
                  }
                  aria-hidden
                >
                  <i className={`ph-duotone ${mode.icon}`}></i>
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[14.5px] font-bold leading-tight"
                    style={{ color: isActive ? mode.accentDeep : 'var(--color-text)' }}
                  >
                    {mode.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-[color-mix(in_srgb,var(--color-text)_58%,transparent)]">
                    {mode.tagline}
                  </span>
                </span>

                {hasResult(mode.key) && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: mode.accent }}
                    title="You have an answer waiting in this mode"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* -------------------------------- Mobile chips -------------------------------- */}
      <div className="shrink-0 border-b border-[var(--color-divider)] bg-[var(--color-surface)] lg:hidden">
        <div className="flex gap-2 overflow-x-auto px-4 py-2.5" aria-label="Cognitive modes">
          {MODES.map((mode) => {
            const isActive = mode.key === activeKey;
            return (
              <button
                key={mode.key}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelect(mode.key)}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-bold transition-colors"
                style={
                  isActive
                    ? { background: mode.accent, borderColor: mode.accent, color: mode.ink }
                    : {
                        background: 'var(--color-bg)',
                        borderColor: `color-mix(in srgb, ${mode.accent} 32%, transparent)`,
                        color: mode.accentDeep
                      }
                }
              >
                <i className={`ph-duotone ${mode.icon} text-[15px]`}></i>
                {mode.name}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
