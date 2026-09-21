import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { savePrefs, getPrefs, FONT_STACKS, SIZE_SCALE } from '../lib/storage';

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState(() => getPrefs().profile || []);
  const [font, setFont] = useState(() => getPrefs().font || 'serif');
  const [size, setSize] = useState(() => getPrefs().textSize || 'normal');
  const [motion, setMotion] = useState(() => getPrefs().motion || 'move');

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTopic = searchParams.get('topic');

  const toggleProfileOption = (id) => {
    setProfile((current) => {
      if (id === 'rather-not-say') {
        return current.includes('rather-not-say') ? [] : ['rather-not-say'];
      }
      const filtered = current.filter((item) => item !== 'rather-not-say');
      if (filtered.includes(id)) {
        return filtered.filter((item) => item !== id);
      }
      return [...filtered, id];
    });
  };

  const finishOnboarding = () => {
    savePrefs({
      profile,
      font,
      textSize: size,
      motion,
      onboardingDone: true
    });

    const query = initialTopic ? `?topic=${encodeURIComponent(initialTopic)}` : '';
    navigate(`/mindmap${query}`);
  };

  const skipAll = () => {
    savePrefs({ onboardingDone: true });
    navigate('/mindmap');
  };

  /**
   * Dyslexia, dyscalculia, and dysgraphia are listed separately because they are
   * genuinely three different conditions — reading, numbers, and writing — and a
   * person may have one, two, or all three. Collapsing them into a single
   * "dyslexia" tile, as most tools do, hides the two that this app now supports
   * with dedicated modes.
   */
  const PROFILE_OPTIONS = [
    { id: 'adhd', icon: 'ph-lightning', label: 'ADHD', hint: 'Attention slides off dense pages' },
    { id: 'dyslexia', icon: 'ph-text-aa', label: 'Dyslexia', hint: 'Reading and understanding text' },
    { id: 'dyscalculia', icon: 'ph-math-operations', label: 'Dyscalculia', hint: 'Numbers and arithmetic' },
    { id: 'dysgraphia', icon: 'ph-pencil-simple-slash', label: 'Dysgraphia', hint: 'Writing and spelling' },
    { id: 'autistic', icon: 'ph-circles-three', label: 'Autistic', hint: 'Ambiguity and clutter cost energy' },
    { id: 'anxiety', icon: 'ph-heart', label: 'Anxiety alongside it', hint: 'Performance or social pressure' },
    { id: 'overwhelmed', icon: 'ph-waves', label: 'Just overwhelmed', hint: 'Too much, too fast, too often' },
    { id: 'rather-not-say', icon: 'ph-dots-three', label: 'Rather not say', hint: 'Show me everything' }
  ];

  const FONT_OPTIONS = [
    { id: 'serif', label: 'Source Serif 4', hint: 'Default reading serif with warm rhythm' },
    { id: 'system', label: 'System sans', hint: 'Neutral standard system interface typeface' },
    { id: 'hyper', label: 'Atkinson Hyperlegible', hint: 'High-distinction shapes to prevent letter flipping' }
  ];

  const SIZE_OPTIONS = [
    { id: 'normal', label: 'Normal', hint: '16px base font size' },
    { id: 'comfortable', label: 'Comfortable', hint: '1.1× scale for easier visual scanning' },
    { id: 'large', label: 'Large', hint: '1.22× scale for maximum clarity' }
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] font-[var(--font-body)] flex flex-col justify-between p-6 sm:p-10">
      <div className="max-w-[760px] w-full mx-auto">
        {/* ----------------- Header & Progress Pips ----------------- */}
        <header className="flex items-center justify-between gap-4 pb-8 mb-8 border-b border-[var(--color-divider)]">
          <span className="font-[var(--font-heading)] font-bold text-2xl tracking-tight text-[var(--color-text)]">
            SETU
          </span>

          <div className="flex items-center gap-3">
            <span className="text-[13px] font-semibold text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
              Step {step} of 3
            </span>
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {[1, 2, 3].map((pip) => (
                <div
                  key={pip}
                  className="w-[34px] h-[3.5px] rounded-full transition-colors duration-200"
                  style={{
                    backgroundColor:
                      pip <= step ? 'var(--color-accent)' : 'var(--color-divider)'
                  }}
                />
              ))}
            </div>
          </div>
        </header>

        {/* ----------------- Step 1 ----------------- */}
        {step === 1 && (
          <section className="space-y-8 animate-setu-rise">
            <div>
              <h1 className="text-3xl sm:text-[40px] font-bold leading-tight tracking-tight text-[var(--color-text)] mb-3">
                What tends to get in your way?
              </h1>
              <p className="text-[16px] sm:text-[17px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_78%,transparent)]">
                Pick anything that fits — or none of it. It only changes which tools SETU puts in
                front of you first, and you can change it whenever you like.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {PROFILE_OPTIONS.map((opt) => {
                const isSelected = profile.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => toggleProfileOption(opt.id)}
                    aria-pressed={isSelected}
                    className={`flex items-start gap-3.5 p-4 rounded-[var(--radius-lg)] text-left transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--color-accent-100)] border border-[var(--color-accent)] text-[var(--color-accent-900)] shadow-[var(--shadow-sm)]'
                        : 'bg-transparent border border-[var(--color-divider)] hover:border-[var(--color-accent)] text-[var(--color-text)]'
                    }`}
                  >
                    <i
                      className={`ph-duotone ${opt.icon} text-2xl shrink-0 mt-0.5 ${
                        isSelected ? 'text-[var(--color-accent-700)]' : 'text-[var(--color-accent)]'
                      }`}
                    ></i>
                    <div>
                      <span className="block font-semibold text-[15px] leading-tight">
                        {opt.label}
                      </span>
                      <span
                        className={`block text-[12.5px] mt-1 ${
                          isSelected
                            ? 'text-[var(--color-accent-800)]'
                            : 'text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]'
                        }`}
                      >
                        {opt.hint}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-[var(--color-divider)]">
              <button
                onClick={skipAll}
                className="btn btn-ghost text-sm font-semibold text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]"
              >
                Skip all this
              </button>
              <button
                onClick={() => setStep(2)}
                className="btn btn-primary text-[15px] px-6"
              >
                Continue
                <i className="ph-duotone ph-arrow-right"></i>
              </button>
            </div>
          </section>
        )}

        {/* ----------------- Step 2 ----------------- */}
        {step === 2 && (
          <section className="space-y-8 animate-setu-rise">
            <div>
              <h1 className="text-3xl sm:text-[40px] font-bold leading-tight tracking-tight text-[var(--color-text)] mb-3">
                Make this paragraph easy to read.
              </h1>
              <p className="text-[16px] sm:text-[17px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_78%,transparent)]">
                Change the settings until the sample below feels comfortable. Whatever you land on
                is what the whole app uses.
              </p>
            </div>

            {/* Live Interactive Sample Paragraph */}
            <div
              className="bg-[var(--color-surface)] p-6 sm:p-7 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-divider)] transition-all duration-150"
              style={{
                fontFamily: FONT_STACKS[font],
                fontSize: `${16 * SIZE_SCALE[size]}px`,
                lineHeight: 1.6
              }}
            >
              <p className="text-[var(--color-text)]">
                Attention is the part that changed everything. Instead of reading a sentence word by
                word and hoping to remember the start by the time it reaches the end, the model looks
                at every word at once and decides, for each one, which of the others actually matter
                to it.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Typeface choices */}
              <div className="space-y-2.5">
                <label className="kicker block">Typeface</label>
                <div className="space-y-2">
                  {FONT_OPTIONS.map((f) => {
                    const isSelected = font === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => {
                          setFont(f.id);
                          savePrefs({ font: f.id });
                        }}
                        className={`w-full p-3 rounded-[var(--radius-md)] text-left transition-all duration-150 cursor-pointer ${
                          isSelected
                            ? 'bg-[var(--color-accent-100)] border border-[var(--color-accent)] text-[var(--color-accent-900)]'
                            : 'bg-transparent border border-[var(--color-divider)] hover:border-[var(--color-accent)] text-[var(--color-text)]'
                        }`}
                      >
                        <span className="block font-semibold text-[14px] leading-tight">
                          {f.label}
                        </span>
                        <span
                          className={`block text-[11.5px] mt-0.5 ${
                            isSelected
                              ? 'text-[var(--color-accent-800)]'
                              : 'text-[color-mix(in_srgb,var(--color-text)_58%,transparent)]'
                          }`}
                        >
                          {f.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Text Size choices */}
              <div className="space-y-2.5">
                <label className="kicker block">Text Size</label>
                <div className="space-y-2">
                  {SIZE_OPTIONS.map((s) => {
                    const isSelected = size === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSize(s.id);
                          savePrefs({ textSize: s.id });
                        }}
                        className={`w-full p-3 rounded-[var(--radius-md)] text-left transition-all duration-150 cursor-pointer ${
                          isSelected
                            ? 'bg-[var(--color-accent-100)] border border-[var(--color-accent)] text-[var(--color-accent-900)]'
                            : 'bg-transparent border border-[var(--color-divider)] hover:border-[var(--color-accent)] text-[var(--color-text)]'
                        }`}
                      >
                        <span className="block font-semibold text-[14px] leading-tight">
                          {s.label}
                        </span>
                        <span
                          className={`block text-[11.5px] mt-0.5 ${
                            isSelected
                              ? 'text-[var(--color-accent-800)]'
                              : 'text-[color-mix(in_srgb,var(--color-text)_58%,transparent)]'
                          }`}
                        >
                          {s.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-[var(--color-divider)]">
              <button onClick={() => setStep(1)} className="btn btn-ghost text-sm font-semibold">
                <i className="ph-duotone ph-arrow-left"></i>
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="btn btn-primary text-[15px] px-6"
              >
                Continue
                <i className="ph-duotone ph-arrow-right"></i>
              </button>
            </div>
          </section>
        )}

        {/* ----------------- Step 3 ----------------- */}
        {step === 3 && (
          <section className="space-y-8 animate-setu-rise">
            <div>
              <h1 className="text-3xl sm:text-[40px] font-bold leading-tight tracking-tight text-[var(--color-text)] mb-3">
                Should things move?
              </h1>
              <p className="text-[16px] sm:text-[17px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_78%,transparent)]">
                Maps can grow into place, or simply appear. If motion makes you queasy or pulls
                your attention away, turn it off — nothing is lost either way.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setMotion('move');
                  savePrefs({ motion: 'move' });
                }}
                className={`p-5 rounded-[var(--radius-lg)] text-left transition-all duration-150 cursor-pointer ${
                  motion === 'move'
                    ? 'bg-[var(--color-accent-100)] border border-[var(--color-accent)] text-[var(--color-accent-900)] shadow-[var(--shadow-sm)]'
                    : 'bg-transparent border border-[var(--color-divider)] hover:border-[var(--color-accent)] text-[var(--color-text)]'
                }`}
              >
                <i className="ph-duotone ph-wind text-3xl text-[var(--color-accent)] mb-2 block"></i>
                <span className="block font-bold text-[16px] leading-tight mb-1">
                  Let things move
                </span>
                <span className="block text-[13px] text-[color-mix(in_srgb,var(--color-text)_65%,transparent)]">
                  Branches grow into place smoothly as they arrive.
                </span>
              </button>

              <button
                onClick={() => {
                  setMotion('still');
                  savePrefs({ motion: 'still' });
                }}
                className={`p-5 rounded-[var(--radius-lg)] text-left transition-all duration-150 cursor-pointer ${
                  motion === 'still'
                    ? 'bg-[var(--color-accent-100)] border border-[var(--color-accent)] text-[var(--color-accent-900)] shadow-[var(--shadow-sm)]'
                    : 'bg-transparent border border-[var(--color-divider)] hover:border-[var(--color-accent)] text-[var(--color-text)]'
                }`}
              >
                <i className="ph-duotone ph-pause-circle text-3xl text-[var(--color-accent)] mb-2 block"></i>
                <span className="block font-bold text-[16px] leading-tight mb-1">
                  Keep it still
                </span>
                <span className="block text-[13px] text-[color-mix(in_srgb,var(--color-text)_65%,transparent)]">
                  Everything appears at once without motion or animations.
                </span>
              </button>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-[var(--color-divider)]">
              <button onClick={() => setStep(2)} className="btn btn-ghost text-sm font-semibold">
                <i className="ph-duotone ph-arrow-left"></i>
                Back
              </button>
              <button
                onClick={finishOnboarding}
                className="btn btn-primary text-[15px] px-6"
              >
                Draw my first map
                <i className="ph-duotone ph-arrow-right"></i>
              </button>
            </div>
          </section>
        )}
      </div>

      <footer className="text-center py-4 text-[12px] text-[color-mix(in_srgb,var(--color-text)_50%,transparent)]">
        SETU · Cognitive Accessibility System
      </footer>
    </div>
  );
}
