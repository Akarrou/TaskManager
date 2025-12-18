/**
 * Production Environment Configuration
 *
 * This file provides fallback values for production builds.
 * Actual runtime values are injected via Docker entrypoint script (window.__env).
 *
 * DO NOT hardcode production secrets here!
 * Values below are placeholders that will be overridden at runtime.
 */
export const environment = {
  production: true,

  /**
   * Supabase API URL
   * Runtime value injected by Docker: window.__env.supabaseUrl
   * Fallback points to localhost (should never be used in production)
   */
  supabaseUrl: 'http://localhost:8000',

  /**
   * Supabase Anonymous Key (Public API key)
   * Runtime value injected by Docker: window.__env.supabaseAnonKey
   * This placeholder is intentionally invalid
   */
  supabaseAnonKey: 'PLACEHOLDER_ANON_KEY_WILL_BE_INJECTED_AT_RUNTIME',

  /**
   * Project Name
   * Runtime value injected by Docker: window.__env.projectName
   */
  projectName: 'Kōdo Task Manager'
};
