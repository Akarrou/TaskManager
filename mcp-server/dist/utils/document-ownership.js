/**
 * Check if a user owns a specific document.
 * Returns true if the document belongs to the user, false otherwise.
 */
export async function userOwnsDocument(supabase, documentId, userId) {
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
export function sanitizeError(error, context) {
    // Only return the context, never the internal error details
    return `Error: ${context}. Please try again or contact support.`;
}
//# sourceMappingURL=document-ownership.js.map