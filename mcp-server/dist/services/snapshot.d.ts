export interface SnapshotParams {
    entityType: string;
    entityId: string;
    tableName?: string;
    toolName: string;
    operation: 'update' | 'delete' | 'soft_delete';
    data: unknown;
    userId?: string;
}
export interface SnapshotResult {
    token: string;
    createdAt: string;
}
/**
 * Save a snapshot of an entity before modification.
 * Awaits confirmation — if insertion fails, throws an error
 * so the modification does NOT proceed.
 */
export declare function saveSnapshot(params: SnapshotParams): Promise<SnapshotResult>;
/**
 * Restore an entity from a snapshot token.
 * - For 'update' operations: updates the entity with snapshot data
 * - For 'delete' operations: re-inserts the entity
 * - For composite-key entities (spreadsheet cells): uses upsert with conflict columns
 * - For array-data entities (batch/range): restores each item individually
 *
 * @param userId - If provided, only allows restoring snapshots owned by this user
 */
export declare function restoreSnapshot(token: string, userId?: string): Promise<{
    entityType: string;
    entityId: string;
    data: unknown;
}>;
/**
 * List snapshots for an entity, ordered by most recent first.
 *
 * @param userId - If provided, only returns snapshots owned by this user
 */
export declare function listSnapshots(entityType?: string, entityId?: string, limit?: number, userId?: string): Promise<Record<string, unknown>[]>;
/**
 * Delete snapshots older than SNAPSHOT_RETENTION_DAYS.
 * Returns the number of deleted snapshots.
 */
export declare function cleanupOldSnapshots(): Promise<number>;
//# sourceMappingURL=snapshot.d.ts.map