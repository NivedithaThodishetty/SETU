/**
 * Tidy horizontal tree layout for the Broadsheet mind map.
 *
 * Nodes render as real HTML button elements (focusable, wrapping, screen-reader
 * friendly) positioned absolutely; only the connecting edges are SVG. That
 * keeps the map keyboard-navigable.
 *
 * The algorithm is a simplified Reingold–Tilford pass: measure each subtree's
 * height bottom-up, then centre each parent against its children. Sibling
 * subtrees never overlap because a parent's slot is exactly the sum of its
 * children's slots.
 */

export const COLOR_PALETTES = {
  broadsheet: {
    name: 'Broadsheet Classic',
    id: 'broadsheet',
    colors: ['#0088b0', '#d6006c', '#edbb00', '#201e1d', '#10b981', '#6366f1', '#f97316']
  },
  cyberpunk: {
    name: 'Neon Horizon',
    id: 'cyberpunk',
    colors: ['#06b6d4', '#ec4899', '#8b5cf6', '#f59e0b', '#10b981', '#3b82f6', '#14b8a6']
  },
  nature: {
    name: 'Forest & Earth',
    id: 'nature',
    colors: ['#059669', '#d97706', '#0284c7', '#7c3aed', '#db2777', '#16a34a', '#ca8a04']
  },
  sunset: {
    name: 'Sunset & Warmth',
    id: 'sunset',
    colors: ['#f97316', '#e11d48', '#9333ea', '#2563eb', '#0d9488', '#eab308', '#dc2626']
  },
  monochrome: {
    name: 'Slate Minimal',
    id: 'monochrome',
    colors: ['#334155', '#475569', '#64748b', '#1e293b', '#0f172a', '#6b7280', '#52525b']
  },
  pastel: {
    name: 'Calming Pastel',
    id: 'pastel',
    colors: ['#38bdf8', '#fb7185', '#fbbf24', '#34d399', '#a78bfa', '#f472b6', '#818cf8']
  }
};

export const PLATE_COLORS = COLOR_PALETTES.broadsheet.colors;

/** Column width per depth, in px. Root is 186; depth 1 is 200; leaves are 168. */
const WIDTH = [186, 200, 168];
/** Horizontal gap between columns. */
const H_GAP = 66;
/** Minimum vertical gap between sibling nodes. */
const V_GAP = 14;

export const widthFor = (depth) => WIDTH[Math.min(depth, WIDTH.length - 1)];

/**
 * Estimate rendered height from text length.
 * Deterministic, so layout is stable across renders without layout shifts.
 */
export function heightFor(node, depth) {
  const width = widthFor(depth);
  const charsPerLine = Math.max(12, Math.floor(width / 7.2));

  const labelLines = Math.max(1, Math.ceil((node.label || '').length / (charsPerLine * 0.85)));
  const detailLines = node.detail ? Math.ceil(node.detail.length / charsPerLine) : 0;

  const padding = depth === 0 ? 22 : 18;
  const labelHeight = labelLines * (depth === 0 ? 20 : 17);
  const detailHeight = detailLines * 15;

  const minHeights = [64, 56, 46];
  const minH = minHeights[Math.min(depth, minHeights.length - 1)];

  return Math.max(minH, padding + labelHeight + (detailHeight ? detailHeight + 4 : 0));
}

/**
 * Compute absolute positions for every visible node.
 *
 * @param {object} root          tree with { id, label, detail, children }
 * @param {Set}    collapsed     ids whose children are hidden
 * @param {string|Array} palette palette name or color array
 * @returns {{nodes: Array, edges: Array, width: number, height: number, byId: Map}}
 */
export function layoutTree(root, collapsed = new Set(), palette = 'broadsheet') {
  if (!root) return { nodes: [], edges: [], width: 0, height: 0, byId: new Map() };

  const activeColors = Array.isArray(palette)
    ? palette
    : (COLOR_PALETTES[palette] || COLOR_PALETTES.broadsheet).colors;

  const nodes = [];
  const edges = [];

  /**
   * Measurements live here rather than on the nodes themselves. The same tree
   * objects get saved to storage, synced to MongoDB, and exported as JSON, so
   * writing layout scratch onto them would leak `_own`/`_span` into user data.
   */
  const metrics = new Map();

  const visibleChildren = (node) =>
    collapsed.has(node.id) ? [] : node.children || [];

  const spanOf = (node) => metrics.get(node)?.span ?? 0;

  /** Pass 1 — total vertical space each subtree needs. */
  function measure(node, depth) {
    const own = heightFor(node, depth);
    const children = visibleChildren(node);

    if (!children.length) {
      metrics.set(node, { own, span: own });
      return own;
    }

    const childSpan = children.reduce(
      (sum, child, index) => sum + measure(child, depth + 1) + (index ? V_GAP : 0),
      0
    );

    // A parent taller than all its children still needs its own room.
    const span = Math.max(own, childSpan);
    metrics.set(node, { own, span });
    return span;
  }

  /**
   * Pass 2 — place each node at the vertical centre of its allotted span.
   */
  function place(node, depth, x, spanTop, branch) {
    const { own: height, span } = metrics.get(node);
    const width = widthFor(depth);
    const y = spanTop + (span - height) / 2;

    const children = visibleChildren(node);
    const hasHiddenChildren = collapsed.has(node.id) && (node.children || []).length > 0;

    const placed = {
      id: node.id,
      label: node.label,
      detail: node.detail,
      emoji: node.emoji || null,
      customColor: node.customColor || null,
      depth,
      x,
      y,
      width,
      height,
      branch,
      childCount: (node.children || []).length,
      collapsed: hasHiddenChildren,
      raw: node
    };
    nodes.push(placed);

    if (!children.length) return placed;

    const childX = x + width + H_GAP;
    const childrenSpan = children.reduce((s, c, i) => s + spanOf(c) + (i ? V_GAP : 0), 0);
    let cursor = spanTop + (span - childrenSpan) / 2;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      // Top-level branches each claim a plate; everything below inherits it, so
      // a whole subtree reads as one colour family.
      const branchIndex = depth === 0 ? i % activeColors.length : branch;
      const childPlaced = place(child, depth + 1, childX, cursor, branchIndex);

      edges.push({
        id: `${placed.id}-${childPlaced.id}`,
        from: { x: x + width, y: y + height / 2 },
        to: { x: childX, y: childPlaced.y + childPlaced.height / 2 },
        depth: depth + 1,
        branch: branchIndex
      });

      cursor += spanOf(child) + V_GAP;
    }

    return placed;
  }

  const totalHeight = measure(root, 0);
  place(root, 0, 16, 16, 3 % activeColors.length);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const maxX = nodes.reduce((max, n) => Math.max(max, n.x + n.width), 0) + 32;

  return {
    nodes,
    edges,
    width: Math.max(620, maxX),
    height: Math.max(400, totalHeight + 32),
    byId
  };
}

