import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
import { getCurrentUserId } from '../services/user-auth.js';
import { env } from '../config.js';
import { saveSnapshot } from '../services/snapshot.js';
/**
 * Register all storage-related tools
 */
export function registerStorageTools(server) {
    // =========================================================================
    // list_document_files - List files attached to a document
    // =========================================================================
    server.registerTool('list_document_files', {
        description: `List all files attached to a document in Supabase Storage. Files are stored under documents/{document_id}/files/. Returns array of files with: name, path, size, content_type, created_at, and public URL. Use this to see what attachments exist on a document. Empty folders are hidden. Related tools: get_file_url (access file), delete_file (remove).`,
        inputSchema: {
            document_id: z.string().uuid().describe('The document UUID to list files for.'),
        },
        annotations: { readOnlyHint: true },
    }, async ({ document_id }) => {
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // get_file_url - Get public URL for a file
    // =========================================================================
    server.registerTool('get_file_url', {
        description: `Get a URL to access a file in storage. Two modes: public URL (permanent, for public files) or signed URL (expires in 1 hour, for private files). Public URLs work if the bucket allows public access. Signed URLs provide temporary authenticated access. Get file paths from list_document_files. Returns the URL and type (public/signed).`,
        inputSchema: {
            file_path: z.string().describe('Full storage path (e.g., "documents/uuid/files/report.pdf"). Get from list_document_files.'),
            signed: z.boolean().optional().default(false).describe('Set true for time-limited signed URL. Default false for permanent public URL.'),
        },
        annotations: { readOnlyHint: true },
    }, async ({ file_path, signed }) => {
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
            }
            else {
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
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // delete_file - Delete a file from storage
    // =========================================================================
    server.registerTool('delete_file', {
        description: `Permanently delete a file from Supabase Storage. A metadata snapshot is saved for audit purposes, but file content CANNOT be restored (storage files are not database rows). Get the file path from list_document_files. Returns confirmation of deletion with snapshot token. WARNING: The file and any links to it will stop working immediately.`,
        inputSchema: {
            file_path: z.string().describe('Full storage path to delete (e.g., "documents/uuid/files/old-report.pdf").'),
        },
        annotations: { destructiveHint: true },
    }, async ({ file_path }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Snapshot file metadata before deletion (audit only — file content cannot be restored)
            const snapshot = await saveSnapshot({
                entityType: 'file_metadata',
                entityId: file_path,
                toolName: 'delete_file',
                operation: 'delete',
                data: { file_path, bucket: env.STORAGE_BUCKET, note: 'metadata only — file content not restorable' },
                userId,
            });
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
                content: [{ type: 'text', text: `File deleted (snapshot: ${snapshot.token}): ${file_path}` }],
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
//# sourceMappingURL=storage.js.map