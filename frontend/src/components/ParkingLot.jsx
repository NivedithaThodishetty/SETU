import { useCallback, useEffect, useRef, useState } from 'react';
import { award } from '../lib/progress';

/**
 * The parking lot — somewhere to put a thought without losing your place.
 *
 * This is the direct accommodation for the one memory finding that came out of
 * the clinical review: long-term memory is intact in this group, working memory
 * is not. So the problem is never "I forgot how to do this" — it is "I cannot
 * hold that while I finish this". Offloading beats any amount of reminding.
 *
 * Everything about it is built to cost nothing to use: it opens on a keystroke
 * from anywhere, the field is already focused, Enter files the note, and Escape
 * puts you back exactly where you were. Notes stay in this browser and are never
 * mirrored anywhere.
 */

/** Fired by the app chrome to open the parking lot from anywhere. */
export const TOGGLE_EVENT = 'setu:toggle-parking-lot';

const PARKED_KEY = 'setu.parked.v1';
const MAX_NOTES = 40;

function readNotes() {
  try {
    const raw = window.localStorage.getItem(PARKED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function writeNotes(notes) {
  try {
    window.localStorage.setItem(PARKED_KEY, JSON.stringify(notes.slice(0, MAX_NOTES)));
  } catch (_) {
    /* memory-only for this session */
  }
}

export default function ParkingLot() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(readNotes);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  const restoreFocusRef = useRef(null);

  const toggle = useCallback(() => {
    setOpen((current) => {
      if (!current) restoreFocusRef.current = document.activeElement;
      return !current;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.altKey && (event.key === 'p' || event.key === 'P')) {
        event.preventDefault();
        toggle();
      } else if (event.key === 'Escape' && open) {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    // The app chrome opens this too — the phone header has no room for a
    // floating pill, and on desktop the pill sat on top of the engine badge in
    // the corner of the sidebar. A window event keeps the notes owned here
    // rather than lifted into the shell just to hang a second button off them.
    window.addEventListener(TOGGLE_EVENT, toggle);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(TOGGLE_EVENT, toggle);
    };
  }, [open, toggle]);

  // Focus straight into the field on open, and hand focus back to wherever the
  // user was on close — the whole point is not to lose their place.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else if (restoreFocusRef.current?.focus) {
      restoreFocusRef.current.focus();
      restoreFocusRef.current = null;
    }
  }, [open]);

  const park = (event) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;

    const next = [{ id: `n_${Date.now()}`, text, at: new Date().toISOString() }, ...notes].slice(
      0,
      MAX_NOTES
    );
    setNotes(next);
    writeNotes(next);
    setDraft('');
    award('noteParked');
    inputRef.current?.focus();
  };

  const remove = (id) => {
    const next = notes.filter((note) => note.id !== id);
    setNotes(next);
    writeNotes(next);
  };

  return (
    <>
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-controls="parking-lot-panel"
        title="Park a thought (Alt+P)"
        className="fixed bottom-4 left-4 z-[880] hidden items-center gap-2 rounded-full border border-[var(--color-divider)] bg-[var(--color-surface)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--color-text)] shadow-[var(--shadow-md)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent-700)] lg:flex"
      >
        <i className="ph-duotone ph-push-pin text-base text-[var(--color-accent)]"></i>
        <span>Park a thought</span>
        {notes.length > 0 && (
          <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--color-accent)] px-1 font-mono text-[10px] font-bold text-[var(--color-bg)]">
            {notes.length}
          </span>
        )}
      </button>

      {open && (
        <div
          id="parking-lot-panel"
          role="dialog"
          aria-label="Parked thoughts"
          className="animate-setu-rise fixed bottom-16 left-4 z-[890] flex w-[min(340px,calc(100vw-2rem))] flex-col rounded-[var(--radius-lg)] border border-[var(--color-divider)] bg-[var(--color-bg)] shadow-[var(--shadow-lg)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--color-divider)] px-3.5 py-2.5">
            <div>
              <span className="kicker block">Parked thoughts</span>
              <span className="block text-[11px] text-[color-mix(in_srgb,var(--color-text)_58%,transparent)]">
                Put it down, pick it up later
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close parked thoughts"
              className="btn btn-quiet !min-h-[26px] !px-1.5"
            >
              <i className="ph-duotone ph-x text-base"></i>
            </button>
          </div>

          <form onSubmit={park} className="border-b border-[var(--color-divider)] p-3">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Reply to Meera about the invoice…"
              aria-label="Thought to park"
              className="input text-[13.5px]"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="btn btn-primary !min-h-[30px] mt-2 w-full text-[12.5px]"
            >
              <i className="ph-duotone ph-push-pin"></i>
              Park it
            </button>
          </form>

          <div className="max-h-[260px] overflow-y-auto p-2">
            {notes.length ? (
              <ul className="space-y-1">
                {notes.map((note) => (
                  <li
                    key={note.id}
                    className="group flex items-start gap-2 rounded-[var(--radius-sm)] p-2 hover:bg-[var(--color-surface)]"
                  >
                    <span className="min-w-0 flex-1 text-[13px] leading-snug text-[var(--color-text)]">
                      {note.text}
                    </span>
                    <button
                      onClick={() => remove(note.id)}
                      aria-label={`Done: ${note.text}`}
                      title="Done with this"
                      className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[color-mix(in_srgb,var(--color-text)_45%,transparent)] opacity-0 transition-opacity hover:text-[var(--color-accent)] focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <i className="ph-duotone ph-check text-base"></i>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-3 text-center text-[12.5px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_58%,transparent)]">
                Nothing parked. Anything that interrupts you can go here instead of taking up
                room in your head.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
