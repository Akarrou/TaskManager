/**
 * Content normalizer for Kodo documents
 *
 * Accepts "Kodo Content JSON" — a simple JSON array of blocks with clear keys —
 * and converts it to valid TipTap JSON for the editor.
 *
 * The AI never sees or produces TipTap JSON. It sends a flat, simple JSON array:
 *
 * [
 *   { "type": "heading", "level": 1, "text": "Title" },
 *   { "type": "paragraph", "text": "Text with **bold** and *italic*" },
 *   { "type": "list", "items": ["Point 1", "Point 2"] },
 *   { "type": "checklist", "items": [{ "text": "Done", "checked": true }] },
 *   { "type": "ordered_list", "items": ["First", "Second"] },
 *   { "type": "quote", "text": "A blockquote" },
 *   { "type": "code", "language": "ts", "text": "const x = 42;" },
 *   { "type": "divider" },
 *   { "type": "table", "headers": ["Name", "Age"], "rows": [["Alice", "30"]] }
 * ]
 *
 * Text values support inline Markdown: **bold**, *italic*, ~~strike~~, `code`, [link](url)
 */

import { convertMarkdownToTiptap } from './markdown-to-tiptap.js';
import { parseInlineMarkdown } from './markdown-to-tiptap.js';

// =============================================================================
// Types
// =============================================================================

interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
}

/** Kodo Content JSON block types */
interface KodoBlock {
  type: string;
  text?: string;
  level?: number;
  items?: string[] | Array<{ text: string; checked?: boolean }>;
  language?: string;
  headers?: string[];
  rows?: string[][];
  url?: string;
  alt?: string;
}

// Valid TipTap block types (for passthrough detection)
const TIPTAP_BLOCK_TYPES = new Set([
  'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem',
  'taskList', 'taskItem', 'codeBlock', 'blockquote', 'horizontalRule',
  'table', 'tableRow', 'tableHeader', 'tableCell',
  'image', 'columns', 'column', 'accordionGroup', 'accordionItem',
  'accordionTitle', 'accordionContent', 'databaseTable', 'spreadsheet',
  'mindmap', 'taskMention', 'taskSection', 'hardBreak',
]);

// Kodo Content JSON block types
const KODO_BLOCK_TYPES = new Set([
  'heading', 'paragraph', 'list', 'ordered_list', 'checklist',
  'quote', 'code', 'divider', 'table', 'image',
]);

// =============================================================================
// Main entry point
// =============================================================================

/**
 * Normalize any content value into a valid TipTap doc node.
 *
 * Priority order:
 * 1. null/undefined → empty doc
 * 2. Kodo Content JSON (array of blocks with "type" keys) → convert
 * 3. TipTap JSON (passthrough with validation)
 * 4. Markdown string → parse via markdown-to-tiptap
 * 5. Plain text string → paragraphs
 * 6. JSON string → parse then re-normalize
 */
export function normalizeContent(content: unknown): TipTapNode {
  // 1. Null/undefined → empty doc
  if (content === null || content === undefined) {
    return emptyDoc();
  }

  // 2. String → could be markdown, plain text, or JSON string
  if (typeof content === 'string') {
    return normalizeStringContent(content);
  }

  // 3. Array → Kodo Content JSON or TipTap nodes
  if (Array.isArray(content)) {
    return normalizeArray(content);
  }

  // 4. Object
  if (typeof content === 'object') {
    return normalizeObject(content as Record<string, unknown>);
  }

  // 5. Fallback: convert to string
  return wrapTextInDoc(String(content));
}

// =============================================================================
// Array handler — detect Kodo JSON vs TipTap nodes
// =============================================================================

function normalizeArray(arr: unknown[]): TipTapNode {
  if (arr.length === 0) return emptyDoc();

  const first = arr[0] as Record<string, unknown> | undefined;
  if (!first || typeof first !== 'object' || !first.type) {
    return emptyDoc();
  }

  // Detect: is this Kodo Content JSON or TipTap nodes?
  const isKodoFormat = arr.some((item) => {
    const block = item as Record<string, unknown>;
    return typeof block.type === 'string' && KODO_BLOCK_TYPES.has(block.type);
  });

  if (isKodoFormat) {
    return convertKodoJsonToTiptap(arr as KodoBlock[]);
  }

  // TipTap nodes array → validate and wrap
  const isTiptapFormat = arr.some((item) => {
    const node = item as Record<string, unknown>;
    return typeof node.type === 'string' && TIPTAP_BLOCK_TYPES.has(node.type);
  });

  if (isTiptapFormat) {
    return { type: 'doc', content: validateTiptapNodes(arr as TipTapNode[]) };
  }

  // Unknown array format — try as Kodo JSON anyway
  return convertKodoJsonToTiptap(arr as KodoBlock[]);
}

// =============================================================================
// Object handler — detect TipTap doc vs single block
// =============================================================================

function normalizeObject(obj: Record<string, unknown>): TipTapNode {
  // Already a TipTap doc node
  if (obj.type === 'doc' && Array.isArray(obj.content)) {
    return {
      type: 'doc',
      content: validateTiptapNodes(obj.content as TipTapNode[]),
    };
  }

  // A TipTap doc with empty content
  if (obj.type === 'doc' && !obj.content) {
    return emptyDoc();
  }

  // A single TipTap block node → wrap in doc
  if (typeof obj.type === 'string' && TIPTAP_BLOCK_TYPES.has(obj.type)) {
    return { type: 'doc', content: [obj as unknown as TipTapNode] };
  }

  // A single Kodo block → convert and wrap
  if (typeof obj.type === 'string' && KODO_BLOCK_TYPES.has(obj.type)) {
    return convertKodoJsonToTiptap([obj as unknown as KodoBlock]);
  }

  // Unknown object — stringify as text
  return wrapTextInDoc(JSON.stringify(obj));
}

