import { getSupabaseClient } from '../services/supabase-client.js';
/**
 * Check if a user owns a specific document.
 * Returns true if the document belongs to the user, false otherwise.
 */
export declare function userOwnsDocument(supabase: ReturnType<typeof getSupabaseClient>, documentId: string, userId: string): Promise<boolean>;
/**
 * Sanitize an error for client-facing responses.
 * Logs the full error server-side and returns a generic message.
 */
export declare function sanitizeError(error: unknown, context: string): string;
//# sourceMappingURL=document-ownership.d.ts.map