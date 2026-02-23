import { getSupabaseClient } from './supabase-client.js';
import { env } from '../config.js';
import { logger } from './logger.js';

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
 * Generate a snapshot token from entity ID and timestamp
 * Format: snap_{entityId_short_12chars}_{timestamp_ms}
 */
function generateToken(entityId: string): string {
  const short = entityId.replace(/-/g, '').slice(0, 12);
  return `snap_${short}_${Date.now()}`;
}

/**
 * Primary key column name for a given entity type
 */
function getPkColumn(entityType: string): string {
  switch (entityType) {
    case 'database_config':
      return 'database_id';
    case 'spreadsheet':
      return 'spreadsheet_id';
    default:
      return 'id';
  }
}

/**
 * Entity types that store array data (batch snapshots)
 */
const ARRAY_ENTITY_TYPES = new Set([
  'spreadsheet_cells_batch',
  'spreadsheet_cells_range',
]);

/**
 * Entity types that use composite keys (not restorable via simple PK lookup)
 */
const COMPOSITE_KEY_ENTITY_TYPES = new Set([
  'spreadsheet_cell',
]);

/**
 * Save a snapshot of an entity before modification.
 * Awaits confirmation — if insertion fails, throws an error
 * so the modification does NOT proceed.
 */
export async function saveSnapshot(params: SnapshotParams): Promise<SnapshotResult> {
  const supabase = getSupabaseClient();
  const token = generateToken(params.entityId);

  const { error } = await supabase
    .from('mcp_snapshots')
    .insert({
      token,
      entity_type: params.entityType,
      entity_id: params.entityId,
      table_name: params.tableName || null,
      tool_name: params.toolName,
      operation: params.operation,
      snapshot_data: params.data,
      user_id: params.userId || null,
    });

  if (error) {
    logger.error({ error, token, toolName: params.toolName }, 'Failed to save snapshot');
    throw new Error(`Snapshot failed — modification blocked: ${error.message}`);
  }

  // Probabilistic cleanup (1% chance)
  if (Math.random() < 0.01) {
    cleanupOldSnapshots().catch(err => {
      logger.warn({ error: err }, 'Snapshot cleanup failed (non-blocking)');
    });
  }

  return { token, createdAt: new Date().toISOString() };
}

/**
 * Restore an entity from a snapshot token.
 * - For 'update' operations: updates the entity with snapshot data
 * - For 'delete' operations: re-inserts the entity
 * - For composite-key entities (spreadsheet cells): uses upsert with conflict columns
 * - For array-data entities (batch/range): restores each item individually
 */
export async function restoreSnapshot(token: string): Promise<{ entityType: string; entityId: string; data: unknown }> {
  const supabase = getSupabaseClient();

  // Fetch the snapshot
  const { data: snapshot, error: fetchError } = await supabase
    .from('mcp_snapshots')
    .select('*')
    .eq('token', token)
    .single();

  if (fetchError || !snapshot) {
    throw new Error(`Snapshot not found: ${token}`);
  }

  const tableName = snapshot.table_name as string;
  const entityId = snapshot.entity_id as string;
  const operation = snapshot.operation as string;
  const snapshotData = snapshot.snapshot_data;
  const entityType = snapshot.entity_type as string;

  if (!tableName) {
    throw new Error(`Snapshot ${token} has no table_name — cannot restore`);
  }

  // Handle array-data entity types (batch/range snapshots)
  if (ARRAY_ENTITY_TYPES.has(entityType)) {
    const rows = snapshotData as Record<string, unknown>[];
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`Snapshot ${token} has no array data to restore`);
    }

    // Upsert all cells back (uses composite key: spreadsheet_id, sheet_id, row, col)
    const { error } = await supabase
      .from(tableName)
      .upsert(rows, { onConflict: 'spreadsheet_id,sheet_id,row,col' });

    if (error) {
      throw new Error(`Failed to restore snapshot ${token}: ${error.message}`);
    }

    logger.info({ token, entityType, entityId, operation, rowCount: rows.length }, 'Batch snapshot restored');
    return { entityType, entityId, data: snapshotData };
  }

  // Handle composite-key entity types (single spreadsheet cell)
  if (COMPOSITE_KEY_ENTITY_TYPES.has(entityType)) {
    const cellData = snapshotData as Record<string, unknown>;

    // Upsert the cell using its composite key
    const { error } = await supabase
      .from(tableName)
      .upsert(cellData, { onConflict: 'spreadsheet_id,sheet_id,row,col' });

    if (error) {
      throw new Error(`Failed to restore snapshot ${token}: ${error.message}`);
    }

    logger.info({ token, entityType, entityId, operation }, 'Composite-key snapshot restored');
    return { entityType, entityId, data: snapshotData };
  }

  // Standard entity types (single row with simple PK)
  const standardData = snapshotData as Record<string, unknown>;
  const pkColumn = getPkColumn(entityType);

  if (operation === 'update') {
    const { error } = await supabase
      .from(tableName)
      .update(standardData)
      .eq(pkColumn, entityId);

    if (error) {
      throw new Error(`Failed to restore snapshot ${token}: ${error.message}`);
    }
  } else if (operation === 'delete') {
    const { error } = await supabase
      .from(tableName)
      .insert(standardData);

    if (error) {
      throw new Error(`Failed to restore snapshot ${token}: ${error.message}`);
    }
  } else {
    throw new Error(`Unknown snapshot operation: ${operation}`);
  }

  logger.info({ token, entityType, entityId, operation }, 'Snapshot restored');

  return { entityType, entityId, data: snapshotData };
}

/**
 * List snapshots for an entity, ordered by most recent first.
 */
export async function listSnapshots(
  entityType?: string,
  entityId?: string,
  limit: number = 10,
): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseClient();

  let query = supabase
    .from('mcp_snapshots')
    .select('token, entity_type, entity_id, table_name, tool_name, operation, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (entityType) {
    query = query.eq('entity_type', entityType);
  }

  if (entityId) {
    query = query.eq('entity_id', entityId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list snapshots: ${error.message}`);
  }

  return data || [];
}

/**
 * Delete snapshots older than SNAPSHOT_RETENTION_DAYS.
 * Returns the number of deleted snapshots.
 */
export async function cleanupOldSnapshots(): Promise<number> {
  const supabase = getSupabaseClient();
  const retentionDays = env.SNAPSHOT_RETENTION_DAYS;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const { error, count } = await supabase
    .from('mcp_snapshots')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff.toISOString());

  if (error) {
    logger.error({ error }, 'Failed to cleanup old snapshots');
    throw new Error(`Snapshot cleanup failed: ${error.message}`);
  }

  const deleted = count || 0;
  if (deleted > 0) {
    logger.info({ deleted, retentionDays }, 'Old snapshots cleaned up');
  }

  return deleted;
}
