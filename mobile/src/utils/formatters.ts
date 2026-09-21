import { MindMapDocument, MindMapNode } from '../types';

export function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  
  // Set times to midnight to calculate strict day differences
  const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const diffTime = nowMidnight.getTime() - dateMidnight.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function truncateText(text: string, maxLen: number): string {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen).trim() + '…';
}

/**
 * A file size somebody can actually picture.
 *
 * Rounded hard — one decimal place at most, and none once past a megabyte.
 * "1.4 MB" is a size; "1,468,006 bytes" is a number to decode, which is the
 * exact tax this app exists to remove.
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

export function generateMapMarkdown(map: MindMapDocument): string {
  if (!map || !map.root) return '';
  
  let markdown = `# ${map.topic}\n\n`;
  if (map.summary) {
    markdown += `${map.summary}\n\n`;
  }
  
  function traverse(node: MindMapNode, depth: number) {
    const indent = '  '.repeat(depth);
    markdown += `${indent}- ${node.label}`;
    
    if (node.detail) {
      markdown += `: ${node.detail}`;
    }
    markdown += '\n';
    
    if (node.keyFacts && node.keyFacts.length > 0) {
      node.keyFacts.forEach(fact => {
        markdown += `${indent}  * ${fact}\n`;
      });
    }
    
    if (node.children) {
      node.children.forEach(child => traverse(child, depth + 1));
    }
  }
  
  traverse(map.root, 0);
  
  return markdown;
}
