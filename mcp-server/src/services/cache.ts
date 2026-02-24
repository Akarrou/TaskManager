/**
 * Simple in-memory TTL cache for metadata queries
 */
export class SimpleCache<T> {
  private cache = new Map<string, { value: T; expiresAt: number }>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs = 120_000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

/** Cache for individual database configs (keyed by database_id) */
export const dbConfigCache = new SimpleCache<Record<string, unknown>>();

/** Cache for user database lists (keyed by userId:dbType) */
export const userDbListCache = new SimpleCache<Record<string, unknown>[]>();
