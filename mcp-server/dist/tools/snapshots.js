import { z } from 'zod';
import { restoreSnapshot, listSnapshots, cleanupOldSnapshots } from '../services/snapshot.js';
/**
 * Register snapshot management tools
 */
export function registerSnapshotTools(server) {
    // =========================================================================
    // restore_snapshot - Restore an entity from a snapshot token
    // =========================================================================
    server.tool('restore_snapshot', `Restore an entity to a previous state using a snapshot token. Snapshot tokens are returned in the response of every modification tool (update/delete) in the format "snap_xxxx_timestamp". For update operations, the entity is reverted to its pre-modification state. For delete operations, the entity is re-created. Returns the restored data. Use list_snapshots to find available tokens if you don't have one.`, {
        token: z.string().describe('The snapshot token (e.g., "snap_abc123def456_1708617600000"). Get this from a previous tool response or from list_snapshots.'),
    }, async ({ token }) => {
        try {
            const result = await restoreSnapshot(token);
            return {
                content: [{
                        type: 'text',
                        text: `Entity restored successfully:\n${JSON.stringify({
                            entity_type: result.entityType,
                            entity_id: result.entityId,
                            restored_data: result.data,
                        }, null, 2)}`,
                    }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Error restoring snapshot: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // list_snapshots - List available snapshots for an entity
    // =========================================================================
    server.tool('list_snapshots', `List recent snapshots to find a token for restoration. Snapshots are created automatically before every modification (update/delete) by MCP tools. Returns token, entity_type, entity_id, tool_name, operation, and created_at for each snapshot. Filter by entity_type and/or entity_id to narrow results. Use the returned token with restore_snapshot to rollback a change.`, {
        entity_type: z.string().optional().describe('Filter by entity type (e.g., "document", "project", "task_row", "database_row", "tab", "section", "spreadsheet", "comment").'),
        entity_id: z.string().optional().describe('Filter by specific entity ID (UUID or database ID).'),
        limit: z.number().min(1).max(50).optional().default(10).describe('Maximum snapshots to return. Default 10, max 50.'),
    }, async ({ entity_type, entity_id, limit }) => {
        try {
            const snapshots = await listSnapshots(entity_type, entity_id, limit);
            return {
                content: [{
                        type: 'text',
                        text: `Found ${snapshots.length} snapshot(s):\n${JSON.stringify(snapshots, null, 2)}`,
                    }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Error listing snapshots: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // cleanup_snapshots - Manually trigger snapshot cleanup
    // =========================================================================
    server.tool('cleanup_snapshots', `Manually trigger cleanup of old snapshots that exceed the retention period (default 30 days). This runs automatically with 1% probability on each snapshot creation, but can be triggered manually if needed. Returns the number of deleted snapshots.`, {}, async () => {
        try {
            const deleted = await cleanupOldSnapshots();
            return {
                content: [{
                        type: 'text',
                        text: `Cleanup complete: ${deleted} old snapshot(s) deleted.`,
                    }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Error cleaning up snapshots: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
}
//# sourceMappingURL=snapshots.js.map