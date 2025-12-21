/**
 * Check if a request is within rate limits
 * @param ip - The IP address or identifier to rate limit
 * @param limit - Maximum requests per window (default from env)
 * @param windowMs - Window size in milliseconds (default from env)
 * @returns true if request is allowed, false if rate limited
 */
export declare function checkRateLimit(ip: string, limit?: number, windowMs?: number): boolean;
/**
 * Get rate limit info for an IP
 */
export declare function getRateLimitInfo(ip: string): {
    remaining: number;
    resetAt: number;
} | null;
/**
 * Reset rate limit for an IP (useful for testing)
 */
export declare function resetRateLimit(ip: string): void;
/**
 * Get current rate limit stats
 */
export declare function getRateLimitStats(): {
    activeEntries: number;
    totalRequests: number;
};
//# sourceMappingURL=rate-limiter.d.ts.map