/**
 * SETU Mobile — mind map tree layout.
 *
 * A Reingold-Tilford layout, laid out left-to-right and sized for a phone.
 * Two passes: measure every subtree bottom-up, then place each node at the
 * vertical centre of the space its subtree occupies. That is what stops
 * branches drifting apart as the tree deepens, which is the failure mode that
 * makes a map unreadable on a small screen.
 *
 * The presentation options are inputs to the *layout*, not just to the
 * renderer, because they change how tall a node is. Hiding the detail text in
 * picture mode and then laying out as though it were still there leaves a map
 * full of gaps; measuring with it hidden closes them, which is most of why
 * picture mode is worth having at all.
 */

import { MindMapNode, PlacedNode, PlacedEdge } from '../types';

const COLUMN_WIDTH = [160, 180, 160];
const H_GAP = 54;
const V_GAP = 16;

/** How many plates the branch colours cycle through. */
export const PLATE_COUNT = 4;

export interface LayoutOptions {
  /** Whether node detail text is drawn. False in picture mode. */
  showDetail?: boolean;
  /** Tighter padding and smaller minimums, for fitting more on screen. */
  compact?: boolean;
  /** Node text scale, 0.85–1.3. Nodes grow to keep the text inside them. */
  textScale?: number;
}

const DEFAULTS: Required<LayoutOptions> = {
  showDetail: true,
  compact: false,
  textScale: 1,
};

export function widthFor(depth: number, options: LayoutOptions = {}): number {
  const { compact, textScale } = { ...DEFAULTS, ...options };
  const base = COLUMN_WIDTH[Math.min(depth, COLUMN_WIDTH.length - 1)];
  return Math.round(base * (compact ? 0.86 : 1) * Math.max(1, textScale * 0.94));
}

export function heightFor(node: MindMapNode, depth: number, options: LayoutOptions = {}): number {
  const { showDetail, compact, textScale } = { ...DEFAULTS, ...options };

  const width = widthFor(depth, options);
  const charsPerLine = Math.max(10, Math.floor(width / (7.2 * textScale)));

  const labelLines = Math.max(1, Math.ceil((node.label || '').length / (charsPerLine * 0.85)));
  const detailLines =
    showDetail && node.detail ? Math.min(3, Math.ceil(node.detail.length / charsPerLine)) : 0;

  const padding = (depth === 0 ? 20 : 16) * (compact ? 0.75 : 1);
  const labelHeight = labelLines * (depth === 0 ? 18 : 16) * textScale;
  const detailHeight = detailLines * 14 * textScale;

  const minHeights = compact ? [50, 42, 36] : [60, 52, 44];
  const minH = minHeights[Math.min(depth, minHeights.length - 1)] * Math.max(1, textScale * 0.95);

  return Math.round(Math.max(minH, padding + labelHeight + (detailHeight ? detailHeight + 4 : 0)));
}

export function layoutTree(
  root: MindMapNode,
  collapsed: Set<string> = new Set(),
  options: LayoutOptions = {}
): {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
} {
  if (!root) return { nodes: [], edges: [], width: 0, height: 0 };

  const opts = { ...DEFAULTS, ...options };
  const nodes: PlacedNode[] = [];
  const edges: PlacedEdge[] = [];
  const metrics = new Map<MindMapNode, { own: number; span: number }>();

  const gap = V_GAP * (opts.compact ? 0.7 : 1);
  const hGap = H_GAP * (opts.compact ? 0.8 : 1);

  const visibleChildren = (node: MindMapNode) =>
    collapsed.has(node.id) ? [] : node.children || [];

  const spanOf = (node: MindMapNode) => metrics.get(node)?.span ?? 0;

  // Pass 1 — measure subtree heights bottom-up
  function measure(node: MindMapNode, depth: number): number {
    const own = heightFor(node, depth, opts);
    const children = visibleChildren(node);

    if (!children.length) {
      metrics.set(node, { own, span: own });
      return own;
    }

    const childSpan = children.reduce(
      (sum, child, index) => sum + measure(child, depth + 1) + (index ? gap : 0),
      0
    );

    const span = Math.max(own, childSpan);
    metrics.set(node, { own, span });
    return span;
  }

  // Pass 2 — place nodes at vertical centres
  function place(
    node: MindMapNode,
    depth: number,
    x: number,
    spanTop: number,
    branch: number
  ): PlacedNode {
    const { own: height, span } = metrics.get(node)!;
    const width = widthFor(depth, opts);
    const y = spanTop + (span - height) / 2;

    const children = visibleChildren(node);
    const hasHiddenChildren = collapsed.has(node.id) && (node.children || []).length > 0;

    const placed: PlacedNode = {
      id: node.id,
      label: node.label,
      detail: node.detail,
      depth,
      x,
      y,
      width,
      height,
      branch,
      childCount: (node.children || []).length,
      collapsed: hasHiddenChildren,
      raw: node,
    };
    nodes.push(placed);

    if (!children.length) return placed;

    const childX = x + width + hGap;
    const childrenSpan = children.reduce((s, c, i) => s + spanOf(c) + (i ? gap : 0), 0);
    let cursor = spanTop + (span - childrenSpan) / 2;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const branchIndex = depth === 0 ? i % PLATE_COUNT : branch;
      const childPlaced = place(child, depth + 1, childX, cursor, branchIndex);

      edges.push({
        id: `${placed.id}-${childPlaced.id}`,
        from: { x: x + width, y: y + height / 2 },
        to: { x: childX, y: childPlaced.y + childPlaced.height / 2 },
        depth: depth + 1,
        branch: branchIndex,
      });

      cursor += spanOf(child) + gap;
    }

    return placed;
  }

  measure(root, 0);
  const totalHeight = metrics.get(root)?.span || 300;
  const paddingX = 24;
  const paddingY = 24;

  // The root prints on the ink plate — index 3 in the four-plate cycle.
  place(root, 0, paddingX, paddingY, 3);

  let maxX = 0;
  for (const n of nodes) {
    if (n.x + n.width > maxX) maxX = n.x + n.width;
  }

  return {
    nodes,
    edges,
    width: maxX + paddingX * 2,
    height: totalHeight + paddingY * 2,
  };
}

/**
 * The trail from the root down to a node, as labels.
 *
 * Used when asking the engine to explain a branch: "Photosynthesis → Light
 * reactions → Photosystem II" tells the model where the idea sits, and an
 * explanation that knows its context is a different quality of answer from one
 * given three words in isolation.
 */
export function pathTo(root: MindMapNode, targetId: string): string[] | null {
  if (!root) return null;

  const walk = (node: MindMapNode, trail: string[]): string[] | null => {
    const here = [...trail, node.label];
    if (node.id === targetId) return here;
    for (const child of node.children || []) {
      const found = walk(child, here);
      if (found) return found;
    }
    return null;
  };

  return walk(root, []);
}
