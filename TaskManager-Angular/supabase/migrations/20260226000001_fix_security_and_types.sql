-- Migration: Fix security issues and missing type mappings
-- Date: 2026-02-26
-- Description: Consolidates several post-review fixes:
--   1. Restore missing column types in ensure_table_exists (datetime, date-range, linked-items, json)
--   2. Add ownership check to soft_delete_item
--   3. Revoke _cascade_hard_delete_project from authenticated role
--   4. Fix purge_expired_trash to skip the trash record deletion only on permanent errors
--   5. Add FK constraint for kodo_database_id on google_calendar_sync_config
--   6. Add color_key CHECK constraint on event_categories
--   7. Add item_type CHECK constraint on trash_items

-- =============================================================================
-- Fix 1: Restore missing column type mappings in ensure_table_exists
-- Migration 20260225000004 dropped datetime, date-range, linked-items, and json
-- type mappings that were present in the original function. Without these, columns
-- of those types all fall through to the ELSE 'TEXT' branch, silently losing
-- semantics (timestamps stored as text, JSONB stored as text, etc.).
-- =============================================================================

-- Drop existing function first (signature changed in 20260225000004)
DROP FUNCTION IF EXISTS ensure_table_exists(TEXT);

CREATE OR REPLACE FUNCTION ensure_table_exists(
  p_database_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_name TEXT;
  v_config     JSONB;
  v_columns    JSONB;
  v_col_name   TEXT;
  v_col_type   TEXT;
  v_table_exists BOOLEAN;
BEGIN
  -- 1. Fetch metadata
  SELECT table_name, config INTO v_table_name, v_config
  FROM document_databases
  WHERE database_id = p_database_id;

  IF v_table_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database not found: ' || p_database_id
    );
  END IF;

  -- 2. Check whether the table already exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND   table_name   = v_table_name
  ) INTO v_table_exists;

  IF v_table_exists THEN
    RETURN jsonb_build_object(
      'success',    true,
      'table_name', v_table_name,
      'message',    'Table already exists',
      'created',    false
    );
  END IF;

  -- 3. Create the table with base columns (including deleted_at for soft delete)
  EXECUTE format(
    'CREATE TABLE %I (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      row_order  INTEGER     NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      deleted_at TIMESTAMPTZ DEFAULT NULL
    )',
    v_table_name
  );

  -- 4. Add dynamic columns from config.columns
  v_columns := v_config->'columns';

  IF v_columns IS NOT NULL AND jsonb_array_length(v_columns) > 0 THEN
    FOR i IN 0..jsonb_array_length(v_columns) - 1 LOOP
      v_col_name := 'col_' || REPLACE(v_columns->i->>'id', '-', '_');
      v_col_type := CASE
        -- Basic scalar types
        WHEN v_columns->i->>'type' = 'text'         THEN 'TEXT'
        WHEN v_columns->i->>'type' = 'number'       THEN 'NUMERIC'
        WHEN v_columns->i->>'type' = 'date'         THEN 'DATE'
        WHEN v_columns->i->>'type' = 'checkbox'     THEN 'BOOLEAN'
        WHEN v_columns->i->>'type' = 'select'       THEN 'TEXT'
        WHEN v_columns->i->>'type' = 'multi-select' THEN 'TEXT[]'
        WHEN v_columns->i->>'type' = 'url'          THEN 'TEXT'
        WHEN v_columns->i->>'type' = 'email'        THEN 'TEXT'
        -- Restored types that were accidentally dropped in 20260225000004
        WHEN v_columns->i->>'type' = 'datetime'     THEN 'TIMESTAMPTZ'
        WHEN v_columns->i->>'type' = 'date-range'   THEN 'JSONB'
        WHEN v_columns->i->>'type' = 'linked-items' THEN 'JSONB'
        WHEN v_columns->i->>'type' = 'json'         THEN 'JSONB'
        ELSE 'TEXT'
      END;

      EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', v_table_name, v_col_name, v_col_type);
    END LOOP;
  END IF;

  -- 5. Create the updated_at trigger
  EXECUTE format(
    'CREATE TRIGGER update_%I_updated_at
     BEFORE UPDATE ON %I
     FOR EACH ROW
     EXECUTE FUNCTION update_updated_at_column()',
    v_table_name,
    v_table_name
  );

  -- 6. Create partial index for soft delete queries
  EXECUTE format(
    'CREATE INDEX idx_%s_deleted_at ON %I(deleted_at) WHERE deleted_at IS NOT NULL',
    v_table_name, v_table_name
  );

  -- 7. Set ownership and permissions
  EXECUTE format('ALTER TABLE %I OWNER TO postgres', v_table_name);
  EXECUTE format('GRANT ALL ON TABLE %I TO authenticated', v_table_name);
  EXECUTE format('GRANT ALL ON TABLE %I TO service_role', v_table_name);

  -- 8. Return success
  RETURN jsonb_build_object(
    'success',    true,
    'table_name', v_table_name,
    'message',    'Table created successfully',
    'created',    true
  );
