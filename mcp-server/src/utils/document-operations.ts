/**
 * Document block operations for partial content updates.
 *
 * These utilities operate on the top-level blocks of a TipTap document,
 * allowing insertion, replacement, and removal by index — so the AI
 * never needs to deal with TipTap JSON directly.
 */

import { type TipTapNode } from './normalize-content.js';

// =============================================================================
// Types
// =============================================================================

interface BlockInfo {
  index: number;
  type: string;
  preview: string;
  attrs?: Record<string, unknown>;
}

interface DocumentStructure {
  total_blocks: number;
  blocks: BlockInfo[];
}

// =============================================================================
// Structure extraction
// =============================================================================

/**
 * Extract a structural summary of a TipTap document.
 * Returns top-level block types with index and a short text preview.
 */
export function getDocumentStructure(content: unknown): DocumentStructure {
  const doc = content as TipTapNode | null;
  if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content)) {
    return { total_blocks: 0, blocks: [] };
  }

  const blocks: BlockInfo[] = doc.content.map((node, index) => {
    const info: BlockInfo = {
      index,
      type: mapTiptapTypeToReadable(node.type),
      preview: extractPreview(node),
    };

    if (node.attrs) {
      const relevantAttrs: Record<string, unknown> = {};
      if (node.attrs.level !== undefined) relevantAttrs.level = node.attrs.level;
      if (node.attrs.databaseId !== undefined) relevantAttrs.databaseId = node.attrs.databaseId;
      if (Object.keys(relevantAttrs).length > 0) info.attrs = relevantAttrs;
    }

    return info;
  });

  return { total_blocks: doc.content.length, blocks };
}

/**
 * Map TipTap internal type names to readable names.
 */
function mapTiptapTypeToReadable(type: string): string {
  const map: Record<string, string> = {
    bulletList: 'list',
    orderedList: 'ordered_list',
    taskList: 'checklist',
    codeBlock: 'code',
    blockquote: 'quote',
    horizontalRule: 'divider',
    databaseTable: 'database_table',
    accordionGroup: 'accordion',
    spreadsheet: 'spreadsheet',
    mindmap: 'mindmap',
  };
  return map[type] || type;
}

/**
 * Extract a short text preview from a TipTap node.
 */
function extractPreview(node: TipTapNode): string {
  const text = extractText(node).trim().slice(0, 120);

  if (text) return text;

  switch (node.type) {
    case 'columns':
      return `[${node.content?.length || 0} columns]`;
    case 'accordionGroup':
      return `[accordion: ${node.content?.length || 0} items]`;
    case 'databaseTable':
      return `[database table]`;
    case 'spreadsheet':
      return '[spreadsheet]';
    case 'mindmap':
      return '[mindmap]';
    case 'horizontalRule':
      return '---';
    case 'table':
      return `[table: ${node.content?.length || 0} rows]`;
    case 'taskList':
      return `[checklist: ${node.content?.length || 0} items]`;
    default:
      return `[${node.type}]`;
  }
}

/**
 * Recursively extract all text content from a TipTap node.
 */
function extractText(node: TipTapNode): string {
  if (node.type === 'text' && node.text) return node.text;
  if (!node.content) return '';
  return node.content.map(extractText).join('');
}

// =============================================================================
// Block manipulation
// =============================================================================

/**
 * Insert blocks at a specific position in a TipTap document.
 * Position 0 = beginning, position N = after block N-1.
 * Returns the modified document.
 */
export function insertBlocksAt(
  doc: TipTapNode,
  position: number,
  newBlocks: TipTapNode[],
): TipTapNode {
  const content = [...(doc.content || [])];
  const insertPos = Math.max(0, Math.min(position, content.length));
  content.splice(insertPos, 0, ...newBlocks);
  return { ...doc, content };
}

/**
 * Replace blocks in a range [start, end) with new blocks.
 * start is inclusive, end is exclusive.
 */
export function replaceBlocksRange(
  doc: TipTapNode,
  start: number,
  end: number,
  newBlocks: TipTapNode[],
): TipTapNode {
  const content = [...(doc.content || [])];
  const safeStart = Math.max(0, Math.min(start, content.length));
  const safeEnd = Math.max(safeStart, Math.min(end, content.length));
  content.splice(safeStart, safeEnd - safeStart, ...newBlocks);
  return { ...doc, content };
}

/**
 * Remove blocks in a range [start, end).
 * start is inclusive, end is exclusive.
 */
export function removeBlocksRange(
  doc: TipTapNode,
  start: number,
  end: number,
): TipTapNode {
  const content = [...(doc.content || [])];
  const safeStart = Math.max(0, Math.min(start, content.length));
  const safeEnd = Math.max(safeStart, Math.min(end, content.length));
  content.splice(safeStart, safeEnd - safeStart);
  return { ...doc, content: content.length > 0 ? content : [{ type: 'paragraph' }] };
}
