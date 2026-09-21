import { useState, useRef, useEffect } from 'react';
import { api } from '../lib/api';
import { useDialog } from '../lib/useDialog';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = [
  'pdf', 'docx', 'txt', 'md', 'markdown', 'json', 'csv',
  'png', 'jpg', 'jpeg', 'webp', 'gif'
];

/**
 * @param {'full'|'text'} variant  'full' offers mind map + chat actions;
 *                                 'text' only hands the extracted text back.
 */
export default function FileUploadModal({
  isOpen,
  onClose,
  onMindMapGenerated,
  onFileAttached,
  conversationId = null,
  variant = 'full',
  attachLabel = 'Ask & Query this File'
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docResult, setDocResult] = useState(null);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const fileInputRef = useRef(null);
  const dialogRef = useRef(null);

  /*
   * Focus trap, Escape, focus restore and scroll lock.
   *
   * `closeOnEscape` is false while an upload is in flight, preserving the
   * previous behaviour: a stray Escape must not abandon a file the user has
   * already committed to sending.
   */
  useDialog({
    isOpen,
    onClose,
    containerRef: dialogRef,
    closeOnEscape: !uploading
  });

  // Reset transient state whenever the dialog is reopened.
  useEffect(() => {
    if (!isOpen) {
      setDocResult(null);
      setError(null);
      setStatusMessage('');
      setDragging(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const processFile = async (file) => {
    if (!file) return;

    // Validate before the round trip so the user gets an answer immediately.
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setError(
        `"${file.name}" is not a supported format. Use PDF, Word (.docx), Markdown, TXT, CSV, JSON, or an image.`
      );
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 25MB — try splitting it up.`
      );
      return;
    }
    if (file.size === 0) {
      setError(`"${file.name}" is empty.`);
      return;
    }

    setUploading(true);
    setError(null);
    setDocResult(null);
    setStatusMessage(`Uploading and extracting text from "${file.name}"…`);

    try {
      const doc = await api.uploadFile(file, conversationId);
      if (!doc) throw new Error('The engine returned no document.');
      setDocResult(doc);
      setStatusMessage('Document extracted and summarised successfully.');
    } catch (err) {
      setError(err.message || 'File processing failed. Check that the backend is running.');
    } finally {
      setUploading(false);
      // Allow re-selecting the same file after an error.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGenerateMindMap = async () => {
    if (!docResult) return;
    setUploading(true);
    setError(null);
    setStatusMessage(`Researching and mapping "${docResult.originalName}"… this takes a few seconds.`);

    try {
      const map = await api.mindMapFromFile(docResult.id);
      if (!map?.root) throw new Error('The engine returned a map with no branches.');
      onMindMapGenerated?.(map);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not generate a mind map from this file.');
    } finally {
      setUploading(false);
    }
  };

  const handleAttachAndChat = () => {
    if (!docResult) return;
    onFileAttached?.(docResult);
    onClose();
  };

  const handleReset = () => {
    setDocResult(null);
    setError(null);
    setStatusMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(32,30,29,0.55)] backdrop-blur-sm animate-setu-rise"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
      onClick={() => {
        if (!uploading) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-[var(--radius-lg)] bg-[var(--color-bg)] border border-[var(--color-divider)] shadow-2xl p-6 space-y-5 text-left max-h-[90vh] overflow-y-auto outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-divider)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[var(--color-accent-100)] text-[var(--color-accent)] text-lg">
              <i className="ph-duotone ph-file-arrow-up"></i>
            </div>
            <div>
              <h2 id="upload-modal-title" className="text-lg font-bold text-[var(--color-text)]">
                Upload your source file
              </h2>
              <p className="text-xs text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
                PDF, Word (.docx), Markdown, TXT, CSV, or Image notes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-quiet !min-h-[28px] !px-2"
            aria-label="Close modal"
          >
            <i className="ph-duotone ph-x text-lg"></i>
          </button>
        </div>

        {/* Dropzone (when no document uploaded yet) */}
        {!docResult && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-[var(--radius-lg)] p-8 text-center transition-all cursor-pointer ${
              dragging
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-100)] scale-[0.99]'
                : 'border-[var(--color-divider)] bg-[var(--color-surface)] hover:border-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-surface)_80%,var(--color-bg))]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              accept={ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
              className="hidden"
            />
            <div className="max-w-xs mx-auto space-y-3 pointer-events-none">
              <i className="ph-duotone ph-cloud-arrow-up text-4xl text-[var(--color-accent)]"></i>
              <div>
                <p className="text-sm font-bold text-[var(--color-text)]">
                  Click to browse or drop file here
                </p>
                <p className="text-xs text-[color-mix(in_srgb,var(--color-text)_60%,transparent)] mt-1">
                  Extracts text, builds mind maps, and allows natural Q&A over your files
                </p>
              </div>
              <span className="tag tag-neutral text-[11px] inline-block">Max 25MB</span>
            </div>
          </div>
        )}

        {/* Upload Status / Progress */}
        {uploading && (
          <div className="p-4 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-divider)] flex items-center gap-3 animate-setu-rise">
            <i className="ph-duotone ph-spinner animate-spin text-xl text-[var(--color-accent)]"></i>
            <p className="text-xs font-semibold text-[var(--color-text)]">{statusMessage}</p>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-accent-2-100)] border border-[var(--color-accent-2)] text-xs text-[var(--color-accent-2-900)]">
            {error}
          </div>
        )}

        {/* Extracted Document Summary & Action Options */}
        {docResult && !uploading && (
          <div className="space-y-4 animate-setu-rise">
            <div className="p-4 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-divider)] space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="kicker block text-[10px]">Processed document</span>
                  <h3 className="text-base font-bold text-[var(--color-text)]">
                    {docResult.originalName}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="tag tag-neutral text-[11px]">
                      {docResult.pageCount || 1} {docResult.pageCount === 1 ? 'page' : 'pages'}
                    </span>
                    <span className="tag tag-neutral text-[11px]">
                      {Math.round(docResult.size / 1024)} KB
                    </span>
                    <span className="tag tag-accent text-[11px]">
                      ~{docResult.tokenCount} tokens
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleReset}
                  className="btn btn-ghost !min-h-[26px] !px-2 text-xs"
                >
                  Upload another
                </button>
              </div>

              {docResult.summary && (
                <div className="pt-2 border-t border-[var(--color-divider)]">
                  <p className="text-xs italic text-[color-mix(in_srgb,var(--color-text)_80%,transparent)] leading-relaxed">
                    “{docResult.summary}”
                  </p>
                </div>
              )}

              {docResult.keyPoints?.length > 0 && (
                <div className="pt-2 border-t border-[var(--color-divider)] space-y-1">
                  <span className="kicker block text-[10px]">Key Takeaways</span>
                  <ul className="text-xs text-[var(--color-text)] space-y-1 pl-4 list-disc">
                    {docResult.keyPoints.slice(0, 4).map((pt, idx) => (
                      <li key={idx}>{pt}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              {variant === 'full' && (
                <button
                  onClick={handleGenerateMindMap}
                  disabled={uploading}
                  className="btn btn-primary flex-1 min-w-[180px] text-xs py-2"
                >
                  <i className="ph-duotone ph-graph"></i>
                  Generate Mind Map from File
                </button>
              )}
              <button
                onClick={handleAttachAndChat}
                className={`btn flex-1 min-w-[180px] text-xs py-2 ${
                  variant === 'full' ? 'btn-secondary' : 'btn-primary'
                }`}
              >
                <i
                  className={`ph-duotone ${
                    variant === 'full' ? 'ph-chats-circle' : 'ph-text-align-left'
                  }`}
                ></i>
                {attachLabel}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-divider)]">
          <button onClick={onClose} className="btn btn-ghost text-xs">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
