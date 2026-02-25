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
 *   { "type": "table", "headers": ["Name", "Age"], "rows": [["Alice", "30"]] },
 *   { "type": "accordion", "items": [{ "title": "Section", "content": "Text or blocks array", "icon": "description", "iconColor": "#3b82f6" }] },
 *   { "type": "columns", "columns": ["Col 1 text", [{ "type": "paragraph", "text": "Col 2" }]] }
 * ]
 *
 * Text values support inline Markdown: **bold**, *italic*, ~~strike~~, `code`, [link](url)
 *
 * Also supports:
 * - Raw TipTap JSON passthrough (accordionGroup, bulletList, columns, databaseTable, etc.)
 * - Markdown strings (converted via markdown-to-tiptap)
 * - Plain text strings (wrapped in paragraphs)
 */
import { randomUUID } from 'crypto';
import { convertMarkdownToTiptap } from './markdown-to-tiptap.js';
import { parseInlineMarkdown } from './markdown-to-tiptap.js';
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
    'quote', 'code', 'divider', 'table', 'image', 'accordion', 'columns',
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
export function normalizeContent(content) {
    let result;
    // 1. Null/undefined → empty doc
    if (content === null || content === undefined) {
        result = emptyDoc();
    }
    else if (typeof content === 'string') {
        // 2. String → could be markdown, plain text, or JSON string
        result = normalizeStringContent(content);
    }
    else if (Array.isArray(content)) {
        // 3. Array → Kodo Content JSON or TipTap nodes
        result = normalizeArray(content);
    }
    else if (typeof content === 'object') {
        // 4. Object
        result = normalizeObject(content);
    }
    else {
        // 5. Fallback: convert to string
        result = wrapTextInDoc(String(content));
    }
    // Assign blockIds to all eligible nodes
    assignBlockIds(result);
    return result;
}
// =============================================================================
// Array handler — detect Kodo JSON vs TipTap nodes
// =============================================================================
function normalizeArray(arr) {
    if (arr.length === 0)
        return emptyDoc();
    const first = arr[0];
    if (!first || typeof first !== 'object' || !first.type) {
        return emptyDoc();
    }
    // Detect: is this Kodo Content JSON or TipTap nodes?
    const isKodoFormat = arr.some((item) => {
        const block = item;
        return typeof block.type === 'string' && KODO_BLOCK_TYPES.has(block.type);
    });
    if (isKodoFormat) {
        return convertKodoJsonToTiptap(arr);
    }
    // TipTap nodes array → validate and wrap
    const isTiptapFormat = arr.some((item) => {
        const node = item;
        return typeof node.type === 'string' && TIPTAP_BLOCK_TYPES.has(node.type);
    });
    if (isTiptapFormat) {
        return { type: 'doc', content: validateTiptapNodes(arr) };
    }
    // Unknown array format — try as Kodo JSON anyway
    return convertKodoJsonToTiptap(arr);
}
// =============================================================================
// Object handler — detect TipTap doc vs single block
// =============================================================================
function normalizeObject(obj) {
    // Already a TipTap doc node
    if (obj.type === 'doc' && Array.isArray(obj.content)) {
        return {
            type: 'doc',
            content: validateTiptapNodes(obj.content),
        };
    }
    // A TipTap doc with empty content
    if (obj.type === 'doc' && !obj.content) {
        return emptyDoc();
    }
    // A single TipTap block node → wrap in doc
    if (typeof obj.type === 'string' && TIPTAP_BLOCK_TYPES.has(obj.type)) {
        return { type: 'doc', content: [obj] };
    }
    // A single Kodo block → convert and wrap
    if (typeof obj.type === 'string' && KODO_BLOCK_TYPES.has(obj.type)) {
        return convertKodoJsonToTiptap([obj]);
    }
    // Unknown object — stringify as text
    return wrapTextInDoc(JSON.stringify(obj));
}
// =============================================================================
// String handler
// =============================================================================
function normalizeStringContent(str) {
    const trimmed = str.trim();
    if (trimmed === '')
        return emptyDoc();
    // Try to parse as JSON first (AI might send JSON as string)
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (typeof parsed === 'object' && parsed !== null) {
                return normalizeContent(parsed);
            }
        }
        catch {
            // Not valid JSON, fall through to markdown
        }
    }
    // Treat as markdown (which also handles plain text)
    return convertMarkdownToTiptap(trimmed);
}
// =============================================================================
// Kodo Content JSON → TipTap converter
// =============================================================================
function convertKodoJsonToTiptap(blocks) {
    const nodes = [];
    for (const block of blocks) {
        if (!block || typeof block.type !== 'string')
            continue;
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
function convertKodoBlock(block) {
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
        case 'accordion':
            return convertAccordion(block.items || []);
        case 'columns':
            return convertColumns(block.columns || []);
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
function convertList(items, listType) {
    const listItems = items.map((item) => {
        const text = typeof item === 'string' ? item : item.text;
        return {
            type: 'listItem',
            content: [{ type: 'paragraph', content: parseInline(text) }],
        };
    });
    return { type: listType, content: listItems };
}
function convertChecklist(items) {
    const taskItems = items.map((item) => {
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
// Columns converter
// =============================================================================
function convertColumns(cols) {
    if (cols.length === 0) {
        // Default: 2 empty columns
        cols = ['', ''];
    }
    const columnNodes = cols.map((col) => {
        let contentBlocks;
        if (typeof col === 'string') {
            // Simple text → single paragraph
            contentBlocks = col.trim()
                ? [{ type: 'paragraph', content: parseInline(col) }]
                : [{ type: 'paragraph' }];
        }
        else if (Array.isArray(col) && col.length > 0) {
            // Array of Kodo blocks
            contentBlocks = col
                .map((block) => convertKodoBlock(block))
                .filter((n) => n !== null);
            if (contentBlocks.length === 0) {
                contentBlocks = [{ type: 'paragraph' }];
            }
        }
        else {
            contentBlocks = [{ type: 'paragraph' }];
        }
        return {
            type: 'column',
            content: contentBlocks,
        };
    });
    return {
        type: 'columns',
        content: columnNodes,
    };
}
// =============================================================================
// Accordion converter
// =============================================================================
function convertAccordion(items) {
    if (items.length === 0) {
        // At least one item required by schema
        items = [{ title: 'Section', content: '' }];
    }
    const accordionItems = items.map((item) => {
        const titleNode = {
            type: 'accordionTitle',
            attrs: {
                icon: item.icon || 'description',
                iconColor: item.iconColor || '#3b82f6',
                titleColor: item.titleColor || '#1f2937',
                collapsed: false,
            },
            content: parseInline(item.title || 'Section'),
        };
        let contentBlocks;
        if (typeof item.content === 'string') {
            // Simple text content → single paragraph
            contentBlocks = item.content.trim()
                ? [{ type: 'paragraph', content: parseInline(item.content) }]
                : [{ type: 'paragraph' }];
        }
        else if (Array.isArray(item.content) && item.content.length > 0) {
            // Array of Kodo blocks → convert each one
            contentBlocks = item.content
                .map((block) => convertKodoBlock(block))
                .filter((n) => n !== null);
            if (contentBlocks.length === 0) {
                contentBlocks = [{ type: 'paragraph' }];
            }
        }
        else {
            contentBlocks = [{ type: 'paragraph' }];
        }
        const contentNode = {
            type: 'accordionContent',
            content: contentBlocks,
        };
        return {
            type: 'accordionItem',
            content: [titleNode, contentNode],
        };
    });
    return {
        type: 'accordionGroup',
        content: accordionItems,
    };
}
/**
 * Build a single accordionItem TipTap node from a simplified definition.
 * Exported for use by the edit_accordion tool.
 */
export function buildAccordionItem(item) {
    const titleNode = {
        type: 'accordionTitle',
        attrs: {
            icon: item.icon || 'description',
            iconColor: item.iconColor || '#3b82f6',
            titleColor: item.titleColor || '#1f2937',
            collapsed: false,
        },
        content: parseInline(item.title || 'Section'),
    };
    let contentBlocks;
    if (typeof item.content === 'string') {
        contentBlocks = item.content.trim()
            ? [{ type: 'paragraph', content: parseInline(item.content) }]
            : [{ type: 'paragraph' }];
    }
    else if (Array.isArray(item.content) && item.content.length > 0) {
        contentBlocks = item.content
            .map((block) => convertKodoBlock(block))
            .filter((n) => n !== null);
        if (contentBlocks.length === 0) {
            contentBlocks = [{ type: 'paragraph' }];
        }
    }
    else {
        contentBlocks = [{ type: 'paragraph' }];
    }
    const contentNode = {
        type: 'accordionContent',
        content: contentBlocks,
    };
    return {
        type: 'accordionItem',
        content: [titleNode, contentNode],
    };
}
// =============================================================================
// Table converter
// =============================================================================
function convertTable(headers, rows) {
    const tableRows = [];
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
function parseInline(text) {
    if (!text)
        return [{ type: 'text', text: ' ' }];
    return parseInlineMarkdown(text);
}
// =============================================================================
// TipTap validation (for passthrough)
// =============================================================================
function validateTiptapNodes(nodes) {
    const result = [];
    for (const node of nodes) {
        if (!node || typeof node !== 'object' || !node.type)
            continue;
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
// =============================================================================
// Block ID assignment
// =============================================================================
/** Types of blocks eligible for automatic blockId assignment */
const BLOCKID_ELIGIBLE_TYPES = new Set([
    'paragraph', 'heading', 'blockquote', 'codeBlock',
    'bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem',
    'table', 'tableRow', 'tableCell', 'tableHeader',
    'horizontalRule', 'image', 'columns', 'column',
    'databaseTable', 'taskSection',
    'accordionGroup', 'accordionItem', 'accordionTitle', 'accordionContent',
    'spreadsheet', 'mindmap', 'taskMention',
]);
/**
 * Generate a block ID with a real UUID.
 */
export function generateBlockId() {
    return `block-${randomUUID()}`;
}
/**
 * Recursively assign `blockId` to every eligible node that doesn't already have one.
 * Idempotent: existing IDs are never replaced.
 */
export function assignBlockIds(node) {
    if (BLOCKID_ELIGIBLE_TYPES.has(node.type)) {
        if (!node.attrs) {
            node.attrs = {};
        }
        if (!node.attrs.blockId) {
            node.attrs.blockId = generateBlockId();
        }
    }
    if (node.content) {
        for (const child of node.content) {
            assignBlockIds(child);
        }
    }
    return node;
}
// =============================================================================
// Helpers
// =============================================================================
function emptyDoc() {
    return { type: 'doc', content: [] };
}
function wrapTextInDoc(text) {
    if (!text.trim())
        return emptyDoc();
    return {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    };
}
//# sourceMappingURL=normalize-content.js.map