/**
 * Mind Map Export Utilities
 * -------------------------
 * PDF, PNG, SVG, Markdown, and JSON exports.
 *
 * SVG and PNG are rendered from the map data through the same layout engine the
 * canvas uses, rather than screenshotting the DOM. That matters for two reasons:
 * the on-screen canvas is panned and zoomed, so a screenshot silently crops
 * whatever is off-view, and the live SVG layer holds only the connector paths,
 * so serialising it produces a file of curved lines with no text on it.
 *
 * jsPDF is imported dynamically — it is large, and most sessions never export.
 */

import { layoutTree, PLATE_COLORS, widthFor } from './layout';

/** Broadsheet palette, duplicated here so exports do not depend on live CSS vars. */
const PAPER = '#f3f2f2';
const SURFACE = '#eae9e9';
const INK = '#201e1d';
const MUTED = '#6b6866';
const HAIRLINE = '#d5d2cf';

function sanitizeFilename(title, ext) {
  const base = (title || 'setu-mindmap')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base || 'mindmap'}.${ext}`;
}

/** Hand a blob to the browser as a download, then release the object URL. */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke on the next frame: revoking synchronously can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** Greedy word wrap to a character budget, matching the canvas height estimate. */
function wrapText(text, charsPerLine, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= charsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[,.;:]$/, '')}…`;
  }
  return lines;
}

/* -------------------------------------------------------------------------- */
/* SVG rendering                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Render the whole map to a standalone SVG string at its natural size.
 * Every branch is expanded, so the export is complete regardless of what the
 * user currently has collapsed on screen.
 */
export function buildMindMapSvg(map) {
  if (!map?.root) return null;

  const { nodes, edges, width, height } = layoutTree(map.root, new Set());
  const headerHeight = 76;
  const totalWidth = Math.max(width + 32, 720);
  const totalHeight = height + headerHeight + 32;

  const parts = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" ` +
      `viewBox="0 0 ${totalWidth} ${totalHeight}" font-family="Georgia, 'Times New Roman', serif">`
  );

  parts.push(`<rect width="${totalWidth}" height="${totalHeight}" fill="${PAPER}"/>`);

  // Title block
  parts.push(
    `<text x="24" y="30" font-size="11" font-weight="700" letter-spacing="1.2" fill="#00607d">` +
      `SETU SANCTUARY — MIND MAP</text>`
  );
  parts.push(
    `<text x="24" y="54" font-size="20" font-weight="700" fill="${INK}">` +
      `${escapeXml(wrapText(map.title, 78, 1)[0] || map.title)}</text>`
  );
  if (map.summary) {
    parts.push(
      `<text x="24" y="70" font-size="11" fill="${MUTED}">` +
        `${escapeXml(wrapText(map.summary, 120, 1)[0] || '')}</text>`
    );
  }
  parts.push(
    `<line x1="24" y1="${headerHeight - 2}" x2="${totalWidth - 24}" y2="${headerHeight - 2}" ` +
      `stroke="${HAIRLINE}" stroke-width="1"/>`
  );

  parts.push(`<g transform="translate(0, ${headerHeight})">`);

  // Connectors first so nodes sit on top of them.
  for (const edge of edges) {
    const dx = Math.max(36, (edge.to.x - edge.from.x) * 0.45);
    const d =
      `M ${edge.from.x},${edge.from.y} C ${edge.from.x + dx},${edge.from.y} ` +
      `${edge.to.x - dx},${edge.to.y} ${edge.to.x},${edge.to.y}`;
    parts.push(
      `<path d="${d}" fill="none" stroke="${PLATE_COLORS[edge.branch ?? 0]}" ` +
        `stroke-opacity="${edge.depth === 1 ? 0.6 : 0.4}" ` +
        `stroke-width="${edge.depth === 1 ? 2.2 : 1.4}" stroke-linecap="round"/>`
    );
  }

  for (const node of nodes) {
    const isRoot = node.depth === 0;
    const accent = isRoot ? INK : PLATE_COLORS[node.branch ?? 0];
    const labelSize = isRoot ? 16.5 : node.depth === 1 ? 14 : 12.5;
    const charsPerLine = Math.max(12, Math.floor(widthFor(node.depth) / 7.2));

    parts.push(
      `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="3" ` +
        `fill="#ffffff" stroke="${HAIRLINE}" stroke-width="1"/>`
    );
    // Coloured plate spine on the left edge.
    parts.push(
      `<rect x="${node.x}" y="${node.y}" width="3.5" height="${node.height}" fill="${accent}"/>`
    );

    let cursorY = node.y + (isRoot ? 20 : 17);
    for (const line of wrapText(node.label, Math.floor(charsPerLine * 0.85), 2)) {
      parts.push(
        `<text x="${node.x + 12}" y="${cursorY}" font-size="${labelSize}" font-weight="600" ` +
          `fill="${INK}">${escapeXml(line)}</text>`
      );
      cursorY += labelSize + 2;
    }

    if (node.detail) {
      cursorY += 3;
      for (const line of wrapText(node.detail, charsPerLine, 3)) {
        if (cursorY > node.y + node.height - 4) break;
        parts.push(
          `<text x="${node.x + 12}" y="${cursorY}" font-size="11" fill="${MUTED}">` +
            `${escapeXml(line)}</text>`
        );
        cursorY += 13;
      }
    }
  }

  parts.push('</g>');

  parts.push(
    `<text x="24" y="${totalHeight - 10}" font-size="9" fill="${MUTED}">` +
      `Generated by SETU Sanctuary · ${escapeXml(new Date().toLocaleDateString())}</text>`
  );

  parts.push('</svg>');

  return { svg: parts.join(''), width: totalWidth, height: totalHeight };
}

