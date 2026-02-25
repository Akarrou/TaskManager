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
export interface TipTapNode {
    type: string;
    content?: TipTapNode[];
    text?: string;
    marks?: Array<{
        type: string;
        attrs?: Record<string, unknown>;
    }>;
    attrs?: Record<string, unknown>;
}
/** Kodo Content JSON block types */
interface KodoBlock {
    type: string;
    text?: string;
    level?: number;
    items?: string[] | Array<{
        text: string;
        checked?: boolean;
    }> | AccordionItemDef[];
    language?: string;
    headers?: string[];
    rows?: string[][];
    url?: string;
    alt?: string;
    columns?: Array<string | KodoBlock[]>;
}
/** Accordion item definition for Kodo Content JSON */
export interface AccordionItemDef {
    title: string;
    content: string | KodoBlock[];
    icon?: string;
    iconColor?: string;
    titleColor?: string;
}
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
export declare function normalizeContent(content: unknown): TipTapNode;
/**
 * Build a single accordionItem TipTap node from a simplified definition.
 * Exported for use by the edit_accordion tool.
 */
export declare function buildAccordionItem(item: AccordionItemDef): TipTapNode;
/**
 * Generate a block ID with a real UUID.
 */
export declare function generateBlockId(): string;
/**
 * Recursively assign `blockId` to every eligible node that doesn't already have one.
 * Idempotent: existing IDs are never replaced.
 */
export declare function assignBlockIds(node: TipTapNode): TipTapNode;
export {};
//# sourceMappingURL=normalize-content.d.ts.map