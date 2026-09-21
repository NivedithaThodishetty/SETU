import { useEffect, useState } from 'react';

/**
 * ADHD & Dyslexia Reading Ruler / Visual Focus Guide
 * --------------------------------------------------
 * Follows the user's cursor or keyboard focus line-by-line,
 * dimming out peripheral visual noise to dramatically increase
 * focus and reduce visual skipping for neurodivergent minds.
 */
export default function ReadingRuler({ enabled, onClose }) {
  const [posY, setPosY] = useState(window.innerHeight / 2);
  const [height, setHeight] = useState(48);
  const [tint, setTint] = useState('amber'); // 'amber' | 'cyan' | 'green' | 'neutral'
  const [dimLevel, setDimLevel] = useState(0.35); // 0.2 to 0.65

  useEffect(() => {
    if (!enabled) return;

    const handleMouseMove = (e) => {
      setPosY(e.clientY);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown' && (e.altKey || e.ctrlKey)) {
        e.preventDefault();
        setPosY((prev) => Math.min(window.innerHeight - 50, prev + 30));
      } else if (e.key === 'ArrowUp' && (e.altKey || e.ctrlKey)) {
        e.preventDefault();
        setPosY((prev) => Math.max(50, prev - 30));
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled]);

  if (!enabled) return null;

  const tintColors = {
    amber: 'rgba(237, 187, 0, 0.16)',
    cyan: 'rgba(0, 136, 176, 0.16)',
    green: 'rgba(34, 197, 94, 0.16)',
    neutral: 'rgba(255, 255, 255, 0.25)'
  };

  const rulerTop = Math.max(0, posY - height / 2);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 select-none transition-opacity duration-150">
      {/* Top Mask */}
      <div
        className="absolute inset-x-0 top-0 bg-black backdrop-blur-[0.5px] transition-all duration-75"
        style={{
          height: `${rulerTop}px`,
          opacity: dimLevel
        }}
      />

      {/* Reading Strip (Clear / Tinted Guide) */}
      <div
        className="absolute inset-x-0 border-y-2 transition-all duration-75 shadow-lg"
        style={{
          top: `${rulerTop}px`,
          height: `${height}px`,
          backgroundColor: tintColors[tint] || tintColors.amber,
          borderColor:
            tint === 'amber'
              ? '#edbb00'
              : tint === 'cyan'
                ? '#0088b0'
                : tint === 'green'
                  ? '#22c55e'
                  : 'rgba(0,0,0,0.4)'
        }}
      />

      {/* Bottom Mask */}
      <div
        className="absolute inset-x-0 bottom-0 bg-black backdrop-blur-[0.5px] transition-all duration-75"
        style={{
          top: `${rulerTop + height}px`,
          opacity: dimLevel
        }}
      />

      {/* Floating Control Widget in Bottom-Right */}
      <div className="pointer-events-auto fixed bottom-5 right-5 z-50 rounded-[var(--radius-md)] bg-[var(--color-bg)] p-2 shadow-2xl border border-[var(--color-divider)] flex items-center gap-2 text-xs animate-setu-rise">
        <span className="font-semibold text-[11px] text-[var(--color-text)] pl-1">Ruler:</span>
        <button
          onClick={() => setHeight((h) => (h === 36 ? 54 : h === 54 ? 80 : 36))}
          className="btn btn-ghost !min-h-[26px] !px-2 text-[11px]"
          title="Toggle Height"
        >
          {height}px
        </button>
        <button
          onClick={() =>
            setTint((t) =>
              t === 'amber' ? 'cyan' : t === 'cyan' ? 'green' : t === 'green' ? 'neutral' : 'amber'
            )
          }
          className="btn btn-ghost !min-h-[26px] !px-2 text-[11px] capitalize"
          title="Toggle Color Tint"
        >
          {tint}
        </button>
        <button
          onClick={() => setDimLevel((d) => (d === 0.25 ? 0.45 : d === 0.45 ? 0.65 : 0.25))}
          className="btn btn-ghost !min-h-[26px] !px-2 text-[11px]"
          title="Toggle Dimming"
        >
          {Math.round(dimLevel * 100)}% dim
        </button>
        <button
          onClick={onClose}
          className="btn btn-quiet !min-h-[26px] !px-1.5 text-xs text-[var(--color-accent-2)]"
          title="Close Ruler (Alt+H)"
        >
          <i className="ph-duotone ph-x"></i>
        </button>
      </div>
    </div>
  );
}
