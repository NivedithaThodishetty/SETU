/**
 * Dialog behaviour: focus trap, Escape to close, focus restore, scroll lock.
 *
 * Every modal in SETU already carried `role="dialog"` and `aria-modal="true"`,
 * which is the half of the problem that is visible in the markup. None of them
 * carried the half that is only visible when you try to use one: a keyboard
 * user pressed Tab and left the dialog for the page behind it, with no way back
 * except Shift+Tab through the whole document, and on close focus landed at the
 * top of the page rather than on the control they opened it from.
 *
 * For an ADHD user, losing your place in an interface is not a minor annoyance.
 * It is the specific failure mode the entire product exists to prevent, which
 * makes it a worse bug here than it would be in most applications.
 *
 * This is a hook rather than a `<Modal>` wrapper on purpose. The five existing
 * dialogs have genuinely different layouts — a document reader with a sidebar,
 * a customiser with a live preview, a small confirm — and folding them into one
 * wrapper is a large diff with real regression risk. A hook delivers identical
 * behaviour for three lines per dialog. `components/Modal.jsx` wraps this for
 * new dialogs, which should use it.
 *
 * ON `inert`
 * ----------
 * The background is deliberately NOT marked `inert`. These dialogs render
 * inline in the component tree rather than through a portal, so the only
 * element that could carry `inert` is an ancestor of the dialog itself, which
 * would disable the dialog too. Moving five dialogs to portals mid-project is
 * not worth the risk, and it is not needed: the focus trap below is what fixes
 * the keyboard escape, and `aria-modal="true"` — already present on all five —
 * is what tells assistive technology to treat the rest of the document as
 * hidden. Any *new* dialog built on `components/Modal.jsx` gets a portal and
 * real `inert`.
 */

import { useEffect, useRef } from 'react';

/**
 * Elements that can hold focus.
 *
 * `:not([disabled])` and the negative-tabindex exclusion both matter: a
 * disabled submit button and a programmatically-focusable container are common
 * inside these dialogs, and including either makes Tab appear to stick.
 */
const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

/**
 * Visible focusable descendants, in DOM order.
 *
 * Queried on every Tab rather than cached at open. These dialogs change shape
 * while open — the upload dialog swaps a dropzone for a result panel, the
 * customiser reveals sections — and a cached list would trap focus on elements
 * that no longer exist while skipping the ones that replaced them.
 */
function focusableWithin(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter((element) => {
    if (element.hasAttribute('disabled') || element.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    // offsetParent is null for display:none subtrees. The rect check catches
    // visibility:hidden and zero-size elements, which offsetParent does not.
    const rect = element.getBoundingClientRect();
    return Boolean(element.offsetParent !== null || rect.width || rect.height);
  });
}

/**
 * Wire dialog behaviour onto a container ref.
 *
 * @param {object}   options
 * @param {boolean}  options.isOpen
 * @param {() => void} options.onClose        Called on Escape and on backdrop click.
 * @param {import('react').RefObject<HTMLElement>} options.containerRef
 *        The dialog *panel*, not the backdrop — the trap and initial focus both
 *        scope to this, and including the backdrop would let Tab reach nothing.
 * @param {boolean}  [options.closeOnEscape=true]
 *        Set false while an operation is in flight that a stray Escape must not
 *        cancel, such as an upload mid-request.
 * @param {import('react').RefObject<HTMLElement>} [options.initialFocusRef]
 *        Element to focus on open. Defaults to the first focusable descendant,
 *        falling back to the container.
 */
export function useDialog({
  isOpen,
  onClose,
  containerRef,
  closeOnEscape = true,
  initialFocusRef
}) {
  /**
   * What had focus before the dialog opened.
   *
   * Captured in a ref rather than state so that capturing it never triggers a
   * render — a render here would run before the dialog has mounted and the
   * value would be the dialog's own first element.
   */
  const restoreFocusRef = useRef(null);

  // Keep the latest onClose without re-running the key listener effect on every
  // parent render, which would detach and reattach the listener constantly.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /* -- remember the trigger, and give it focus back ------------------------ */

  useEffect(() => {
    if (!isOpen) return undefined;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return () => {
      const trigger = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (!trigger || typeof trigger.focus !== 'function') return;

      // The trigger can be gone by now — deleting a map closes the dialog and
      // removes the button that opened it. Focusing a detached node silently
      // moves focus to <body>, which is the behaviour we are fixing, so check.
      if (!document.contains(trigger)) return;

      // Deferred one task: React may still be committing the unmount, and
      // focusing during that pass is overwritten by the browser's own
      // post-removal focus reset.
      //
      // setTimeout rather than requestAnimationFrame. rAF does not run at all
      // while a tab is backgrounded or hidden, so a dialog closed in a tab the
      // user has switched away from would never restore focus — and would then
      // hand them a document focused on <body> when they came back, which is
      // the bug this whole hook exists to fix.
      setTimeout(() => {
        try {
          trigger.focus({ preventScroll: true });
        } catch (_) {
          /* focus is best-effort; never let it break a close */
        }
      }, 0);
    };
  }, [isOpen]);

  /* -- initial focus ------------------------------------------------------- */

  useEffect(() => {
    if (!isOpen) return undefined;

    /*
     * Try synchronously first.
     *
     * This effect runs after React has committed the DOM, so in the common case
     * the panel and its children already exist and the refs are populated —
     * there is nothing to wait for.
     *
     * The deferred retry exists for dialogs whose content mounts a tick later
     * (an async panel, a lazily-imported child). It is a setTimeout and NOT a
     * requestAnimationFrame: rAF is paused entirely while a tab is hidden or
     * backgrounded, so a dialog opened in a background tab would never receive
     * focus at all — the exact symptom this hook was written to eliminate, in
     * the one situation nobody tests by hand.
     */
    function moveFocus() {
      const container = containerRef.current;
      if (!container) return false;

      const target = initialFocusRef?.current || focusableWithin(container)[0] || container;

      try {
        target.focus({ preventScroll: true });
      } catch (_) {
        return false;
      }
      return container.contains(document.activeElement);
    }

    if (moveFocus()) return undefined;

    const timer = setTimeout(moveFocus, 0);
    return () => clearTimeout(timer);
  }, [isOpen, containerRef, initialFocusRef]);

  /* -- focus trap + Escape ------------------------------------------------- */

  useEffect(() => {
    if (!isOpen) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape' && closeOnEscape) {
        event.stopPropagation();
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = focusableWithin(container);

      // Nothing to cycle through: keep focus on the container rather than
      // letting Tab escape to the page behind.
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      // Focus can be outside the dialog entirely — the user clicked the page
      // behind before the trap engaged, or an async panel replaced the focused
      // node. Pull it back to the appropriate edge instead of assuming it is
      // on `first` or `last`.
      if (!container.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    // Capture phase, so a dialog's own inner handler cannot swallow Escape
    // before the dialog sees it — which is how a nested picker inside the
    // customiser used to eat the key that should have closed the dialog.
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, closeOnEscape, containerRef]);

  /* -- scroll lock --------------------------------------------------------- */

  useEffect(() => {
    if (!isOpen) return undefined;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;

    // Compensate for the scrollbar the lock removes, or the whole page shifts
    // sideways as the dialog opens — a jump that is disorienting generally and
    // actively disruptive for the readers this product is built for.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      const current = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + scrollbarWidth}px`;
    }
    body.style.overflow = 'hidden';

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [isOpen]);

  return { restoreFocusRef };
}

export { focusableWithin, FOCUSABLE };
