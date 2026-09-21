import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MindMap from '../components/MindMap';
import NodeInsightPanel from '../components/NodeInsightPanel';
import FileUploadModal from '../components/FileUploadModal';
import DocumentViewerModal from '../components/DocumentViewerModal';
import VoiceInputButton from '../components/VoiceInputButton';
import { BionicText } from '../lib/bionic';
import { listMaps, deleteMap, saveMap, getPrefs, savePrefs } from '../lib/storage';
import { api } from '../lib/api';
import {
  exportMindMapToJSON,
  exportMindMapToMarkdown,
  exportMindMapToPDF,
  exportMindMapToPNG,
  exportMindMapToSVG
} from '../lib/exportUtils';

function MapExportMenu({ map, onError, className = '', buttonText = 'Export' }) {
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const runExport = useCallback(
    async (label, exporter) => {
      if (!map) return;
      setMenuOpen(false);
      try {
        await exporter(map);
      } catch (err) {
        const message = err?.message || 'unknown error';
        onError?.(`${label} export failed: ${message}`);
      }
    },
    [map, onError]
  );

  if (!map) return null;

  return (
    <div className={`relative z-20 ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setMenuOpen((prev) => !prev);
        }}
        className="btn btn-secondary !min-h-[32px] text-[12px] whitespace-nowrap"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Export mind map options"
      >
        <i className="ph-duotone ph-export"></i>
        {buttonText}
        <i className="ph-duotone ph-caret-down text-xs"></i>
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1.5 w-52 rounded-[var(--radius-md)] bg-[var(--color-bg)] border border-[var(--color-divider)] shadow-xl py-1.5 z-[60] text-left animate-setu-rise origin-top-left"
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              runExport('PDF', exportMindMapToPDF);
            }}
            className="w-full px-3.5 py-2 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface)] hover:text-[var(--color-accent)] flex items-center gap-2.5 transition-colors cursor-pointer bg-transparent border-0"
          >
            <i className="ph-duotone ph-file-pdf text-base text-[var(--color-accent-2)]"></i>
            Visual PDF Document
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              runExport('PNG', exportMindMapToPNG);
            }}
            className="w-full px-3.5 py-2 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface)] hover:text-[var(--color-accent)] flex items-center gap-2.5 transition-colors cursor-pointer bg-transparent border-0"
          >
            <i className="ph-duotone ph-image text-base text-[var(--color-accent)]"></i>
            High-Res Image (PNG)
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              runExport('SVG', exportMindMapToSVG);
            }}
            className="w-full px-3.5 py-2 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface)] hover:text-[var(--color-accent)] flex items-center gap-2.5 transition-colors cursor-pointer bg-transparent border-0"
          >
            <i className="ph-duotone ph-bezier-curve text-base text-[#0088b0]"></i>
            Vector Graphic (SVG)
          </button>
          <div className="my-1 h-px bg-[var(--color-divider)]" />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              runExport('Markdown', exportMindMapToMarkdown);
            }}
            className="w-full px-3.5 py-2 text-xs text-[color-mix(in_srgb,var(--color-text)_80%,transparent)] hover:bg-[var(--color-surface)] flex items-center gap-2.5 transition-colors cursor-pointer bg-transparent border-0"
          >
            <i className="ph-duotone ph-file-text text-base"></i>
            Markdown Outline
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              runExport('JSON', exportMindMapToJSON);
            }}
            className="w-full px-3.5 py-2 text-xs text-[color-mix(in_srgb,var(--color-text)_80%,transparent)] hover:bg-[var(--color-surface)] flex items-center gap-2.5 transition-colors cursor-pointer bg-transparent border-0"
          >
            <i className="ph-duotone ph-code text-base"></i>
            JSON Data Schema
          </button>
        </div>
      )}
    </div>
  );
}

export default function Library() {
  const [activeTab, setActiveTab] = useState('maps'); // 'maps' | 'files'
  const [fileFilter, setFileFilter] = useState('all'); // 'all' | 'pdf' | 'docx' | 'image' | 'text'
  const [maps, setMaps] = useState([]);
  const [files, setFiles] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState('');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [viewingDocId, setViewingDocId] = useState(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [buildingFrom, setBuildingFrom] = useState(null);
  const [error, setError] = useState(null);
  const [bionicEnabled, setBionicEnabled] = useState(() => getPrefs().bionicReading === true);

  /**
   * The branch selected in the map viewer.
   *
   * A map opened from the Library is the same map with the same branches, so
   * selecting one has to do the same thing it does on the mind map page:
   * explain it. Without this the viewer here was read-only in a way nothing on
   * screen admitted — you clicked a branch and nothing happened.
   */
  const [detail, setDetail] = useState(null);
  // Read once per mount so a map opened here is drawn with the same palette,
  // edges, and text scale the user chose on the mind map page.
  const [mapPrefs] = useState(getPrefs);
  const navigate = useNavigate();

  useEffect(() => {
    setMaps(listMaps());
    loadFiles();
  }, []);

  useEffect(() => {
    setDetail(null);
  }, [openId]);

  const loadFiles = async () => {
    setLoadingFiles(true);
    try {
      const res = await api.listFiles();
      if (res?.files) {
        setFiles(res.files);
      }
    } catch (_) {
      // Fallback
    } finally {
      setLoadingFiles(false);
    }
  };

  const filteredMaps = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return maps;
    return maps.filter(
      (m) =>
        m.title.toLowerCase().includes(needle) || (m.summary || '').toLowerCase().includes(needle)
    );
  }, [maps, query]);

  const filteredFiles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return files.filter((f) => {
      const matchesQuery =
        !needle ||
        (f.originalName || '').toLowerCase().includes(needle) ||
        (f.summary || '').toLowerCase().includes(needle);

      if (!matchesQuery) return false;

      if (fileFilter === 'all') return true;
      if (fileFilter === 'pdf') return f.mimeType?.includes('pdf') || f.originalName?.endsWith('.pdf');
      if (fileFilter === 'docx') return f.mimeType?.includes('word') || f.originalName?.endsWith('.docx');
      if (fileFilter === 'image') return f.mimeType?.startsWith('image');
      if (fileFilter === 'text') return f.mimeType?.includes('text') || f.originalName?.endsWith('.txt') || f.originalName?.endsWith('.md');
      return true;
    });
  }, [files, query, fileFilter]);

  const openMap = maps.find((m) => m.id === openId);

  /**
   * Send a question about the open map over to the mind map page.
   *
   * The Library has no conversation of its own, and the mind map page otherwise
   * opens whichever map was saved most recently — so the map id travels with
   * the question. Without it, "tell me more about this branch" would be asked
   * against a different map entirely.
   */
  const handOffToChat = (question) => {
    if (!openMap) return;
    navigate(
      `/mindmap?map=${encodeURIComponent(openMap.id)}&topic=${encodeURIComponent(question)}`
    );
  };

  const removeMap = (e, id) => {
    e.stopPropagation();
    deleteMap(id);
    setMaps(listMaps());
    if (openId === id) setOpenId(null);
  };

  const removeFile = async (e, id) => {
    e.stopPropagation();
    const previous = files;
    setFiles((prev) => prev.filter((f) => f.id !== id));
    try {
      await api.deleteFile(id);
    } catch (err) {
      console.error('[Library] Failed to delete file:', err);
      setFiles(previous);
      setError('Could not delete file from server. Please try again.');
    }
  };

  const toggleBionicReading = () => {
    const next = !bionicEnabled;
    setBionicEnabled(next);
    savePrefs({ bionicReading: next });
  };

  /**
   * Build a map from an uploaded document and open it.
   */
  const handleMindMapFromFile = async (file) => {
    if (buildingFrom) return;
    setBuildingFrom(file.id);
    setError(null);

    try {
      const freshMap = await api.mindMapFromFile(file.id);
      if (!freshMap?.root) throw new Error('The engine returned a map with no branches.');

      const stored = saveMap(freshMap);
      setMaps(listMaps());
      setActiveTab('maps');
      if (stored) setOpenId(stored.id);
    } catch (err) {
      setError(err.message || 'Could not build a mind map from that document.');
    } finally {
      setBuildingFrom(null);
    }
  };

  if (openMap) {
    return (
      <div className="flex h-full flex-col gap-3 p-4 sm:p-6 bg-[var(--color-bg)] text-left">
        <header className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-divider)] shadow-[var(--shadow-sm)] relative">
          <div className="flex items-center gap-3 min-w-0 flex-1 min-w-[220px]">
            <button
              onClick={() => setOpenId(null)}
              className="btn btn-ghost !min-h-[30px] !px-2.5 text-[12px]"
            >
              <i className="ph-duotone ph-arrow-left"></i>
              All maps
            </button>
            <div className="min-w-0">
              <h1 className="text-[17px] font-bold text-[var(--color-text)] truncate">
                {openMap.title}
              </h1>
              <p className="text-[12px] text-[color-mix(in_srgb,var(--color-text)_58%,transparent)] truncate">
                {openMap.summary}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <MapExportMenu map={openMap} onError={setError} buttonText="Export" />
            <button
              onClick={() => navigate('/mindmap')}
              className="btn btn-primary !min-h-[32px] text-[12.5px]"
            >
              <i className="ph-duotone ph-plus"></i>
              Ask a new topic
            </button>
          </div>
        </header>

        {/* Canvas and branch explainer, laid out exactly as on the mind map
            page: side by side where there is room, stacked below it otherwise. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 2xl:flex-row">
          <div className="relative min-h-[350px] flex-1">
            <MindMap
              map={openMap}
              palette={mapPrefs.mapColorTheme}
              edgeStyle={mapPrefs.mapEdgeStyle}
              gridPattern={mapPrefs.mapGridPattern}
              nodeStyle={mapPrefs.mapNodeStyle}
              edgeWidth={mapPrefs.mapEdgeWidth}
              textScale={mapPrefs.mapTextScale}
              onMapChange={(next) => {
                saveMap(next);
                setMaps(listMaps());
              }}
              onNodeFocus={setDetail}
            />
          </div>

          {detail && (
            <div className="flex max-h-[46vh] min-h-[240px] 2xl:max-h-none 2xl:min-h-0 2xl:w-[380px] 2xl:shrink-0">
              <NodeInsightPanel
                node={detail}
                map={openMap}
                language={mapPrefs.language}
                bionicEnabled={bionicEnabled}
                onClose={() => setDetail(null)}
                onAsk={(node) => handOffToChat(`Tell me more about "${node.label}"`)}
                onDeeper={(node) =>
                  handOffToChat(`Go one level deeper into "${node.label}" in the map`)
                }
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 sm:p-10 bg-[var(--color-bg)] text-left">
      <div className="max-w-[1180px] mx-auto space-y-6">
        {/* Page Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl sm:text-[34px] font-bold text-[var(--color-text)]">
              Your Library & Knowledge Vault
            </h1>
            <p className="text-[14.5px] text-[color-mix(in_srgb,var(--color-text)_75%,transparent)] max-w-2xl">
              All your visual mind maps, research notes, and uploaded source documents stored securely in the database for instant retrieval.
            </p>
          </div>
          <button
            onClick={() => setUploadModalOpen(true)}
            className="btn btn-primary text-xs font-semibold py-2 self-start sm:self-auto"
          >
            <i className="ph-duotone ph-cloud-arrow-up text-base"></i>
            Upload Source File
          </button>
        </header>

        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-accent-2-100)] border border-[var(--color-accent-2)] text-[13px] text-[var(--color-accent-2-900)]"
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="btn btn-quiet !min-h-[22px] !px-1.5 shrink-0"
              aria-label="Dismiss error"
            >
              <i className="ph-duotone ph-x text-xs"></i>
            </button>
          </div>
        )}

        {/* Tabs & Search Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-divider)] pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('maps')}
              className={`btn !min-h-[34px] !px-3.5 text-xs font-semibold ${
                activeTab === 'maps' ? 'btn-primary' : 'btn-ghost'
              }`}
            >
              <i className="ph-duotone ph-graph"></i>
              Mind Maps ({maps.length})
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className={`btn !min-h-[34px] !px-3.5 text-xs font-semibold ${
                activeTab === 'files' ? 'btn-primary' : 'btn-ghost'
              }`}
            >
              <i className="ph-duotone ph-file-text"></i>
              Uploaded Documents ({files.length})
            </button>

            {activeTab === 'files' && (
              <div className="hidden md:flex items-center gap-1 pl-2 border-l border-[var(--color-divider)]">
                {['all', 'pdf', 'docx', 'text', 'image'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setFileFilter(filter)}
                    className={`px-2 py-1 rounded-[var(--radius-sm)] text-[11px] font-bold uppercase transition-colors ${
                      fileFilter === filter
                        ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                        : 'text-[color-mix(in_srgb,var(--color-text)_65%,transparent)] hover:bg-[var(--color-surface)]'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-full sm:w-80 flex items-center gap-1.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  activeTab === 'maps'
                    ? 'Search mind maps (or speak)…'
                    : 'Search documents (or speak)…'
                }
                className="input text-[13.5px] !min-h-[36px] w-full"
                aria-label="Search library"
              />
            </div>
            <VoiceInputButton
              onTranscript={(txt) => setQuery(txt)}
              size="sm"
              title="Voice search library"
            />
          </div>

          <button
            type="button"
            onClick={toggleBionicReading}
            className={`btn !min-h-[34px] !px-3 text-xs font-semibold ${
              bionicEnabled
                ? 'bg-[var(--color-accent-100)] text-[var(--color-accent-900)] border border-[var(--color-accent-300)]'
                : 'btn-ghost'
            }`}
            title="Toggle Bionic Reading Fixations"
          >
            <i className="ph-duotone ph-eye text-sm"></i>
            Bionic: {bionicEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* -------------------- Mind Maps Tab -------------------- */}
        {activeTab === 'maps' && (
          <>
            {filteredMaps.length === 0 ? (
              <div className="p-12 text-center bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-divider)]">
                <div className="max-w-md mx-auto space-y-3">
                  <i className="ph-duotone ph-books text-4xl text-[var(--color-accent)]"></i>
                  <h2 className="text-xl font-bold text-[var(--color-text)]">
                    {maps.length ? 'Nothing matches that search' : 'No mind maps yet'}
                  </h2>
                  <p className="text-[14px] text-[color-mix(in_srgb,var(--color-text)_70%,transparent)]">
                    {maps.length
                      ? 'Try a different word or topic title.'
                      : 'Ask about any topic on the Mind Map page or upload a document to build your first map.'}
                  </p>
                  {!maps.length && (
                    <button
                      onClick={() => navigate('/mindmap')}
                      className="btn btn-primary text-sm font-semibold mt-2"
                    >
                      Make your first map
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMaps.map((m) => (
                  <article
                    key={m.id}
                    onClick={() => setOpenId(m.id)}
                    className="card elev-sm p-4 flex flex-col justify-between hover:shadow-[var(--shadow-md)] cursor-pointer group transition-all duration-150 border border-[var(--color-divider)] hover:border-[var(--color-accent)]"
                  >
                    <div className="space-y-2">
                      <span className="kicker block text-[10.5px]">
                        {m.isLensHandoff
                          ? 'Sent from Lens'
                          : new Date(m.updatedAt || m.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                      </span>
                      <h2 className="text-[16px] font-bold text-[var(--color-text)] leading-snug group-hover:text-[var(--color-accent-700)] transition-colors">
                        {m.title}
                      </h2>
                      <p className="text-[13px] text-[color-mix(in_srgb,var(--color-text)_70%,transparent)] line-clamp-3 leading-relaxed">
                        <BionicText text={m.summary} enabled={bionicEnabled} />
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-3 mt-4 border-t border-[var(--color-divider)]">
                      <span className="tag tag-neutral text-[11px]">
                        {countNodes(m.root)} topics
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => removeMap(e, m.id)}
                          className="btn btn-quiet !min-h-[26px] !px-2 text-[11.5px] hover:!text-[var(--color-accent-2-700)]"
                          title="Delete map"
                        >
                          Delete
                        </button>
                        <span className="btn btn-ghost !min-h-[26px] !px-2.5 text-[11.5px]">
                          Open
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {/* -------------------- Uploaded Documents Tab -------------------- */}
        {activeTab === 'files' && (
          <>
            {filteredFiles.length === 0 ? (
              <div className="p-12 text-center bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-divider)]">
                <div className="max-w-md mx-auto space-y-3">
                  <i className="ph-duotone ph-file-arrow-up text-4xl text-[var(--color-accent)]"></i>
                  <h2 className="text-xl font-bold text-[var(--color-text)]">
                    {files.length ? 'No documents match that search' : 'No uploaded files yet'}
                  </h2>
                  <p className="text-[14px] text-[color-mix(in_srgb,var(--color-text)_70%,transparent)]">
                    Upload your PDF, Word documents, research papers, or image notes. The files are stored in your database and ready for instant visual mind mapping, TTS reading, and Q&A.
                  </p>
                  <button
                    onClick={() => setUploadModalOpen(true)}
                    className="btn btn-primary text-sm font-semibold mt-2"
                  >
                    Upload your first document
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredFiles.map((file) => (
                  <article
                    key={file.id}
                    onClick={() => setViewingDocId(file.id)}
                    className="card elev-sm p-4 flex flex-col justify-between hover:shadow-[var(--shadow-md)] transition-all duration-150 border border-[var(--color-divider)] hover:border-[var(--color-accent)] cursor-pointer group"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="tag tag-accent text-[10.5px]">
                          {file.mimeType?.includes('pdf')
                            ? 'PDF'
                            : file.mimeType?.includes('word') || file.originalName?.endsWith('.docx')
                              ? 'DOCX'
                              : file.mimeType?.startsWith('image')
                                ? 'IMAGE'
                                : 'TEXT'}
                        </span>
                        <span className="text-[11px] text-[color-mix(in_srgb,var(--color-text)_55%,transparent)]">
                          {new Date(file.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric'
                            })}
                        </span>
                      </div>

                      <h2 className="text-[16px] font-bold text-[var(--color-text)] leading-snug truncate group-hover:text-[var(--color-accent-700)] transition-colors">
                        {file.originalName}
                      </h2>

                      <p className="text-[13px] text-[color-mix(in_srgb,var(--color-text)_70%,transparent)] line-clamp-3 leading-relaxed">
                        <BionicText
                          text={file.summary || 'Uploaded document stored in database.'}
                          enabled={bionicEnabled}
                        />
                      </p>
                    </div>

                    <div className="space-y-2 pt-3 mt-4 border-t border-[var(--color-divider)]">
                      <div className="flex items-center gap-2 text-[11px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
                        <span>{file.pageCount || 1} pgs</span>
                        <span>·</span>
                        <span>{Math.round((file.size || 0) / 1024)} KB</span>
                        <span>·</span>
                        <span>~{file.tokenCount || 0} tokens</span>
                      </div>

                      <div className="flex items-center justify-between gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setViewingDocId(file.id)}
                          className="btn btn-ghost !min-h-[26px] !px-2 text-[11px]"
                          title="Open full document reader"
                        >
                          <i className="ph-duotone ph-book-open"></i>
                          Read
                        </button>
                        <button
                          onClick={() => handleMindMapFromFile(file)}
                          disabled={Boolean(buildingFrom)}
                          className="btn btn-secondary !min-h-[26px] !px-2 text-[11px]"
                          title="Generate a mind map from this document"
                        >
                          {buildingFrom === file.id ? (
                            <>
                              <i className="ph-duotone ph-spinner animate-spin"></i>
                              Mapping…
                            </>
                          ) : (
                            <>
                              <i className="ph-duotone ph-graph"></i>
                              Map
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => navigate(`/mindmap?doc=${encodeURIComponent(file.id)}`)}
                          className="btn btn-primary !min-h-[26px] !px-2 text-[11px]"
                          title="Ask questions about this document"
                        >
                          <i className="ph-duotone ph-chats-circle"></i>
                          Query
                        </button>
                        <button
                          onClick={(e) => removeFile(e, file.id)}
                          className="btn btn-quiet !min-h-[26px] !px-1.5 text-[11px] hover:!text-[var(--color-accent-2-700)]"
                          title="Delete document"
                        >
                          <i className="ph-duotone ph-trash"></i>
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* File Upload Modal */}
      <FileUploadModal
        isOpen={uploadModalOpen}
        onClose={() => {
          setUploadModalOpen(false);
          loadFiles();
        }}
        onMindMapGenerated={(freshMap) => {
          const stored = saveMap(freshMap);
          setMaps(listMaps());
          setActiveTab('maps');
          if (stored) setOpenId(stored.id);
        }}
        onFileAttached={() => {
          loadFiles();
          setActiveTab('files');
        }}
      />

      {/* Document Reader & Cognitive Viewer Modal */}
      <DocumentViewerModal
        isOpen={Boolean(viewingDocId)}
        documentId={viewingDocId}
        onClose={() => setViewingDocId(null)}
        onMindMapGenerated={(freshMap) => {
          const stored = saveMap(freshMap);
          setMaps(listMaps());
          setActiveTab('maps');
          if (stored) setOpenId(stored.id);
        }}
      />
    </div>
  );
}

function countNodes(node) {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum, child) => sum + countNodes(child), 0);
}
