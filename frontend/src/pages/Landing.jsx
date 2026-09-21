import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPrefs } from '../lib/storage';

export default function Landing() {
  const [topic, setTopic] = useState('');
  const navigate = useNavigate();

  const handleStart = (e) => {
    e?.preventDefault();
    const prefs = getPrefs();
    const query = topic.trim() ? `?topic=${encodeURIComponent(topic.trim())}` : '';

    if (!prefs.onboardingDone) {
      navigate(`/onboarding${query}`);
    } else {
      navigate(`/mindmap${query}`);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] font-[var(--font-body)]">
      {/* ----------------------------- Top Nav ----------------------------- */}
      <header className="border-b border-[var(--color-divider)]">
        <div className="max-w-[1280px] mx-auto px-6 sm:px-10 py-5 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <span className="nav-brand text-2xl font-bold tracking-tight">SETU</span>
            <nav className="hidden md:flex items-center gap-6 text-[14.5px] font-semibold text-[color-mix(in_srgb,var(--color-text)_80%,transparent)]">
              <button
                onClick={() => navigate('/mindmap')}
                className="hover:text-[var(--color-accent-700)] transition-colors cursor-pointer bg-transparent border-0 font-inherit"
              >
                Sanctuary
              </button>
              <a
                href="#bed"
                className="hover:text-[var(--color-accent-700)] transition-colors"
              >
                Lens
              </a>
              <button
                onClick={() => navigate('/modes')}
                className="hover:text-[var(--color-accent-700)] transition-colors cursor-pointer bg-transparent border-0 font-inherit"
              >
                Modes
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleStart}
              className="btn btn-primary text-sm font-semibold"
            >
              Open Sanctuary
            </button>
            <a
              href="https://chrome.google.com/webstore"
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary text-sm font-semibold hidden sm:inline-flex"
            >
              <i className="ph-duotone ph-puzzle-piece text-base"></i>
              Add to Chrome
            </a>
          </div>
        </div>
      </header>

      {/* ----------------------------- Hero Section ----------------------------- */}
      <main className="max-w-[1280px] mx-auto px-6 sm:px-10 py-12 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] gap-12 lg:gap-14 items-center">
          {/* Left Column */}
          <div className="space-y-6">
            <h6 className="kicker kicker-magenta">One question in. One map out.</h6>

            <h1 className="text-4xl sm:text-5xl lg:text-[66px] font-bold leading-[1.04] tracking-[-0.02em] text-[var(--color-text)]">
              Understand it in one look.
            </h1>

            <p className="text-lg sm:text-[19px] leading-[1.55] text-[color-mix(in_srgb,var(--color-text)_80%,transparent)] max-w-[42ch]">
              Ask about anything in plain language. SETU researches it and lays it out as a map you
              open one branch at a time — instead of a wall of text you have to survive.
            </p>

            <form onSubmit={handleStart} className="space-y-2.5 max-w-[480px]">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="How does a transformer neural network work?"
                  className="input min-h-[48px] text-[15px]"
                  aria-label="Enter a topic to research"
                />
                <button
                  type="submit"
                  className="btn btn-primary min-h-[48px] px-6 whitespace-nowrap text-[15px]"
                >
                  Draw it
                  <i className="ph-duotone ph-arrow-right"></i>
                </button>
              </div>
              <p className="text-[13px] text-[color-mix(in_srgb,var(--color-text)_58%,transparent)]">
                Free, no account. Your maps stay in this browser.
              </p>
            </form>

            {/* Stat Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-6 mt-8 border-t border-[var(--color-divider)]">
              <div>
                <p className="font-[var(--font-heading)] text-3xl font-bold text-[var(--color-text)]">8</p>
                <p className="text-[12px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)] leading-tight">
                  reading tools, on any site
                </p>
              </div>
              <div>
                <p className="font-[var(--font-heading)] text-3xl font-bold text-[var(--color-text)]">8</p>
                <p className="text-[12px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)] leading-tight">
                  cognitive modes
                </p>
              </div>
              <div>
                <p className="font-[var(--font-heading)] text-3xl font-bold text-[var(--color-text)]">1</p>
                <p className="text-[12px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)] leading-tight">
                  common AI agent
                </p>
              </div>
              <div>
                <p className="font-[var(--font-heading)] text-3xl font-bold text-[var(--color-text)]">0</p>
                <p className="text-[12px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)] leading-tight">
                  bytes uploaded
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Live Map Preview */}
          <figure className="m-0">
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-4 sm:p-5 shadow-[var(--shadow-lg)] border border-[var(--color-divider)]">
              {/* Header */}
              <div className="flex items-baseline justify-between gap-3 mb-3.5 pb-2 border-b border-[var(--color-divider)]">
                <div className="min-w-0">
                  <h3 className="font-[var(--font-heading)] text-[17px] font-bold text-[var(--color-text)] truncate">
                    Transformer neural networks
                  </h3>
                  <p className="text-[12px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)] truncate">
                    Attention replaces recurrence — the whole sequence, at once.
                  </p>
                </div>
                <span className="tag tag-neutral shrink-0">14 topics</span>
              </div>

              {/* Live coordinate map preview */}
              <div className="relative h-[380px] sm:h-[400px] bg-[var(--color-bg)] rounded-[var(--radius-md)] overflow-hidden border border-[var(--color-divider)]">
                {/* Dot grid */}
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle, color-mix(in srgb, var(--color-text) 14%, transparent) 1px, transparent 1px)',
                    backgroundSize: '22px 22px'
                  }}
                />

                {/* Connectors SVG */}
                <svg
                  viewBox="0 0 620 400"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  aria-hidden="true"
                >
                  <path
                    d="M175 200 C 215 200, 215 58, 260 58"
                    fill="none"
                    stroke="#0088b0"
                    strokeOpacity="0.6"
                    strokeWidth="2"
                  />
                  <path
                    d="M175 200 C 215 200, 215 146, 260 146"
                    fill="none"
                    stroke="#d6006c"
                    strokeOpacity="0.6"
                    strokeWidth="2"
                  />
                  <path
                    d="M175 208 C 215 208, 215 244, 260 244"
                    fill="none"
                    stroke="#edbb00"
                    strokeOpacity="0.75"
                    strokeWidth="2"
                  />
                  <path
                    d="M175 208 C 215 208, 215 334, 260 334"
                    fill="none"
                    stroke="#201e1d"
                    strokeOpacity="0.45"
                    strokeWidth="2"
                  />
                  <path
                    d="M420 58 C 448 58, 448 30, 480 30"
                    fill="none"
                    stroke="#0088b0"
                    strokeOpacity="0.4"
                    strokeWidth="1.4"
                  />
                  <path
                    d="M420 66 C 448 66, 448 96, 480 96"
                    fill="none"
                    stroke="#0088b0"
                    strokeOpacity="0.4"
                    strokeWidth="1.4"
                  />
                  <path
                    d="M420 146 C 448 146, 448 174, 480 174"
                    fill="none"
                    stroke="#d6006c"
                    strokeOpacity="0.4"
                    strokeWidth="1.4"
                  />
                </svg>

                {/* Root Node */}
                <div className="absolute left-[20px] top-[175px] w-[155px] p-2.5 bg-[var(--color-bg)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] border-l-[3.5px] border-[var(--color-text)]">
                  <p className="font-[var(--font-heading)] font-semibold text-[14.5px] leading-tight text-[var(--color-text)]">
                    Transformer
                  </p>
                  <p className="text-[10.5px] text-[color-mix(in_srgb,var(--color-text)_58%,transparent)] mt-0.5">
                    The architecture
                  </p>
                </div>

                {/* Level 1 Nodes */}
                <div className="absolute left-[260px] top-[36px] w-[160px] p-2 bg-[var(--color-bg)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] border-l-[3.5px] border-[#0088b0]">
                  <p className="font-semibold text-[13px] leading-tight text-[var(--color-text)]">
                    Self-attention
                  </p>
                  <p className="text-[10px] text-[color-mix(in_srgb,var(--color-text)_58%,transparent)] mt-0.5">
                    Every word weighs every other
                  </p>
                </div>

                <div className="absolute left-[260px] top-[124px] w-[160px] p-2 bg-[var(--color-bg)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] border-l-[3.5px] border-[#d6006c]">
                  <p className="font-semibold text-[13px] leading-tight text-[var(--color-text)]">
                    Positional encoding
                  </p>
                  <p className="text-[10px] text-[color-mix(in_srgb,var(--color-text)_58%,transparent)] mt-0.5">
                    Order, without reading in order
                  </p>
                </div>

                <div className="absolute left-[260px] top-[222px] w-[160px] p-2 bg-[var(--color-bg)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] border-l-[3.5px] border-[#edbb00]">
                  <p className="font-semibold text-[13px] leading-tight text-[var(--color-text)]">
                    Feed-forward layers
                  </p>
                  <p className="text-[10px] text-[color-mix(in_srgb,var(--color-text)_58%,transparent)] mt-0.5">
                    Where knowledge is stored
                  </p>
                </div>

                <div className="absolute left-[260px] top-[312px] w-[160px] p-2 bg-[var(--color-bg)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] border-l-[3.5px] border-[color-mix(in_srgb,var(--color-text)_50%,transparent)]">
                  <p className="font-semibold text-[13px] leading-tight text-[var(--color-text)]">
                    Training at scale
                  </p>
                  <p className="text-[10px] text-[color-mix(in_srgb,var(--color-text)_58%,transparent)] mt-0.5">
                    Why it powers foundation models
                  </p>
                </div>

                {/* Level 2 Leaf Nodes */}
                <div className="absolute left-[480px] top-[16px] w-[120px] p-1.5 bg-[var(--color-bg)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] border border-[var(--color-divider)]">
                  <p className="font-semibold text-[11px] leading-tight text-[var(--color-text)]">
                    Query, key, value
                  </p>
                </div>

                <div className="absolute left-[480px] top-[82px] w-[120px] p-1.5 bg-[var(--color-bg)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] border border-[var(--color-divider)]">
                  <p className="font-semibold text-[11px] leading-tight text-[var(--color-text)]">
                    Multi-head attention
                  </p>
                </div>

                <div className="absolute left-[480px] top-[160px] w-[120px] p-1.5 bg-[var(--color-bg)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] border border-[var(--color-divider)]">
                  <p className="font-semibold text-[11px] leading-tight text-[var(--color-text)]">
                    Sinusoidal vs learned
                  </p>
                </div>

                <p className="absolute left-3 bottom-2.5 text-[11px] text-[color-mix(in_srgb,var(--color-text)_50%,transparent)]">
                  Interactive canvas · click any branch to expand
                </p>
              </div>
            </div>
            <figcaption className="text-center text-[12.5px] text-[color-mix(in_srgb,var(--color-text)_58%,transparent)] mt-3">
              A real map, drawn in about twelve seconds.
            </figcaption>
          </figure>
        </div>

        {/* ----------------------------- Three-Column Bed ----------------------------- */}
        <section id="bed" className="mt-20 pt-12 border-t border-[var(--color-divider)]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-14 text-left">
            <div className="space-y-3">
              <h6 className="kicker">The problem</h6>
              <h3 className="text-xl font-bold text-[var(--color-text)]">
                Density is a disability barrier.
              </h3>
              <p className="text-[15px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_78%,transparent)]">
                A benefits portal, a tenancy agreement, a research paper. The information is there.
                The visual shape and wall-of-text density are what keep neurodivergent readers out.
              </p>
            </div>

            <div className="space-y-3">
              <h6 className="kicker">The move</h6>
              <h3 className="text-xl font-bold text-[var(--color-text)]">
                Reshape, don't summarise.
              </h3>
              <p className="text-[15px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_78%,transparent)]">
                Nothing is thrown away or watered down. The same words, re-laid so your eye can hold
                a line and your working memory can hold a branch without overwhelm.
              </p>
            </div>

            <div className="space-y-3">
              <h6 className="kicker kicker-magenta">The promise</h6>
              <h3 className="text-xl font-bold text-[var(--color-text)]">
                It stays yours.
              </h3>
              <p className="text-[15px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_78%,transparent)]">
                Maps and reading settings are saved right in your browser. No mandatory account, no
                cloud uploads, and no model trained on the private material you were reading.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ----------------------------- Footer ----------------------------- */}
      <footer className="border-t border-[var(--color-divider)] py-8 mt-12 bg-[var(--color-surface)]">
        <div className="max-w-[1280px] mx-auto px-6 sm:px-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
          <div className="flex items-center gap-3">
            <span className="font-[var(--font-heading)] font-bold text-[var(--color-text)]">SETU</span>
            <span>·</span>
            <span>Cognitive Accessibility System</span>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={() => navigate('/mindmap')}
              className="hover:text-[var(--color-accent-700)] bg-transparent border-0 cursor-pointer text-inherit"
            >
              Mind Map
            </button>
            <button
              onClick={() => navigate('/modes')}
              className="hover:text-[var(--color-accent-700)] bg-transparent border-0 cursor-pointer text-inherit"
            >
              7 Modes
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="hover:text-[var(--color-accent-700)] bg-transparent border-0 cursor-pointer text-inherit"
            >
              Settings
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
