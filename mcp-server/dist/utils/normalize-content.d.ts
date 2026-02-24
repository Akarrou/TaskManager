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
//# sourceMappingURL=normalize-content.d.ts.map