// =============================================================================
// String handler
// =============================================================================

function normalizeStringContent(str: string): TipTapNode {
  const trimmed = str.trim();

  if (trimmed === '') return emptyDoc();

  // Try to parse as JSON first (AI might send JSON as string)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        return normalizeContent(parsed);
      }
    } catch {
      // Not valid JSON, fall through to markdown
    }
  }

  // Treat as markdown (which also handles plain text)
  return convertMarkdownToTiptap(trimmed);
}

// =============================================================================
// Kodo Content JSON → TipTap converter
// =============================================================================

function convertKodoJsonToTiptap(blocks: KodoBlock[]): TipTapNode {
  const nodes: TipTapNode[] = [];

  for (const block of blocks) {
    if (!block || typeof block.type !== 'string') continue;

    const converted = convertKodoBlock(block);
    if (converted) {
      nodes.push(converted);
    }
  }

  return {
    type: 'doc',
    content: nodes.length > 0 ? nodes : [{ type: 'paragraph' }],
  };
}

function convertKodoBlock(block: KodoBlock): TipTapNode | null {
  switch (block.type) {
    case 'heading':
      return {
        type: 'heading',
        attrs: { level: block.level || 1 },
        content: parseInline(block.text || ''),
      };

    case 'paragraph':
      return {
        type: 'paragraph',
        content: parseInline(block.text || ''),
      };

    case 'list':
      return convertList(block.items || [], 'bulletList');

    case 'ordered_list':
      return convertList(block.items || [], 'orderedList');

    case 'checklist':
      return convertChecklist(block.items || []);

    case 'quote':
      return {
        type: 'blockquote',
        content: [
          { type: 'paragraph', content: parseInline(block.text || '') },
        ],
      };

    case 'code':
      return {
        type: 'codeBlock',
        attrs: block.language ? { language: block.language } : {},
        content: block.text ? [{ type: 'text', text: block.text }] : [],
      };

    case 'divider':
      return { type: 'horizontalRule' };

    case 'table':
      return convertTable(block.headers || [], block.rows || []);

    case 'image':
      return {
        type: 'image',
        attrs: {
          src: block.url || block.text || '',
          alt: block.alt || '',
          alignment: 'center',
        },
      };

    default:
      // Unknown block type — render as paragraph
      if (block.text) {
        return {
          type: 'paragraph',
          content: parseInline(block.text),
        };
      }
      return null;
  }
}

// =============================================================================
// List converters
// =============================================================================

function convertList(
  items: string[] | Array<{ text: string; checked?: boolean }>,
  listType: 'bulletList' | 'orderedList',
): TipTapNode {
  const listItems: TipTapNode[] = items.map((item) => {
    const text = typeof item === 'string' ? item : item.text;
    return {
      type: 'listItem',
      content: [{ type: 'paragraph', content: parseInline(text) }],
    };
  });

  return { type: listType, content: listItems };
}

function convertChecklist(
  items: string[] | Array<{ text: string; checked?: boolean }>,
): TipTapNode {
  const taskItems: TipTapNode[] = items.map((item) => {
    const text = typeof item === 'string' ? item : item.text;
    const checked = typeof item === 'object' ? (item.checked ?? false) : false;
    return {
      type: 'taskItem',
      attrs: { checked },
      content: [{ type: 'paragraph', content: parseInline(text) }],
    };
  });

  return { type: 'taskList', content: taskItems };
}

// =============================================================================
// Table converter
// =============================================================================

function convertTable(headers: string[], rows: string[][]): TipTapNode {
  const tableRows: TipTapNode[] = [];

  // Header row
  if (headers.length > 0) {
    tableRows.push({
      type: 'tableRow',
      content: headers.map((h) => ({
        type: 'tableHeader',
        attrs: { colspan: 1, rowspan: 1 },
        content: [{ type: 'paragraph', content: parseInline(h) }],
      })),
    });
  }

  // Data rows
  for (const row of rows) {
    tableRows.push({
      type: 'tableRow',
      content: row.map((cell) => ({
        type: 'tableCell',
        attrs: { colspan: 1, rowspan: 1 },
        content: [{ type: 'paragraph', content: parseInline(cell) }],
      })),
    });
  }

  return { type: 'table', content: tableRows };
}

// =============================================================================
// Inline markdown parser (text values → TipTap text nodes with marks)
// =============================================================================

function parseInline(text: string): TipTapNode[] {
  if (!text) return [{ type: 'text', text: ' ' }];
  return parseInlineMarkdown(text);
}

// =============================================================================
// TipTap validation (for passthrough)
// =============================================================================

function validateTiptapNodes(nodes: TipTapNode[]): TipTapNode[] {
  const result: TipTapNode[] = [];

  for (const node of nodes) {
    if (!node || typeof node !== 'object' || !node.type) continue;

    // Text node at block level → wrap in paragraph
    if (node.type === 'text') {
      result.push({ type: 'paragraph', content: [node] });
      continue;
    }

    result.push(node);
  }

  return result.length > 0 ? result : [{ type: 'paragraph' }];
}

// =============================================================================
// Helpers
// =============================================================================

function emptyDoc(): TipTapNode {
  return { type: 'doc', content: [] };
}

function wrapTextInDoc(text: string): TipTapNode {
  if (!text.trim()) return emptyDoc();
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}
