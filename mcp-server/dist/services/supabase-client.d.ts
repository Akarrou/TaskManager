import { SupabaseClient } from '@supabase/supabase-js';
/**
 * Get the Supabase client instance (singleton)
 * Uses SERVICE_ROLE_KEY to bypass RLS for full access
 */
export declare function getSupabaseClient(): SupabaseClient;
/**
 * Retry wrapper with exponential backoff
 * Retries failed operations with increasing delays
 */
export declare function withRetry<T>(operation: () => Promise<T>, options?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    operationName?: string;
}): Promise<T>;
/**
 * Test Supabase connection
 * @returns true if connection is successful
 */
export declare function testConnection(): Promise<boolean>;
/**
 * Execute a Supabase query with retry and logging
 */
export declare function executeWithRetry<T>(queryFn: () => Promise<{
    data: T | null;
    error: Error | null;
}>, operationName: string, tableName: string): Promise<{
    data: T | null;
    error: Error | null;
}>;
//# sourceMappingURL=supabase-client.d.ts.map