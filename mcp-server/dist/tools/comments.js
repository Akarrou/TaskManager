import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
/**
 * Register all comment-related tools (block comments for documents)
 */
export function registerCommentTools(server) {
    // =========================================================================
    // list_comments - List comments for a document or specific block
    // =========================================================================
    server.tool('list_comments', 'List all comments for a document with pagination, optionally filtered by block ID.', {
        document_id: z.string().uuid().describe('The UUID of the document'),
        block_id: z.string().optional().describe('Optional block ID to filter comments for a specific block'),
        limit: z.number().min(1).max(100).optional().default(50).describe('Maximum number of comments to return'),
        offset: z.number().min(0).optional().default(0).describe('Number of comments to skip for pagination'),
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
    server.tool('add_comment', 'Add a comment to a specific block in a document.', {
        document_id: z.string().uuid().describe('The UUID of the document'),
        block_id: z.string().describe('The ID of the block to comment on'),
        content: z.string().min(1).describe('The comment content'),
        user_id: z.string().uuid().describe('The UUID of the user posting the comment'),
        user_email: z.string().email().optional().describe('Email of the user (for display purposes)'),
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
    server.tool('delete_comment', 'Delete a comment by its ID.', {
        comment_id: z.string().uuid().describe('The UUID of the comment to delete'),
    }, async ({ comment_id }) => {
        try {
            const supabase = getSupabaseClient();
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
                content: [{ type: 'text', text: `Comment ${comment_id} deleted successfully.` }],
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
    server.tool('get_comment_count', 'Get the number of comments on a document, optionally filtered by block.', {
        document_id: z.string().uuid().describe('The UUID of the document'),
        block_id: z.string().optional().describe('Optional block ID to count comments for a specific block'),
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
    server.tool('get_blocks_with_comments', 'Get a list of all block IDs that have comments in a document, with comment counts.', {
        document_id: z.string().uuid().describe('The UUID of the document'),
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