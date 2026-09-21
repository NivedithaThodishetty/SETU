import { useEffect, useRef, useState } from 'react';
import { onAward } from '../lib/progress';
import { tts } from '../lib/tts';
import { getPrefs } from '../lib/storage';

/**
 * Award notifications.
 *
 * Deliberately quiet by design: the clinical brief asked for a calm, engaging,
 * gamified surface, and a full-screen confetti burst on every ticked checkbox
 * is the opposite of calm for the audience this is built for. So a plain points
 * award is a small card that fades on its own, and only the rare events — a rank
 * change or a first-time milestone — get the chime and the accent treatment.
 */

const VISIBLE_MS = 3400;
const MILESTONE_MS = 5200;

export default function RewardToast() {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  useEffect(() => {
    const unsubscribe = onAward((event) => {
      const isBig = event.rankedUp || event.newMilestones.length > 0;

      // A chime for the rare moments only — the small ones stay silent so the
      // sound keeps meaning something.
      if (isBig && getPrefs().motion !== 'still') {
        tts.playCelebrationChime();
      }

      const entries = [];

      if (event.newMilestones.length > 0) {
        for (const milestone of event.newMilestones) {
          entries.push({
            id: `m_${milestone.id}_${Date.now()}`,
            tone: 'milestone',
            icon: milestone.icon,
            title: milestone.name,
            body: milestone.hint,
            ttl: MILESTONE_MS
          });
        }
      }

      if (event.rankedUp) {
        entries.push({
          id: `r_${event.rank.level}_${Date.now()}`,
          tone: 'rank',
          icon: 'ph-seal-check',
          title: `Level ${event.rank.level} — ${event.rank.name}`,
          body: `${event.total} points so far. No rush on the next one.`,
          ttl: MILESTONE_MS
        });
      }

      if (!entries.length) {
        entries.push({
          id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          tone: 'points',
          icon: event.icon,
          title: `+${event.points}`,
          body: event.label,
          ttl: VISIBLE_MS
        });
      }

      setToasts((current) => {
        // Cap the stack so a burst of rapid checkbox ticks cannot bury the screen.
        const next = [...current, ...entries].slice(-3);
        return next;
      });

      for (const entry of entries) {
        const timer = setTimeout(() => {
          setToasts((current) => current.filter((toast) => toast.id !== entry.id));
          timersRef.current.delete(entry.id);
        }, entry.ttl);
        timersRef.current.set(entry.id, timer);
      }
    });

    return () => {
      unsubscribe();
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    };
  }, []);

  const dismiss = (id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  if (!toasts.length) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[900] flex w-[min(320px,calc(100vw-2rem))] flex-col gap-2"
      // Announced politely: a reward interrupting a screen reader mid-sentence
      // would undo the calm the visual design is trying to keep.
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => dismiss(toast.id)}
          className={`pointer-events-auto flex w-full items-start gap-2.5 rounded-[var(--radius-md)] border p-2.5 text-left shadow-[var(--shadow-md)] animate-setu-rise cursor-pointer ${
            toast.tone === 'points'
              ? 'border-[var(--color-divider)] bg-[var(--color-surface)]'
              : 'border-[var(--color-accent)] bg-[var(--color-accent-100)]'
          }`}
        >
          <i
            className={`ph-duotone ${toast.icon} shrink-0 text-xl ${
              toast.tone === 'points'
                ? 'text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]'
                : 'text-[var(--color-accent)]'
            }`}
          ></i>
          <div className="min-w-0 flex-1">
            <span
              className={`block text-[14px] font-bold leading-tight ${
                toast.tone === 'points'
                  ? 'text-[var(--color-text)]'
                  : 'text-[var(--color-accent-900)]'
              }`}
            >
              {toast.title}
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-[color-mix(in_srgb,var(--color-text)_65%,transparent)]">
              {toast.body}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
