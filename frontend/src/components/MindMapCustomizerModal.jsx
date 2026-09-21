import { useState, useEffect, useRef } from 'react';
import { COLOR_PALETTES } from '../lib/layout';
import { useDialog } from '../lib/useDialog';
import { getPrefs } from '../lib/storage';

const GRID_PATTERNS = [
  { id: 'dots', label: 'Dot Grid', icon: 'ph-dots-nine', desc: 'Classic 24px subtle radial dots' },
  { id: 'grid', label: 'Blueprint Grid', icon: 'ph-grid-four', desc: 'Engineering graph grid lines' },
  { id: 'isometric', label: 'Isometric Grid', icon: 'ph-squares-four', desc: 'Modern diagonal subtle texture' },
  { id: 'crosses', label: 'Tech Crosses', icon: 'ph-plus', desc: 'Clean pinpoint crosshairs' },
  { id: 'clean', label: 'Pure Canvas', icon: 'ph-square', desc: 'Distraction-free solid background' }
];

const EDGE_STYLES = [
  { id: 'bezier', label: 'Organic Curves', icon: 'ph-bezier-curve', desc: 'Flowing natural cubic beziers' },
  { id: 'straight', label: 'Straight Lines', icon: 'ph-line-segments', desc: 'Crisp minimal direct lines' },
  { id: 'orthogonal', label: 'Tree Right-Angles', icon: 'ph-tree-structure', desc: 'Structured circuit step lines' },
  { id: 'arc', label: 'Rounded Arcs', icon: 'ph-curved-arrow', desc: 'Smooth rounded corner turns' }
];

const NODE_STYLES = [
  { id: 'comfortable', label: 'Comfortable Card', icon: 'ph-cardholder', desc: 'Generous padding & rich typography' },
  { id: 'compact', label: 'Compact Dense', icon: 'ph-rows', desc: 'High density for massive maps' },
  { id: 'glass', label: 'Frosted Glass', icon: 'ph-sparkle', desc: 'Translucent backdrop-blur finish' },
  { id: 'pill', label: 'Curved Pill', icon: 'ph-circle', desc: 'Soft circular ergonomic badges' }
];

const SENSORY_TINTS = [
  { id: 'none', label: 'Off', color: 'transparent', desc: 'Natural theme background' },
  { id: 'peach', label: 'Peach Warmth', color: '#ffd8b8', desc: 'Reduces visual glare & contrast strain' },
  { id: 'rose', label: 'Rose Calming', color: '#ffc4d6', desc: 'Soft soothing reading tint' },
  { id: 'mint', label: 'Mint Sage', color: '#c7f9cc', desc: 'High focus & reduced ocular fatigue' },
  { id: 'aqua', label: 'Aqua Marine', color: '#bbf2f6', desc: 'Cool relaxing contrast' },
  { id: 'lavender', label: 'Lavender Focus', color: '#e2d9fc', desc: 'ADHD focus & dyslexia ease' },
  { id: 'yellow', label: 'Buttercup Yellow', color: '#fef08a', desc: 'High legibility low blue-light tint' }
];

