import { env } from '../config.js';
import { logger } from '../services/logger.js';

/**
 * Simple in-memory rate limiter
 * Tracks requests per IP with sliding window
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Store rate limit entries per IP
const limits = new Map<string, RateLimitEntry>();

// Cleanup interval to prevent memory leaks
const CLEANUP_INTERVAL = 60000; // 1 minute

/**
 * Periodically clean up expired entries
 */
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [ip, entry] of limits.entries()) {
    if (entry.resetAt < now) {
      limits.delete(ip);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug({ cleaned, remaining: limits.size }, 'Rate limit cleanup');
  }
}, CLEANUP_INTERVAL);

/**
 * Check if a request is within rate limits
 * @param ip - The IP address or identifier to rate limit
 * @param limit - Maximum requests per window (default from env)
 * @param windowMs - Window size in milliseconds (default from env)
 * @returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(
  ip: string,
  limit: number = env.RATE_LIMIT_REQUESTS,
  windowMs: number = env.RATE_LIMIT_WINDOW_MS
): boolean {
  const now = Date.now();
  const entry = limits.get(ip);

  // No existing entry or expired - create new one
  if (!entry || entry.resetAt < now) {
    limits.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  // Check if over limit
  if (entry.count >= limit) {
    logger.warn({ ip, count: entry.count, limit }, 'Rate limit exceeded');
    return false;
  }

  // Increment counter
  entry.count++;
  return true;
}

/**
 * Get rate limit info for an IP
 */
export function getRateLimitInfo(ip: string): { remaining: number; resetAt: number } | null {
  const entry = limits.get(ip);
  if (!entry || entry.resetAt < Date.now()) {
    return null;
  }

  return {
    remaining: Math.max(0, env.RATE_LIMIT_REQUESTS - entry.count),
    resetAt: entry.resetAt,
  };
}

/**
 * Reset rate limit for an IP (useful for testing)
 */
export function resetRateLimit(ip: string): void {
  limits.delete(ip);
}

/**
 * Get current rate limit stats
 */
export function getRateLimitStats(): { activeEntries: number; totalRequests: number } {
  let totalRequests = 0;
  for (const entry of limits.values()) {
    totalRequests += entry.count;
  }

  return {
    activeEntries: limits.size,
    totalRequests,
  };
}
