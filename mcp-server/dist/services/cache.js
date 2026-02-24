/**
 * Simple in-memory TTL cache for metadata queries
 */
export class SimpleCache {
    cache = new Map();
    defaultTtlMs;
    constructor(defaultTtlMs = 120_000) {
        this.defaultTtlMs = defaultTtlMs;
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return undefined;
        }
        return entry.value;
    }
    set(key, value, ttlMs) {
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
        });
    }
    invalidate(key) {
        this.cache.delete(key);
    }
    clear() {
        this.cache.clear();
    }
}
/** Cache for individual database configs (keyed by database_id) */
export const dbConfigCache = new SimpleCache();
/** Cache for user database lists (keyed by userId:dbType) */
export const userDbListCache = new SimpleCache();
//# sourceMappingURL=cache.js.map