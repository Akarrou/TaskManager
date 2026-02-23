-- Migration: Add RPC functions for atomic trash operations
-- Fixes: non-atomic soft delete, fragile emptyTrash hack, purge UUID cast issue

-- =============================================================================
-- 1. Atomic soft_delete_item: UPDATE original table + INSERT trash_items
--    in a single transaction. Prevents orphaned items.
-- =============================================================================

CREATE OR REPLACE FUNCTION soft_delete_item(
  p_item_type TEXT,
  p_item_id TEXT,
  p_item_table TEXT,
  p_display_name TEXT,
  p_parent_info JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_result RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Step 1: Set deleted_at on original table
  EXECUTE format(
    'UPDATE %I SET deleted_at = now() WHERE id = $1',
    p_item_table
  ) USING p_item_id::uuid;

  -- Step 2: Insert into trash_items (upsert to handle re-deletion)
  INSERT INTO trash_items (item_type, item_id, item_table, display_name, parent_info, user_id)
  VALUES (p_item_type, p_item_id, p_item_table, p_display_name, p_parent_info, v_user_id)
  ON CONFLICT (item_type, item_id) DO UPDATE SET
    deleted_at = now(),
    expires_at = now() + interval '30 days',
    display_name = EXCLUDED.display_name,
    parent_info = EXCLUDED.parent_info
  RETURNING * INTO v_result;

  RETURN jsonb_build_object(
    'success', true,
    'trash_item', jsonb_build_object(
      'id', v_result.id,
      'item_type', v_result.item_type,
      'item_id', v_result.item_id,
      'item_table', v_result.item_table,
      'display_name', v_result.display_name,
      'parent_info', v_result.parent_info,
      'user_id', v_result.user_id,
      'deleted_at', v_result.deleted_at,
      'expires_at', v_result.expires_at
    )
  );
END;
$$;

COMMENT ON FUNCTION soft_delete_item IS
'Atomic soft delete: sets deleted_at on original table and inserts into trash_items in a single transaction.';

-- =============================================================================
-- 2. Empty all trash for current user (atomic)
--    Replaces the fragile client-side .neq() hack
-- =============================================================================

CREATE OR REPLACE FUNCTION empty_user_trash()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_record RECORD;
  v_deleted_count INTEGER := 0;
  v_errors TEXT[] := '{}';
  v_table_name TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Process projects first (cascade to children)
  FOR v_record IN
    SELECT id, item_id, item_table, item_type, display_name
    FROM trash_items
    WHERE user_id = v_user_id AND item_type = 'project'
  LOOP
    BEGIN
      PERFORM _cascade_hard_delete_project(v_record.item_id::uuid, v_user_id);
      EXECUTE format('DELETE FROM %I WHERE id = $1', v_record.item_table)
        USING v_record.item_id::uuid;
      v_deleted_count := v_deleted_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors,
        format('Failed to delete %s: %s', v_record.display_name, SQLERRM));
    END;
  END LOOP;

  -- Then process remaining non-project items
  FOR v_record IN
    SELECT id, item_id, item_table, item_type, display_name
    FROM trash_items
    WHERE user_id = v_user_id AND item_type != 'project'
  LOOP
    BEGIN
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

      EXECUTE format('DELETE FROM %I WHERE id = $1', v_record.item_table)
        USING v_record.item_id::uuid;
      v_deleted_count := v_deleted_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors,
        format('Failed to delete %s: %s', v_record.display_name, SQLERRM));
    END;
  END LOOP;

  -- Clean up all remaining trash_items for this user
  DELETE FROM trash_items WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'errors', to_jsonb(v_errors)
  );
END;
$$;

COMMENT ON FUNCTION empty_user_trash IS
'Empties all trash for the current user. Hard-deletes items from original tables, then cleans up trash_items.';

-- =============================================================================
-- 3. Updated purge function with non-UUID fallback
--    Fixes potential cast error for non-standard item IDs
-- =============================================================================

CREATE OR REPLACE FUNCTION purge_expired_trash()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record RECORD;
  v_purged_count INTEGER := 0;
  v_errors TEXT[] := '{}';
  v_table_name TEXT;
BEGIN
  FOR v_record IN
    SELECT id, item_type, item_id, item_table, display_name, user_id
    FROM trash_items
    WHERE expires_at <= now()
    ORDER BY deleted_at ASC
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

      -- Try UUID cast first, fall back to text comparison
      BEGIN
        EXECUTE format('DELETE FROM %I WHERE id = $1', v_record.item_table)
          USING v_record.item_id::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        EXECUTE format('DELETE FROM %I WHERE id::text = $1', v_record.item_table)
          USING v_record.item_id;
      END;

      DELETE FROM trash_items WHERE id = v_record.id;
      v_purged_count := v_purged_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors,
        format('Failed to purge %s (%s): %s', v_record.display_name, v_record.item_id, SQLERRM));
      -- Still remove trash record (item may already be gone)
      DELETE FROM trash_items WHERE id = v_record.id;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'purged_count', v_purged_count,
    'errors', to_jsonb(v_errors)
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION soft_delete_item TO authenticated;
GRANT EXECUTE ON FUNCTION empty_user_trash TO authenticated;
GRANT EXECUTE ON FUNCTION purge_expired_trash TO service_role;
