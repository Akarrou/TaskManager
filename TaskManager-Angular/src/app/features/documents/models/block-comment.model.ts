/**
 * Block Comment Model
 * Defines interfaces for the block comment system (Notion-style comments on document blocks)
 */

/**
 * Represents a comment attached to a specific block in a document
 */
export interface BlockComment {
  id: string;
  document_id: string;
  block_id: string;
  content: string;
  user_id: string | null;
  user_email: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Request payload for creating a new comment
 */
export interface CreateBlockCommentRequest {
  document_id: string;
  block_id: string;
  content: string;
}

/**
 * Request payload for updating an existing comment
 */
export interface UpdateBlockCommentRequest {
  content: string;
}

/**
 * Grouped comments by block for efficient rendering
 */
export interface BlockCommentsMap {
  [blockId: string]: BlockComment[];
}

/**
 * Summary of comments for a block (used for indicators)
 */
export interface BlockCommentSummary {
  blockId: string;
  count: number;
  latestComment?: BlockComment;
}
