import { useEffect, useState, useRef } from 'react';
import { stt } from '../lib/stt';

/**
 * VoiceInputButton
 *
 * Accessible, animated microphone button powered by Sarvam Saaras AI STT
 * with live audio level feedback and browser Web Speech fallback.
 */
export default function VoiceInputButton({
  onTranscript,
  onAutoSubmit = null,
  language = null,
  size = 'md', // 'sm' | 'md' | 'lg'
  className = '',
  title = 'Voice query (Speak into microphone)',
  showLabel = false,
  label = 'Voice query'
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const isRecordingRef = useRef(false);
  const errorTimerRef = useRef(null);

  useEffect(() => {
    const unsubscribe = stt.subscribe((state) => {
      setIsRecording(state.isRecording);
      isRecordingRef.current = state.isRecording;
      setIsProcessing(state.isProcessing);
      if (state.audioLevel !== undefined) {
        setAudioLevel(state.audioLevel);
      }
      if (state.error) {
        setErrorMessage(state.error);
        // The subscriber is a plain callback, not an effect — a cleanup returned
        // from here is simply dropped on the floor, so the auto-dismiss timer has
        // to be tracked on a ref instead. Replacing the previous one also stops a
        // stale timer from clearing a newer message four seconds early.
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = setTimeout(() => setErrorMessage(null), 4000);
      }
    });

    return () => {
      unsubscribe();
      clearTimeout(errorTimerRef.current);
      if (isRecordingRef.current) {
        stt.stop();
      }
    };
  }, []);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isRecording) {
      stt.stop();
      return;
    }

    setErrorMessage(null);
    stt.start({
      language,
      onTranscript: (text, isFinal) => {
        if (onTranscript) {
          onTranscript(text, isFinal);
        }
        if (isFinal && onAutoSubmit && text.trim()) {
          onAutoSubmit(text.trim());
        }
      },
      onError: (err) => {
        setErrorMessage(err);
        setTimeout(() => setErrorMessage(null), 4000);
      }
    });
  };

  const sizeClasses = {
    sm: 'min-h-[32px] min-w-[32px] px-2 text-xs',
    md: 'min-h-[40px] min-w-[40px] px-2.5 text-sm',
    lg: 'min-h-[44px] min-w-[44px] px-3.5 text-base'
  }[size] || 'min-h-[40px] min-w-[40px] px-2.5 text-sm';

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={isProcessing}
        title={
          isRecording
            ? 'Listening… Click to finish speaking'
            : isProcessing
              ? 'Transcribing audio with Sarvam AI…'
              : title
        }
        aria-label={
          isRecording
            ? 'Stop voice input'
            : isProcessing
              ? 'Processing speech'
              : 'Start voice input'
        }
        aria-pressed={isRecording}
        className={`relative flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] font-medium transition-all cursor-pointer border ${
          isRecording
            ? 'border-[var(--color-accent-2)] bg-[var(--color-accent-2-100)] text-[var(--color-accent-2-900)] shadow-[0_0_0_3px_rgba(214,0,108,0.2)]'
            : isProcessing
              ? 'border-[var(--color-accent)] bg-[var(--color-accent-100)] text-[var(--color-accent)] opacity-80 cursor-wait'
              : 'border-transparent bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface)] hover:text-[var(--color-accent)] hover:border-[var(--color-divider)]'
        } ${sizeClasses} ${className}`}
      >
        {isRecording ? (
          <>
            <span className="relative flex h-2.5 w-2.5 mr-0.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-accent-2)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--color-accent-2)]"></span>
            </span>
            <i className="ph-duotone ph-microphone text-lg text-[var(--color-accent-2)] animate-pulse"></i>
            {showLabel && (
              <span className="text-xs font-bold text-[var(--color-accent-2-900)]">
                Listening…
              </span>
            )}
            {/* Live Audio Visualizer Pulse Indicator */}
            <span
              className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full bg-[var(--color-accent-2)] transition-all duration-75"
              style={{
                transform: `scaleX(${Math.max(0.15, audioLevel * 1.5)})`,
                transformOrigin: 'center'
              }}
            />
          </>
        ) : isProcessing ? (
          <>
            <i className="ph-duotone ph-spinner animate-spin text-lg text-[var(--color-accent)]"></i>
            {showLabel && <span className="text-xs font-semibold">Transcribing…</span>}
          </>
        ) : (
          <>
            <i className="ph-duotone ph-microphone text-lg"></i>
            {showLabel && <span className="text-xs">{label}</span>}
          </>
        )}
      </button>

      {/* Floating Error Toast */}
      {errorMessage && (
        <div
          role="alert"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 whitespace-nowrap rounded-[var(--radius-md)] bg-[var(--color-accent-2-900)] text-white text-[11.5px] font-medium px-2.5 py-1 shadow-lg animate-setu-rise flex items-center gap-1.5"
        >
          <i className="ph-duotone ph-warning-circle text-xs text-[var(--color-accent-2-200)]"></i>
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
