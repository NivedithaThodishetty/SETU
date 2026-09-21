import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BionicText } from '../lib/bionic';
import { tts } from '../lib/tts';
import { api } from '../lib/api';
import { getPrefs } from '../lib/storage';
import VoiceInputButton from './VoiceInputButton';
import { useDialog } from '../lib/useDialog';

export default function DocumentViewerModal({
  isOpen,
  onClose,
  documentId,
  initialDocument = null,
  onMindMapGenerated
}) {
  const [doc, setDoc] = useState(initialDocument);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [bionicEnabled, setBionicEnabled] = useState(() => getPrefs().bionicReading === true);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsRate, setTtsRate] = useState(1.0);
  const [fontSize, setFontSize] = useState('base'); // 'sm' | 'base' | 'lg' | 'xl'
  const [copySuccess, setCopySuccess] = useState(false);
  const [generatingMap, setGeneratingMap] = useState(false);

  const navigate = useNavigate();
  const readerRef = useRef(null);

  // Load document if only documentId is passed
  useEffect(() => {
    if (!isOpen) {
      tts.stop();
      return;
    }

    if (initialDocument) {
      setDoc(initialDocument);
    } else if (documentId) {
      setLoading(true);
      setError(null);
      api
        .getFile(documentId)
        .then((res) => {
          if (res?.document) {
            setDoc(res.document);
          } else {
            setError('Could not retrieve document from database.');
          }
        })
        .catch((err) => setError(err.message || 'Error loading document.'))
        .finally(() => setLoading(false));
    }
  }, [isOpen, documentId, initialDocument]);

  /**
   * Escape closes the reader.
   *
   * This is the one modal in the app that opens over a long read, so it is also
   * the one a user is most likely to want out of quickly — and it was the only
   * dialog with no keyboard exit at all.
   */
  useDialog({ isOpen, onClose, containerRef: readerRef });

  // Subscribe to TTS changes
  useEffect(() => {
    const unsubscribe = tts.subscribe((state) => {
      setTtsPlaying(state.isPlaying && !state.isPaused);
    });
    return () => {
      unsubscribe();
      tts.stop();
    };
  }, []);

  if (!isOpen) return null;

  const handleToggleTts = () => {
    if (ttsPlaying) {
      tts.stop();
    } else {
      const textToSpeak = doc?.extractedText || doc?.summary || '';
      tts.setRate(ttsRate);
      tts.speak(textToSpeak, {
        onEnd: () => setTtsPlaying(false)
      });
    }
  };

  const handleRateChange = (newRate) => {
    setTtsRate(newRate);
    tts.setRate(newRate);
    if (ttsPlaying) {
      tts.stop();
      tts.speak(doc?.extractedText || doc?.summary || '');
    }
  };

  const handleGenerateMindMap = async () => {
    if (!doc || generatingMap) return;
    setGeneratingMap(true);
    setError(null);
    try {
      const freshMap = await api.mindMapFromFile(doc.id);
      if (freshMap) {
        onMindMapGenerated?.(freshMap);
        onClose();
        navigate(`/mindmap?doc=${encodeURIComponent(doc.id)}`);
      }
    } catch (err) {
      setError(err.message || 'Could not build mind map from this file.');
    } finally {
      setGeneratingMap(false);
    }
  };

  const handleCopyText = () => {
    if (!doc?.extractedText) return;
    navigator.clipboard.writeText(doc.extractedText).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    });
  };

  const handleDownload = () => {
    if (!doc?.extractedText) return;
    const blob = new Blob([doc.extractedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${doc.originalName || 'document'}_extracted.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const sections = doc?.structuredSections?.length
    ? doc.structuredSections
    : [{ heading: 'Full Content', content: doc?.extractedText || '', page: 1 }];

  // Estimated reading time in minutes
  const readingTimeMin = Math.max(1, Math.ceil((doc?.charCount || 0) / 1000));

  const fontSizeClasses = {
    sm: 'text-[13.5px] leading-relaxed',
    base: 'text-[15.5px] leading-[1.75]',
    lg: 'text-[17.5px] leading-[1.85]',
    xl: 'text-[19.5px] leading-[2.0]'
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[rgba(20,18,17,0.7)] backdrop-blur-sm animate-setu-rise"
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-viewer-title"
    >
      <div className="w-full max-w-5xl h-[92vh] max-h-[950px] rounded-[var(--radius-lg)] bg-[var(--color-bg)] border border-[var(--color-divider)] shadow-2xl flex flex-col overflow-hidden text-left">
        {/* Top Header Bar */}
        <header className="px-5 py-3.5 bg-[var(--color-surface)] border-b border-[var(--color-divider)] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] bg-[var(--color-accent-100)] text-[var(--color-accent)] text-lg shrink-0">
              <i
                className={`ph-duotone ${
                  doc?.mimeType?.includes('pdf')
                    ? 'ph-file-pdf text-[var(--color-accent-2)]'
                    : doc?.mimeType?.includes('word') || doc?.originalName?.endsWith('.docx')
                      ? 'ph-file-doc text-[var(--color-accent)]'
                      : 'ph-file-text'
                }`}
              ></i>
            </div>
            <div className="min-w-0">
              <h2
                id="doc-viewer-title"
                className="text-[17px] font-bold text-[var(--color-text)] truncate leading-tight"
              >
                {doc?.originalName || 'Document Viewer'}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)] mt-0.5">
                <span>{doc?.pageCount || 1} pages</span>
                <span>·</span>
                <span>~{doc?.tokenCount || 0} tokens</span>
                <span>·</span>
                <span>~{readingTimeMin} min read</span>
                <span>·</span>
                <span>{Math.round((doc?.size || 0) / 1024)} KB</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                onClose();
                navigate(`/mindmap?doc=${encodeURIComponent(doc?.id)}`);
              }}
              className="btn btn-primary !min-h-[32px] !px-3 text-xs font-semibold"
              title="Chat with this document"
            >
              <i className="ph-duotone ph-chats-circle"></i>
              <span className="hidden sm:inline">Ask Copilot</span>
            </button>

            <button
              onClick={handleGenerateMindMap}
              disabled={generatingMap}
              className="btn btn-secondary !min-h-[32px] !px-3 text-xs font-semibold"
              title="Build interactive mind map"
            >
              {generatingMap ? (
                <>
                  <i className="ph-duotone ph-spinner animate-spin"></i>
                  <span>Mapping…</span>
                </>
              ) : (
                <>
                  <i className="ph-duotone ph-graph"></i>
                  <span className="hidden sm:inline">Build Map</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="btn btn-quiet !min-h-[32px] !px-2 text-base text-[var(--color-text)]"
              aria-label="Close document viewer"
            >
              <i className="ph-duotone ph-x"></i>
            </button>
          </div>
        </header>

        {/* Accessibility & Reader Toolbar */}
        <div className="px-5 py-2.5 bg-[var(--color-bg)] border-b border-[var(--color-divider)] flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          {/* Left: Audio & Bionic Reading Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Audio TTS Button */}
            <button
              onClick={handleToggleTts}
              className={`btn !min-h-[30px] !px-2.5 text-xs font-semibold ${
                ttsPlaying ? 'btn-primary' : 'btn-ghost'
              }`}
              title={ttsPlaying ? 'Pause Audio Reading' : 'Listen to Document Aloud (TTS)'}
            >
              <i
                className={`ph-duotone ${ttsPlaying ? 'ph-pause-circle text-base' : 'ph-speaker-high text-base'}`}
              ></i>
              <span>{ttsPlaying ? 'Pause Audio' : 'Listen Aloud'}</span>
            </button>

            {/* TTS Speed selector */}
            <div className="flex items-center gap-1 bg-[var(--color-surface)] px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--color-divider)]">
              <span className="text-[10.5px] font-semibold text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
                Speed:
              </span>
              {[0.75, 1.0, 1.25, 1.5].map((rate) => (
                <button
                  key={rate}
                  onClick={() => handleRateChange(rate)}
                  className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold ${
                    ttsRate === rate
                      ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                      : 'text-[var(--color-text)] hover:bg-[color-mix(in_srgb,var(--color-bg)_80%,transparent)]'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            {/* Bionic Reading Toggle */}
            <button
              onClick={() => setBionicEnabled((prev) => !prev)}
              className={`btn !min-h-[30px] !px-2.5 text-xs font-semibold ${
                bionicEnabled
                  ? 'bg-[var(--color-accent-100)] text-[var(--color-accent-900)] border border-[var(--color-accent-300)]'
                  : 'btn-ghost'
              }`}
              title="Toggle Bionic Fixation Anchor Highlighting for Dyslexia/ADHD"
            >
              <i className="ph-duotone ph-eye text-base"></i>
              <span>
                Bionic Reading: <strong>{bionicEnabled ? 'ON' : 'OFF'}</strong>
              </span>
            </button>
          </div>

          {/* Right: Text Size, Search & Copy */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Font Size controls */}
            <div className="flex items-center gap-1 bg-[var(--color-surface)] px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--color-divider)]">
              <span className="text-[10.5px] font-semibold text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
                Size:
              </span>
              {[
                { label: 'A-', val: 'sm' },
                { label: 'A', val: 'base' },
                { label: 'A+', val: 'lg' },
                { label: 'A++', val: 'xl' }
              ].map((s) => (
                <button
                  key={s.val}
                  onClick={() => setFontSize(s.val)}
                  className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold ${
                    fontSize === s.val
                      ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                      : 'text-[var(--color-text)]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Search in document */}
            <div className="flex items-center gap-1">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Find in file (or speak)…"
                  className="input text-[12px] !min-h-[28px] !py-0.5 !pl-7 !pr-2 w-32 sm:w-44"
                />
                <i className="ph-duotone ph-magnifying-glass absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[color-mix(in_srgb,var(--color-text)_50%,transparent)]"></i>
              </div>
              <VoiceInputButton
                onTranscript={(txt) => setSearchQuery(txt)}
                size="sm"
                title="Voice search in document"
              />
            </div>

            {/* Copy / Export */}
            <button
              onClick={handleCopyText}
              className="btn btn-ghost !min-h-[30px] !px-2.5 text-xs"
              title="Copy extracted text"
            >
              <i className={`ph-duotone ${copySuccess ? 'ph-check text-green-600' : 'ph-copy'}`}></i>
              <span className="hidden md:inline">{copySuccess ? 'Copied!' : 'Copy'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="btn btn-ghost !min-h-[30px] !px-2.5 text-xs"
              title="Download text file"
            >
              <i className="ph-duotone ph-download-simple"></i>
              <span className="hidden md:inline">Export</span>
            </button>
          </div>
        </div>

        {/* Main Content Body */}
        <div className="flex-1 flex overflow-hidden min-h-0 bg-[var(--color-bg)]">
          {/* Left TOC / Section Navigator (240px) */}
          <aside className="w-60 border-r border-[var(--color-divider)] bg-[var(--color-surface)] p-4 overflow-y-auto hidden md:flex flex-col gap-3 shrink-0">
            <span className="kicker text-[10px]">Table of Contents</span>
            <nav className="space-y-1" aria-label="Document Sections">
              {sections.map((sec, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setActiveSectionIndex(idx);
                    const el = document.getElementById(`section-chunk-${idx}`);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`w-full text-left p-2 rounded-[var(--radius-sm)] text-xs transition-colors flex items-start gap-2 border-0 cursor-pointer ${
                    activeSectionIndex === idx
                      ? 'bg-[var(--color-bg)] font-bold text-[var(--color-accent-700)] shadow-[var(--shadow-sm)]'
                      : 'bg-transparent text-[color-mix(in_srgb,var(--color-text)_75%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-bg)_60%,transparent)]'
                  }`}
                >
                  <span className="text-[10px] font-mono text-[color-mix(in_srgb,var(--color-text)_45%,transparent)] shrink-0 mt-0.5">
                    #{idx + 1}
                  </span>
                  <span className="truncate">{sec.heading || `Section ${idx + 1}`}</span>
                </button>
              ))}
            </nav>

            {doc?.keyPoints?.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[var(--color-divider)] space-y-2">
                <span className="kicker text-[10px]">Key Takeaways</span>
                <ul className="text-[11.5px] text-[color-mix(in_srgb,var(--color-text)_80%,transparent)] space-y-1.5 pl-3 list-disc">
                  {doc.keyPoints.slice(0, 5).map((pt, idx) => (
                    <li key={idx} className="leading-snug">
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>

          {/* Right Reader Area */}
          <main
            ref={readerRef}
            className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-6 text-left max-w-4xl"
          >
            {loading ? (
              <div className="p-12 text-center space-y-3">
                <i className="ph-duotone ph-spinner animate-spin text-3xl text-[var(--color-accent)]"></i>
                <p className="text-sm font-semibold text-[var(--color-text)]">
                  Loading document from database…
                </p>
              </div>
            ) : error ? (
              <div className="p-4 rounded-[var(--radius-md)] bg-[var(--color-accent-2-100)] border border-[var(--color-accent-2)] text-xs text-[var(--color-accent-2-900)]">
                {error}
              </div>
            ) : (
              <>
                {/* Executive Summary Card */}
                {doc?.summary && (
                  <section className="p-5 rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-accent-300)] shadow-sm space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="kicker text-[10.5px]">Executive Summary</span>
                      <span className="tag tag-accent text-[10px]">Plain Language Overview</span>
                    </div>
                    <p className="text-[15px] leading-relaxed italic text-[var(--color-text)]">
                      <BionicText text={doc.summary} enabled={bionicEnabled} />
                    </p>
                  </section>
                )}

                {/* Section Content Chunks */}
                <div className="space-y-8 pt-2">
                  {sections.map((section, idx) => (
                    <article
                      key={idx}
                      id={`section-chunk-${idx}`}
                      className="space-y-2.5 pb-6 border-b border-[var(--color-divider)] last:border-0"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-bold text-[var(--color-text)] font-[var(--font-heading)]">
                          {section.heading || `Section ${idx + 1}`}
                        </h3>
                        {section.page && (
                          <span className="tag tag-neutral text-[10px]">Page {section.page}</span>
                        )}
                      </div>

                      <div
                        className={`${fontSizeClasses[fontSize]} text-[var(--color-text)] whitespace-pre-wrap`}
                      >
                        <BionicText text={section.content} enabled={bionicEnabled} />
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </main>
        </div>

        {/* Footer Action Bar */}
        <footer className="px-5 py-3 bg-[var(--color-surface)] border-t border-[var(--color-divider)] flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
            <i className="ph-duotone ph-shield-check text-base text-[var(--color-accent)]"></i>
            <span>Stored securely in database · Ready for all cognitive modes</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                navigate(`/modes?mode=simplify`);
              }}
              className="btn btn-ghost !min-h-[28px] !px-2.5 text-xs"
            >
              Simplify in Modes
            </button>
            <button
              onClick={() => {
                onClose();
                navigate(`/modes?mode=learn`);
              }}
              className="btn btn-ghost !min-h-[28px] !px-2.5 text-xs"
            >
              Quiz & Flashcards
            </button>
            <button onClick={onClose} className="btn btn-primary !min-h-[28px] !px-3 text-xs">
              Done Reading
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
