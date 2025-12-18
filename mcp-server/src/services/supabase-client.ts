import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config.js';

let client: SupabaseClient | null = null;

/**
 * Get the Supabase client instance (singleton)
 * Uses SERVICE_ROLE_KEY to bypass RLS for full access
 */
export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return client;
}

/**
 * Test Supabase connection
 * @returns true if connection is successful
 */
export async function testConnection(): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('projects').select('count').limit(1);
    return !error;
  } catch {
    return false;
  }
}
