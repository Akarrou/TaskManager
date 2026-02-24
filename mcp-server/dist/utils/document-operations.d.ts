/**
 * Document block operations for partial content updates.
 *
 * These utilities operate on the top-level blocks of a TipTap document,
 * allowing insertion, replacement, and removal by index — so the AI
 * never needs to deal with TipTap JSON directly.
 */
import { type TipTapNode } from './normalize-content.js';
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
/**
 * Extract a structural summary of a TipTap document.
 * Returns top-level block types with index and a short text preview.
 */
export declare function getDocumentStructure(content: unknown): DocumentStructure;
/**
 * Insert blocks at a specific position in a TipTap document.
 * Position 0 = beginning, position N = after block N-1.
 * Returns the modified document.
 */
export declare function insertBlocksAt(doc: TipTapNode, position: number, newBlocks: TipTapNode[]): TipTapNode;
/**
 * Replace blocks in a range [start, end) with new blocks.
 * start is inclusive, end is exclusive.
 */
export declare function replaceBlocksRange(doc: TipTapNode, start: number, end: number, newBlocks: TipTapNode[]): TipTapNode;
/**
 * Remove blocks in a range [start, end).
 * start is inclusive, end is exclusive.
 */
export declare function removeBlocksRange(doc: TipTapNode, start: number, end: number): TipTapNode;
export {};
//# sourceMappingURL=document-operations.d.ts.map