import { useEffect, useState } from 'react';
import { getPrefs, savePrefs, listMaps, clearAllMaps, restoreSeedMaps } from '../lib/storage';
import { getUserId } from '../lib/identity';
import { api, setApiLanguage } from '../lib/api';
import { tts } from '../lib/tts';
import VoiceInputButton from '../components/VoiceInputButton';
import { langAttr, langDir } from '../lib/languages';

/**
 * Audition line, per language.
 *
 * Written natively rather than machine-translated from the English one, so each
 * sample actually demonstrates that language's rhythm. Falls back to English for
 * anything not listed.
 */
const VOICE_SAMPLES = {
  'en-IN': 'Here is your map. Point at any branch and I will read it to you, one piece at a time.',
  'hi-IN': 'यह रहा आपका मानचित्र। किसी भी शाखा पर इशारा कीजिए, मैं उसे एक-एक करके पढ़कर सुनाऊँगी।',
  'bn-IN': 'এই যে আপনার মানচিত্র। যেকোনো শাখায় আঙুল রাখুন, আমি এক এক করে পড়ে শোনাব।',
  'gu-IN': 'આ રહ્યો તમારો નકશો. કોઈ પણ શાખા પર આંગળી મૂકો, હું એક પછી એક વાંચી સંભળાવીશ.',
  'kn-IN': 'ಇದು ನಿಮ್ಮ ನಕ್ಷೆ. ಯಾವುದೇ ಶಾಖೆಯ ಮೇಲೆ ತೋರಿಸಿ, ನಾನು ಒಂದೊಂದಾಗಿ ಓದಿ ಹೇಳುತ್ತೇನೆ.',
  'ml-IN': 'ഇതാ നിങ്ങളുടെ ഭൂപടം. ഏതെങ്കിലും ശാഖയിൽ ചൂണ്ടിക്കാണിക്കൂ, ഞാൻ ഓരോന്നായി വായിച്ചു തരാം.',
  'mr-IN': 'हा तुमचा नकाशा. कोणत्याही फांदीवर बोट ठेवा, मी एक एक करून वाचून दाखवेन.',
  'od-IN': 'ଏହା ଆପଣଙ୍କର ମାନଚିତ୍ର। ଯେକୌଣସି ଶାଖାକୁ ଦେଖାନ୍ତୁ, ମୁଁ ଗୋଟି ଗୋଟି କରି ପଢ଼ି ଶୁଣାଇବି।',
  'pa-IN': 'ਇਹ ਤੁਹਾਡਾ ਨਕਸ਼ਾ ਹੈ। ਕਿਸੇ ਵੀ ਸ਼ਾਖਾ ਵੱਲ ਇਸ਼ਾਰਾ ਕਰੋ, ਮੈਂ ਇੱਕ-ਇੱਕ ਕਰਕੇ ਪੜ੍ਹ ਕੇ ਸੁਣਾਵਾਂਗੀ।',
  'ta-IN': 'இதோ உங்கள் வரைபடம். எந்தக் கிளையையும் சுட்டிக்காட்டுங்கள், நான் ஒவ்வொன்றாகப் படித்துக் காட்டுகிறேன்.',
  'te-IN': 'ఇదిగో మీ మ్యాప్. ఏ శాఖనైనా చూపించండి, నేను ఒక్కొక్కటిగా చదివి వినిపిస్తాను.'
};

const sampleFor = (code) => VOICE_SAMPLES[code] || VOICE_SAMPLES['en-IN'];