/** Export the map as a standalone vector SVG file. */
export function exportMindMapToSVG(map) {
  const built = buildMindMapSvg(map);
  if (!built) return false;

  downloadBlob(
    new Blob([built.svg], { type: 'image/svg+xml;charset=utf-8' }),
    sanitizeFilename(map.title, 'svg')
  );
  return true;
}

/**
 * Export the map as a high-resolution PNG by rasterising the generated SVG.
 * This captures the entire map, not just whatever is currently in the viewport.
 */
export async function exportMindMapToPNG(map, scale = 2.5) {
  const built = buildMindMapSvg(map);
  if (!built) return false;

  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(built.svg)}`;

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not rasterise the mind map.'));
    img.src = svgUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(built.width * scale);
  canvas.height = Math.round(built.height * scale);

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not encode the PNG.');

  downloadBlob(blob, sanitizeFilename(map.title, 'png'));
  return true;
}

/* -------------------------------------------------------------------------- */
/* PDF                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Export a Broadsheet-styled PDF: summary, key takeaways, the full hierarchy,
 * and citations. jsPDF is loaded on demand to keep it out of the initial bundle.
 */
export async function exportMindMapToPDF(map) {
  if (!map) return false;

  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  /** Break to a new page when the next block would not fit. */
  const ensureRoom = (needed) => {
    if (y + needed > pageHeight - 50) {
      doc.addPage();
      y = margin;
      return true;
    }
    return false;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 96, 125);
  doc.text('SETU SANCTUARY — COGNITIVE RESEARCH & VISUAL MAP', margin, y);
  y += 20;

  doc.setFontSize(22);
  doc.setTextColor(32, 30, 29);
  const titleLines = doc.splitTextToSize(map.title || 'Untitled Mind Map', contentWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 24 + 6;

  doc.setDrawColor(213, 210, 207);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  if (map.summary) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(60, 58, 55);
    const summaryLines = doc.splitTextToSize(map.summary, contentWidth - 24);
    const boxHeight = summaryLines.length * 14 + 22;

    ensureRoom(boxHeight);
    doc.setFillColor(234, 233, 233);
    doc.setDrawColor(213, 210, 207);
    doc.roundedRect(margin, y, contentWidth, boxHeight, 4, 4, 'FD');
    doc.text(summaryLines, margin + 12, y + 20);
    y += boxHeight + 14;
  }

  if (map.keyFacts?.length) {
    ensureRoom(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(32, 30, 29);
    doc.text('Key Takeaways', margin, y);
    y += 16;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(50, 48, 45);

    for (const fact of map.keyFacts) {
      const factLines = doc.splitTextToSize(fact, contentWidth - 18);
      ensureRoom(factLines.length * 14 + 6);
      doc.setFillColor(0, 136, 176);
      doc.circle(margin + 5, y - 3, 2.5, 'F');
      doc.text(factLines, margin + 16, y);
      y += factLines.length * 14 + 4;
    }
    y += 12;
  }

  ensureRoom(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(32, 30, 29);
  doc.text('Mind Map Hierarchy', margin, y);
  y += 20;

  const walkTree = (node, depth) => {
    if (!node) return;

    const indent = margin + (depth - 1) * 18;
    const labelWidth = contentWidth - (depth - 1) * 18;

    if (depth === 1) {
      ensureRoom(34);
      doc.setDrawColor(213, 210, 207);
      doc.setFillColor(245, 244, 243);
      doc.roundedRect(indent, y - 11, labelWidth, 22, 3, 3, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 28, 26);
      doc.text(node.label || '', indent + 8, y + 3);
      y += 20;

      if (node.detail) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(90, 85, 80);
        const detailLines = doc.splitTextToSize(node.detail, labelWidth - 16);
        ensureRoom(detailLines.length * 12 + 6);
        doc.text(detailLines, indent + 10, y);
        y += detailLines.length * 12 + 8;
      }
    } else {
      ensureRoom(20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(50, 48, 45);
      doc.text(`— ${node.label || ''}`, indent, y);
      y += 13;

      if (node.detail) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 95, 90);
        const detailLines = doc.splitTextToSize(node.detail, labelWidth - 14);
        ensureRoom(detailLines.length * 11 + 4);
        doc.text(detailLines, indent + 14, y);
        y += detailLines.length * 11 + 5;
      }
    }

    for (const child of node.children || []) walkTree(child, depth + 1);
  };

  for (const branch of map.root?.children || []) walkTree(branch, 1);

  if (map.sources?.length) {
    ensureRoom(50);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(32, 30, 29);
    doc.text('Sources & Citations', margin, y);
    y += 15;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 96, 125);

    for (const source of map.sources) {
      const line = source.url ? `${source.title} — ${source.url}` : source.title;
      const sourceLines = doc.splitTextToSize(line, contentWidth);
      ensureRoom(sourceLines.length * 11 + 4);
      doc.text(sourceLines, margin, y);
      y += sourceLines.length * 11 + 3;
    }
  }

  const totalPages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 145, 140);
    doc.text(`Generated by SETU Sanctuary · Page ${page} of ${totalPages}`, margin, pageHeight - 20);
  }

  doc.save(sanitizeFilename(map.title, 'pdf'));
  return true;
}

/* -------------------------------------------------------------------------- */
/* Text formats                                                               */
/* -------------------------------------------------------------------------- */

export function exportMindMapToMarkdown(map) {
  if (!map) return false;

  const lines = [`# ${map.title}`, ''];
  if (map.summary) lines.push(map.summary, '');

  if (map.keyFacts?.length) {
    lines.push('## Key facts', ...map.keyFacts.map((fact) => `- ${fact}`), '');
  }

  lines.push('## Mind map outline', '');
  const walk = (node, depth) => {
    const indent = '  '.repeat(Math.max(0, depth - 1));
    lines.push(`${indent}- **${node.label}**${node.detail ? ` — ${node.detail}` : ''}`);
    (node.children || []).forEach((child) => walk(child, depth + 1));
  };
  (map.root?.children || []).forEach((branch) => walk(branch, 1));

  if (map.followUps?.length) {
    lines.push('', '## Where to go next', ...map.followUps.map((q) => `- ${q}`));
  }

  if (map.sources?.length) {
    lines.push('', '## Sources', ...map.sources.map((s) => `- [${s.title}](${s.url})`));
  }

  lines.push('', '---', '_Generated by SETU Sanctuary._');

  downloadBlob(
    new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }),
    sanitizeFilename(map.title, 'md')
  );
  return true;
}

export function exportMindMapToJSON(map) {
  if (!map) return false;

  downloadBlob(
    new Blob([JSON.stringify(map, null, 2)], { type: 'application/json;charset=utf-8' }),
    sanitizeFilename(map.title, 'json')
  );
  return true;
}
