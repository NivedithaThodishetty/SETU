import { useState, useEffect, useRef } from 'react';
import VoiceInputButton from './VoiceInputButton';
import { useDialog } from '../lib/useDialog';
import { COLOR_PALETTES } from '../lib/layout';

const COMMON_EMOJIS = ['💡', '🧠', '🔬', '📊', '⚡', '🎯', '📚', '🚀', '🛠️', '✨', '⚠️', '🔍', '🌿', '💎'];

export default function NodeEditorModal({
  isOpen,
  mode = 'edit', // 'edit' | 'add'
  node = null,
  parentNode = null,
  paletteKey = 'broadsheet',
  onClose,
  onSave,
  onDelete
}) {
  const [label, setLabel] = useState('');
  const [detail, setDetail] = useState('');
  const [emoji, setEmoji] = useState(null);
  const [customColor, setCustomColor] = useState(null);
  const dialogRef = useRef(null);

  // Above the `if (!isOpen)` early return below: hooks cannot be called
  // conditionally, and the hook handles the closed state itself.
  useDialog({ isOpen, onClose, containerRef: dialogRef });

  const colors = (COLOR_PALETTES[paletteKey] || COLOR_PALETTES.broadsheet).colors;

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && node) {
        setLabel(node.label || '');
        setDetail(node.detail || '');
        setEmoji(node.emoji || null);
        setCustomColor(node.customColor || null);
      } else {
        setLabel('');
        setDetail('');
        setEmoji(null);
        setCustomColor(null);
      }
    }
  }, [isOpen, mode, node]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!label.trim()) return;

    onSave?.({
      id: node?.id,
      label: label.trim(),
      detail: detail.trim(),
      emoji,
      customColor
    });
    onClose?.();
  };

  const isAdding = mode === 'add';

  return (
    <div
      className="dialog-backdrop items-center justify-center p-4 z-50 animate-setu-rise"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="node-editor-title"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="dialog w-full max-w-lg p-0 overflow-hidden shadow-2xl border border-[var(--color-divider)] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-divider)] bg-[var(--color-surface)]">
          <div className="flex items-center gap-2">
            <i
              className={`ph-duotone ${
                isAdding ? 'ph-tree-structure text-[var(--color-accent)]' : 'ph-note-pencil text-[var(--color-accent)]'
              } text-xl`}
            ></i>
            <h2 id="node-editor-title" className="text-[17px] font-bold text-[var(--color-text)]">
              {isAdding
                ? `Add branch to “${parentNode?.label || 'Parent'}”`
                : `Edit Topic: “${node?.label || ''}”`}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost !min-h-[28px] !w-7 !p-0 rounded-full text-base"
            aria-label="Close"
          >
            <i className="ph-duotone ph-x"></i>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 bg-[var(--color-bg)] text-left">
          {/* Label Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="node-label" className="kicker block">
                Branch Label / Concept Name
              </label>
              <VoiceInputButton
                onTranscript={(txt) => setLabel(txt)}
                size="sm"
                title="Speak branch name"
              />
            </div>
            <input
              id="node-label"
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Cognitive Ergonomics, Next Steps, Memory Anchor…"
              className="input text-[14px]"
              autoFocus
            />
          </div>

          {/* Detail / Explanation Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="node-detail" className="kicker block">
                Supporting Detail & Notes (Optional)
              </label>
              <VoiceInputButton
                onTranscript={(txt) => setDetail((prev) => (prev ? `${prev} ${txt}` : txt))}
                size="sm"
                title="Speak detail notes"
              />
            </div>
            <textarea
              id="node-detail"
              rows={3}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Add key takeaways, definitions, citations, or instructions (will be read aloud by Sarvam AI TTS)…"
              className="textarea text-[13.5px]"
            />
          </div>

          {/* Emoji Badge Picker */}
          <div className="space-y-1.5">
            <span className="kicker block">Icon / Emoji Marker</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setEmoji(null)}
                className={`px-2 py-1 rounded-[var(--radius-sm)] text-[12px] border transition-all ${
                  !emoji
                    ? 'bg-[var(--color-accent-100)] text-[var(--color-accent-900)] border-[var(--color-accent-300)] font-bold'
                    : 'bg-[var(--color-surface)] border-[var(--color-divider)] text-[var(--color-text)]'
                }`}
              >
                None
              </button>
              {COMMON_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setEmoji(em)}
                  className={`w-7 h-7 rounded-[var(--radius-sm)] text-base flex items-center justify-center border transition-all cursor-pointer ${
                    emoji === em
                      ? 'bg-[var(--color-accent-100)] border-[var(--color-accent)] scale-110 shadow-xs'
                      : 'bg-[var(--color-surface)] border-[var(--color-divider)] hover:scale-105'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          {/* Color Accent Picker */}
          <div className="space-y-1.5">
            <span className="kicker block">Custom Color Accent</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCustomColor(null)}
                className={`px-2 py-1 rounded-[var(--radius-sm)] text-[12px] border transition-all ${
                  !customColor
                    ? 'bg-[var(--color-accent-100)] text-[var(--color-accent-900)] border-[var(--color-accent-300)] font-bold'
                    : 'bg-[var(--color-surface)] border-[var(--color-divider)] text-[var(--color-text)]'
                }`}
              >
                Default Palette
              </button>
              {colors.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCustomColor(c)}
                  className={`w-6 h-6 rounded-full border border-black/20 transition-all cursor-pointer ${
                    customColor === c ? 'scale-125 ring-2 ring-[var(--color-text)] ring-offset-1' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-[var(--color-divider)]">
            {!isAdding && onDelete && node?.depth > 0 ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete “${node.label}” and all its child branches?`)) {
                    onDelete(node.id);
                    onClose();
                  }
                }}
                className="btn btn-destructive !min-h-[34px] !px-3 text-xs flex items-center gap-1.5"
              >
                <i className="ph-duotone ph-trash"></i>
                Delete Branch
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-ghost !min-h-[34px] text-xs px-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!label.trim()}
                className="btn btn-primary !min-h-[34px] text-xs px-4 font-semibold flex items-center gap-1.5"
              >
                <i className="ph-duotone ph-check"></i>
                {isAdding ? 'Add Branch' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
