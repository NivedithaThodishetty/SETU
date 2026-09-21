import { useRef } from 'react';
import { useDialog } from '../lib/useDialog';

/**
 * End-of-session prompt.
 *
 * Deliberately an `alertdialog` with no Escape dismissal: it appears only after
 * a full focus session and asks for one of two deliberate choices, and silently
 * vanishing on a stray keypress would lose the moment it exists to mark. What it
 * does owe a keyboard user is focus — without moving it here, the dialog opened
 * behind wherever the caret happened to be and a screen reader user was left
 * hunting for a dialog that had already been announced.
 */
export default function BreakDialog({ isOpen, onKeepGoing, onTakeFive }) {
  const primaryRef = useRef(null);
  const dialogRef = useRef(null);

  /*
   * `closeOnEscape: false` preserves the deliberate decision documented above —
   * this dialog marks the end of a focus session and must not vanish on a stray
   * keypress. Everything else the hook provides still applies, and the focus
   * trap matters more here than elsewhere: with only two buttons and no exit,
   * Tab previously walked straight out into the page behind a dialog that
   * cannot be dismissed, which is the worst version of this bug.
   */
  useDialog({
    isOpen,
    onClose: () => {},
    containerRef: dialogRef,
    closeOnEscape: false,
    initialFocusRef: primaryRef
  });

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop items-center p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="dialog w-full max-w-[480px] p-6 text-left border border-[var(--color-divider)] outline-none"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="break-dialog-title"
        aria-describedby="break-dialog-desc"
      >
        <span className="kicker kicker-magenta mb-2 block">Focus Session</span>
        <h2 id="break-dialog-title" className="text-2xl font-bold text-[var(--color-text)] mb-3">
          That's twenty-five minutes.
        </h2>
        <p
          id="break-dialog-desc"
          className="text-[15px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_78%,transparent)] mb-6"
        >
          You've done the hard part. Look away from the screen for a few minutes — the map will be
          exactly where you left it, and so will your place in it.
        </p>

        <div className="flex items-center justify-end gap-3">
          <button onClick={onKeepGoing} className="btn btn-secondary text-sm">
            Keep going
          </button>
          <button ref={primaryRef} onClick={onTakeFive} className="btn btn-primary text-sm">
            Take five
          </button>
        </div>
      </div>
    </div>
  );
}
