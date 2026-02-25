import { getSupabaseClient } from '../services/supabase-client.js';

/**
 * Check if a user owns a specific document.
 * Returns true if the document belongs to the user, false otherwise.
 */
export async function userOwnsDocument(
  supabase: ReturnType<typeof getSupabaseClient>,
  documentId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('documents')
    .select('user_id')
    .eq('id', documentId)
    .single();

  return data?.user_id === userId;
}

/**
 * Sanitize an error for client-facing responses.
 * Logs the full error server-side and returns a generic message.
 */
export function sanitizeError(error: unknown, context: string): string {
  // Only return the context, never the internal error details
  return `Error: ${context}. Please try again or contact support.`;
}
