/**
 * Markdown to TipTap JSON converter
 *
 * Parses common markdown syntax and produces valid TipTap JSON nodes.
 * Handles: headings, paragraphs, bold, italic, strike, code, links,
 * bullet/ordered/task lists, code blocks, blockquotes, horizontal rules, tables.
 */
interface TipTapNode {
    type: string;
    content?: TipTapNode[];
    text?: string;
    marks?: TipTapMark[];
    attrs?: Record<string, unknown>;
}
interface TipTapMark {
    type: string;
    attrs?: Record<string, unknown>;
}
/**
 * Convert a markdown string to a TipTap doc node
 */
export declare function convertMarkdownToTiptap(markdown: string): TipTapNode;
export declare function parseInlineMarkdown(text: string): TipTapNode[];
export {};
//# sourceMappingURL=markdown-to-tiptap.d.ts.map