export default function MindMapCustomizerModal({
  isOpen,
  onClose,
  currentPrefs,
  onUpdatePrefs
}) {
  const [activeTab, setActiveTab] = useState('palette');
  const [localPrefs, setLocalPrefs] = useState(() => currentPrefs || getPrefs());
  const dialogRef = useRef(null);

  // Above the `if (!isOpen)` early return below — hooks cannot be conditional.
  useDialog({ isOpen, onClose, containerRef: dialogRef });

  useEffect(() => {
    if (isOpen) {
      setLocalPrefs(currentPrefs || getPrefs());
    }
  }, [isOpen, currentPrefs]);

  if (!isOpen) return null;

  const update = (patch) => {
    const next = { ...localPrefs, ...patch };
    setLocalPrefs(next);
    onUpdatePrefs?.(next);
  };

  const handleReset = () => {
    const defaults = {
      mapColorTheme: 'broadsheet',
      mapEdgeStyle: 'bezier',
      mapGridPattern: 'dots',
      mapNodeStyle: 'comfortable',
      mapEdgeWidth: 2.2,
      mapTextScale: 1.0,
      chatPanelSide: 'left',
      colorOverlay: 'none',
      colorOverlayOpacity: 0.12
    };
    update(defaults);
  };

  return (
    <div
      className="dialog-backdrop items-center justify-center p-4 z-50 animate-setu-rise"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="customizer-modal-title"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="dialog w-full max-w-2xl max-h-[88vh] flex flex-col p-0 overflow-hidden shadow-2xl border border-[var(--color-divider)] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-divider)] bg-[var(--color-surface)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[var(--color-accent-100)] flex items-center justify-center text-[var(--color-accent)]">
              <i className="ph-duotone ph-paint-brush-broad text-lg"></i>
            </div>
            <div>
              <h2 id="customizer-modal-title" className="text-[18px] font-bold text-[var(--color-text)] leading-tight">
                Customize Mind Map & Page
              </h2>
              <p className="text-[12px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)] mt-0.5">
                Personalize visual palettes, connectors, grid patterns, node styles, and workspace ergonomics
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost !min-h-[32px] !w-8 !p-0 rounded-full text-lg"
            aria-label="Close customizer"
          >
            <i className="ph-duotone ph-x"></i>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 py-2.5 bg-[var(--color-bg)] border-b border-[var(--color-divider)] overflow-x-auto">
          {[
            { id: 'palette', label: 'Color Palettes', icon: 'ph-palette' },
            { id: 'edges', label: 'Connectors', icon: 'ph-bezier-curve' },
            { id: 'grid', label: 'Background Grid', icon: 'ph-grid-four' },
            { id: 'nodes', label: 'Node Style', icon: 'ph-cards' },
            { id: 'workspace', label: 'Workspace & Tints', icon: 'ph-layout' }
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] text-[12.5px] font-semibold transition-all cursor-pointer border-0 shrink-0 ${
                  isActive
                    ? 'bg-[var(--color-accent-100)] text-[var(--color-accent-900)] border border-[var(--color-accent-300)]'
                    : 'bg-transparent text-[color-mix(in_srgb,var(--color-text)_70%,transparent)] hover:bg-[var(--color-surface)]'
                }`}
              >
                <i className={`ph-duotone ${tab.icon} text-base`}></i>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[var(--color-bg)] text-left">
          {/* TAB 1: COLOR PALETTES */}
          {activeTab === 'palette' && (
            <div className="space-y-4">
              <div>
                <span className="kicker block">Branch Color Schemes</span>
                <p className="text-[13px] text-[color-mix(in_srgb,var(--color-text)_65%,transparent)] mt-1">
                  Choose the color family used to differentiate branches and cognitive paths.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.values(COLOR_PALETTES).map((pal) => {
                  const isSelected = (localPrefs.mapColorTheme || 'broadsheet') === pal.id;
                  return (
                    <button
                      key={pal.id}
                      onClick={() => update({ mapColorTheme: pal.id })}
                      className={`p-3.5 rounded-[var(--radius-md)] border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[var(--color-accent)] bg-[var(--color-surface)] ring-2 ring-[var(--color-accent)] shadow-[var(--shadow-sm)]'
                          : 'border-[var(--color-divider)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-[14px] text-[var(--color-text)]">
                          {pal.name}
                        </span>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-[var(--color-accent)] text-[var(--color-bg)] flex items-center justify-center text-xs">
                            <i className="ph-duotone ph-check"></i>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 pt-1">
                        {pal.colors.map((c, i) => (
                          <span
                            key={i}
                            className="w-5 h-5 rounded-full border border-black/10 shadow-xs"
                            style={{ backgroundColor: c }}
                            title={c}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: CONNECTORS & EDGES */}
          {activeTab === 'edges' && (
            <div className="space-y-5">
              <div>
                <span className="kicker block">Connector Line Geometry</span>
                <p className="text-[13px] text-[color-mix(in_srgb,var(--color-text)_65%,transparent)] mt-1">
                  Control how branches visually link parent topics to their child leaves.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {EDGE_STYLES.map((edge) => {
                  const isSelected = (localPrefs.mapEdgeStyle || 'bezier') === edge.id;
                  return (
                    <button
                      key={edge.id}
                      onClick={() => update({ mapEdgeStyle: edge.id })}
                      className={`p-3.5 rounded-[var(--radius-md)] border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[var(--color-accent)] bg-[var(--color-surface)] ring-2 ring-[var(--color-accent)] shadow-[var(--shadow-sm)]'
                          : 'border-[var(--color-divider)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <i className={`ph-duotone ${edge.icon} text-lg text-[var(--color-accent)]`}></i>
                        <span className="font-bold text-[14px] text-[var(--color-text)]">
                          {edge.label}
                        </span>
                      </div>
                      <p className="text-[12px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
                        {edge.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-[var(--color-divider)] space-y-2">
                <span className="kicker block">Line Weight & Thickness</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 1.5, label: 'Fine (1.5px)' },
                    { value: 2.2, label: 'Standard (2.2px)' },
                    { value: 3.2, label: 'Bold (3.2px)' }
                  ].map((w) => {
                    const isSelected = (localPrefs.mapEdgeWidth || 2.2) === w.value;
                    return (
                      <button
                        key={w.value}
                        onClick={() => update({ mapEdgeWidth: w.value })}
                        className={`px-3.5 py-1.5 rounded-[var(--radius-md)] text-[12.5px] font-semibold border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[var(--color-accent)] text-[var(--color-bg)] border-[var(--color-accent)]'
                            : 'bg-[var(--color-surface)] border-[var(--color-divider)] text-[var(--color-text)] hover:border-[var(--color-accent)]'
                        }`}
                      >
                        {w.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BACKGROUND GRID PATTERNS */}
          {activeTab === 'grid' && (
            <div className="space-y-4">
              <div>
                <span className="kicker block">Canvas Floor Pattern</span>
                <p className="text-[13px] text-[color-mix(in_srgb,var(--color-text)_65%,transparent)] mt-1">
                  Choose a guiding canvas texture for spatial balance and depth.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {GRID_PATTERNS.map((grid) => {
                  const isSelected = (localPrefs.mapGridPattern || 'dots') === grid.id;
                  return (
                    <button
                      key={grid.id}
                      onClick={() => update({ mapGridPattern: grid.id })}
                      className={`p-3.5 rounded-[var(--radius-md)] border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[var(--color-accent)] bg-[var(--color-surface)] ring-2 ring-[var(--color-accent)] shadow-[var(--shadow-sm)]'
                          : 'border-[var(--color-divider)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <i className={`ph-duotone ${grid.icon} text-lg text-[var(--color-accent)]`}></i>
                        <span className="font-bold text-[14px] text-[var(--color-text)]">
                          {grid.label}
                        </span>
                      </div>
                      <p className="text-[12px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
                        {grid.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: NODE STYLE & TEXT SIZE */}
          {activeTab === 'nodes' && (
            <div className="space-y-5">
              <div>
                <span className="kicker block">Card Geometry & Aesthetics</span>
                <p className="text-[13px] text-[color-mix(in_srgb,var(--color-text)_65%,transparent)] mt-1">
                  Configure the card shape, surface finish, and visual density of nodes.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {NODE_STYLES.map((style) => {
                  const isSelected = (localPrefs.mapNodeStyle || 'comfortable') === style.id;
                  return (
                    <button
                      key={style.id}
                      onClick={() => update({ mapNodeStyle: style.id })}
                      className={`p-3.5 rounded-[var(--radius-md)] border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[var(--color-accent)] bg-[var(--color-surface)] ring-2 ring-[var(--color-accent)] shadow-[var(--shadow-sm)]'
                          : 'border-[var(--color-divider)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <i className={`ph-duotone ${style.icon} text-lg text-[var(--color-accent)]`}></i>
                        <span className="font-bold text-[14px] text-[var(--color-text)]">
                          {style.label}
                        </span>
                      </div>
                      <p className="text-[12px] text-[color-mix(in_srgb,var(--color-text)_60%,transparent)]">
                        {style.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-[var(--color-divider)] space-y-2">
                <span className="kicker block">Node Text Size Scale</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 0.88, label: '88% Compact' },
                    { value: 1.0, label: '100% Standard' },
                    { value: 1.15, label: '115% Comfortable' },
                    { value: 1.3, label: '130% Large Print' }
                  ].map((s) => {
                    const isSelected = (localPrefs.mapTextScale || 1.0) === s.value;
                    return (
                      <button
                        key={s.value}
                        onClick={() => update({ mapTextScale: s.value })}
                        className={`px-3.5 py-1.5 rounded-[var(--radius-md)] text-[12.5px] font-semibold border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[var(--color-accent)] text-[var(--color-bg)] border-[var(--color-accent)]'
                            : 'bg-[var(--color-surface)] border-[var(--color-divider)] text-[var(--color-text)] hover:border-[var(--color-accent)]'
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: WORKSPACE & SENSORY TINTS */}
          {activeTab === 'workspace' && (
            <div className="space-y-5">
              <div>
                <span className="kicker block">Workspace Panel Alignment</span>
                <p className="text-[13px] text-[color-mix(in_srgb,var(--color-text)_65%,transparent)] mt-1">
                  Place the conversation panel on your preferred side for natural flow.
                </p>
                <div className="flex gap-2.5 mt-2.5">
                  <button
                    onClick={() => update({ chatPanelSide: 'left' })}
                    className={`flex-1 p-3 rounded-[var(--radius-md)] border text-left flex items-center gap-2.5 cursor-pointer ${
                      (localPrefs.chatPanelSide || 'left') === 'left'
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-100)] text-[var(--color-accent-900)] font-bold'
                        : 'border-[var(--color-divider)] bg-[var(--color-surface)] text-[var(--color-text)]'
                    }`}
                  >
                    <i className="ph-duotone ph-sidebar-simple text-xl"></i>
                    <div>
                      <span className="block text-[13.5px]">Chat on Left</span>
                      <span className="block text-[11px] font-normal opacity-75">Mind map on right</span>
                    </div>
                  </button>

                  <button
                    onClick={() => update({ chatPanelSide: 'right' })}
                    className={`flex-1 p-3 rounded-[var(--radius-md)] border text-left flex items-center gap-2.5 cursor-pointer ${
                      localPrefs.chatPanelSide === 'right'
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-100)] text-[var(--color-accent-900)] font-bold'
                        : 'border-[var(--color-divider)] bg-[var(--color-surface)] text-[var(--color-text)]'
                    }`}
                  >
                    <i className="ph-duotone ph-sidebar-simple-mirror text-xl"></i>
                    <div>
                      <span className="block text-[13.5px]">Chat on Right</span>
                      <span className="block text-[11px] font-normal opacity-75">Mind map on left</span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--color-divider)] space-y-3">
                <div>
                  <span className="kicker block">Visual Stress Tint (Irlen Spectral Filter)</span>
                  <p className="text-[12.5px] text-[color-mix(in_srgb,var(--color-text)_62%,transparent)] mt-0.5">
                    Calming colored overlay applied over the whole page to reduce visual snow, scotopic sensitivity, and reading fatigue.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SENSORY_TINTS.map((tint) => {
                    const isSelected = (localPrefs.colorOverlay || 'none') === tint.id;
                    return (
                      <button
                        key={tint.id}
                        onClick={() => update({ colorOverlay: tint.id })}
                        className={`p-2 rounded-[var(--radius-md)] border text-left transition-all cursor-pointer flex items-center gap-2 ${
                          isSelected
                            ? 'border-[var(--color-accent)] bg-[var(--color-surface)] ring-2 ring-[var(--color-accent)] font-bold'
                            : 'border-[var(--color-divider)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]'
                        }`}
                      >
                        <span
                          className="w-4 h-4 rounded-full border border-black/20 shrink-0"
                          style={{ backgroundColor: tint.color === 'transparent' ? '#ffffff' : tint.color }}
                        />
                        <span className="text-[12px] truncate">{tint.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-[var(--color-surface)] border-t border-[var(--color-divider)]">
          <button
            onClick={handleReset}
            className="btn btn-ghost !min-h-[34px] text-xs flex items-center gap-1.5"
            title="Reset to recommended defaults"
          >
            <i className="ph-duotone ph-arrow-counter-clockwise"></i>
            Reset to Defaults
          </button>
          <button
            onClick={onClose}
            className="btn btn-primary !min-h-[34px] px-5 text-xs font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
