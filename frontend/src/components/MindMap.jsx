import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  layoutTree,
  edgePath,
  flatten,
  pathTo,
  withChildren,
  COLOR_PALETTES,
  PLATE_COLORS
} from '../lib/layout';
import { api } from '../lib/api';
import { tts } from '../lib/tts';
import { getPrefs, savePrefs } from '../lib/storage';
import { award } from '../lib/progress';

const SPEAK_DELAY_MS = 240;

export default function MindMap({
  map,
  onMapChange,
  onNodeFocus,
  palette = 'broadsheet',
  edgeStyle = 'bezier',
  gridPattern = 'dots',
  nodeStyle = 'comfortable',
  edgeWidth = 2.2,
  textScale = 1.0,
  onOpenCustomizer = null,
  onAddChild = null,
  onEditNode = null
}) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [selected, setSelected] = useState(null);
  const [expanding, setExpanding] = useState(null);
  const [expandError, setExpandError] = useState(null);
  const [view, setView] = useState({ x: 24, y: 24, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const [speakOnHover, setSpeakOnHover] = useState(() => getPrefs().speakOnHover !== false);
  const [pictureMode, setPictureMode] = useState(() => Boolean(getPrefs().pictureMode));

  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const didFitRef = useRef(false);
  const speakTimerRef = useRef(null);
  const draggingRef = useRef(false);

  /**
   * Whether the reader has panned or zoomed since the last automatic fit.
   *
   * The canvas is re-fitted when its box changes size — opening the branch
   * explainer, collapsing the conversation panel, or simply resizing the window
   * all used to leave the map stranded off-screen with no way back except the
   * fit button. But re-fitting a map somebody has deliberately zoomed into
   * would throw away their place, so the automatic pass stands down as soon as
   * they take the viewport into their own hands.
   */
  const userMovedRef = useRef(false);

  const root = map?.root;
  const activePalette = (COLOR_PALETTES[palette] || COLOR_PALETTES.broadsheet).colors;

  const { nodes, edges, width, height } = useMemo(
    () => layoutTree(root, collapsed, palette),
    [root, collapsed, palette]
  );

  /* Fit to view */
  const fit = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !width || !height) return;

    const padding = 54;
    const scale = Math.min(
      1.15,
      Math.max(
        0.35,
        Math.min(
          (viewport.clientWidth - padding * 2) / width,
          (viewport.clientHeight - padding * 2) / height
        )
      )
    );

    setView({
      scale,
      x: Math.max(16, (viewport.clientWidth - width * scale) / 2),
      y: Math.max(16, (viewport.clientHeight - height * scale) / 2)
    });
  }, [width, height]);

  // Fit once per map on load
  useEffect(() => {
    didFitRef.current = false;
    userMovedRef.current = false;
    setCollapsed(new Set());
    setSelected(null);
  }, [map?.id, map?.createdAt]);

  useEffect(() => {
    if (!didFitRef.current && width && height) {
      didFitRef.current = true;
      fit();
    }
  }, [width, height, fit]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return undefined;

    let frame = null;
    const observer = new ResizeObserver(() => {
      if (userMovedRef.current) return;
      // Coalesced into a frame: a resize fires continuously while a panel
      // animates open, and re-fitting on every tick is a full layout each time.
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fit());
    });

    observer.observe(viewport);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [fit]);

  /* Pan & Zoom */
  const onPointerDown = (event) => {
    if (event.target.closest('[data-node]')) return;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y
    };
    draggingRef.current = true;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  // Only a live drag may set state here. Anything unconditional in this handler
  // re-renders every node and every edge on each mouse move across the canvas,
  // which is what a stray cursor-tracking state did before it was removed —
  // it was never read by anything, and it cost a full tree render per pixel.
  const onPointerMove = (event) => {
    const dragState = dragRef.current;
    if (!dragState) return;

    userMovedRef.current = true;
    setView((current) => ({
      ...current,
      x: dragState.originX + (event.clientX - dragState.startX),
      y: dragState.originY + (event.clientY - dragState.startY)
    }));
  };

  const endDrag = () => {
    if (dragRef.current) {
      dragRef.current = null;
    }
    draggingRef.current = false;
    setDragging(false);
  };

  /* ------------------------- Auditory node reading ------------------------- */

  const cancelPendingSpeech = useCallback(() => {
    if (speakTimerRef.current) {
      clearTimeout(speakTimerRef.current);
      speakTimerRef.current = null;
    }
  }, []);

  const speakNode = useCallback(
    (node) => {
      if (!speakOnHover || draggingRef.current) return;
      cancelPendingSpeech();
      speakTimerRef.current = setTimeout(() => {
        speakTimerRef.current = null;
        tts.speak(node.detail ? `${node.label}. ${node.detail}` : node.label);
      }, SPEAK_DELAY_MS);
    },
    [speakOnHover, cancelPendingSpeech]
  );

  const stopSpeaking = useCallback(() => {
    cancelPendingSpeech();
    tts.stop();
  }, [cancelPendingSpeech]);

  useEffect(
    () => () => {
      cancelPendingSpeech();
      tts.stop();
    },
    [cancelPendingSpeech]
  );

  // Both toggles keep their side effects outside the updater: stopping speech
  // and writing preferences are not idempotent, and StrictMode runs updaters
  // twice in development.
  const toggleSpeakOnHover = () => {
    const next = !speakOnHover;
    setSpeakOnHover(next);
    if (!next) stopSpeaking();
    savePrefs({ speakOnHover: next });
  };

  const togglePictureMode = () => {
    const next = !pictureMode;
    setPictureMode(next);
    savePrefs({ pictureMode: next });
  };

  const zoomBy = (factor) => {
    userMovedRef.current = true;
    setView((current) => ({
      ...current,
      scale: Math.min(2.4, Math.max(0.22, current.scale * factor))
    }));
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1.12 : 0.89);
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, []);

  /* Node interactions */
  const toggleCollapse = (id) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expand = useCallback(
    async (node) => {
      if (expanding || !map) return;
      setExpanding(node.id);
      setExpandError(null);

      try {
        const path = pathTo(root, node.id) || [node.label];
        const { children } = await api.expandNode(map.title, node.label, node.detail, path);

        if (!children?.length) {
          setExpandError(`No deeper detail came back for “${node.label}”.`);
          return;
        }

        const updated = {
          ...map,
          root: withChildren(root, node.id, [...(node.raw.children || []), ...children])
        };
        onMapChange?.(updated);
        award('branchExpanded');
        setCollapsed((current) => {
          const next = new Set(current);
          next.delete(node.id);
          return next;
        });
      } catch (err) {
        setExpandError(err.message || `Could not research deeper into “${node.label}”.`);
      } finally {
        setExpanding(null);
      }
    },
    [expanding, map, root, onMapChange]
  );

  useEffect(() => {
    if (!expandError) return undefined;
    const timer = setTimeout(() => setExpandError(null), 6000);
    return () => clearTimeout(timer);
  }, [expandError]);

  const selectNode = (node) => {
    // Hovering already started reading the branch out. Selecting it means the
    // reader wants it *explained*, and the explainer will speak its own answer
    // — so the hover read-out is cut here rather than left talking over it.
    stopSpeaking();
    setSelected(node.id);
    onNodeFocus?.(node);
  };

  /* Keyboard navigation */
  const order = useMemo(() => flatten(root, collapsed), [root, collapsed]);

  const onKeyDown = (event, node) => {
    const index = order.findIndex((n) => n.id === node.id);

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = order[index + (event.key === 'ArrowDown' ? 1 : -1)];
      if (next) document.querySelector(`[data-node="${next.id}"]`)?.focus();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (!collapsed.has(node.id) && node.childCount) toggleCollapse(node.id);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (collapsed.has(node.id)) toggleCollapse(node.id);
      else if (!node.childCount) expand(node);
    }
  };

  if (!root) return null;

  /* Background Grid Styles */
  const getGridBackgroundStyle = () => {
    const size = Math.max(12, Math.round(26 * view.scale));
    if (gridPattern === 'clean') {
      return {};
    }
    if (gridPattern === 'grid') {
      return {
        backgroundImage: `
          linear-gradient(to right, color-mix(in srgb, var(--color-text) 10%, transparent) 1px, transparent 1px),
          linear-gradient(to bottom, color-mix(in srgb, var(--color-text) 10%, transparent) 1px, transparent 1px)
        `,
        backgroundSize: `${size}px ${size}px`,
        backgroundPosition: `${view.x}px ${view.y}px`
      };
    }
    if (gridPattern === 'isometric') {
      return {
        backgroundImage: `
          linear-gradient(60deg, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px),
          linear-gradient(120deg, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)
        `,
        backgroundSize: `${size * 1.5}px ${size * 1.5}px`,
        backgroundPosition: `${view.x}px ${view.y}px`
      };
    }
    if (gridPattern === 'crosses') {
      return {
        backgroundImage: `
          radial-gradient(circle, color-mix(in srgb, var(--color-text) 18%, transparent) 1.5px, transparent 1.5px)
        `,
        backgroundSize: `${size * 1.2}px ${size * 1.2}px`,
        backgroundPosition: `${view.x}px ${view.y}px`
      };
    }
    // Default: dots
    return {
      backgroundImage:
        'radial-gradient(circle, color-mix(in srgb, var(--color-text) 15%, transparent) 1px, transparent 1px)',
      backgroundSize: `${size}px ${size}px`,
      backgroundPosition: `${view.x}px ${view.y}px`
    };
  };

  return (
    <div
      id="mindmap-canvas-container"
      className="relative h-full w-full overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] border border-[var(--color-divider)]"
    >
      {/* Background Floor Pattern */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-55 transition-opacity"
        style={getGridBackgroundStyle()}
      />

      {/* Main Viewport Container */}
      <div
        ref={viewportRef}
        className={`absolute inset-0 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="application"
        aria-label={`Mind map: ${map.title}. Use arrow keys to navigate.`}
      >
        <div
          className="absolute origin-top-left will-change-transform"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            width,
            height
          }}
        >
          {/* Connector SVG */}
          <svg
            id="mindmap-canvas-svg"
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={width}
            height={height}
            aria-hidden
          >
            {edges.map((edge) => {
              const edgeColor = activePalette[edge.branch % activePalette.length] || PLATE_COLORS[0];
              return (
                <path
                  key={edge.id}
                  d={edgePath(edge, edgeStyle)}
                  pathLength="1"
                  fill="none"
                  stroke={edgeColor}
                  strokeOpacity={edge.depth === 1 ? 0.75 : 0.5}
                  strokeWidth={edge.depth === 1 ? edgeWidth : Math.max(1.2, edgeWidth * 0.75)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="animate-setu-draw"
                />
              );
            })}
          </svg>

          {/* Placed Nodes */}
          {nodes.map((node) => {
            const nodeColor =
              node.customColor ||
              activePalette[node.branch % activePalette.length] ||
              PLATE_COLORS[0];
            return (
              <Node
                key={node.id}
                node={node}
                color={nodeColor}
                selected={selected === node.id}
                expanding={expanding === node.id}
                pictureMode={pictureMode}
                nodeStyle={nodeStyle}
                textScale={textScale}
                onSelect={() => selectNode(node)}
                onToggle={() => toggleCollapse(node.id)}
                onExpand={() => expand(node)}
                onKeyDown={(event) => onKeyDown(event, node)}
                onSpeak={() => speakNode(node)}
                onSilence={stopSpeaking}
                onAddChild={onAddChild ? () => onAddChild(node) : null}
                onEditNode={onEditNode ? () => onEditNode(node) : null}
              />
            );
          })}
        </div>
      </div>

      {/* Floating Canvas Controls */}
      <Controls
        scale={view.scale}
        speakOnHover={speakOnHover}
        pictureMode={pictureMode}
        onZoomIn={() => zoomBy(1.18)}
        onZoomOut={() => zoomBy(0.85)}
        onFit={() => {
          userMovedRef.current = false;
          fit();
        }}
        onCollapseAll={() =>
          setCollapsed(new Set(nodes.filter((n) => n.depth >= 1 && n.childCount).map((n) => n.id)))
        }
        onExpandAll={() => setCollapsed(new Set())}
        onToggleSpeak={toggleSpeakOnHover}
        onTogglePicture={togglePictureMode}
        onOpenCustomizer={onOpenCustomizer}
      />

      {/* Expansion failure notice */}
      {expandError && (
        <div
          role="status"
          className="absolute bottom-11 left-4 right-4 sm:right-auto sm:max-w-md p-2.5 rounded-[var(--radius-md)] bg-[var(--color-accent-2-100)] border border-[var(--color-accent-2)] text-[12.5px] leading-snug text-[var(--color-accent-2-900)] shadow-[var(--shadow-md)] animate-setu-rise z-20"
        >
          {expandError}
        </div>
      )}

      {/* Bottom Hint Bar */}
      <div className="pointer-events-none absolute bottom-3 left-4 right-20 flex items-center justify-between text-[11.5px] text-[color-mix(in_srgb,var(--color-text)_55%,transparent)] select-none">
        <span>
          {speakOnHover
            ? 'Point at a branch to hear it · click it for an explanation in your language · double-click to research deeper'
            : 'Click a branch for an explanation in your language · double-click to research deeper · arrow keys work too'}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------- Node Component -------------------------------- */

function Node({
  node,
  color,
  selected,
  expanding,
  pictureMode,
  nodeStyle = 'comfortable',
  textScale = 1.0,
  onSelect,
  onToggle,
  onExpand,
  onKeyDown,
  onSpeak,
  onSilence,
  onAddChild,
  onEditNode
}) {
  const isRoot = node.depth === 0;

  const getStyleClass = () => {
    if (nodeStyle === 'glass') return 'node-glass';
    if (nodeStyle === 'pill') return 'node-pill';
    return '';
  };

  const isCompact = nodeStyle === 'compact';

  return (
    <div
      className="group absolute animate-setu-rise"
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
    >
      <button
        data-node={node.id}
        onClick={onSelect}
        onDoubleClick={onExpand}
        onKeyDown={onKeyDown}
        onPointerEnter={onSpeak}
        onPointerLeave={onSilence}
        onFocus={onSpeak}
        onBlur={onSilence}
        aria-expanded={node.childCount ? !node.collapsed : undefined}
        title={node.detail || node.label}
        className={`relative h-full w-full rounded-[var(--radius-md)] bg-[var(--color-bg)] ${
          isCompact ? 'p-2' : 'p-2.5'
        } text-left transition-all duration-150 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] overflow-hidden cursor-pointer ${getStyleClass()} ${
          selected
            ? 'ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-surface)] shadow-md'
            : ''
        } ${pictureMode ? 'grid place-content-center text-center' : ''}`}
        style={{
          borderLeft: `3.5px solid ${isRoot ? 'var(--color-text)' : color}`,
          fontSize: `${textScale * (isRoot ? 16 : node.depth === 1 ? 13.5 : 12)}px`,
          ...(pictureMode ? { background: `color-mix(in srgb, ${color} 14%, var(--color-bg))` } : {})
        }}
      >
        {pictureMode ? (
          <>
            <span
              className="mx-auto grid h-7 w-7 place-items-center rounded-full text-xs font-bold"
              style={{
                background: color,
                color: '#ffffff'
              }}
            >
              {node.emoji || (isRoot ? '◉' : String.fromCharCode(65 + ((node.branch || 0) % 26)))}
            </span>
            <span className="mt-1 block font-bold text-[var(--color-text)] truncate max-w-[130px]">
              {node.label}
            </span>
          </>
        ) : (
          <div className="flex flex-col h-full justify-center">
            <div className="flex items-center gap-1.5 min-w-0">
              {node.emoji && <span className="text-sm shrink-0">{node.emoji}</span>}
              <span
                className={`font-bold leading-snug text-[var(--color-text)] ${
                  isRoot ? 'text-[15px]' : 'text-[13.5px]'
                }`}
                style={{ fontSize: `${textScale * (isRoot ? 15 : 13)}px` }}
              >
                {node.label}
              </span>
            </div>

            {node.detail && !isCompact && (
              <span
                className="mt-1 block text-[11px] leading-tight text-[color-mix(in_srgb,var(--color-text)_60%,transparent)] line-clamp-2"
                style={{ fontSize: `${textScale * 11}px` }}
              >
                {node.detail}
              </span>
            )}
          </div>
        )}
      </button>

      {/* Floating Hover Action Badges */}
      <div className="absolute -bottom-2.5 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity z-10">
        {/* Edit Node Action */}
        {onEditNode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditNode();
            }}
            aria-label={`Edit ${node.label}`}
            title="Edit topic title, notes, or emoji"
            className="grid h-[22px] w-[22px] place-items-center rounded-full bg-[var(--color-bg)] border border-[var(--color-divider)] text-[11px] text-[var(--color-text)] shadow-xs hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] cursor-pointer"
          >
            <i className="ph-duotone ph-pencil-simple"></i>
          </button>
        )}

        {/* Add Child Branch Action */}
        {onAddChild && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddChild();
            }}
            aria-label={`Add child branch to ${node.label}`}
            title="Add your own custom idea branch here"
            className="grid h-[22px] w-[22px] place-items-center rounded-full bg-[var(--color-accent-100)] border border-[var(--color-accent-300)] text-[11px] font-bold text-[var(--color-accent-900)] shadow-xs hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)] cursor-pointer"
          >
            <i className="ph-duotone ph-plus"></i>
          </button>
        )}

        {/* Collapse / Expand Toggle */}
        {node.childCount > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-label={node.collapsed ? `Expand ${node.label}` : `Collapse ${node.label}`}
            title={node.collapsed ? 'Expand branches' : 'Collapse branches'}
            className="grid h-[22px] w-[22px] place-items-center rounded-full border border-[var(--color-divider)] bg-[var(--color-bg)] text-[10px] font-bold text-[var(--color-text)] shadow-xs hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] cursor-pointer"
          >
            {node.collapsed ? `+${node.childCount}` : '−'}
          </button>
        )}

        {/* AI Research Deeper */}
        {node.childCount === 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
            disabled={expanding}
            aria-label={`Research deeper into ${node.label}`}
            title="AI research deeper into this branch"
            className="grid h-[22px] w-[22px] place-items-center rounded-full border border-dashed border-[var(--color-divider)] bg-[var(--color-bg)] text-[11px] font-bold text-[var(--color-text)] shadow-xs hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] cursor-pointer disabled:opacity-100"
          >
            {expanding ? (
              <i className="ph-duotone ph-spinner animate-spin text-[11px] text-[var(--color-accent)]"></i>
            ) : (
              <i className="ph-duotone ph-sparkle text-[11px] text-[var(--color-accent)]"></i>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Floating Controls Toolbar ------------------------------ */

function Controls({
  scale,
  speakOnHover,
  pictureMode,
  onZoomIn,
  onZoomOut,
  onFit,
  onCollapseAll,
  onExpandAll,
  onToggleSpeak,
  onTogglePicture,
  onOpenCustomizer
}) {
  return (
    <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-[var(--radius-md)] bg-[var(--color-bg)] p-1 shadow-[var(--shadow-md)] border border-[var(--color-divider)] z-20 animate-setu-rise">
      {/* Visual Customizer Button */}
      {onOpenCustomizer && (
        <>
          <button
            onClick={onOpenCustomizer}
            aria-label="Customize palette, grid, and connectors"
            title="Customize Mind Map (Palettes, Connectors, Grid, Style)"
            className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-accent-100)] text-[var(--color-accent-900)] border border-[var(--color-accent-300)] cursor-pointer hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)] transition-colors"
          >
            <i className="ph-duotone ph-paint-brush-broad text-sm"></i>
          </button>
          <div className="my-0.5 h-px bg-[var(--color-divider)]" />
        </>
      )}

      {/* Voice Read on Hover */}
      <button
        onClick={onToggleSpeak}
        aria-pressed={speakOnHover}
        aria-label={speakOnHover ? 'Turn off speak on hover' : 'Turn on speak on hover'}
        title={
          speakOnHover
            ? 'Speaking branches on hover — click to silence'
            : 'Silent — click to read branches aloud on hover'
        }
        className={`grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] cursor-pointer ${
          speakOnHover
            ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
            : 'text-[var(--color-text)] hover:bg-[var(--color-surface)]'
        }`}
      >
        <i
          className={`ph-duotone ${speakOnHover ? 'ph-speaker-high' : 'ph-speaker-slash'} text-sm`}
        ></i>
      </button>

      {/* Picture / Visual Disc Mode */}
      <button
        onClick={onTogglePicture}
        aria-pressed={pictureMode}
        aria-label={pictureMode ? 'Show branch descriptions' : 'Hide branch descriptions'}
        title={
          pictureMode
            ? 'Picture mode on — descriptions are spoken, not written'
            : 'Picture mode off — click to strip the supporting text'
        }
        className={`grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] cursor-pointer ${
          pictureMode
            ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
            : 'text-[var(--color-text)] hover:bg-[var(--color-surface)]'
        }`}
      >
        <i className="ph-duotone ph-image text-sm"></i>
      </button>

      <div className="my-0.5 h-px bg-[var(--color-divider)]" />

      {/* Zoom Controls */}
      <button
        onClick={onZoomIn}
        aria-label="Zoom in"
        title="Zoom in"
        className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text)] hover:bg-[var(--color-surface)] cursor-pointer"
      >
        <i className="ph-duotone ph-plus text-sm"></i>
      </button>

      <span className="text-center font-mono text-[10px] font-semibold text-[color-mix(in_srgb,var(--color-text)_55%,transparent)] select-none py-0.5">
        {Math.round(scale * 100)}%
      </span>

      <button
        onClick={onZoomOut}
        aria-label="Zoom out"
        title="Zoom out"
        className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text)] hover:bg-[var(--color-surface)] cursor-pointer"
      >
        <i className="ph-duotone ph-minus text-sm"></i>
      </button>

      <div className="my-0.5 h-px bg-[var(--color-divider)]" />

      {/* Viewport Fit & Structure */}
      <button
        onClick={onFit}
        aria-label="Fit to screen"
        title="Fit to screen"
        className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text)] hover:bg-[var(--color-surface)] cursor-pointer"
      >
        <i className="ph-duotone ph-arrows-out text-sm"></i>
      </button>

      <button
        onClick={onCollapseAll}
        aria-label="Collapse branches"
        title="Collapse branches"
        className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text)] hover:bg-[var(--color-surface)] cursor-pointer"
      >
        <i className="ph-duotone ph-tree-structure text-sm"></i>
      </button>

      <button
        onClick={onExpandAll}
        aria-label="Expand all"
        title="Expand all"
        className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text)] hover:bg-[var(--color-surface)] cursor-pointer"
      >
        <i className="ph-duotone ph-arrows-out-line-vertical text-sm"></i>
      </button>
    </div>
  );
}
