/**
 * Simple in-memory TTL cache for metadata queries
 */
export declare class SimpleCache<T> {
    private cache;
    private defaultTtlMs;
    constructor(defaultTtlMs?: number);
    get(key: string): T | undefined;
    set(key: string, value: T, ttlMs?: number): void;
    invalidate(key: string): void;
    clear(): void;
}
/** Cache for individual database configs (keyed by database_id) */
export declare const dbConfigCache: SimpleCache<Record<string, unknown>>;
/** Cache for user database lists (keyed by userId:dbType) */
export declare const userDbListCache: SimpleCache<Record<string, unknown>[]>;
//# sourceMappingURL=cache.d.ts.map