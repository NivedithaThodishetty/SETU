import { useCallback, useEffect, useRef, useState } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import MindMapChat from './pages/MindMapChat';
import Library from './pages/Library';
import Modes from './pages/Modes';
import Settings from './pages/Settings';
import Landing from './pages/Landing';
import Onboarding from './pages/Onboarding';
import Listen from './pages/Listen';
import Momentum from './pages/Momentum';
import CommandPalette from './components/CommandPalette';
import BreakDialog from './components/BreakDialog';
import ReadingRuler from './components/ReadingRuler';
import RewardToast from './components/RewardToast';
import ParkingLot, { TOGGLE_EVENT as PARKING_LOT_TOGGLE } from './components/ParkingLot';
import MomentumRail from './components/MomentumRail';
import { api, setApiLanguage } from './lib/api';
import { applyPrefs, getPrefs, savePrefs } from './lib/storage';
import { award, mergeServerProgress } from './lib/progress';
import { tts } from './lib/tts';
import { langAttr, langDir } from './lib/languages';

const FOCUS_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;

export default function App() {
  useEffect(() => {
    applyPrefs();

    // Hand the saved voice, pace, and language to the speech and API layers
    // before anything can ask them to speak or think, so the first utterance
    // already sounds right and the first answer comes back in the right tongue.
    const prefs = getPrefs();
    if (prefs.voice) tts.setSpeaker(prefs.voice);
    tts.setRate(prefs.speechRate || 1);
    tts.setLanguage(prefs.language || 'en-IN');
    setApiLanguage(prefs.language || 'en-IN');
    // Via langAttr, not the raw code. SETU stores Odia as 'od-IN' because that
    // is what Sarvam's API wants, but it is not a valid BCP-47 tag — setting it
    // here leaves a screen reader with nothing it recognises, so it falls back
    // to the document default and reads Odia with an English voice engine.
    // applyPrefs() sets the same pair; this runs at boot before prefs are
    // applied, and the two must not disagree.
    document.documentElement.lang = langAttr(prefs.language);
    document.documentElement.dir = langDir(prefs.language);

    // Top up local progress from the server copy once at boot, so a streak
    // built on another device is not silently restarted here.
    let cancelled = false;
    api.getProgress().then((result) => {
      if (!cancelled && result?.progress) mergeServerProgress(result.progress);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoot />
    </HashRouter>
  );
}

function AppRoot() {
  const location = useLocation();
  const isLandingOrOnboarding =
    location.pathname === '/landing' || location.pathname === '/onboarding';

  // Global Command Palette & Focus Session States
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);
  const [readingRulerActive, setReadingRulerActive] = useState(() => Boolean(getPrefs().readingRuler));

  // 25-minute focus session timer state (1500 seconds)
  const [focusSeconds, setFocusSeconds] = useState(FOCUS_SECONDS);
  const [focusRunning, setFocusRunning] = useState(false);

  /**
   * Which countdown is currently on the clock.
   *
   * The break reuses the same timer, so without this the five minutes after a
   * session ended were indistinguishable from the session itself — they paid
   * out a full focus award and re-opened a dialog announcing twenty-five
   * minutes that had not happened.
   */
  const [focusPhase, setFocusPhase] = useState('focus');

  /**
   * Reading-ruler controls.
   *
   * The current value is mirrored on a ref so these can be stable across
   * renders: the Alt+H listener is registered once with an empty dependency
   * list, and a handler that closed over `readingRulerActive` directly would be
   * frozen at its first-render value and toggle from the wrong state forever.
   *
   * `savePrefs` runs here rather than inside a state updater because it writes
   * storage and fires a background sync, and StrictMode invokes updaters twice
   * in development.
   */
  const rulerRef = useRef(readingRulerActive);

  const setRuler = useCallback((next) => {
    rulerRef.current = next;
    setReadingRulerActive(next);
    savePrefs({ readingRuler: next });
  }, []);

  const toggleRuler = useCallback(() => setRuler(!rulerRef.current), [setRuler]);

  // Global Keyboard Shortcuts (Ctrl+K / Cmd+K for palette, Alt+H for Reading Ruler)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Compared case-insensitively, and against `code` as well, because
      // `key` arrives as "K" under Caps Lock or Shift and as a dead character
      // when Option is the modifier on macOS — both of which silently killed
      // the shortcut for the users least able to reach for a mouse instead.
      const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';

      if ((e.ctrlKey || e.metaKey) && (key === 'k' || e.code === 'KeyK')) {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      } else if (e.altKey && (key === 'h' || e.code === 'KeyH')) {
        e.preventDefault();
        toggleRuler();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleRuler]);

  // Focus timer tick. The updater only counts down — see the completion effect
  // below for why nothing else may happen in here.
  useEffect(() => {
    if (!focusRunning) return undefined;
    const timer = setInterval(() => setFocusSeconds((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(timer);
  }, [focusRunning]);

  /**
   * Completion, handled as an effect rather than inside the tick.
   *
   * `award` writes to storage and fans out to toast listeners, and a state
   * updater has to stay pure — StrictMode invokes it twice in development, so
   * running the payout in there granted the points twice for one session.
   */
  useEffect(() => {
    if (!focusRunning || focusSeconds > 0) return;

    setFocusRunning(false);

    if (focusPhase === 'focus') {
      // Sitting through a whole session is the single most effortful thing the
      // app asks for, so it is the largest single award. A finished break is
      // not an achievement and pays nothing.
      award('focusSession');
      setBreakOpen(true);
    }

    setFocusPhase('focus');
    setFocusSeconds(FOCUS_SECONDS);
  }, [focusRunning, focusSeconds, focusPhase]);

  const toggleFocus = () => setFocusRunning((prev) => !prev);
  const resetFocus = () => {
    setFocusRunning(false);
    setFocusPhase('focus');
    setFocusSeconds(FOCUS_SECONDS);
  };

  const handleBreakKeepGoing = () => {
    setBreakOpen(false);
    setFocusPhase('focus');
    setFocusSeconds(FOCUS_SECONDS);
    setFocusRunning(true);
  };

  const handleBreakTakeFive = () => {
    setBreakOpen(false);
    setFocusPhase('break');
    setFocusSeconds(BREAK_SECONDS);
    setFocusRunning(true);
  };

  return (
    <>
      <Routes>
        <Route path="/landing" element={<Landing />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route
          path="/*"
          element={
            <Shell
              onOpenPalette={() => setPaletteOpen(true)}
              focusSeconds={focusSeconds}
              focusRunning={focusRunning}
              focusPhase={focusPhase}
              onToggleFocus={toggleFocus}
              onResetFocus={resetFocus}
              readingRulerActive={readingRulerActive}
              onToggleRuler={toggleRuler}
            >
              <Routes>
                <Route path="/" element={<RootRedirect />} />
                <Route path="/mindmap" element={<MindMapChat />} />
                <Route path="/library" element={<Library />} />
                <Route path="/modes" element={<Modes />} />
                <Route path="/listen" element={<Listen />} />
                <Route path="/momentum" element={<Momentum />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Shell>
          }
        />
      </Routes>

      {/* Global ADHD Reading Ruler */}
      <ReadingRuler
        enabled={readingRulerActive}
        onClose={() => setRuler(false)}
      />

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onStartFocus={() => {
          setFocusRunning(true);
          setPaletteOpen(false);
        }}
      />

      <BreakDialog
        isOpen={breakOpen}
        onKeepGoing={handleBreakKeepGoing}
        onTakeFive={handleBreakTakeFive}
      />

      {/* Global working-memory offload and reward notifications. Kept outside the
          Shell so they survive route changes and are reachable from the landing
          and onboarding screens too. */}
      {!isLandingOrOnboarding && <ParkingLot />}
      <RewardToast />
    </>
  );
}

function RootRedirect() {
  return <Navigate to="/landing" replace />;
}

const NAV = [
  { to: '/mindmap', label: 'Mind Map', icon: 'ph-graph', hint: 'Ask anything, get a map' },
  { to: '/library', label: 'Library', icon: 'ph-books', hint: 'Saved maps & documents' },
  { to: '/modes', label: 'Modes', icon: 'ph-squares-four', hint: 'Eight cognitive tools' },
  { to: '/listen', label: 'Listen', icon: 'ph-heart', hint: 'Somewhere to put it' },
  { to: '/settings', label: 'Settings', icon: 'ph-gear', hint: 'Reading & focus controls' }
];

function Shell({
  children,
  onOpenPalette,
  focusSeconds,
  focusRunning,
  focusPhase,
  onToggleFocus,
  onResetFocus,
  readingRulerActive,
  onToggleRuler
}) {
  const [engine, setEngine] = useState('checking');
  const [dbState, setDbState] = useState(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const health = await api.health();
      if (cancelled) return;
      if (!health) {
        setEngine('down');
      } else {
        setEngine(health.aiConfigured ? 'ok' : 'nokey');
        setDbState(health.database);
      }
    };

    check();
    const timer = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)] font-[var(--font-body)]">
      <a href="#main" className="sr-only-focusable btn-primary z-50 m-2">
        Skip to content
      </a>

      {/* ----------------- Broadsheet Sidebar (244px fixed) ----------------- */}
      <nav
        className={`fixed inset-y-0 left-0 z-40 flex w-[244px] flex-col bg-[var(--color-surface)] transition-transform duration-200 lg:static lg:translate-x-0 ${
          navOpen ? 'translate-x-0 shadow-lg' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
      >
        {/* Brand Header */}
        <div className="px-5 py-4 border-b border-[var(--color-divider)] flex items-center justify-between">
          <div>
            <span className="font-[var(--font-heading)] text-[20px] font-bold text-[var(--color-text)] tracking-tight block">
              SETU
            </span>
            <span className="kicker block text-[10px] text-[color-mix(in_srgb,var(--color-text)_55%,transparent)] mt-0.5">
              Cognitive Sanctuary
            </span>
          </div>
          <button
            onClick={() => setNavOpen(false)}
            className="lg:hidden btn btn-quiet !min-h-[28px] !px-1.5"
            aria-label="Close sidebar"
          >
            <i className="ph-duotone ph-x text-base"></i>
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 space-y-1 py-3 pr-3 pl-0 overflow-y-auto">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 py-2.5 pl-4 pr-3 rounded-r-[var(--radius-md)] transition-colors ${
                  isActive
                    ? 'bg-[var(--color-bg)] text-[var(--color-text)] font-semibold border-l-[3.5px] border-[var(--color-accent)] shadow-[var(--shadow-sm)]'
                    : 'text-[color-mix(in_srgb,var(--color-text)_72%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-bg)_60%,transparent)] hover:text-[var(--color-text)] border-l-[3.5px] border-transparent'
                }`
              }
            >
              <i className={`ph-duotone ${item.icon} text-lg text-[var(--color-accent)] shrink-0`}></i>
              <div className="min-w-0 text-left">
                <span className="block text-[14px] leading-tight font-semibold">
                  {item.label}
                </span>
                <span className="block text-[11px] text-[color-mix(in_srgb,var(--color-text)_55%,transparent)] truncate mt-0.5">
                  {item.hint}
                </span>
              </div>
            </NavLink>
          ))}

        </div>

        {/*
          Utility row.

          The ruler and the command palette used to occupy a headed section and
          a full-width button of their own, which put four separate blocks
          between the navigation and the clock. They are two toggles; they get
          one row.
        */}
        <div className="grid grid-cols-2 gap-1.5 px-3 pb-2">
          <button
            onClick={onToggleRuler}
            aria-pressed={readingRulerActive}
            className={`flex min-h-[34px] cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border text-[12px] font-semibold transition-colors ${
              readingRulerActive
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-100)] text-[var(--color-accent-900)]'
                : 'border-[var(--color-divider)] bg-[var(--color-bg)] text-[var(--color-text)] hover:border-[var(--color-accent)]'
            }`}
            title="Reading ruler — a moving band that keeps your place (Alt+H)"
          >
            <i className="ph-duotone ph-line-segments text-base text-[var(--color-accent)]"></i>
            Ruler
          </button>

          <button
            onClick={onOpenPalette}
            className="flex min-h-[34px] cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-bg)] text-[12px] font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent-700)]"
            aria-label="Open command palette"
            title="Jump anywhere — every screen and tool, by name (Ctrl or Cmd + K)"
          >
            <i className="ph-duotone ph-magnifying-glass text-base text-[var(--color-accent)]"></i>
            Actions
          </button>
        </div>

        {/* Focus Session Widget */}
        <div className="p-3 border-t border-[var(--color-divider)] space-y-2 text-left bg-[color-mix(in_srgb,var(--color-surface)_80%,transparent)]">
          <div className="flex items-center justify-between">
            <span className="kicker text-[9.5px]">
              {focusPhase === 'break' ? 'Break' : 'Focus Session'}
            </span>
            <span
              className={`font-mono text-[18px] font-bold ${
                focusRunning
                  ? 'text-[var(--color-accent)]'
                  : 'text-[color-mix(in_srgb,var(--color-text)_50%,transparent)]'
              }`}
            >
              {formatTime(focusSeconds)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 pt-0.5">
            <button
              onClick={onToggleFocus}
              className={`btn flex-1 !min-h-[28px] !py-1 text-[12px] ${
                focusRunning ? 'btn-secondary' : 'btn-primary'
              }`}
            >
              {focusRunning ? 'Pause' : 'Start'}
            </button>
            <button
              onClick={onResetFocus}
              className="btn btn-quiet !min-h-[28px] !px-2"
              title="Reset focus clock"
              aria-label="Reset focus clock"
            >
              <i className="ph-duotone ph-arrow-counter-clockwise text-sm"></i>
            </button>
          </div>
        </div>

        {/* Reward progress summary */}
        <MomentumRail />

        {/* Engine & MongoDB Status Badge */}
          {/* Reserved lane at the foot of the rail: the parking-lot pill floats at
            bottom-left on desktop and used to sit directly on top of this badge. */}
        <div className="border-t border-[var(--color-divider)] p-3 pb-[60px] bg-[var(--color-surface)]">
          <EngineBadge state={engine} dbState={dbState} />
        </div>
      </nav>

      {/* Mobile Backdrop */}
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-[rgba(32,30,29,0.4)] backdrop-blur-sm lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden
        />
      )}

      {/* ----------------- Main Workspace ----------------- */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--color-bg)]">
        {/* Mobile Header Bar */}
        <div className="lg:hidden flex items-center justify-between p-3 border-b border-[var(--color-divider)] bg-[var(--color-surface)]">
          <button
            onClick={() => setNavOpen(true)}
            className="btn btn-ghost !min-h-[34px] !px-2.5 text-xs font-semibold"
            aria-label="Open menu"
          >
            <i className="ph-duotone ph-list text-base"></i>
            Menu
          </button>
          <span className="font-[var(--font-heading)] font-bold text-base text-[var(--color-text)]">
            SETU Sanctuary
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent(PARKING_LOT_TOGGLE))}
              className="btn btn-quiet !min-h-[34px] !px-2"
              aria-label="Park a thought"
              title="Park a thought (Alt+P)"
            >
              <i className="ph-duotone ph-push-pin text-lg"></i>
            </button>
            <button
              onClick={onOpenPalette}
              className="btn btn-quiet !min-h-[34px] !px-2"
              aria-label="Search"
            >
              <i className="ph-duotone ph-magnifying-glass text-lg"></i>
            </button>
          </div>
        </div>

        <main id="main" className="min-h-0 flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}