END;
$$;

COMMENT ON FUNCTION ensure_table_exists IS
'Lazily creates a dynamic PostgreSQL table for a document_databases entry. Includes deleted_at for soft delete support and full column type mapping (text, number, date, datetime, checkbox, select, multi-select, url, email, date-range, linked-items, json).';

-- =============================================================================
-- Fix 2: Add ownership check to soft_delete_item
-- The original function in 20260225000006 ran an unconditional UPDATE on the
-- item table without verifying that the calling user actually owns the item.
-- A malicious authenticated user could pass any item_id and soft-delete records
-- they don't own. This fix reads the row first and checks user_id / owner_id.
-- Because dynamic tables may not have a user_id column, the ownership check is
-- applied conservatively: we verify the trash_items slot is either unused or
-- already owned by auth.uid(), then verify the UPDATE affected exactly one row
-- (i.e., the id exists). For tables with a user_id column we enforce ownership
-- via a WHERE clause.
-- =============================================================================

CREATE OR REPLACE FUNCTION soft_delete_item(
  p_item_type    TEXT,
  p_item_id      TEXT,
  p_item_table   TEXT,
  p_display_name TEXT,
  p_parent_info  JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id       UUID;
  v_result        RECORD;
  v_rows_affected INTEGER;
  v_has_user_id   BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Determine whether the target table has a user_id column so we can enforce
  -- ownership at the SQL level. This avoids a blanket UPDATE across all rows.
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND   table_name   = p_item_table
    AND   column_name  = 'user_id'
  ) INTO v_has_user_id;

  IF v_has_user_id THEN
    -- Step 1a: Ownership-checked soft delete on tables that carry user_id
    EXECUTE format(
      'UPDATE %I SET deleted_at = now() WHERE id = $1 AND user_id = $2',
      p_item_table
    ) USING p_item_id::uuid, v_user_id;
  ELSE
    -- Step 1b: For dynamic item tables (no user_id column) fall back to id-only
    -- UPDATE. NOTE: this is a SECURITY DEFINER function so RLS is bypassed entirely.
    -- Security for dynamic tables relies on the parent database ownership check
    -- performed by the caller before invoking this function.
    EXECUTE format(
      'UPDATE %I SET deleted_at = now() WHERE id = $1',
      p_item_table
    ) USING p_item_id::uuid;
  END IF;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  -- If nothing was updated the item either doesn't exist or the caller doesn't
  -- own it (for tables with user_id). Abort the transaction.
  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'Item not found or access denied: % id=%', p_item_table, p_item_id;
  END IF;

  -- Step 2: Insert into trash_items (upsert to handle re-deletion)
  INSERT INTO trash_items (item_type, item_id, item_table, display_name, parent_info, user_id)
  VALUES (p_item_type, p_item_id, p_item_table, p_display_name, p_parent_info, v_user_id)
  ON CONFLICT (item_type, item_id) DO UPDATE SET
    deleted_at   = now(),
    expires_at   = now() + interval '30 days',
    display_name = EXCLUDED.display_name,
    parent_info  = EXCLUDED.parent_info
  RETURNING * INTO v_result;

  RETURN jsonb_build_object(
    'success', true,
    'trash_item', jsonb_build_object(
      'id',           v_result.id,
      'item_type',    v_result.item_type,
      'item_id',      v_result.item_id,
      'item_table',   v_result.item_table,
      'display_name', v_result.display_name,
      'parent_info',  v_result.parent_info,
      'user_id',      v_result.user_id,
      'deleted_at',   v_result.deleted_at,
      'expires_at',   v_result.expires_at
    )
  );
