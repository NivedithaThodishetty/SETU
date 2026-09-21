import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import MindMap from '../components/MindMap';
import FileUploadModal from '../components/FileUploadModal';
import DocumentViewerModal from '../components/DocumentViewerModal';
import MindMapCustomizerModal from '../components/MindMapCustomizerModal';
import NodeEditorModal from '../components/NodeEditorModal';
import NodeInsightPanel from '../components/NodeInsightPanel';
import { BionicText } from '../lib/bionic';
import { tts } from '../lib/tts';
import { streamChat, api } from '../lib/api';
import { saveMap, listMaps, getMap, DEFAULT_WORKED_MAP, getPrefs, savePrefs } from '../lib/storage';
import { addNodeToTree, editNodeInTree, deleteNodeFromTree } from '../lib/layout';
import { award } from '../lib/progress';
import {
  exportMindMapToPDF,
  exportMindMapToPNG,
  exportMindMapToSVG,
  exportMindMapToMarkdown,
  exportMindMapToJSON
} from '../lib/exportUtils';

const SUGGESTIONS = [
  'How does a transformer neural network work?',
  'Why did attention beat recurrence in LSTMs?',
  'How do vaccines actually train the immune system?',
  'The causes of the French Revolution',
  'How does compound interest build wealth?'
];

function normalizeMessageContent(content) {
  if (typeof content === 'string') return content;
  if (typeof content === 'number' || typeof content === 'boolean') return String(content);
  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if (typeof content.message === 'string') return content.message;
  }
  return '';
}