/**
 * Connecting path between two points supporting various visual aesthetics.
 *
 * @param {object} from  {x, y}
 * @param {object} to    {x, y}
 * @param {string} style 'bezier' | 'straight' | 'orthogonal' | 'arc'
 */
export function edgePath({ from, to }, style = 'bezier') {
  if (style === 'straight') {
    return `M ${from.x},${from.y} L ${to.x},${to.y}`;
  }

  if (style === 'orthogonal') {
    const midX = (from.x + to.x) / 2;
    return `M ${from.x},${from.y} H ${midX} V ${to.y} H ${to.x}`;
  }

  if (style === 'arc') {
    const midX = (from.x + to.x) / 2;
    const dy = to.y - from.y;
    const radius = Math.min(18, Math.abs(dy) / 2, Math.abs(midX - from.x) / 2);
    if (Math.abs(dy) < 4 || radius <= 2) {
      return `M ${from.x},${from.y} L ${to.x},${to.y}`;
    }
    const dirY = dy > 0 ? 1 : -1;
    return `M ${from.x},${from.y} H ${midX - radius} Q ${midX},${from.y} ${midX},${from.y + radius * dirY} V ${to.y - radius * dirY} Q ${midX},${to.y} ${midX + radius},${to.y} H ${to.x}`;
  }

  // Default: organic smooth cubic bezier curve
  const dx = Math.max(36, (to.x - from.x) * 0.45);
  return `M ${from.x},${from.y} C ${from.x + dx},${from.y} ${to.x - dx},${to.y} ${to.x},${to.y}`;
}

/** Flatten a tree into depth-first order — used for keyboard navigation. */
export function flatten(root, collapsed = new Set(), out = []) {
  if (!root) return out;
  out.push(root);
  if (!collapsed.has(root.id)) {
    for (const child of root.children || []) flatten(child, collapsed, out);
  }
  return out;
}

/** Path of labels from the root down to `id`, for expansion context. */
export function pathTo(root, id, trail = []) {
  if (!root) return null;
  const next = [...trail, root.label];
  if (root.id === id) return next;

  for (const child of root.children || []) {
    const found = pathTo(child, id, next);
    if (found) return found;
  }
  return null;
}

/** Immutably replace one node's children. */
export function withChildren(root, id, children) {
  if (!root) return root;
  if (root.id === id) return { ...root, children };
  return { ...root, children: (root.children || []).map((c) => withChildren(c, id, children)) };
}

/** Immutably add a new child node to a parent node in the tree. */
export function addNodeToTree(root, parentId, newNode) {
  if (!root) return null;
  const nodeToAdd = {
    id: newNode.id || `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    label: newNode.label || 'New Branch',
    detail: newNode.detail || '',
    emoji: newNode.emoji || null,
    customColor: newNode.customColor || null,
    children: []
  };

  if (root.id === parentId) {
    return {
      ...root,
      children: [...(root.children || []), nodeToAdd]
    };
  }

  return {
    ...root,
    children: (root.children || []).map((c) => addNodeToTree(c, parentId, newNode))
  };
}

/** Immutably edit a node in the tree. */
export function editNodeInTree(root, targetId, updates) {
  if (!root) return null;
  if (root.id === targetId) {
    return {
      ...root,
      ...updates
    };
  }

  return {
    ...root,
    children: (root.children || []).map((c) => editNodeInTree(c, targetId, updates))
  };
}

/** Immutably delete a node and its descendants from the tree. */
export function deleteNodeFromTree(root, targetId) {
  if (!root || root.id === targetId) return null; // Cannot delete root directly
  return {
    ...root,
    children: (root.children || [])
      .filter((c) => c.id !== targetId)
      .map((c) => deleteNodeFromTree(c, targetId))
  };
}