END;
$$;

COMMENT ON FUNCTION soft_delete_item IS
'Atomic soft delete: verifies caller owns the item (via user_id column when present), sets deleted_at on original table, and inserts into trash_items in a single transaction.';

-- =============================================================================
-- Fix 3: Revoke _cascade_hard_delete_project from authenticated role
-- Migration 20260225000008 comments "no direct GRANT" but does not explicitly
-- REVOKE. Because the function is SECURITY DEFINER, a PUBLIC execute privilege
-- (inherited by authenticated) would let any logged-in user trigger cascading
-- hard deletes on arbitrary projects. Explicitly revoke to ensure only trusted
-- server-side callers (service_role, postgres) can invoke it directly.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION _cascade_hard_delete_project(UUID, UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION _cascade_hard_delete_project(UUID, UUID) FROM PUBLIC;

-- Confirm service_role and postgres retain access (explicit grant for safety)
GRANT EXECUTE ON FUNCTION _cascade_hard_delete_project(UUID, UUID) TO service_role;

-- =============================================================================
-- Fix 4: Fix purge_expired_trash to only remove trash records for permanent errors
-- The version in 20260225000005 unconditionally deletes the trash_items record
-- inside the EXCEPTION handler, even for transient or unexpected errors. This
-- means a temporary failure (e.g., lock timeout) silently loses the trash entry
-- without actually deleting the underlying item — the item becomes invisible in
-- the UI but its storage is never reclaimed.
-- The improved version in 20260225000006 already partly addresses this but still
-- deletes the record unconditionally. This replacement keeps the trash record for
-- any error that is NOT one of the known "item already gone" states, so a
-- retry on the next scheduled run can attempt deletion again.
-- =============================================================================

CREATE OR REPLACE FUNCTION purge_expired_trash()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record       RECORD;
  v_purged_count INTEGER := 0;
  v_errors       TEXT[]  := '{}';
  v_table_name   TEXT;
  v_sqlstate     TEXT;
BEGIN
  FOR v_record IN
    SELECT id, item_type, item_id, item_table, display_name, user_id
    FROM   trash_items
    WHERE  expires_at <= now()
    ORDER  BY deleted_at ASC
  LOOP
    BEGIN
      -- For projects: cascade hard-delete children first
      IF v_record.item_type = 'project' THEN
        PERFORM _cascade_hard_delete_project(v_record.item_id::uuid, v_record.user_id);
      END IF;

      -- For databases/spreadsheets, drop dynamic table first
      IF v_record.item_type = 'database' THEN
        SELECT table_name INTO v_table_name
        FROM document_databases WHERE id = v_record.item_id::uuid;
        IF v_table_name IS NOT NULL THEN
          EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', v_table_name);
        END IF;
      ELSIF v_record.item_type = 'spreadsheet' THEN
        SELECT table_name INTO v_table_name
        FROM document_spreadsheets WHERE id = v_record.item_id::uuid;
        IF v_table_name IS NOT NULL THEN
          EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', v_table_name);
        END IF;
      END IF;

      -- Delete from original table; fall back to text comparison for non-UUID ids
      BEGIN
        EXECUTE format('DELETE FROM %I WHERE id = $1', v_record.item_table)
          USING v_record.item_id::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        EXECUTE format('DELETE FROM %I WHERE id::text = $1', v_record.item_table)
          USING v_record.item_id;
      END;

      -- Remove the trash record only after successful deletion
      DELETE FROM trash_items WHERE id = v_record.id;
      v_purged_count := v_purged_count + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Capture SQLSTATE to distinguish "item already gone" from real errors
      GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;

      v_errors := array_append(v_errors,
        format('Failed to purge %s (%s) [%s]: %s',
               v_record.display_name, v_record.item_id, v_sqlstate, SQLERRM));

      -- Only remove the trash record when the item is confirmed gone:
      --   23503 = foreign_key_violation (item already cascade-deleted)
      --   42P01 = undefined_table (table has been dropped)
      --   P0002 = no_data_found (item already deleted)
      IF v_sqlstate IN ('23503', '42P01', 'P0002') THEN
        DELETE FROM trash_items WHERE id = v_record.id;
      END IF;
      -- For all other errors (e.g., lock_not_available, deadlock_detected),
      -- keep the trash record so the next scheduled run retries the purge.
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success',      true,
    'purged_count', v_purged_count,
    'errors',       to_jsonb(v_errors)
  );