export default function MindMapChat() {
  const [messages, setMessages] = useState([]);
  const [map, setMap] = useState(null);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showChat, setShowChat] = useState(true);

  /**
   * Which half of this screen a phone is looking at.
   *
   * Below `lg` the two panes stack, and the conversation is `w-full` — which
   * meant the canvas was pushed off the bottom of a viewport that does not
   * scroll, so on a phone the mind map, the entire point of the page, could not
   * be reached at all. They are now mutually exclusive views with a switch,
   * and researching a topic hands you straight to the map.
   */
  const [mobileView, setMobileView] = useState('chat');
  const [handoffBanner, setHandoffBanner] = useState(null);
  const [attachedDoc, setAttachedDoc] = useState(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [viewingDocId, setViewingDocId] = useState(null);
  const [bionicEnabled, setBionicEnabled] = useState(() => getPrefs().bionicReading === true);
  const [conversationId, setConversationId] = useState(() => `conv_${Date.now()}`);

  // Canvas appearance lives in preferences so it survives reloads and applies to
  // every map, not just the one open when it was changed.
  const [mapPrefs, setMapPrefs] = useState(getPrefs);
  const [customizerOpen, setCustomizerOpen] = useState(false);

  /** `{ mode: 'add' | 'edit', node?, parentNode? }`, or null when closed. */
  const [nodeEditor, setNodeEditor] = useState(null);

  const abortRef = useRef(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const exportMenuRef = useRef(null);
  const pendingRef = useRef(null);
  const [params, setParams] = useSearchParams();

  // Open the most recent map on first mount so the canvas is never blank.
  useEffect(() => {
    const stored = listMaps();
    setMap(stored[0] || DEFAULT_WORKED_MAP);
  }, []);

  // Read-aloud transport now lives inside the branch explainer, which owns the
  // text being spoken. All this page still owes the engine is silence on the
  // way out, so leaving a route mid-sentence does not keep talking.
  useEffect(() => () => tts.stop(), []);

  /**
   * Handle the deep links the app supports, exactly once each.
   *
   * `map` names a saved map to open, and travels with `topic` when a question
   * is handed over from the Library — asking "tell me more about this branch"
   * is meaningless if the page has opened somebody's most recent map instead of
   * the one they were reading.
   */
  useEffect(() => {
    const topicParam = params.get('topic');
    const docParam = params.get('doc');
    const importParam = params.get('import');
    const mapParam = params.get('map');

    if (!topicParam && !docParam && !importParam && !mapParam) return;

    const next = new URLSearchParams(params);
    next.delete('topic');
    next.delete('doc');
    next.delete('import');
    next.delete('map');
    setParams(next, { replace: true });

    let handedOverId = null;
    if (mapParam) {
      const stored = getMap(mapParam);
      if (stored) {
        setMap(stored);
        setMobileView('map');
        // Only claimed when the map genuinely resolved: a deleted id must not
        // leave a pending question waiting forever on a map that cannot arrive.
        handedOverId = stored.id;
      }
    }

    if (topicParam) {
      pendingRef.current = { kind: 'topic', topic: topicParam, mapId: handedOverId };
      return;
    }
    if (docParam) {
      pendingRef.current = { kind: 'doc', documentId: docParam };
      return;
    }
    // A bare `?map=` has already done its whole job above. Guarded here so it
    // cannot fall through and try to parse a missing `import` payload.
    if (mapParam) return;

    try {
      pendingRef.current = { kind: 'import', payload: JSON.parse(decodeURIComponent(importParam)) };
    } catch (_) {
      // A malformed handoff should not break the page.
    }
  }, [params, setParams]);

  /* Auto-scroll transcript */
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status]);

  /* Cancel stream on unmount */
  useEffect(() => () => abortRef.current?.abort(), []);

  /* Close the export menu on outside click or Escape */
  useEffect(() => {
    if (!exportMenuOpen) return undefined;

    const onPointerDown = (event) => {
      if (!exportMenuRef.current?.contains(event.target)) setExportMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setExportMenuOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [exportMenuOpen]);

  const send = useCallback(
    async (raw) => {
      const text = (raw ?? input).trim();
      if (!text || busy) return;

      setInput('');
      setError(null);
      setBusy(true);
      setStatus(attachedDoc ? `Analyzing "${attachedDoc.originalName}"…` : 'Researching around topic…');

      const history = [...messages, { role: 'user', content: text }];
      setMessages(history);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamChat(
          {
            messages: history.map(({ role, content }) => ({ role, content })),
            conversationId,
            documentId: attachedDoc?.id || null,
            map: map ? { title: map.title, summary: map.summary, root: map.root } : null
          },
          {
            onStatus: (update) => setStatus(update.message || update.stage),
            onReply: (reply) =>
              setMessages((current) => {
                const replyText = normalizeMessageContent(
                  reply?.text ?? reply?.message ?? reply?.content
                ).trim();
                if (!replyText) return current;

                if (reply.final) {
                  const last = current[current.length - 1];
                  if (last?.role === 'assistant') {
                    const next = [...current];
                    next[next.length - 1] = { ...last, content: replyText };
                    return next;
                  }
                }
                return [...current, { role: 'assistant', content: replyText }];
              }),
            onMap: (fresh) => {
              const stored = saveMap(fresh);
              setMap(stored || fresh);
              setMobileView('map');
              // Researching a map is the headline action of the whole app; it
              // has to pay out, or the Mapmaker milestone can never be reached.
              award('mapCreated');
              setDetail(null);
              setMessages((current) => [
                ...current,
                { role: 'assistant', content: `Here's your structured map of **${fresh.title}**.` }
              ]);
            },
            onError: (payload) => setError(payload.message),
            onDone: (data) => {
              if (data.conversationId) setConversationId(data.conversationId);
            }
          },
          controller.signal
        );
      } catch (streamError) {
        if (streamError.name !== 'AbortError') {
          setError(
            streamError.message ||
              'Could not reach the SETU engine. Make sure the backend is running (npm start in /backend).'
          );
        }
      } finally {
        setBusy(false);
        setStatus(null);
        abortRef.current = null;
      }
    },
    [input, busy, messages, map, attachedDoc, conversationId]
  );

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || busy) return;
    pendingRef.current = null;

    if (pending.kind === 'topic') {
      // Hold the question until the handed-over map is in state. `send` is
      // rebuilt whenever `map` changes, which re-runs this effect, so re-arming
      // is enough — no polling needed.
      if (pending.mapId && map?.id !== pending.mapId) {
        pendingRef.current = pending;
        return;
      }
      send(pending.topic);
      return;
    }

    if (pending.kind === 'doc') {
      api
        .getFile(pending.documentId)
        .then((result) => {
          if (result?.document) {
            setAttachedDoc(result.document);
            inputRef.current?.focus();
          } else {
            setError('That document is no longer available on the engine.');
          }
        })
        .catch((err) => setError(err.message));
      return;
    }

    if (pending.kind === 'import') {
      const payload = pending.payload || {};
      const title = payload.title || 'Page sent from Lens';

      setHandoffBanner({ title, url: payload.url || '' });
      setMessages([
        { role: 'user', content: `Map this page for me: ${title}` },
        { role: 'assistant', content: `Reading “${title}” and laying out an accessible mind map…` }
      ]);
      setBusy(true);
      setStatus('Reading around the topic…');

      api
        .mindMap(title, payload.text?.slice(0, 12000) || '')
        .then((fresh) => {
          const stored = saveMap({ ...fresh, isLensHandoff: true });
          setMap(stored || { ...fresh, isLensHandoff: true });
          award('mapCreated');
          setMessages((current) => [
            ...current,
            { role: 'assistant', content: `Here's your map of **${fresh.title}**.` }
          ]);
        })
        .catch((err) => setError(err.message))
        .finally(() => {
          setBusy(false);
          setStatus(null);
        });
    }
  }, [params, busy, send, map?.id]);

  const stop = () => {
    abortRef.current?.abort();
    setBusy(false);
    setStatus(null);
  };

  const startNewMap = () => {
    stop();
    tts.stop();
    setMobileView('chat');
    setMessages([]);
    setMap(null);
    setDetail(null);
    setError(null);
    setHandoffBanner(null);
    setAttachedDoc(null);
    setConversationId(`conv_${Date.now()}`);
    inputRef.current?.focus();
  };

  const handleMindMapFromFile = (freshMap) => {
    const stored = saveMap(freshMap);
    setMap(stored || freshMap);
    setMobileView('map');
    setDetail(null);
    award('mapCreated');
    setMessages([
      {
        role: 'user',
        content: `Created mind map from file: ${freshMap.title}`
      },
      {
        role: 'assistant',
        content: `I analyzed your uploaded source and generated the interactive visual mind map on the right. You can ask follow-up questions or explore any branch.`
      }
    ]);
  };

  const runExport = useCallback(
    async (label, exporter) => {
      if (!map) return;
      setExportMenuOpen(false);
      setError(null);
      try {
        await exporter(map);
      } catch (err) {
        setError(`${label} export failed: ${err.message || 'unknown error'}`);
      }
    },
    [map]
  );

  /**
   * Commit an edited tree to the open canvas and the stored copy together.
   *
   * Everything that edits the map funnels through here so a hand edit is
   * persisted exactly like a researched one — including picking up the stored
   * record's id, which is what lets the next edit find and replace the same map
   * instead of appending a duplicate to the library.
   */
  const applyRootChange = useCallback(
    (nextRoot) => {
      if (!map || !nextRoot) return;
      const updated = { ...map, root: nextRoot };
      const stored = saveMap(updated);
      setMap(stored || updated);
    },
    [map]
  );

  const handleNodeSave = useCallback(
    (values) => {
      if (!map?.root || !nodeEditor) return;

      if (nodeEditor.mode === 'add') {
        applyRootChange(addNodeToTree(map.root, nodeEditor.parentNode.id, values));
        return;
      }

      // `id` is dropped rather than merged: it already matches, and spreading it
      // back would let a future change to the modal silently rewrite node ids.
      const { id: _ignored, ...updates } = values;
      applyRootChange(editNodeInTree(map.root, nodeEditor.node.id, updates));
    },
    [map, nodeEditor, applyRootChange]
  );

  const handleNodeDelete = useCallback(
    (nodeId) => {
      if (!map?.root) return;
      applyRootChange(deleteNodeFromTree(map.root, nodeId));
      // The detail panel may be showing the branch that just disappeared.
      setDetail((current) => (current?.id === nodeId ? null : current));
    },
    [map, applyRootChange]
  );

  // Reversed visually only: the transcript stays first in DOM order either way,
  // so tab order and screen-reader sequence do not change with the side.
  const chatOnRight = mapPrefs.chatPanelSide === 'right';

  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden bg-[var(--color-bg)] ${
        chatOnRight ? 'lg:flex-row-reverse' : 'lg:flex-row'
      }`}
    >
      {/* Phone-only switch between the two panes. Order-first so it sits on top
          of the stack whichever side the conversation is pinned to. */}
      <div
        className="order-first flex shrink-0 gap-1 border-b border-[var(--color-divider)] bg-[var(--color-surface)] p-2 lg:hidden"
        role="tablist"
        aria-label="Conversation or map"
      >
        {[
          { key: 'chat', label: 'Ask', icon: 'ph-chats-circle' },
          { key: 'map', label: 'Map', icon: 'ph-graph' }
        ].map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={mobileView === tab.key}
            onClick={() => setMobileView(tab.key)}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border py-2 text-[13px] font-bold transition-colors ${
              mobileView === tab.key
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-bg)]'
                : 'border-[var(--color-divider)] bg-[var(--color-bg)] text-[var(--color-text)]'
            }`}
          >
            <i className={`ph-duotone ${tab.icon} text-base`}></i>
            {tab.label}
          </button>
        ))}
      </div>

      {/* --------------------------- Conversation Pane (392px fixed) --------------------------- */}
      <section
        className={`flex-col bg-[var(--color-bg)] transition-all duration-200 ${
          chatOnRight
            ? 'border-[var(--color-divider)] lg:border-l'
            : 'border-r border-[var(--color-divider)]'
        } ${mobileView === 'chat' ? 'flex min-h-0 flex-1' : 'hidden'} ${
          showChat ? 'lg:flex lg:w-[392px] lg:flex-none lg:shrink-0' : 'lg:flex lg:w-12 lg:flex-none lg:shrink-0'
        }`}
        aria-label="Conversation"
      >
        {/*
          Header.

          Four labelled buttons and a two-line title never fitted across 392px —
          the heading wrapped to three lines and the row spilled. The title now
          keeps the row to itself and the tools sit underneath as icons with
          accessible names, which is both narrower and steadier when the panel
          is resized.
        */}
        <header className="border-b border-[var(--color-divider)] px-4 py-3">
          {showChat ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <h1 className="truncate text-[19px] font-bold leading-tight text-[var(--color-text)]">
                  Ask anything
                </h1>
                <button
                  onClick={() => setShowChat(false)}
                  className="btn btn-quiet !min-h-[28px] !px-1.5 hidden shrink-0 lg:inline-flex"
                  aria-label="Collapse conversation panel"
                  title="Collapse this panel to widen the map"
                >
                  <i className="ph-duotone ph-caret-left text-base"></i>
                </button>
              </div>

              <div className="mt-2 flex items-center gap-1.5">
                <button
                  onClick={() => setUploadModalOpen(true)}
                  className="btn btn-secondary !min-h-[28px] !px-2.5 text-[12px]"
                  title="Upload a PDF, Word file, or notes"
                >
                  <i className="ph-duotone ph-file-arrow-up"></i>
                  Upload
                </button>
                <button
                  onClick={startNewMap}
                  className="btn btn-ghost !min-h-[28px] !px-2.5 text-[12px]"
                  title="Clear the canvas and start a new map"
                >
                  <i className="ph-duotone ph-plus"></i>
                  New map
                </button>
                <button
                  onClick={() => {
                    const next = !bionicEnabled;
                    setBionicEnabled(next);
                    // Persisted like the other reading settings: it used to reset
                    // every time the page was re-entered, so a reader who needs
                    // it had to switch it back on at every visit.
                    savePrefs({ bionicReading: next });
                  }}
                  aria-pressed={bionicEnabled}
                  className={`btn !min-h-[28px] !px-2 text-[12px] font-semibold ${
                    bionicEnabled
                      ? 'bg-[var(--color-accent-100)] text-[var(--color-accent-900)] border border-[var(--color-accent-300)]'
                      : 'btn-ghost'
                  }`}
                  title="Bold the first letters of each word. Helps some readers, not all — try it both ways."
                >
                  <i className="ph-duotone ph-eye text-sm"></i>
                  Bionic
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setShowChat(true)}
              className="btn btn-quiet !min-h-[36px] !px-2 w-full justify-center"
              aria-label="Expand conversation panel"
              title="Show the conversation"
            >
              <i className="ph-duotone ph-caret-right text-base"></i>
            </button>
          )}
        </header>

        {showChat && (
          <>
            {/* Extension Handoff Moment Banner */}
            {handoffBanner && (
              <div className="mx-4 mt-3 p-3.5 bg-[var(--color-accent-100)] border border-[var(--color-accent-300)] rounded-[var(--radius-md)] flex items-start justify-between gap-3 text-left animate-setu-rise">
                <div className="flex items-start gap-2.5">
                  <i className="ph-duotone ph-arrow-square-in text-xl text-[var(--color-accent-700)] shrink-0 mt-0.5"></i>
                  <div>
                    <p className="text-[13px] font-bold text-[var(--color-accent-900)] leading-tight">
                      Sent over from Lens
                    </p>
                    <p className="text-[12px] text-[var(--color-accent-800)] mt-0.5 leading-snug">
                      The page you were reading — <em>{handoffBanner.title}</em> — came across and
                      became the map on the right.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setHandoffBanner(null)}
                  className="text-[var(--color-accent-700)] hover:text-[var(--color-accent-900)] p-1 bg-transparent border-0 cursor-pointer"
                  aria-label="Dismiss banner"
                >
                  <i className="ph-duotone ph-x text-sm"></i>
                </button>
              </div>
            )}

            {/* Attached Document Banner */}
            {attachedDoc && (
              <div className="mx-4 mt-3 p-2.5 bg-[var(--color-surface)] border border-[var(--color-accent)] rounded-[var(--radius-md)] flex items-center justify-between gap-2.5 text-left animate-setu-rise">
                <div className="flex items-center gap-2 min-w-0">
                  <i className="ph-duotone ph-paperclip text-lg text-[var(--color-accent)] shrink-0"></i>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold text-[var(--color-text)] truncate">
                      {attachedDoc.originalName}
                    </p>
                    <span className="text-[10.5px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
                      Grounded document query active
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setViewingDocId(attachedDoc.id)}
                    className="btn btn-ghost !min-h-[24px] !px-2 text-[11px]"
                    title="View full document"
                  >
                    View
                  </button>
                  <button
                    onClick={() => setAttachedDoc(null)}
                    className="btn btn-quiet !min-h-[24px] !px-1.5 text-[11px]"
                    title="Detach file"
                  >
                    <i className="ph-duotone ph-x"></i>
                  </button>
                </div>
              </div>
            )}

            {/* Transcript Area */}
            <div
              ref={logRef}
              className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-left"
              role="log"
              aria-live="polite"
              // Held while a turn is streaming so a screen reader announces the
              // finished reply once, rather than re-reading a growing paragraph
              // on every token that arrives.
              aria-busy={busy}
            >
              {messages.length === 0 && !busy && (
                <div className="space-y-4 py-2">
                  <p className="text-[14.5px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_80%,transparent)]">
                    Name any complex topic or upload a file (PDF, Word, TXT, Notes). SETU researches it and organizes it into an interactive visual hierarchy.
                  </p>

                  <div className="space-y-2 pt-2">
                    <span className="kicker block">Try an example</span>
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => send(suggestion)}
                        className="block w-full p-2.5 rounded-[var(--radius-md)] border border-[var(--color-divider)] text-left text-[13px] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-100)] hover:text-[var(--color-accent-900)] transition-colors cursor-pointer bg-transparent"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>

                  <div className="p-3 bg-[var(--color-surface)] rounded-[var(--radius-md)] border border-[var(--color-divider)] space-y-2">
                    <span className="kicker block">Upload your own source</span>
                    <button
                      onClick={() => setUploadModalOpen(true)}
                      className="w-full btn btn-secondary text-xs flex items-center justify-center gap-2 py-2"
                    >
                      <i className="ph-duotone ph-cloud-arrow-up text-base"></i>
                      Upload PDF or Document
                    </button>
                  </div>
                </div>
              )}

              {messages.map((message, index) => (
                <MessageItem
                  key={index}
                  role={message?.role || 'assistant'}
                  content={normalizeMessageContent(message?.content)}
                  bionicEnabled={bionicEnabled}
                />
              ))}

              {/* 3-Stage Progress Lines */}
              {busy && <StagedProgress status={status} />}

              {error && (
                <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-accent-2-100)] border border-[var(--color-accent-2)] text-[13px] text-[var(--color-accent-2-900)] leading-snug">
                  {error}
                </div>
              )}
            </div>

            {/* Follow-up suggestions */}
            {map?.followUps?.length > 0 && !busy && (
              <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-t border-[var(--color-divider)] bg-[var(--color-surface)]">
                {map.followUps.slice(0, 3).map((question) => (
                  <button
                    key={question}
                    onClick={() => send(question)}
                    className="tag tag-outline hover:border-[var(--color-accent)] hover:text-[var(--color-accent-700)] text-left cursor-pointer"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}

            {/* Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-center gap-2 p-3 border-t border-[var(--color-divider)] bg-[var(--color-bg)]"
            >
              <button
                type="button"
                onClick={() => setUploadModalOpen(true)}
                className="btn btn-ghost min-h-[44px] px-2.5 text-[var(--color-accent)]"
                title="Upload or attach document"
                aria-label="Upload document"
              >
                <i className="ph-duotone ph-paperclip text-lg"></i>
              </button>

              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  attachedDoc
                    ? `Ask anything about ${attachedDoc.originalName}…`
                    : map
                      ? 'Ask a follow-up or name a new topic…'
                      : 'Name any topic or ask a question…'
                }
                className="input min-h-[44px] text-[14px]"
                aria-label="Message prompt"
                disabled={busy}
              />
              {busy ? (
                <button
                  type="button"
                  onClick={stop}
                  className="btn btn-ghost min-h-[44px] px-3.5"
                  aria-label="Stop research"
                >
                  <i className="ph-duotone ph-stop text-lg text-[var(--color-accent-2)]"></i>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="btn btn-primary min-h-[44px] px-4"
                  aria-label="Send message"
                >
                  <i className="ph-duotone ph-arrow-up text-lg"></i>
                </button>
              )}
            </form>
          </>
        )}
      </section>

      {/* --------------------------- Flexible Map Pane --------------------------- */}
      <section
        className={`min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4 sm:p-5 gap-3 lg:flex ${
          mobileView === 'map' ? 'flex' : 'hidden'
        }`}
        aria-label="Mind map canvas"
      >
        {map ? (
          <>
            {/* Map Header with flex-wrap and export dropdown */}
            <header className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-divider)] shadow-[var(--shadow-sm)] relative">
              <div className="flex-1 basis-[260px] min-w-0 text-left">
                <h2 className="text-[19px] sm:text-[22px] font-bold text-[var(--color-text)] truncate leading-tight">
                  {map.title}
                </h2>
                <p className="text-[13px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)] truncate mt-0.5">
                  <BionicText text={map.summary} enabled={bionicEnabled} />
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span className="tag tag-neutral">{countNodes(map.root)} topics</span>
                {map.grounded ? (
                  <span className="tag tag-accent">
                    <i className="ph-duotone ph-globe"></i>
                    {map.sources?.length || 0} sources
                  </span>
                ) : (
                  <span className="tag tag-neutral" title="Verified knowledge synthesis">
                    verified synthesis
                  </span>
                )}

                {/* Visual Export Menu */}
                <div className="relative" ref={exportMenuRef}>
                  <button
                    onClick={() => setExportMenuOpen((prev) => !prev)}
                    className="btn btn-secondary !min-h-[32px] !px-3 text-[12.5px] flex items-center gap-1.5"
                    aria-haspopup="menu"
                    aria-expanded={exportMenuOpen}
                    aria-label="Export mind map options"
                  >
                    <i className="ph-duotone ph-export"></i>
                    Export Visual
                    <i className="ph-duotone ph-caret-down text-xs"></i>
                  </button>

                  {exportMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full mt-1.5 w-48 rounded-[var(--radius-md)] bg-[var(--color-bg)] border border-[var(--color-divider)] shadow-xl py-1.5 z-50 text-left animate-setu-rise"
                    >
                      <button
                        onClick={() => runExport('PDF', exportMindMapToPDF)}
                        className="w-full px-3.5 py-2 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface)] hover:text-[var(--color-accent)] flex items-center gap-2.5 transition-colors cursor-pointer bg-transparent border-0"
                      >
                        <i className="ph-duotone ph-file-pdf text-base text-[var(--color-accent-2)]"></i>
                        Visual PDF Document
                      </button>
                      <button
                        onClick={() => runExport('PNG', exportMindMapToPNG)}
                        className="w-full px-3.5 py-2 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface)] hover:text-[var(--color-accent)] flex items-center gap-2.5 transition-colors cursor-pointer bg-transparent border-0"
                      >
                        <i className="ph-duotone ph-image text-base text-[var(--color-accent)]"></i>
                        High-Res Image (PNG)
                      </button>
                      <button
                        onClick={() => runExport('SVG', exportMindMapToSVG)}
                        className="w-full px-3.5 py-2 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface)] hover:text-[var(--color-accent)] flex items-center gap-2.5 transition-colors cursor-pointer bg-transparent border-0"
                      >
                        <i className="ph-duotone ph-bezier-curve text-base text-[#0088b0]"></i>
                        Vector Graphic (SVG)
                      </button>
                      <div className="my-1 h-px bg-[var(--color-divider)]" />
                      <button
                        onClick={() => runExport('Markdown', exportMindMapToMarkdown)}
                        className="w-full px-3.5 py-2 text-xs text-[color-mix(in_srgb,var(--color-text)_80%,transparent)] hover:bg-[var(--color-surface)] flex items-center gap-2.5 transition-colors cursor-pointer bg-transparent border-0"
                      >
                        <i className="ph-duotone ph-file-text text-base"></i>
                        Markdown Outline
                      </button>
                      <button
                        onClick={() => runExport('JSON', exportMindMapToJSON)}
                        className="w-full px-3.5 py-2 text-xs text-[color-mix(in_srgb,var(--color-text)_80%,transparent)] hover:bg-[var(--color-surface)] flex items-center gap-2.5 transition-colors cursor-pointer bg-transparent border-0"
                      >
                        <i className="ph-duotone ph-code text-base"></i>
                        JSON Data Schema
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/*
              Canvas and branch explainer sit side by side from 2xl up, and stack
              below that.

              The split needs about 500px of canvas left over to be worth having,
              and the sidebar and the conversation have already taken 636px — so
              at 1280 a side-docked panel left the map a 220px strip. Above 1536
              there is genuinely room for both; below it the panel goes under the
              canvas, where the map keeps its full width and the explanation is
              still on screen without covering it.
            */}
            <div className="flex min-h-0 flex-1 basis-[300px] flex-col gap-3 2xl:flex-row">
            <div className="relative min-h-[300px] flex-1">
              <MindMap
                map={map}
                palette={mapPrefs.mapColorTheme}
                edgeStyle={mapPrefs.mapEdgeStyle}
                gridPattern={mapPrefs.mapGridPattern}
                nodeStyle={mapPrefs.mapNodeStyle}
                edgeWidth={mapPrefs.mapEdgeWidth}
                textScale={mapPrefs.mapTextScale}
                onMapChange={(next) => {
                  setMap(next);
                  saveMap(next);
                }}
                onNodeFocus={setDetail}
                onOpenCustomizer={() => setCustomizerOpen(true)}
                onAddChild={(node) => setNodeEditor({ mode: 'add', parentNode: node })}
                onEditNode={(node) => setNodeEditor({ mode: 'edit', node })}
              />
            </div>

            {detail && (
              <div className="flex max-h-[46vh] min-h-[240px] 2xl:max-h-none 2xl:min-h-0 2xl:w-[380px] 2xl:shrink-0">
                <NodeInsightPanel
                  node={detail}
                  map={map}
                  language={mapPrefs.language}
                  bionicEnabled={bionicEnabled}
                  onClose={() => setDetail(null)}
                  onAsk={(node) => send(`Tell me more about "${node.label}"`)}
                  onDeeper={(node) =>
                    send(`Go one level deeper into "${node.label}" in the map`)
                  }
                />
              </div>
            )}
            </div>
          </>
        ) : (
          <EmptyCanvas
            busy={busy}
            status={status}
            onStart={() => inputRef.current?.focus()}
            onUpload={() => setUploadModalOpen(true)}
          />
        )}
      </section>

      {/* File Upload Modal */}
      <FileUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        conversationId={conversationId}
        onMindMapGenerated={handleMindMapFromFile}
        onFileAttached={(doc) => {
          setAttachedDoc(doc);
          inputRef.current?.focus();
        }}
      />

      {/* Document Reader & Cognitive Viewer Modal */}
      <DocumentViewerModal
        isOpen={Boolean(viewingDocId)}
        documentId={viewingDocId}
        onClose={() => setViewingDocId(null)}
        onMindMapGenerated={handleMindMapFromFile}
      />

      {/* Canvas appearance — palette, edges, grid, node shape, text scale */}
      <MindMapCustomizerModal
        isOpen={customizerOpen}
        currentPrefs={mapPrefs}
        onClose={() => setCustomizerOpen(false)}
        onUpdatePrefs={(next) => {
          // savePrefs also re-applies the document-level tint and motion classes,
          // so the sensory overlay in this modal takes effect immediately.
          savePrefs(next);
          setMapPrefs(next);
        }}
      />

      {/* Hand editing: rename a branch, add one, or remove a subtree */}
      <NodeEditorModal
        isOpen={Boolean(nodeEditor)}
        mode={nodeEditor?.mode || 'edit'}
        node={nodeEditor?.node || null}
        parentNode={nodeEditor?.parentNode || null}
        paletteKey={mapPrefs.mapColorTheme}
        onClose={() => setNodeEditor(null)}
        onSave={handleNodeSave}
        onDelete={handleNodeDelete}
      />
    </div>
  );
}

