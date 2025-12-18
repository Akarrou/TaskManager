import { SupabaseClient } from '@supabase/supabase-js';
/**
 * Get the Supabase client instance (singleton)
 * Uses SERVICE_ROLE_KEY to bypass RLS for full access
 */
export declare function getSupabaseClient(): SupabaseClient;
/**
 * Test Supabase connection
 * @returns true if connection is successful
 */
export declare function testConnection(): Promise<boolean>;
//# sourceMappingURL=supabase-client.d.ts.map