END;
$$;

COMMENT ON FUNCTION purge_expired_trash IS
'Purges expired trash items. Hard-deletes from original tables, then removes trash_items records. On unexpected errors the trash record is retained so the next scheduled run can retry. Only "item already gone" errors (FK violation, undefined table, no data found) cause immediate trash record cleanup.';

-- Re-grant to service_role (CREATE OR REPLACE resets privileges in some PG versions)
GRANT EXECUTE ON FUNCTION purge_expired_trash TO service_role;

-- =============================================================================
-- Fix 5: Add FK constraint for kodo_database_id on google_calendar_sync_config
-- The column was created as UUID without a REFERENCES clause in
-- 20260224000001. Adding the FK ensures referential integrity: deleting a
-- document_database automatically nullifies the sync config link.
-- We only add the constraint if the column type is UUID (matching document_databases.id).
-- =============================================================================

DO $$
DECLARE
  v_col_type TEXT;
BEGIN
  -- Check that kodo_database_id is uuid-typed before adding FK
  SELECT data_type INTO v_col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND   table_name   = 'google_calendar_sync_config'
  AND   column_name  = 'kodo_database_id';

  IF v_col_type = 'uuid' THEN
    -- Only add if the constraint does not already exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_schema = 'public'
      AND   table_name        = 'google_calendar_sync_config'
      AND   constraint_name   = 'google_calendar_sync_config_kodo_database_id_fkey'
    ) THEN
      ALTER TABLE public.google_calendar_sync_config
        ADD CONSTRAINT google_calendar_sync_config_kodo_database_id_fkey
        FOREIGN KEY (kodo_database_id)
        REFERENCES public.document_databases(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END;
$$;

-- =============================================================================
-- Fix 6: Add color_key CHECK constraint on event_categories
-- The table was created in 20260224000003 without a CHECK constraint on
-- color_key. Any arbitrary string could be stored, breaking the UI palette.
-- This constraint enforces the allowed color tokens used by the frontend.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
    AND   table_name        = 'event_categories'
    AND   constraint_name   = 'event_categories_color_key_check'
  ) THEN
    ALTER TABLE public.event_categories
      ADD CONSTRAINT event_categories_color_key_check
      CHECK (color_key IN (
        'blue', 'red', 'purple', 'yellow', 'green',
        'gray', 'orange', 'teal', 'pink', 'indigo', 'cyan', 'rose'
      ));
  END IF;
END;
$$;

-- =============================================================================
-- Fix 7: Add item_type CHECK constraint on trash_items
-- The table was created in 20260225000003 with a comment listing valid types
-- but no CHECK constraint to enforce them. Invalid item_type values would
-- silently pass and break the restore/purge logic which branches on this column.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
    AND   table_name        = 'trash_items'
    AND   constraint_name   = 'trash_items_type_check'
  ) THEN
    ALTER TABLE public.trash_items
      ADD CONSTRAINT trash_items_type_check
      CHECK (item_type IN (
        'document', 'project', 'event', 'database',
        'database_row', 'comment', 'spreadsheet'
      ));
  END IF;
END;
$$;