/* ------------------------------ Transcript Items ------------------------------ */

function MessageItem({ role, content, bionicEnabled }) {
  const isUser = role === 'user';
  const safeContent = normalizeMessageContent(content);

  if (!safeContent) return null;

  if (isUser) {
    return (
      <div className="flex justify-end animate-setu-rise">
        <div
          className="max-w-[85%] px-4 py-2.5 text-[14px] leading-relaxed shadow-[var(--shadow-sm)]"
          style={{
            backgroundColor: 'var(--color-accent)',
            color: 'var(--color-bg)',
            borderRadius: 'var(--radius-lg) var(--radius-lg) 2px var(--radius-lg)'
          }}
        >
          <BionicText text={safeContent} enabled={bionicEnabled} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start animate-setu-rise">
      <div className="text-[15px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_84%,transparent)] max-w-[95%]">
        <BionicText text={safeContent} enabled={bionicEnabled} />
      </div>
    </div>
  );
}

/* ------------------------------ 3-Stage Progress ------------------------------ */

function StagedProgress({ status }) {
  const isFinding = status?.includes('branch') || status?.includes('tree') || status?.includes('deeper');
  const isDrawing = status?.includes('Draw') || status?.includes('map') || status?.includes('final');

  return (
    <div className="p-3 bg-[var(--color-surface)] rounded-[var(--radius-md)] border border-[var(--color-divider)] space-y-2 text-left animate-setu-rise">
      <div
        className={`flex items-center gap-2.5 text-[13px] ${
          !isFinding && !isDrawing
            ? 'text-[var(--color-accent-700)] font-semibold'
            : 'text-[color-mix(in_srgb,var(--color-text)_40%,transparent)]'
        }`}
      >
        <i className="ph-duotone ph-book-open text-base"></i>
        <span>{status || 'Reading around the topic'}</span>
      </div>
      <div
        className={`flex items-center gap-2.5 text-[13px] ${
          isFinding && !isDrawing
            ? 'text-[var(--color-accent-700)] font-semibold'
            : 'text-[color-mix(in_srgb,var(--color-text)_40%,transparent)]'
        }`}
      >
        <i className="ph-duotone ph-tree-structure text-base"></i>
        <span>Structuring branches</span>
      </div>
      <div
        className={`flex items-center gap-2.5 text-[13px] ${
          isDrawing
            ? 'text-[var(--color-accent-700)] font-semibold'
            : 'text-[color-mix(in_srgb,var(--color-text)_40%,transparent)]'
        }`}
      >
        <i className="ph-duotone ph-pen-nib text-base"></i>
        <span>Laying out visual map</span>
      </div>
    </div>
  );
}

/* ------------------------------ Empty Canvas ------------------------------ */

function EmptyCanvas({ busy, status, onStart, onUpload }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8 text-center bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-divider)]">
      <div className="max-w-md space-y-4">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--color-accent-100)] text-[var(--color-accent)] text-2xl">
          <i className="ph-duotone ph-graph"></i>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-[var(--color-text)]">
            {busy ? status || 'Researching topic…' : 'Your map appears here'}
          </h2>
          <p className="text-[14.5px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_70%,transparent)]">
            {busy
              ? 'Exploring verified references and mapping out clear cognitive branches.'
              : 'Type any question on the left, try an example, or upload a source document.'}
          </p>
        </div>
        {!busy && (
          <div className="flex items-center justify-center gap-2.5 pt-2">
            <button onClick={onStart} className="btn btn-primary text-sm font-semibold">
              Ask a question
            </button>
            <button onClick={onUpload} className="btn btn-secondary text-sm font-semibold">
              <i className="ph-duotone ph-file-arrow-up"></i>
              Upload file
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function countNodes(node) {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum, child) => sum + countNodes(child), 0);
}
