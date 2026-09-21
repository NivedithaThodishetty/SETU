import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { tts } from '../lib/tts';
import { award } from '../lib/progress';
import VoiceInputButton from '../components/VoiceInputButton';

/**
 * Listen — reflective support.
 *
 * Roughly 40% of dyslexic and ADHD adults also carry anxiety or depression, and
 * the guidance for this project was to give them somewhere to put the
 * frustration rather than leaving it in the workflow. So this is a listener, not
 * a coach: it reflects, names, validates, and offers one small next thing.
 *
 * Two things are deliberate and load-bearing. Entries never leave the browser —
 * they are written to a local-only key with no background mirror, unlike every
 * other artefact in the app — and the crisis path is decided on the server
 * before any model is called, so a risk reply is fixed text with real helplines
 * rather than something sampled.
 */

const JOURNAL_KEY = 'setu.journal.v1';
const MAX_ENTRIES = 30;

const MOODS = [
  { value: 1, emoji: '😞', label: 'Rough' },
  { value: 2, emoji: '😕', label: 'Low' },
  { value: 3, emoji: '😐', label: 'Flat' },
  { value: 4, emoji: '🙂', label: 'Alright' },
  { value: 5, emoji: '😌', label: 'Good' }
];

/** Local-only journal helpers. No API mirror by design — see the note above. */
function readJournal() {
  try {
    const raw = window.localStorage.getItem(JOURNAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function writeJournal(entries) {
  try {
    window.localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch (_) {
    /* private mode — the session still works, it just will not persist */
  }
}

export default function Listen() {
  const [entry, setEntry] = useState('');
  const [mood, setMood] = useState(null);
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [journal, setJournal] = useState(readJournal);
  const [showJournal, setShowJournal] = useState(false);
  const responseRef = useRef(null);

  useEffect(() => () => tts.stop(), []);

  // Move focus to the reply once it lands, so a screen reader or keyboard user
  // is not left hunting for the thing they just asked for.
  useEffect(() => {
    if (response) responseRef.current?.focus();
  }, [response]);

  const handleSubmit = async (event) => {
    event?.preventDefault();
    const text = entry.trim();
    if (!text || loading) return;

    tts.stop();
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const result = await api.listen(text, mood);
      setResponse(result);

      // A crisis turn is not a scored activity. Attaching points to someone
      // disclosing risk would be grotesque.
      if (!result.crisis) award('checkIn');

      const next = [
        {
          id: `j_${Date.now()}`,
          text,
          mood,
          at: new Date().toISOString(),
          reflection: result.crisis ? null : result.reflection || null
        },
        ...journal
      ].slice(0, MAX_ENTRIES);

      setJournal(next);
      writeJournal(next);
      setEntry('');
    } catch (err) {
      setError(
        err.message ||
          'Could not reach the engine. What you wrote is still here — nothing was lost.'
      );
    } finally {
      setLoading(false);
    }
  };

  const clearJournal = () => {
    if (!confirm('Delete every saved check-in from this browser? This cannot be undone.')) return;
    setJournal([]);
    writeJournal([]);
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)] p-6 text-left sm:p-10">
      <div className="mx-auto max-w-[720px] space-y-8">
        <header className="space-y-1.5">
          <span className="kicker block">A quiet room</span>
          <h1 className="text-3xl font-bold text-[var(--color-text)] sm:text-[34px]">
            Say it here first
          </h1>
          <p className="max-w-[62ch] text-[15px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_75%,transparent)]">
            Somewhere to put the frustration before it follows you into the next task. Nothing
            you write leaves this browser, and no one else can read it.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="kicker">How is today going, roughly?</legend>
            <div className="flex flex-wrap gap-2">
              {MOODS.map((option) => {
                const selected = mood === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMood(selected ? null : option.value)}
                    aria-pressed={selected}
                    className={`flex min-w-[76px] flex-col items-center gap-0.5 rounded-[var(--radius-md)] border px-3 py-2 transition-all ${
                      selected
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-100)] shadow-[var(--shadow-sm)]'
                        : 'border-[var(--color-divider)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]'
                    }`}
                  >
                    <span className="text-[22px] leading-none" aria-hidden>
                      {option.emoji}
                    </span>
                    <span
                      className={`text-[11.5px] font-semibold ${
                        selected
                          ? 'text-[var(--color-accent-900)]'
                          : 'text-[color-mix(in_srgb,var(--color-text)_65%,transparent)]'
                      }`}
                    >
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="listen-entry" className="kicker block">
                What is going on?
              </label>
              <VoiceInputButton
                onTranscript={(txt) => setEntry((prev) => (prev ? `${prev} ${txt}` : txt))}
                showLabel={true}
                label="Speak thoughts"
                size="sm"
              />
            </div>
            <textarea
              id="listen-entry"
              rows={6}
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              placeholder="Everything took twice as long today and I still got asked why it wasn't done… (Type or click the microphone to speak)"
              className="textarea text-[15px]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={loading || !entry.trim()}
              className="btn btn-primary px-5 text-sm"
            >
              {loading ? (
                <>
                  <i className="ph-duotone ph-spinner animate-spin"></i>
                  Listening…
                </>
              ) : (
                <>
                  <i className="ph-duotone ph-paper-plane-tilt"></i>
                  Say it
                </>
              )}
            </button>

            <VoiceInputButton
              onTranscript={(txt) => setEntry((prev) => (prev ? `${prev} ${txt}` : txt))}
              size="lg"
              title="Speak your thoughts into microphone"
            />

            {journal.length > 0 && (
              <button
                type="button"
                onClick={() => setShowJournal((current) => !current)}
                className="btn btn-ghost text-sm"
              >
                <i className="ph-duotone ph-notebook"></i>
                {showJournal ? 'Hide' : `Past check-ins (${journal.length})`}
              </button>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-[var(--radius-md)] border border-[var(--color-accent-2)] bg-[var(--color-accent-2-100)] p-3 text-[13px] text-[var(--color-accent-2-900)]"
            >
              {error}
            </p>
          )}
        </form>

        {response && (
          <section
            ref={responseRef}
            tabIndex={-1}
            className="animate-setu-rise space-y-5 border-t border-[var(--color-divider)] pt-7 outline-none"
          >
            {response.crisis ? (
              <CrisisPanel data={response} />
            ) : (
              <ReflectionPanel data={response} />
            )}
          </section>
        )}

        {showJournal && journal.length > 0 && (
          <section className="space-y-3 border-t border-[var(--color-divider)] pt-7">
            <div className="flex items-center justify-between gap-3">
              <span className="kicker">Past check-ins · this browser only</span>
              <button onClick={clearJournal} className="btn btn-destructive !min-h-[28px] text-xs">
                Delete all
              </button>
            </div>
            <ul className="space-y-2">
              {journal.map((item) => (
                <li
                  key={item.id}
                  className="rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-3"
                >
                  <div className="flex items-center gap-2">
                    {item.mood && (
                      <span className="text-[15px]" aria-hidden>
                        {MOODS.find((m) => m.value === item.mood)?.emoji}
                      </span>
                    )}
                    <span className="text-[11.5px] text-[color-mix(in_srgb,var(--color-text)_55%,transparent)]">
                      {new Date(item.at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--color-text)]">
                    {item.text}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Panels ------------------------------- */

function ReflectionPanel({ data }) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    const unsubscribe = tts.subscribe((state) => setSpeaking(state.isPlaying && !state.isPaused));
    return unsubscribe;
  }, []);

  const readAloud = () => {
    if (speaking) {
      tts.stop();
      return;
    }
    tts.speak(
      `${data.reflection} ${data.validation} Here is something you could try. ${
        data.groundingExercise?.name || ''
      }. ${(data.groundingExercise?.steps || []).join('. ')} ${data.oneSmallThing}`
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="kicker">What I heard</span>
        <button
          onClick={readAloud}
          className={`btn !min-h-[28px] !px-2.5 text-xs font-semibold ${
            speaking ? 'btn-primary' : 'btn-ghost'
          }`}
        >
          <i className={`ph-duotone ${speaking ? 'ph-pause-circle' : 'ph-speaker-high'}`}></i>
          {speaking ? 'Stop' : 'Read to me'}
        </button>
      </div>

      <blockquote className="border-l-[3.5px] border-[var(--color-accent)] bg-[var(--color-surface)] p-4 text-[16px] leading-relaxed text-[var(--color-text)]">
        {data.reflection}
      </blockquote>

      {Array.isArray(data.namedFeelings) && data.namedFeelings.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
            That sounds like:
          </span>
          {data.namedFeelings.map((feeling) => (
            <span key={feeling} className="tag tag-accent">
              {feeling}
            </span>
          ))}
        </div>
      )}

      <p className="text-[15px] leading-relaxed text-[var(--color-text)]">{data.validation}</p>

      {data.groundingExercise && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="kicker">Something to try right now</span>
            <span className="text-[11.5px] text-[color-mix(in_srgb,var(--color-text)_58%,transparent)]">
              about {data.groundingExercise.durationMinutes} min
            </span>
          </div>
          <h3 className="mt-1 text-[17px] font-bold text-[var(--color-text)]">
            {data.groundingExercise.name}
          </h3>
          <ol className="mt-2.5 space-y-2">
            {(data.groundingExercise.steps || []).map((step, index) => (
              <li key={index} className="flex gap-2.5 text-[14.5px] leading-relaxed">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] font-mono text-[10.5px] font-bold text-[var(--color-bg)]">
                  {index + 1}
                </span>
                <span className="text-[var(--color-text)]">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[var(--radius-md)] border border-[var(--color-divider)] p-3.5">
          <span className="kicker block">If you want to keep going</span>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-[var(--color-text)]">
            {data.openQuestion}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--color-accent-300)] bg-[var(--color-accent-100)] p-3.5">
          <span className="kicker block">One small thing</span>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-[var(--color-accent-900)]">
            {data.oneSmallThing}
          </p>
        </div>
      </div>

      <p className="text-[12px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_55%,transparent)]">
        SETU is software, not a therapist, and it can be wrong about you. If this keeps sitting
        heavily, talking to a GP or a counsellor is worth more than anything on this page.
      </p>
    </>
  );
}

/**
 * The crisis panel.
 *
 * Rendered from the server's fixed response — never model output. It stops
 * offering exercises and reflections entirely, because the only useful thing at
 * this point is a real human on the other end of a phone line.
 */
function CrisisPanel({ data }) {
  return (
    <div className="space-y-4 rounded-[var(--radius-lg)] border-2 border-[var(--color-accent-2)] bg-[var(--color-accent-2-100)] p-5">
      <div className="flex items-start gap-3">
        <i className="ph-duotone ph-hand-heart shrink-0 text-3xl text-[var(--color-accent-2)]"></i>
        <p className="text-[16px] font-semibold leading-relaxed text-[var(--color-accent-2-900)]">
          {data.message}
        </p>
      </div>

      <ul className="space-y-2">
        {(data.helplines || []).map((line) => (
          <li
            key={line.name}
            className="rounded-[var(--radius-md)] border border-[var(--color-accent-2-200)] bg-[var(--color-bg)] p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[14.5px] font-bold text-[var(--color-text)]">{line.name}</span>
              <span className="tag tag-neutral">{line.region}</span>
            </div>
            {line.contact.startsWith('http') ? (
              <a
                href={line.contact}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block font-mono text-[15px] font-bold text-[var(--color-accent)]"
              >
                {line.contact}
              </a>
            ) : (
              <span className="mt-1 block font-mono text-[18px] font-bold text-[var(--color-text)]">
                {line.contact}
              </span>
            )}
            <span className="mt-0.5 block text-[12px] text-[color-mix(in_srgb,var(--color-text)_62%,transparent)]">
              {line.hours}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[14px] font-semibold leading-relaxed text-[var(--color-accent-2-900)]">
        {data.immediateStep}
      </p>
      <p className="text-[13px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_70%,transparent)]">
        {data.stayingHere}
      </p>
    </div>
  );
}
