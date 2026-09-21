import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  RANKS,
  getActivityBreakdown,
  getEarnedMilestones,
  getProgress,
  getRank,
  mergeServerProgress,
  resetProgress,
  subscribeProgress
} from '../lib/progress';
import { getPrefs, savePrefs } from '../lib/storage';
import { api } from '../lib/api';

/**
 * Momentum — the progress and reward surface.
 *
 * The clinical guidance was to show progress as something engaging rather than
 * as a report, so this page leads with the ring and the streak, keeps the
 * milestone grid visual, and puts the numeric breakdown last for the people who
 * actually want it.
 */
export default function Momentum() {
  const [progress, setProgress] = useState(getProgress);
  const [rewardsOn, setRewardsOn] = useState(() => getPrefs().rewards !== false);

  useEffect(() => subscribeProgress(setProgress), []);

  // Top up from the server copy once on mount, so a streak built on another
  // device shows up here instead of silently resetting.
  useEffect(() => {
    let cancelled = false;
    api.getProgress().then((result) => {
      if (!cancelled && result?.progress) setProgress(mergeServerProgress(result.progress));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rank = getRank(progress.points);
  const milestones = getEarnedMilestones();
  const breakdown = getActivityBreakdown();
  const earnedCount = milestones.filter((m) => m.earned).length;

  const handleReset = () => {
    if (!confirm('Reset points, streak, and milestones? Your maps and saved work stay.')) return;
    resetProgress();
    setProgress(getProgress());
  };

  const toggleRewards = () => {
    const next = !rewardsOn;
    savePrefs({ rewards: next });
    setRewardsOn(next);
  };

  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)] p-6 text-left sm:p-10">
      <div className="mx-auto max-w-[760px] space-y-9">
        <header className="space-y-1">
          <span className="kicker block">Your Momentum</span>
          <h1 className="text-3xl font-bold text-[var(--color-text)] sm:text-[34px]">
            Progress, not pressure
          </h1>
          <p className="max-w-[62ch] text-[15px] text-[color-mix(in_srgb,var(--color-text)_75%,transparent)]">
            Points build up from things you actually did. Nothing here expires, nothing goes
            down, and no one else sees it.
          </p>
        </header>

        {/* Ring, streak, milestone count */}
        <section className="flex flex-col items-center gap-7 rounded-[var(--radius-lg)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-6 sm:flex-row sm:p-7">
          <div className="relative shrink-0">
            <svg width="128" height="128" viewBox="0 0 128 128" aria-hidden>
              <circle
                cx="64"
                cy="64"
                r={radius}
                fill="none"
                stroke="var(--color-divider)"
                strokeWidth="8"
              />
              <circle
                cx="64"
                cy="64"
                r={radius}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - rank.fraction)}
                transform="rotate(-90 64 64)"
                style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }}
              />
            </svg>
            <div className="absolute inset-0 grid place-content-center text-center">
              <span className="block font-mono text-[30px] font-bold leading-none text-[var(--color-text)]">
                {progress.points}
              </span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-[color-mix(in_srgb,var(--color-text)_55%,transparent)]">
                points
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left">
            <div>
              <span className="kicker block">Level {rank.level}</span>
              <h2 className="text-2xl font-bold text-[var(--color-text)]">{rank.name}</h2>
              <p className="mt-1 text-[13.5px] text-[color-mix(in_srgb,var(--color-text)_68%,transparent)]">
                {rank.next
                  ? `${rank.pointsToNext} more points reaches ${rank.next.name}.`
                  : 'You have reached the top of the ladder. It stays yours.'}
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              <Stat
                icon="ph-flame"
                value={progress.streakDays || 0}
                label={`day${progress.streakDays === 1 ? '' : 's'} in a row`}
              />
              <Stat
                icon="ph-trophy"
                value={`${earnedCount}/${milestones.length}`}
                label="milestones"
              />
              <Stat
                icon="ph-mountains"
                value={progress.longestStreakDays || 0}
                label="longest streak"
              />
            </div>
          </div>
        </section>

        {/* Milestones */}
        <section className="space-y-3">
          <span className="kicker block">Milestones</span>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                className={`rounded-[var(--radius-md)] border p-3 transition-colors ${
                  milestone.earned
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-100)]'
                    : 'border-[var(--color-divider)] bg-[var(--color-surface)]'
                }`}
              >
                <i
                  className={`ph-duotone ${milestone.icon} text-2xl ${
                    milestone.earned
                      ? 'text-[var(--color-accent)]'
                      : 'text-[color-mix(in_srgb,var(--color-text)_32%,transparent)]'
                  }`}
                ></i>
                <span
                  className={`mt-1.5 block text-[13px] font-bold leading-tight ${
                    milestone.earned
                      ? 'text-[var(--color-accent-900)]'
                      : 'text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]'
                  }`}
                >
                  {milestone.name}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[color-mix(in_srgb,var(--color-text)_58%,transparent)]">
                  {milestone.earned ? 'Earned' : milestone.hint}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Where the points came from */}
        <section className="space-y-3 border-t border-[var(--color-divider)] pt-6">
          <span className="kicker block">Where your points came from</span>
          {breakdown.length ? (
            <ul className="space-y-1.5">
              {breakdown.map((row) => (
                <li
                  key={row.kind}
                  className="flex items-center gap-3 border-b border-[var(--color-divider)] py-2 text-[14px] last:border-b-0"
                >
                  <i className={`ph-duotone ${row.icon} text-lg text-[var(--color-accent)]`}></i>
                  <span className="min-w-0 flex-1 truncate text-[var(--color-text)]">
                    {row.label}
                  </span>
                  <span className="shrink-0 text-[color-mix(in_srgb,var(--color-text)_55%,transparent)]">
                    ×{row.count}
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono font-semibold text-[var(--color-text)]">
                    {row.earned}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-divider)] p-6 text-center">
              <p className="text-[14px] text-[color-mix(in_srgb,var(--color-text)_70%,transparent)]">
                Nothing yet. Run one mode or finish one focus session and this fills in.
              </p>
              <NavLink to="/modes" className="btn btn-primary mt-3 inline-flex text-[13px]">
                Open the modes
              </NavLink>
            </div>
          )}
        </section>

        {/* The ladder */}
        <section className="space-y-3 border-t border-[var(--color-divider)] pt-6">
          <span className="kicker block">The ladder</span>
          <ol className="space-y-1">
            {RANKS.map((entry) => {
              const reached = progress.points >= entry.at;
              const current = entry.level === rank.level;
              return (
                <li
                  key={entry.level}
                  className={`flex items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 text-[14px] ${
                    current ? 'bg-[var(--color-accent-100)]' : ''
                  }`}
                >
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold ${
                      reached
                        ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                        : 'border border-[var(--color-divider)] text-[color-mix(in_srgb,var(--color-text)_45%,transparent)]'
                    }`}
                  >
                    {entry.level}
                  </span>
                  <span
                    className={`min-w-0 flex-1 ${
                      reached ? 'font-semibold text-[var(--color-text)]' : 'text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]'
                    }`}
                  >
                    {entry.name}
                  </span>
                  <span className="shrink-0 font-mono text-[12px] text-[color-mix(in_srgb,var(--color-text)_55%,transparent)]">
                    {entry.at} pts
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Controls */}
        <section className="space-y-3 border-t border-[var(--color-divider)] pt-6">
          <span className="kicker kicker-magenta block">Reward controls</span>
          <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-3">
            <div className="min-w-0">
              <span className="block text-[14px] font-bold text-[var(--color-text)]">
                Show points and milestones
              </span>
              <span className="block text-[12px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
                Turn this off if scoring makes the work feel like pressure. Your progress keeps
                counting quietly either way.
              </span>
            </div>
            <input
              type="checkbox"
              checked={rewardsOn}
              onChange={toggleRewards}
              aria-label="Show points and milestones"
              className="h-5 w-5 shrink-0 cursor-pointer rounded accent-[var(--color-accent)]"
            />
          </div>
          <button onClick={handleReset} className="btn btn-destructive !min-h-[36px] text-[13px]">
            Reset points and streak
          </button>
        </section>
      </div>
    </div>
  );
}

function Stat({ icon, value, label }) {
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-2.5 py-1.5">
      <i className={`ph-duotone ${icon} text-base text-[var(--color-accent)]`}></i>
      <span className="font-mono text-[15px] font-bold text-[var(--color-text)]">{value}</span>
      <span className="text-[11.5px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
        {label}
      </span>
    </div>
  );
}
