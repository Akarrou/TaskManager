import { getSupabaseClient } from '../services/supabase-client.js';
/**
 * Check if user has access to a specific database.
 * Databases are accessible if they belong to a document owned by the user.
 */
export declare function userHasDatabaseAccess(supabase: ReturnType<typeof getSupabaseClient>, databaseId: string, userId: string): Promise<boolean>;
/**
 * Get databases of a specific type accessible to the current user (with caching).
 */
export declare function getUserDatabasesByType(supabase: ReturnType<typeof getSupabaseClient>, userId: string, dbType: 'task' | 'event' | 'generic'): Promise<Record<string, unknown>[]>;
/**
 * Invalidate all database list caches.
 * Call after create/delete database, add/update/delete column.
 */
export declare function invalidateDbCaches(): void;
//# sourceMappingURL=database-access.d.ts.map