import { getSupabaseClient } from '../services/supabase-client.js';
import { userDbListCache } from '../services/cache.js';

/**
 * Check if user has access to a specific database.
 * Databases are accessible if they belong to a document owned by the user.
 */
export async function userHasDatabaseAccess(
  supabase: ReturnType<typeof getSupabaseClient>,
  databaseId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('document_databases')
    .select('document_id, documents(user_id)')
    .eq('database_id', databaseId)
    .single();

  if (!data) return false;

  // If no document linked, allow access (standalone database)
  if (!data.document_id) return true;

  const doc = data.documents as unknown as { user_id: string } | null;
  return doc?.user_id === userId;
}

/**
 * Get databases of a specific type accessible to the current user (with caching).
 */
export async function getUserDatabasesByType(
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string,
  dbType: 'task' | 'event' | 'generic'
): Promise<Record<string, unknown>[]> {
  const cacheKey = `${userId}:${dbType}`;
  const cached = userDbListCache.get(cacheKey);
  if (cached) return cached;

  const { data: databases, error } = await supabase
    .from('document_databases')
    .select('*, documents!inner(user_id)')
    .eq('documents.user_id', userId)
    .is('deleted_at', null);

  if (error) {
    // Fallback: get standalone databases (no document_id)
    const { data: standaloneDbs } = await supabase
      .from('document_databases')
      .select('*')
      .is('document_id', null)
      .is('deleted_at', null);

    const result = (standaloneDbs || []).filter((db: Record<string, unknown>) => {
      const config = db.config as { type?: string } | undefined;
      return config?.type === dbType;
    });
    userDbListCache.set(cacheKey, result);
    return result;
  }

  const result = (databases || []).filter((db: Record<string, unknown>) => {
    const config = db.config as { type?: string } | undefined;
    return config?.type === dbType;
  });
  userDbListCache.set(cacheKey, result);
  return result;
}

/**
 * Invalidate all database list caches.
 * Call after create/delete database, add/update/delete column.
 */
export function invalidateDbCaches(): void {
  userDbListCache.clear();
}