export default function Settings() {
  const [prefs, setPrefs] = useState(getPrefs);
  const [health, setHealth] = useState(null);
  const [checking, setChecking] = useState(false);
  const [mapsCount, setMapsCount] = useState(0);
  const [notice, setNotice] = useState(null);
  const [speech, setSpeech] = useState(null);
  const [auditioning, setAuditioning] = useState(null);
  const [sttTestTranscript, setSttTestTranscript] = useState('');
  const userId = getUserId();

  useEffect(() => {
    let cancelled = false;
    api.health().then((result) => {
      if (!cancelled) setHealth(result);
    });
    api.speechVoices().then((result) => {
      if (!cancelled) setSpeech(result);
    });
    setMapsCount(listMaps().length);
    return () => {
      cancelled = true;
      tts.stop();
    };
  }, []);

  const update = (patch) => {
    const next = savePrefs(patch);
    setPrefs(next);
  };

  /** Switch voice and immediately play it, so the choice is heard, not guessed. */
  const chooseVoice = (voiceId) => {
    update({ voice: voiceId });
    tts.setSpeaker(voiceId);
    setAuditioning(voiceId);
    tts.speak(sampleFor(prefs.language), { onEnd: () => setAuditioning(null) }).catch(() =>
      setAuditioning(null)
    );
  };

  const changeSpeechRate = (rate) => {
    update({ speechRate: rate });
    tts.setRate(rate);
  };

  /**
   * Switch the conversation language.
   *
   * Updates all three consumers together — the AI request layer, the speech
   * engine, and the document `lang` attribute that drives screen-reader
   * pronunciation — then reads the sample so the change is immediately audible.
   */
  const chooseLanguage = (code) => {
    update({ language: code });
    setApiLanguage(code);
    tts.setLanguage(code);
    // langAttr, not `code` — see App.jsx. 'od-IN' is Sarvam's spelling of Odia
    // and is not a language tag any assistive technology accepts.
    document.documentElement.lang = langAttr(code);
    document.documentElement.dir = langDir(code);
    setAuditioning(`lang_${code}`);
    tts.speak(sampleFor(code), { onEnd: () => setAuditioning(null) }).catch(() =>
      setAuditioning(null)
    );
  };

  const deepCheck = async () => {
    setChecking(true);
    try {
      const res = await api.healthAi();
      setHealth((prev) => ({
        ...(prev || {}),
        ai: res || { ok: false, reason: 'Engine unreachable' },
        database: res?.database || prev?.database
      }));
    } finally {
      setChecking(false);
    }
  };

  const handleDeleteAll = () => {
    if (!confirm('Delete every saved map in this browser? This cannot be undone.')) return;
    clearAllMaps();
    setMapsCount(0);
    setNotice('All saved maps deleted.');
  };

  const handleRestoreSeeds = () => {
    const maps = restoreSeedMaps();
    setMapsCount(maps.length);
    setNotice('Reference library restored. Your own maps were left untouched.');
  };

  return (
    <div className="h-full overflow-y-auto p-6 sm:p-10 bg-[var(--color-bg)] text-left">
      <div className="max-w-[680px] mx-auto space-y-9">
        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-3xl sm:text-[34px] font-bold text-[var(--color-text)]">
            Accessibility & Engine Settings
          </h1>
          <p className="text-[15px] text-[color-mix(in_srgb,var(--color-text)_75%,transparent)]">
            Customise sensory palettes, dyslexia fonts, ADHD focus tools, and ultra-fast AI engine connections.
          </p>
        </header>

        {/* 1. Sensory Overlays & Themes */}
        <section className="space-y-4">
          <span className="kicker block">Sensory Color Palettes (Scotopic & Visual Comfort)</span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="Theme palette">
            {[
              { id: 'broadsheet', name: 'Broadsheet Light', hint: 'Editorial neutral grey (#F3F2F2)' },
              { id: 'cream', name: 'Warm Parchment', hint: 'Anti-glare warm cream for visual stress' },
              { id: 'pastel', name: 'Calming Blue', hint: 'Low-stimulus soothing blue for ADHD' },
              { id: 'sage', name: 'Muted Sage Green', hint: 'Restful muted green ground' },
              { id: 'velvet', name: 'Velvet Dark', hint: 'Deep dark background (#18181A)' },
              { id: 'contrast', name: 'High Contrast Yellow/Black', hint: 'Maximum readability & bold accents' }
            ].map((theme) => {
              const isSelected = (prefs.theme || 'broadsheet') === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => update({ theme: theme.id })}
                  className={`p-3 rounded-[var(--radius-md)] text-left border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--color-surface)] border-[var(--color-accent)] ring-1 ring-[var(--color-accent)] shadow-[var(--shadow-sm)]'
                      : 'bg-transparent border-[var(--color-divider)] hover:border-[var(--color-accent)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[14px] text-[var(--color-text)]">
                      {theme.name}
                    </span>
                    {isSelected && (
                      <span className="h-2 w-2 rounded-full bg-[var(--color-accent)]"></span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)] mt-0.5">
                    {theme.hint}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. Reading & Typography */}
        <section className="space-y-5 pt-4 border-t border-[var(--color-divider)]">
          <span className="kicker block">Dyslexia & Typography Preferences</span>

          {/* Typeface Choice */}
          <div className="space-y-2">
            <label className="block text-[14.5px] font-semibold text-[var(--color-text)]">
              Dyslexia-Optimized Typeface
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Typeface">
              {[
                { value: 'serif', label: 'Source Serif 4', hint: 'Balanced editorial serif' },
                { value: 'lexend', label: 'Lexend Reading Font', hint: 'Clinically proven reading speed font' },
                { value: 'hyper', label: 'Atkinson Hyperlegible', hint: 'Braille Institute low-vision design' },
                { value: 'dyslexic', label: 'Dyslexia Hybrid Stack', hint: 'Heavy baseline to reduce letter flips' },
                { value: 'system', label: 'System Clean Sans', hint: 'Modern system sans-serif' }
              ].map((opt) => {
                const isSelected = prefs.font === opt.value;
                return (
                  <button
                    key={opt.value}
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => update({ font: opt.value })}
                    className={`p-2.5 rounded-[var(--radius-md)] text-left transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-[var(--color-accent)] text-[var(--color-bg)] border-[var(--color-accent)] shadow-[var(--shadow-sm)]'
                        : 'bg-transparent text-[var(--color-text)] border-[var(--color-divider)] hover:border-[var(--color-accent)]'
                    }`}
                  >
                    <span className="block text-[13.5px] font-bold">{opt.label}</span>
                    <span className={`block text-[11px] mt-0.5 ${isSelected ? 'opacity-85' : 'opacity-65'}`}>
                      {opt.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Text Size Choice */}
          <div className="space-y-2">
            <label className="block text-[14.5px] font-semibold text-[var(--color-text)]">
              Text size
            </label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Text size">
              {[
                { value: 'normal', label: 'Normal (16px)' },
                { value: 'comfortable', label: 'Comfortable (17.6px)' },
                { value: 'large', label: 'Large (19.5px)' }
              ].map((opt) => {
                const isSelected = prefs.textSize === opt.value;
                return (
                  <button
                    key={opt.value}
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => update({ textSize: opt.value })}
                    className={`px-3.5 py-2 rounded-[var(--radius-md)] text-[13px] font-semibold transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-[var(--color-accent)] text-[var(--color-bg)] border-[var(--color-accent)] shadow-[var(--shadow-sm)]'
                        : 'bg-transparent text-[var(--color-text)] border-[var(--color-divider)] hover:border-[var(--color-accent)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Typography Spacing */}
          <div className="space-y-2">
            <label className="block text-[14.5px] font-semibold text-[var(--color-text)]">
              Line & Letter Spacing
            </label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Spacing scale">
              {[
                { value: 'normal', label: 'Standard' },
                { value: 'relaxed', label: 'Relaxed (+0.035em)' },
                { value: 'spacious', label: 'Spacious (+0.06em, 2.0 Line Height)' }
              ].map((opt) => {
                const isSelected = (prefs.spacing || 'normal') === opt.value;
                return (
                  <button
                    key={opt.value}
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => update({ spacing: opt.value })}
                    className={`px-3.5 py-2 rounded-[var(--radius-md)] text-[13px] font-semibold transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-[var(--color-accent)] text-[var(--color-bg)] border-[var(--color-accent)] shadow-[var(--shadow-sm)]'
                        : 'bg-transparent text-[var(--color-text)] border-[var(--color-divider)] hover:border-[var(--color-accent)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tracking aids — honestly framed. See the note below. */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-4 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-divider)]">
              <div className="min-w-0">
                <span className="block text-[14px] font-bold text-[var(--color-text)]">
                  Bionic fixation bolding
                </span>
                <span className="block text-[12px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
                  Bolds the first letters of each word. Some people find it helps them track a
                  line; the evidence that it improves comprehension is weak. Try it and keep it
                  only if it genuinely helps you.
                </span>
              </div>
              <input
                type="checkbox"
                checked={prefs.bionicReading !== false}
                onChange={(e) => update({ bionicReading: e.target.checked })}
                aria-label="Bionic fixation bolding"
                className="h-5 w-5 shrink-0 rounded accent-[var(--color-accent)] cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between gap-4 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-divider)]">
              <div className="min-w-0">
                <span className="block text-[14px] font-bold text-[var(--color-text)]">
                  Reading ruler
                </span>
                <span className="block text-[12px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
                  Highlights the line you are on and dims the rest. Toggle any time with Alt+H.
                </span>
              </div>
              <input
                type="checkbox"
                checked={Boolean(prefs.readingRuler)}
                onChange={(e) => update({ readingRuler: e.target.checked })}
                aria-label="Reading ruler"
                className="h-5 w-5 shrink-0 rounded accent-[var(--color-accent)] cursor-pointer"
              />
            </div>

            <p className="p-3 rounded-[var(--radius-md)] border border-dashed border-[var(--color-divider)] text-[12.5px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_68%,transparent)]">
              <strong className="text-[var(--color-text)]">A note on fonts and bolding.</strong>{' '}
              Dyslexia is a difficulty with decoding and comprehension, not with eyesight — so
              bigger text and bolded word-starts help far less than people expect. The settings
              above are comfort options. The tools that actually move comprehension are in the
              next section.
            </p>
          </div>
        </section>

        {/* Comprehension support — the things that actually address decoding */}
        <section className="space-y-4 pt-4 border-t border-[var(--color-divider)]">
          <div>
            <span className="kicker block">Comprehension Support</span>
            <p className="mt-1 text-[13px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_68%,transparent)]">
              Audio and diagrams carry meaning without asking you to decode text first. These are
              the primary accommodations in SETU.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-divider)]">
            <div className="min-w-0">
              <span className="block text-[14px] font-bold text-[var(--color-text)]">
                Speak mind map branches on hover
              </span>
              <span className="block text-[12px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
                Pointing at or tabbing to a branch reads it aloud. A diagram whose labels are
                silent is still a reading task — this is what makes the map usable.
              </span>
            </div>
            <input
              type="checkbox"
              checked={prefs.speakOnHover !== false}
              onChange={(e) => update({ speakOnHover: e.target.checked })}
              aria-label="Speak mind map branches on hover"
              className="h-5 w-5 shrink-0 rounded accent-[var(--color-accent)] cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between gap-4 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-divider)]">
            <div className="min-w-0">
              <span className="block text-[14px] font-bold text-[var(--color-text)]">
                Picture mode on mind maps
              </span>
              <span className="block text-[12px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
                Strips the supporting sentences so the map reads as shape and colour. The detail
                moves to the voice instead of the page.
              </span>
            </div>
            <input
              type="checkbox"
              checked={Boolean(prefs.pictureMode)}
              onChange={(e) => update({ pictureMode: e.target.checked })}
              aria-label="Picture mode on mind maps"
              className="h-5 w-5 shrink-0 rounded accent-[var(--color-accent)] cursor-pointer"
            />
          </div>

          {/* Language. Deliberately above the voice picker, because it changes
              what SETU says as well as how it sounds. */}
          <div className="space-y-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-divider)]">
            <div>
              <span className="block text-[14px] font-bold text-[var(--color-text)]">
                Conversation language
              </span>
              <span className="block text-[12px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_62%,transparent)]">
                Mind maps, mode results, the listener, and the reading voice all switch together.
                Pick one to hear it straight away.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(speech?.languages || [{ code: 'en-IN', name: 'English', native: 'English' }]).map(
                (language) => {
                  const selected = (prefs.language || 'en-IN') === language.code;
                  return (
                    <button
                      key={language.code}
                      onClick={() => chooseLanguage(language.code)}
                      aria-pressed={selected}
                      lang={langAttr(language.code)}
                      className={`rounded-[var(--radius-md)] border p-2.5 text-left transition-all ${
                        selected
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-100)] shadow-[var(--shadow-sm)]'
                          : 'border-[var(--color-divider)] bg-[var(--color-bg)] hover:border-[var(--color-accent)]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {auditioning === `lang_${language.code}` && (
                          <i className="ph-duotone ph-speaker-high animate-setu-breathe text-sm text-[var(--color-accent)]"></i>
                        )}
                        <span
                          className={`text-[15px] font-bold leading-tight ${
                            selected ? 'text-[var(--color-accent-900)]' : 'text-[var(--color-text)]'
                          }`}
                        >
                          {language.native}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[color-mix(in_srgb,var(--color-text)_58%,transparent)]">
                        {language.name}
                      </span>
                    </button>
                  );
                }
              )}
            </div>

            <p className="text-[11.5px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_55%,transparent)]">
              Buttons and menus stay in English for now — this changes what SETU writes and says,
              not the app's own labels.
            </p>
          </div>

          {/* Voice picker. The catalogue comes from the engine so it always
              matches the model actually configured server-side. */}
          <div className="space-y-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-divider)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="block text-[14px] font-bold text-[var(--color-text)]">
                Reading voice
              </span>
              {speech && (
                <span
                  className={`tag ${speech.enabled ? 'tag-accent' : 'tag-neutral'} text-[10.5px]`}
                >
                  {speech.enabled ? `Sarvam AI · ${speech.model}` : 'Browser voice'}
                </span>
              )}
            </div>

            {speech?.enabled ? (
              <>
                <p className="text-[12px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_62%,transparent)]">
                  Natural human voices. Pick one to hear it straight away — it is used everywhere
                  SETU reads to you.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(speech.voices || []).map((voice) => {
                    const selected = (prefs.voice || speech.defaultSpeaker) === voice.id;
                    return (
                      <button
                        key={voice.id}
                        onClick={() => chooseVoice(voice.id)}
                        aria-pressed={selected}
                        className={`rounded-[var(--radius-md)] border p-2.5 text-left transition-all ${
                          selected
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent-100)] shadow-[var(--shadow-sm)]'
                            : 'border-[var(--color-divider)] bg-[var(--color-bg)] hover:border-[var(--color-accent)]'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <i
                            className={`ph-duotone ${
                              auditioning === voice.id
                                ? 'ph-speaker-high animate-setu-breathe'
                                : 'ph-play-circle'
                            } text-base text-[var(--color-accent)]`}
                          ></i>
                          <span
                            className={`text-[13.5px] font-bold ${
                              selected ? 'text-[var(--color-accent-900)]' : 'text-[var(--color-text)]'
                            }`}
                          >
                            {voice.label}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-[color-mix(in_srgb,var(--color-text)_58%,transparent)]">
                          {voice.note}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-[12px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_62%,transparent)]">
                Using your browser's built-in voice. For natural human speech, set{' '}
                <code className="bg-[var(--color-bg)] px-1">SARVAM_API_KEY</code> in the engine's{' '}
                <code className="bg-[var(--color-bg)] px-1">.env</code> and restart it.
              </p>
            )}

            <div className="space-y-1.5 border-t border-[var(--color-divider)] pt-3">
              <label className="block text-[13px] font-semibold text-[var(--color-text)]">
                Speaking pace
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 0.75, label: 'Slower' },
                  { value: 1, label: 'Normal' },
                  { value: 1.25, label: 'Brisk' },
                  { value: 1.5, label: 'Fast' }
                ].map((option) => {
                  const selected = (prefs.speechRate || 1) === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => changeSpeechRate(option.value)}
                      aria-pressed={selected}
                      className={`rounded-[var(--radius-md)] border px-3 py-1.5 text-[12.5px] font-semibold transition-all ${
                        selected
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-bg)]'
                          : 'border-[var(--color-divider)] text-[var(--color-text)] hover:border-[var(--color-accent)]'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
                <button
                  onClick={() => {
                    setAuditioning('sample');
                    tts
                      .speak(sampleFor(prefs.language), { onEnd: () => setAuditioning(null) })
                      .catch(() => setAuditioning(null));
                  }}
                  className="btn btn-ghost !min-h-[32px] text-[12.5px]"
                >
                  <i className="ph-duotone ph-speaker-high"></i>
                  Test voice
                </button>
              </div>
            </div>
          </div>

          {/* Microphone & Voice Input Test */}
          <div className="space-y-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-divider)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="block text-[14px] font-bold text-[var(--color-text)]">
                Microphone & Speech Input (STT)
              </span>
              <span className="tag tag-accent text-[10.5px]">
                {speech?.sttEnabled ? 'Sarvam Saaras · Live' : 'Web Speech STT'}
              </span>
            </div>
            <p className="text-[12px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_62%,transparent)]">
              Speak into your microphone to test speech recognition. Works across Mind Map Chat, Modes, Listen, and Search.
            </p>
            <div className="flex items-center gap-2.5">
              <VoiceInputButton
                onTranscript={(txt) => setSttTestTranscript(txt)}
                showLabel={true}
                label="Test Microphone"
                size="md"
              />
              {sttTestTranscript && (
                <button
                  type="button"
                  onClick={() => {
                    tts.speak(sttTestTranscript);
                  }}
                  className="btn btn-ghost !min-h-[34px] text-[12px] flex items-center gap-1.5"
                  title="Read back transcribed speech"
                >
                  <i className="ph-duotone ph-speaker-high"></i>
                  Read back
                </button>
              )}
            </div>
            {sttTestTranscript && (
              <div className="p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-bg)] border border-[var(--color-divider)] text-[13px] text-[var(--color-text)] animate-setu-rise">
                <span className="text-[11px] font-semibold text-[color-mix(in_srgb,var(--color-text)_55%,transparent)] block mb-1">
                  Transcribed Result:
                </span>
                “{sttTestTranscript}”
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-divider)]">
            <div className="min-w-0">
              <span className="block text-[14px] font-bold text-[var(--color-text)]">
                Points, streaks, and milestones
              </span>
              <span className="block text-[12px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
                Progress rewards for finishing things. Turn off if scoring makes the work feel
                like pressure — your progress keeps counting quietly either way.
              </span>
            </div>
            <input
              type="checkbox"
              checked={prefs.rewards !== false}
              onChange={(e) => update({ rewards: e.target.checked })}
              aria-label="Points, streaks, and milestones"
              className="h-5 w-5 shrink-0 rounded accent-[var(--color-accent)] cursor-pointer"
            />
          </div>
        </section>

        {/* 3. Fast Engine & Database Section */}
        <section className="space-y-4 pt-4 border-t border-[var(--color-divider)]">
          <span className="kicker block">AI Engine Speed & Database Persistence</span>

          <dl className="space-y-2.5 text-[14px]">
            <div className="flex justify-between py-1.5 border-b border-[var(--color-divider)]">
              <dt className="text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">Status</dt>
              <dd className="font-semibold text-right">
                {health ? (
                  <span className="text-[var(--color-accent-700)]">
                    Connected · {health.product || 'SETU Engine'} v{health.version}
                  </span>
                ) : (
                  <span className="text-[var(--color-accent-2-700)]">
                    Offline — run <code className="px-1 bg-[var(--color-surface)]">npm start</code> in /backend
                  </span>
                )}
              </dd>
            </div>

            <div className="flex justify-between py-1.5 border-b border-[var(--color-divider)]">
              <dt className="text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">Database Persistence</dt>
              <dd className="font-semibold text-right">
                <span className="text-[var(--color-accent-700)]">
                  MongoDB {health?.database?.connected ? '(Connected & Synced)' : '(Local Storage Fallback)'}
                </span>
              </dd>
            </div>

            <div className="flex justify-between py-1.5 border-b border-[var(--color-divider)]">
              <dt className="text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">Active Fast Model Chain</dt>
              <dd className="font-semibold text-right">
                {health?.aiConfigured ? (
                  // Read from the health payload rather than hard-coded: the chain is
                  // configurable and Google retires model IDs on its own schedule, so a
                  // list written into this file goes stale silently and misreports what
                  // is actually answering.
                  <span className="text-[var(--color-accent-700)]">
                    Google Gemini · {health?.aiEngine?.model || 'resolving…'}
                    {health?.aiEngine?.fallbackChain?.length > 1
                      ? ` (+${health.aiEngine.fallbackChain.length - 1} fallback)`
                      : ''}
                  </span>
                ) : (
                  <span className="text-[#edbb00]">
                    {health?.aiEngine?.setupHint || 'Set GEMINI_API_KEY in .env'}
                  </span>
                )}
              </dd>
            </div>

            {health?.ai && (
              <div className="flex justify-between py-1.5 border-b border-[var(--color-divider)]">
                <dt className="text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">Latency Test</dt>
                <dd className="font-semibold text-right">
                  {health.ai.ok ? (
                    <span className="text-[var(--color-accent-700)]">
                      Ultra-Fast Response · {health.ai.provider} ({health.ai.model})
                    </span>
                  ) : (
                    <span className="text-[var(--color-accent-2-700)]">{health.ai.reason}</span>
                  )}
                </dd>
              </div>
            )}
          </dl>

          <button
            onClick={deepCheck}
            disabled={checking}
            className="btn btn-secondary !min-h-[34px] text-[13px]"
          >
            {checking ? 'Testing round-trip latency…' : 'Test AI Round-Trip Latency'}
          </button>
        </section>

        {/* 4. Your Data Section */}
        <section className="space-y-3 pt-4 border-t border-[var(--color-divider)]">
          <span className="kicker kicker-magenta block">Storage & Data Management</span>
          <p className="text-[14.5px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_75%,transparent)]">
            {mapsCount} mind map{mapsCount === 1 ? '' : 's'} and all uploaded files stored securely.
          </p>

          <div className="flex items-center justify-between gap-3 p-2.5 bg-[var(--color-surface)] rounded-[var(--radius-sm)] text-[12.5px]">
            <span className="text-[color-mix(in_srgb,var(--color-text)_65%,transparent)]">
              Client Anonymous ID
            </span>
            <code className="font-mono text-[11.5px] text-[var(--color-text)]">{userId}</code>
          </div>

          {notice && (
            <p
              role="status"
              className="p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-accent-100)] border border-[var(--color-accent-300)] text-[13px] text-[var(--color-accent-900)]"
            >
              {notice}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button onClick={handleRestoreSeeds} className="btn btn-secondary !min-h-[36px] text-[13px]">
              <i className="ph-duotone ph-arrow-counter-clockwise"></i>
              Restore reference library
            </button>
            <button onClick={handleDeleteAll} className="btn btn-destructive !min-h-[36px] text-[13px]">
              Delete all saved maps
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
