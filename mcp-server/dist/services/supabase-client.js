import { createClient } from '@supabase/supabase-js';
import { env } from '../config.js';
import { logger, logSupabase } from './logger.js';
let client = null;
/**
 * Get the Supabase client instance (singleton)
 * Uses SERVICE_ROLE_KEY to bypass RLS for full access
 */
export function getSupabaseClient() {
    if (!client) {
        client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
        logger.info({ url: env.SUPABASE_URL }, 'Supabase client initialized');
    }
    return client;
}
/**
 * Retry wrapper with exponential backoff
 * Retries failed operations with increasing delays
 */
export async function withRetry(operation, options = {}) {
    const { maxAttempts = env.RETRY_MAX_ATTEMPTS, baseDelayMs = env.RETRY_BASE_DELAY_MS, operationName = 'operation', } = options;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const startTime = Date.now();
            const result = await operation();
            const duration = Date.now() - startTime;
            if (attempt > 1) {
                logger.info({ operationName, attempt, duration }, `Retry succeeded after ${attempt} attempts`);
            }
            return result;
        }
        catch (error) {
            lastError = error;
            const isRetryable = isRetryableError(lastError);
            if (!isRetryable || attempt === maxAttempts) {
                logger.error({ operationName, attempt, maxAttempts, error: lastError.message, retryable: isRetryable }, `Operation failed: ${operationName}`);
                throw lastError;
            }
            const delay = baseDelayMs * Math.pow(2, attempt - 1);
            logger.warn({ operationName, attempt, maxAttempts, delay, error: lastError.message }, `Retrying ${operationName} in ${delay}ms`);
            await sleep(delay);
        }
    }
    throw lastError;
}
/**
 * Check if an error is retryable
 */
function isRetryableError(error) {
    const message = error.message.toLowerCase();
    // Network errors
    if (message.includes('network') || message.includes('timeout') || message.includes('econnrefused')) {
        return true;
    }
    // Rate limiting
    if (message.includes('rate limit') || message.includes('too many requests')) {
        return true;
    }
    // Server errors (5xx)
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
        return true;
    }
    return false;
}
/**
 * Sleep helper
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Test Supabase connection
 * @returns true if connection is successful
 */
export async function testConnection() {
    try {
        const startTime = Date.now();
        const supabase = getSupabaseClient();
        const { error } = await supabase.from('projects').select('count').limit(1);
        const duration = Date.now() - startTime;
        if (error) {
            logSupabase('testConnection', 'projects', duration, error);
            return false;
        }
        logSupabase('testConnection', 'projects', duration);
        return true;
    }
    catch (error) {
        logSupabase('testConnection', 'projects', undefined, error);
        return false;
    }
}
/**
 * Execute a Supabase query with retry and logging
 */
export async function executeWithRetry(queryFn, operationName, tableName) {
    const startTime = Date.now();
    try {
        const result = await withRetry(async () => {
            const { data, error } = await queryFn();
            if (error)
                throw error;
            return { data, error: null };
        }, { operationName: `${operationName}:${tableName}` });
        const duration = Date.now() - startTime;
        logSupabase(operationName, tableName, duration);
        return result;
    }
    catch (error) {
        const duration = Date.now() - startTime;
        logSupabase(operationName, tableName, duration, error);
        return { data: null, error: error };
    }
}
//# sourceMappingURL=supabase-client.js.map