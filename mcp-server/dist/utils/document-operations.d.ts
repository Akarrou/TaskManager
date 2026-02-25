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
    block_id?: string;
    attrs?: Record<string, unknown>;
}
interface DocumentStructure {
    total_blocks: number;
    blocks: BlockInfo[];
}
export interface EditOperation {
    action: 'insert_after' | 'insert_before' | 'replace' | 'remove' | 'append';
    target?: number | string;
    end_target?: number | string;
    block_id?: string;
    end_block_id?: string;
    content?: TipTapNode[];
}
export interface HeadingMatch {
    index: number;
    level: number;
    text: string;
}
export interface ApplyResult {
    doc: TipTapNode;
    operationsApplied: number;
    warnings: string[];
}
/**
 * Returns true if the document content contains any complex blocks
 * that would be destroyed by a full content replacement.
 */
export declare function hasComplexBlocks(content: unknown): boolean;
/**
 * Returns the list of complex block types found in a document.
 */
export declare function getComplexBlockTypes(content: unknown): string[];
/**
 * Find the top-level block index by its blockId attribute.
 * Returns null if no block with that ID is found.
 */
export declare function findBlockIndexByBlockId(doc: TipTapNode, blockId: string): number | null;
/**
 * Find headings in a document by text (case-insensitive substring match).
 */
export declare function findHeadingMatches(doc: TipTapNode, search: string): HeadingMatch[];
/**
 * Apply a list of edit operations to a TipTap document.
 * Operations are sorted by target index and applied with cumulative delta adjustment.
 */
export declare function applyEditOperations(doc: TipTapNode, operations: EditOperation[]): ApplyResult;
/**
 * Extract a structural summary of a TipTap document.
 * Returns top-level block types with index and a short text preview.
 */
export declare function getDocumentStructure(content: unknown): DocumentStructure;
export {};
//# sourceMappingURL=document-operations.d.ts.map