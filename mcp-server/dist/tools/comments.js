import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
import { getCurrentUserId } from '../services/user-auth.js';
import { saveSnapshot } from '../services/snapshot.js';
/**
 * Register all comment-related tools (block comments for documents)
 */
export function registerCommentTools(server) {
    // =========================================================================
    // list_comments - List comments for a document or specific block
    // =========================================================================
    server.tool('list_comments', `List comments attached to a document with pagination. Comments are attached to specific blocks (TipTap nodes) within a document, enabling inline discussions similar to Google Docs. Each comment has a block_id (TipTap node ID), content, user_id, and timestamp. Returns comments sorted by creation time with pagination info including total count. Use get_blocks_with_comments first to find which blocks have discussions.`, {
        document_id: z.string().uuid().describe('The document UUID to get comments for.'),
        block_id: z.string().optional().describe('Filter to comments on a specific TipTap block/node. Get block IDs from get_blocks_with_comments.'),
        limit: z.number().min(1).max(100).optional().default(50).describe('Max comments per page. Default 50.'),
        offset: z.number().min(0).optional().default(0).describe('Number to skip for pagination.'),
    }, async ({ document_id, block_id, limit, offset }) => {
        try {
            const supabase = getSupabaseClient();
            let query = supabase
                .from('block_comments')
                .select('*', { count: 'exact' })
                .eq('document_id', document_id)
                .order('created_at', { ascending: true })
                .range(offset, offset + limit - 1);
            if (block_id) {
                query = query.eq('block_id', block_id);
            }
            const { data, error, count } = await query;
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error listing comments: ${error.message}` }],
                    isError: true,
                };
            }
            const result = {
                comments: data,
                pagination: {
                    total: count || 0,
                    limit,
                    offset,
                    hasMore: (count || 0) > offset + limit,
                },
            };
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // add_comment - Add a comment to a document block
    // =========================================================================
    server.tool('add_comment', `Add a comment to a specific block in a document. Comments enable inline discussions on document content. The block_id must be a valid TipTap node ID from the document's content (found in the content JSON). Returns the created comment with its generated ID. Comments are timestamped and attributed to the specified user. Related tools: list_comments, delete_comment, get_blocks_with_comments.`, {
        document_id: z.string().uuid().describe('The document UUID where the comment should be added.'),
        block_id: z.string().describe('The TipTap block/node ID to attach the comment to. Found in document content JSON.'),
        content: z.string().min(1).describe('The comment text content.'),
        user_id: z.string().uuid().describe('The UUID of the user posting the comment.'),
        user_email: z.string().email().optional().describe('User email for display. Optional, shown alongside comment.'),
    }, async ({ document_id, block_id, content, user_id, user_email }) => {
        try {
            const supabase = getSupabaseClient();
            const commentData = {
                document_id,
                block_id,
                content,
                user_id,
            };
            if (user_email) {
                commentData.user_email = user_email;
            }
            const { data, error } = await supabase
                .from('block_comments')
                .insert(commentData)
                .select()
                .single();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error adding comment: ${error.message}` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Comment added successfully:\n${JSON.stringify(data, null, 2)}` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // delete_comment - Delete a comment
    // =========================================================================
    server.tool('delete_comment', `Delete a comment from a document. This permanently removes the comment. Get comment IDs from list_comments. Returns confirmation of deletion. Related tools: list_comments, add_comment.`, {
        comment_id: z.string().uuid().describe('The comment UUID to delete. Get this from list_comments.'),
    }, async ({ comment_id }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Snapshot before deletion
            const { data: currentComment } = await supabase
                .from('block_comments')
                .select('*')
                .eq('id', comment_id)
                .single();
            let snapshotToken = '';
            if (currentComment) {
                const snapshot = await saveSnapshot({
                    entityType: 'comment',
                    entityId: comment_id,
                    tableName: 'block_comments',
                    toolName: 'delete_comment',
                    operation: 'delete',
                    data: currentComment,
                    userId,
                });
                snapshotToken = snapshot.token;
            }
            const { error } = await supabase
                .from('block_comments')
                .delete()
                .eq('id', comment_id);
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error deleting comment: ${error.message}` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Comment ${comment_id} deleted (snapshot: ${snapshotToken}).` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // get_comment_count - Get comment count for a document or block
    // =========================================================================
    server.tool('get_comment_count', `Get the total number of comments on a document or specific block. Faster than list_comments when you only need the count. Returns document_id, block_id (if filtered), and count. Use this for displaying comment indicators or checking activity level. Related tools: list_comments (full data), get_blocks_with_comments (per-block counts).`, {
        document_id: z.string().uuid().describe('The document UUID to count comments for.'),
        block_id: z.string().optional().describe('Count only comments on this specific block.'),
    }, async ({ document_id, block_id }) => {
        try {
            const supabase = getSupabaseClient();
            let query = supabase
                .from('block_comments')
                .select('id', { count: 'exact', head: true })
                .eq('document_id', document_id);
            if (block_id) {
                query = query.eq('block_id', block_id);
            }
            const { count, error } = await query;
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error counting comments: ${error.message}` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: JSON.stringify({ document_id, block_id: block_id || null, count }, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // get_blocks_with_comments - Get all blocks that have comments in a document
    // =========================================================================
    server.tool('get_blocks_with_comments', `Get all blocks in a document that have comments, with comment counts per block. Returns array of { block_id, comment_count }. Use this to: 1) Find which blocks have discussions, 2) Display comment indicators in the UI, 3) Know which block_ids to query with list_comments. Essential for understanding where conversations exist in a document.`, {
        document_id: z.string().uuid().describe('The document UUID to analyze.'),
    }, async ({ document_id }) => {
        try {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('block_comments')
                .select('block_id')
                .eq('document_id', document_id);
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error getting blocks with comments: ${error.message}` }],
                    isError: true,
                };
            }
            // Count comments per block
            const blockCounts = {};
            for (const row of data || []) {
                blockCounts[row.block_id] = (blockCounts[row.block_id] || 0) + 1;
            }
            const result = Object.entries(blockCounts).map(([block_id, count]) => ({
                block_id,
                comment_count: count,
            }));
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
}
//# sourceMappingURL=comments.js.map