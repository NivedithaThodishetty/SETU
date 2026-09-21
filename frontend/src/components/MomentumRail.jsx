import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { getProgress, getRank, subscribeProgress } from '../lib/progress';
import { getPrefs } from '../lib/storage';

/**
 * The sidebar progress summary.
 *
 * One ring, one number, one streak — the whole reward state at a glance. The
 * brief was explicit that progress should not arrive as a long text report, so
 * everything beyond these three facts lives behind the link to the Momentum
 * page rather than being stacked into the rail.
 */
export default function MomentumRail() {
  const [progress, setProgress] = useState(getProgress);
  const [enabled, setEnabled] = useState(() => getPrefs().rewards !== false);

  useEffect(() => subscribeProgress(setProgress), []);

  // Preferences are written from Settings without a shared store, so re-read on
  // focus rather than leaving the rail showing a state the user just turned off.
  useEffect(() => {
    const sync = () => setEnabled(getPrefs().rewards !== false);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  if (!enabled) return null;

  const rank = getRank(progress.points);
  const radius = 15;
  const circumference = 2 * Math.PI * radius;

  return (
    <NavLink
      to="/momentum"
      className="flex items-center gap-2.5 border-t border-[var(--color-divider)] p-3 transition-colors hover:bg-[color-mix(in_srgb,var(--color-bg)_60%,transparent)]"
      title={
        rank.next
          ? `${rank.pointsToNext} points to ${rank.next.name}`
          : 'Top rank reached — nice work'
      }
    >
      <div className="relative shrink-0">
        <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden>
          <circle
            cx="19"
            cy="19"
            r={radius}
            fill="none"
            stroke="var(--color-divider)"
            strokeWidth="3"
          />
          <circle
            cx="19"
            cy="19"
            r={radius}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - rank.fraction)}
            transform="rotate(-90 19 19)"
            style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center font-mono text-[11px] font-bold text-[var(--color-text)]">
          {rank.level}
        </span>
      </div>

      <div className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[12.5px] font-bold leading-tight text-[var(--color-text)]">
          {rank.name}
        </span>
        <span className="mt-0.5 block text-[10.5px] text-[color-mix(in_srgb,var(--color-text)_58%,transparent)]">
          {progress.points} pts
          {progress.streakDays > 1 && (
            <>
              {' · '}
              <span className="text-[var(--color-accent-700)]">
                {progress.streakDays} day streak
              </span>
            </>
          )}
        </span>
      </div>
    </NavLink>
  );
}