function EngineBadge({ state, dbState }) {
  const configs = {
    checking: {
      dot: 'bg-slate-400',
      label: 'Checking engine…'
    },
    ok: {
      dot: 'bg-[var(--color-accent)]',
      label: dbState?.connected ? 'Engine & DB ready' : 'Engine ready'
    },
    nokey: {
      dot: 'bg-[#edbb00]',
      label: 'No AI key set'
    },
    down: {
      dot: 'bg-[var(--color-accent-2)]',
      label: 'Engine offline'
    }
  }[state] || { dot: 'bg-slate-400', label: 'Engine offline' };

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] text-[11px] font-semibold text-[color-mix(in_srgb,var(--color-text)_75%,transparent)]"
      title={
        state === 'down'
          ? 'Start the backend: npm start in /backend'
          : state === 'nokey'
            ? 'Set GEMINI_API_KEY in your .env file — get one at aistudio.google.com/apikey'
            : dbState?.connected
              ? 'Connected to Google Gemini and MongoDB'
              : 'Connected to Google Gemini with local storage fallback'
      }
    >
      <span
        className={`h-2 w-2 rounded-full ${configs.dot} ${
          state === 'ok' ? 'animate-setu-breathe' : ''
        }`}
      />
      <span className="truncate">{configs.label}</span>
    </div>
  );
}

function NotFound() {
  return (
    <div className="grid h-full place-items-center p-8 text-center bg-[var(--color-bg)]">
      <div className="space-y-4 max-w-sm">
        <i className="ph-duotone ph-warning-circle text-4xl text-[var(--color-accent-2)]"></i>
        <h1 className="text-xl font-bold text-[var(--color-text)]">Page not found</h1>
        <p className="text-[14px] text-[color-mix(in_srgb,var(--color-text)_70%,transparent)]">
          The link or screen you requested is not available.
        </p>
        <NavLink to="/mindmap" className="btn btn-primary text-sm inline-flex">
          Back to Mind Map
        </NavLink>
      </div>
    </div>
  );
}
