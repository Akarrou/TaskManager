import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
import { getCurrentUserId } from '../services/user-auth.js';

/**
 * Register all trash-related tools
 */
export function registerTrashTools(server: McpServer): void {
  // =========================================================================
  // list_trash - List items in the trash
  // =========================================================================
  server.registerTool(
    'list_trash',
    {
      description: `List all items currently in the user's trash. Items are kept for 30 days before automatic permanent deletion. Each item shows its type, name, original location, deletion date, and expiration date. Use restore_from_trash to recover items or permanent_delete_from_trash to delete them immediately.`,
      inputSchema: {
        item_type: z.enum(['document', 'project', 'event', 'database_row', 'comment', 'spreadsheet']).optional().describe('Filter by item type.'),
        limit: z.number().min(1).max(100).optional().default(50).describe('Maximum items to return. Default 50.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ item_type, limit }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        let query = supabase
          .from('trash_items')
          .select('*')
          .eq('user_id', userId)
          .order('deleted_at', { ascending: false })
          .limit(limit);

        if (item_type) {
          query = query.eq('item_type', item_type);
        }

        const { data, error } = await query;

        if (error) {
          return {
            content: [{ type: 'text' as const, text: `Error listing trash: ${error.message}` }],
            isError: true,
          };
        }

        if (!data || data.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'Trash is empty.' }],
          };
        }

        const items = data.map((item: Record<string, unknown>) => {
          const deletedAt = new Date(item.deleted_at as string);
          const expiresAt = new Date(item.expires_at as string);
          const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          const parentInfo = item.parent_info as Record<string, string> | null;
          const context = parentInfo
            ? Object.entries(parentInfo).map(([k, v]) => `${k}: ${v}`).join(', ')
            : '';

          return `- [${item.item_type}] "${item.display_name}" (id: ${item.item_id})` +
            (context ? ` | ${context}` : '') +
            ` | deleted: ${deletedAt.toISOString().split('T')[0]}` +
            ` | expires in ${daysLeft} day(s)` +
            ` | trash_id: ${item.id}`;
        });

        return {
          content: [{
            type: 'text' as const,
            text: `Trash items (${data.length}):\n${items.join('\n')}`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Unexpected error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // restore_from_trash - Restore an item from trash
  // =========================================================================
  server.registerTool(
    'restore_from_trash',
    {
      description: `Restore a previously deleted item from the trash. This clears the deleted_at timestamp on the original item and removes it from the trash. The item will reappear in its original location. Use list_trash first to find the trash_id.`,
      inputSchema: {
        trash_id: z.string().uuid().describe('The trash item ID (from list_trash output).'),
      },
    },
    async ({ trash_id }) => {
      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Get trash item
        const { data: trashItem, error: fetchError } = await supabase
          .from('trash_items')
          .select('*')
          .eq('id', trash_id)
          .eq('user_id', userId)
          .single();

        if (fetchError || !trashItem) {
          return {
            content: [{ type: 'text' as const, text: `Trash item not found: ${trash_id}` }],
            isError: true,
          };
        }

        // Clear deleted_at on original table
        const { error: updateError } = await supabase
          .from(trashItem.item_table)
          .update({ deleted_at: null })
          .eq('id', trashItem.item_id);

        if (updateError) {
          return {
            content: [{ type: 'text' as const, text: `Failed to restore item: ${updateError.message}` }],
            isError: true,
          };
        }

        // Remove from trash
        const { error: deleteError } = await supabase
          .from('trash_items')
          .delete()
          .eq('id', trash_id);

        if (deleteError) {
          return {
            content: [{ type: 'text' as const, text: `Item restored but failed to clean up trash record: ${deleteError.message}` }],
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: `Restored "${trashItem.display_name}" (${trashItem.item_type}) from trash.`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Unexpected error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // permanent_delete_from_trash - Permanently delete an item from trash
  // =========================================================================
  server.registerTool(
    'permanent_delete_from_trash',
    {
      description: `DESTRUCTIVE: Permanently delete an item from the trash. This performs a hard delete on the original table and removes the trash record. This action cannot be undone. Use list_trash first to find the trash_id.`,
      inputSchema: {
        trash_id: z.string().uuid().describe('The trash item ID (from list_trash output).'),
        confirm: z.boolean().describe('REQUIRED: Must be explicitly set to true to confirm permanent deletion.'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ trash_id, confirm }) => {
      if (!confirm) {
        return {
          content: [{ type: 'text' as const, text: 'Deletion not confirmed. Set confirm=true to proceed.' }],
          isError: true,
        };
      }

      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Get trash item
        const { data: trashItem, error: fetchError } = await supabase
          .from('trash_items')
          .select('*')
          .eq('id', trash_id)
          .eq('user_id', userId)
          .single();

        if (fetchError || !trashItem) {
          return {
            content: [{ type: 'text' as const, text: `Trash item not found: ${trash_id}` }],
            isError: true,
          };
        }

        // Hard delete from original table
        const { error: deleteError } = await supabase
          .from(trashItem.item_table)
          .delete()
          .eq('id', trashItem.item_id);

        if (deleteError) {
          // Item might already be gone, still clean up trash
          console.warn(`Failed to delete from original table: ${deleteError.message}`);
        }

        // Remove from trash
        await supabase
          .from('trash_items')
          .delete()
          .eq('id', trash_id);

        return {
          content: [{
            type: 'text' as const,
            text: `Permanently deleted "${trashItem.display_name}" (${trashItem.item_type}).`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Unexpected error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // empty_trash - Empty all items from trash
  // =========================================================================
  server.registerTool(
    'empty_trash',
    {
      description: `DESTRUCTIVE: Permanently delete ALL items from the trash. This hard deletes every item from their original tables and clears the entire trash. This action cannot be undone.`,
      inputSchema: {
        confirm: z.boolean().describe('REQUIRED: Must be explicitly set to true to confirm emptying the entire trash.'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ confirm }) => {
      if (!confirm) {
        return {
          content: [{ type: 'text' as const, text: 'Not confirmed. Set confirm=true to proceed.' }],
          isError: true,
        };
      }

      try {
        const userId = getCurrentUserId();
        const supabase = getSupabaseClient();

        // Get all trash items
        const { data: items, error: fetchError } = await supabase
          .from('trash_items')
          .select('*')
          .eq('user_id', userId);

        if (fetchError) {
          return {
            content: [{ type: 'text' as const, text: `Error fetching trash items: ${fetchError.message}` }],
            isError: true,
          };
        }

        if (!items || items.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'Trash is already empty.' }],
          };
        }

        let deletedCount = 0;
        const errors: string[] = [];

        // Hard delete each item from original table
        for (const item of items) {
          try {
            await supabase
              .from(item.item_table)
              .delete()
              .eq('id', item.item_id);
            deletedCount++;
          } catch (err) {
            errors.push(`Failed to delete ${item.display_name}: ${(err as Error).message}`);
          }
        }

        // Clear all trash records
        await supabase
          .from('trash_items')
          .delete()
          .eq('user_id', userId);

        const result = `Trash emptied: ${deletedCount}/${items.length} items permanently deleted.`;
        if (errors.length > 0) {
          return {
            content: [{ type: 'text' as const, text: `${result}\nErrors:\n${errors.join('\n')}` }],
          };
        }

        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Unexpected error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
