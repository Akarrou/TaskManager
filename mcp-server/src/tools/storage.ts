import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
import { env } from '../config.js';

/**
 * Register all storage-related tools
 */
export function registerStorageTools(server: McpServer): void {
  // =========================================================================
  // list_document_files - List files attached to a document
  // =========================================================================
  server.tool(
    'list_document_files',
    'List all files attached to a document in storage.',
    {
      document_id: z.string().uuid().describe('The document ID'),
    },
    async ({ document_id }) => {
      try {
        const supabase = getSupabaseClient();
        const folderPath = `documents/${document_id}/files`;

        const { data, error } = await supabase.storage
          .from(env.STORAGE_BUCKET)
          .list(folderPath);

        if (error) {
          return {
            content: [{ type: 'text', text: `Error listing files: ${error.message}` }],
            isError: true,
          };
        }

        // Filter out placeholder files and format response
        const files = (data || [])
          .filter(file => file.name !== '.emptyFolderPlaceholder')
          .map(file => {
            const filePath = `${folderPath}/${file.name}`;
            const { data: urlData } = supabase.storage
              .from(env.STORAGE_BUCKET)
              .getPublicUrl(filePath);

            return {
              name: file.name,
              path: filePath,
              size: file.metadata?.size,
              content_type: file.metadata?.mimetype,
              created_at: file.created_at,
              url: urlData.publicUrl,
            };
          });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              document_id,
              file_count: files.length,
              files,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // get_file_url - Get public URL for a file
  // =========================================================================
  server.tool(
    'get_file_url',
    'Get the public URL for a file in storage. Can also generate signed URLs for private files.',
    {
      file_path: z.string().describe('Full path to the file (e.g., documents/uuid/files/filename.pdf)'),
      signed: z.boolean().optional().default(false).describe('Generate a signed URL (expires in 1 hour)'),
    },
    async ({ file_path, signed }) => {
      try {
        const supabase = getSupabaseClient();

        if (signed) {
          const { data, error } = await supabase.storage
            .from(env.STORAGE_BUCKET)
            .createSignedUrl(file_path, 3600); // 1 hour expiry

          if (error) {
            return {
              content: [{ type: 'text', text: `Error creating signed URL: ${error.message}` }],
              isError: true,
            };
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                path: file_path,
                url: data.signedUrl,
                type: 'signed',
                expires_in: '1 hour',
              }, null, 2),
            }],
          };
        } else {
          const { data } = supabase.storage
            .from(env.STORAGE_BUCKET)
            .getPublicUrl(file_path);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                path: file_path,
                url: data.publicUrl,
                type: 'public',
              }, null, 2),
            }],
          };
        }
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // delete_file - Delete a file from storage
  // =========================================================================
  server.tool(
    'delete_file',
    'Delete a file from storage.',
    {
      file_path: z.string().describe('Full path to the file to delete'),
    },
    async ({ file_path }) => {
      try {
        const supabase = getSupabaseClient();

        const { error } = await supabase.storage
          .from(env.STORAGE_BUCKET)
          .remove([file_path]);

        if (error) {
          return {
            content: [{ type: 'text', text: `Error deleting file: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `File deleted successfully: ${file_path}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );
}
