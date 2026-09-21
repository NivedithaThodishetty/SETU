import { useEffect, useRef, useState } from 'react';
import { useDialog } from '../lib/useDialog';
import { useNavigate } from 'react-router-dom';
import { savePrefs, listMaps } from '../lib/storage';
import { exportMindMapToPDF } from '../lib/exportUtils';
import { MODES } from '../lib/modeCatalog';
import VoiceInputButton from './VoiceInputButton';

export default function CommandPalette({ isOpen, onClose, onStartFocus }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [notice, setNotice] = useState(null);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setNotice(null);
    }
  }, [isOpen]);

  /*
   * The palette had no dialog role and no trap at all — it was the one dialog
   * the audit counted correctly. `initialFocusRef` points at the search field,
   * which is also what the old `setTimeout(..., 50)` was reaching for; the hook
   * waits a frame for mount instead of guessing at a delay.
   */
  useDialog({
    isOpen,
    onClose,
    containerRef: dialogRef,
    initialFocusRef: inputRef
  });

  /**
   * Export the most recently updated map. The palette is global and has no map
   * of its own, so it reads the library rather than depending on which page is
   * currently mounted.
   */
  const exportLatestMap = () => {
    const latest = listMaps()[0];
    if (!latest) {
      setNotice('No maps saved yet — research a topic first.');
      return false;
    }
    exportMindMapToPDF(latest).catch((err) => {
      console.error('[CommandPalette] PDF export failed:', err);
      setNotice('PDF export failed. Please try again.');
    });
    return true;
  };

  const COMMANDS = [
    // Go Group
    {
      id: 'go-mindmap',
      group: 'Go',
      icon: 'ph-graph',
      label: 'Mind Map',
      hint: 'Ask anything, get an interactive map',
      run: () => navigate('/mindmap')
    },
    {
      id: 'go-library',
      group: 'Go',
      icon: 'ph-books',
      label: 'Library',
      hint: 'Explore all your saved maps',
      run: () => navigate('/library')
    },
    {
      id: 'go-modes',
      group: 'Go',
      icon: 'ph-squares-four',
      label: 'Cognitive Modes',
      hint: 'Eight cognitive disability tools',
      run: () => navigate('/modes')
    },
    {
      id: 'go-listen',
      group: 'Go',
      icon: 'ph-heart',
      label: 'Listen',
      hint: 'Somewhere to put the frustration before the next task',
      run: () => navigate('/listen')
    },
    {
      id: 'go-momentum',
      group: 'Go',
      icon: 'ph-medal',
      label: 'Momentum',
      hint: 'Points, streak, and milestones',
      run: () => navigate('/momentum')
    },
    {
      id: 'go-settings',
      group: 'Go',
      icon: 'ph-gear',
      label: 'Settings',
      hint: 'Adjust reading typography and preferences',
      run: () => navigate('/settings')
    },

    // Do Group
    {
      id: 'do-focus',
      group: 'Do',
      icon: 'ph-timer',
      label: 'Start a focus session',
      hint: '25-minute calm timer with gentle break',
      run: () => onStartFocus?.()
    },
    /*
      Every mode, generated from the catalogue.

      Three of the eight used to be hand-listed here, which meant Numbers — the
      dyscalculia tool, and the hardest one to stumble across — was unreachable
      from the palette entirely. Generating them keeps the list honest when a
      mode is added or renamed.
    */
    ...MODES.map((mode) => ({
      id: `do-${mode.key}`,
      group: 'Do',
      icon: mode.icon,
      label: `${mode.verb} · ${mode.name}`,
      hint: mode.blurb,
      run: () => navigate(`/modes?mode=${mode.key}`)
    })),
    {
      id: 'do-upload',
      group: 'Do',
      icon: 'ph-file-arrow-up',
      label: 'Upload a document or source file',
      hint: 'PDF, Word, TXT, or notes for mind maps and Q&A',
      run: () => navigate('/library')
    },
    {
      id: 'do-export',
      group: 'Do',
      icon: 'ph-export',
      label: 'Export your latest map as a PDF',
      hint: 'Summary, key takeaways, full hierarchy, and sources',
      run: exportLatestMap
    },

    // Reading Group
    {
      id: 'read-hyper',
      group: 'Reading',
      icon: 'ph-text-aa',
      label: 'Switch to Atkinson Hyperlegible',
      hint: 'High-distinction letterforms for dyslexic readers',
      run: () => savePrefs({ font: 'hyper' })
    },
    {
      id: 'read-serif',
      group: 'Reading',
      icon: 'ph-article',
      label: 'Switch to Source Serif 4',
      hint: 'The default Broadsheet reading serif',
      run: () => savePrefs({ font: 'serif' })
    },
    {
      id: 'read-system',
      group: 'Reading',
      icon: 'ph-browsers',
      label: 'Switch to System sans',
      hint: 'Clean standard system typography',
      run: () => savePrefs({ font: 'system' })
    },
    {
      id: 'read-size',
      group: 'Reading',
      icon: 'ph-magnifying-glass-plus',
      label: 'Set text size to Comfortable (1.1×)',
      hint: 'Larger, more relaxed line height',
      run: () => savePrefs({ textSize: 'comfortable' })
    },
    {
      id: 'read-still',
      group: 'Reading',
      icon: 'ph-pause-circle',
      label: 'Keep it still (Reduce motion)',
      hint: 'Disable all transitions and movement',
      run: () => savePrefs({ motion: 'still' })
    }
  ];

  const filtered = COMMANDS.filter((cmd) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      cmd.label.toLowerCase().includes(q) ||
      cmd.hint.toLowerCase().includes(q) ||
      cmd.group.toLowerCase().includes(q)
    );
  }).slice(0, 6);

  /** A command returning false keeps the palette open to show its notice. */
  const runCommand = (cmd) => {
    if (!cmd) return;
    if (cmd.run() !== false) onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runCommand(filtered[selectedIndex]);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="dialog-backdrop items-start pt-[14vh] px-4"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="dialog w-full max-w-[560px] p-0 shadow-lg border border-[var(--color-divider)] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search header */}
        <div className="flex items-center gap-2.5 border-b border-[var(--color-divider)] px-4 py-3 bg-[var(--color-bg)]">
          <i className="ph-duotone ph-magnifying-glass text-xl text-[var(--color-accent)] shrink-0"></i>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Do anything, navigate, or speak your search…"
            className="flex-1 bg-transparent border-0 text-[16px] text-[var(--color-text)] outline-none placeholder:text-[color-mix(in_srgb,var(--color-text)_45%,transparent)] font-[var(--font-body)]"
            aria-label="Command palette input"
          />
          <VoiceInputButton
            onTranscript={(txt) => {
              setQuery(txt);
              setSelectedIndex(0);
            }}
            size="sm"
            title="Voice search command"
          />
          <kbd className="rounded border border-[var(--color-divider)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[11px] font-mono font-semibold text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
            esc
          </kbd>
        </div>

        {notice && (
          <p
            role="status"
            className="px-4 py-2 bg-[var(--color-accent-100)] border-b border-[var(--color-accent-300)] text-[12.5px] text-[var(--color-accent-900)]"
          >
            {notice}
          </p>
        )}

        {/* Results list */}
        <div className="max-h-[340px] overflow-y-auto p-1.5 bg-[var(--color-bg)]" role="listbox">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13.5px] text-[color-mix(in_srgb,var(--color-text)_55%,transparent)]">
              No matching commands
            </div>
          ) : (
            filtered.map((cmd, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => runCommand(cmd)}
                  className={`flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] px-3.5 py-2.5 text-left transition-colors cursor-pointer border-0 ${
                    isSelected
                      ? 'bg-[var(--color-accent-100)] text-[var(--color-accent-900)]'
                      : 'bg-transparent text-[var(--color-text)] hover:bg-[var(--color-accent-100)]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <i
                      className={`ph-duotone ${cmd.icon} text-lg ${
                        isSelected ? 'text-[var(--color-accent-700)]' : 'text-[var(--color-accent)]'
                      }`}
                    ></i>
                    <div className="min-w-0">
                      <span className="block text-[14.5px] font-semibold leading-tight truncate">
                        {cmd.label}
                      </span>
                      <span
                        className={`block text-[12px] truncate ${
                          isSelected
                            ? 'text-[var(--color-accent-800)]'
                            : 'text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]'
                        }`}
                      >
                        {cmd.hint}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-[11px] font-semibold uppercase tracking-wider ${
                      isSelected
                        ? 'text-[var(--color-accent-700)]'
                        : 'text-[color-mix(in_srgb,var(--color-text)_45%,transparent)]'
                    }`}
                  >
                    {cmd.group}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
