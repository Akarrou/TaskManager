-- Migration: Add atomic RPCs for restore and permanent delete operations
-- Fixes: non-atomic restore/permanentDelete, orphaned cascade-deleted documents,
--         N getUser() calls in softDeleteTrashOnly

-- =============================================================================
-- 1. Atomic restore_item: clears deleted_at on original table + removes from
--    trash_items in a single transaction.
-- =============================================================================

CREATE OR REPLACE FUNCTION restore_item(p_trash_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_record RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Get the trash item (verify ownership)
  SELECT * INTO v_record
  FROM trash_items
  WHERE id = p_trash_item_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trash item not found or access denied';
  END IF;

  -- Step 1: Clear deleted_at on original table
  EXECUTE format(
    'UPDATE %I SET deleted_at = NULL WHERE id = $1',
    v_record.item_table
  ) USING v_record.item_id::uuid;

  -- Step 2: Remove from trash_items
  DELETE FROM trash_items WHERE id = p_trash_item_id;

  RETURN jsonb_build_object(
    'success', true,
    'item_type', v_record.item_type,
    'item_id', v_record.item_id
  );
END;
$$;

COMMENT ON FUNCTION restore_item IS
'Atomic restore: clears deleted_at on original table and removes from trash_items in a single transaction.';

-- =============================================================================
-- 2. Helper: cascade hard-delete a project's children (documents, databases,
--    spreadsheets, dynamic tables, and their trash_items).
--    Used by both permanent_delete_item and empty_user_trash.
-- =============================================================================

CREATE OR REPLACE FUNCTION _cascade_hard_delete_project(
  p_project_id UUID,
  p_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc_ids UUID[];
  v_db_ids UUID[];
  v_ss_ids UUID[];
  v_doc RECORD;
  v_cascade_count INTEGER := 0;
BEGIN
  -- Collect all child IDs BEFORE deleting anything
  SELECT COALESCE(array_agg(id), '{}') INTO v_doc_ids
  FROM documents WHERE project_id = p_project_id;

  SELECT COALESCE(array_agg(dd.id), '{}') INTO v_db_ids
  FROM document_databases dd
  WHERE dd.document_id = ANY(v_doc_ids);

  SELECT COALESCE(array_agg(ds.id), '{}') INTO v_ss_ids
  FROM document_spreadsheets ds
  WHERE ds.document_id = ANY(v_doc_ids);

  -- Drop dynamic database tables
  FOR v_doc IN
    SELECT dd.id, dd.table_name
    FROM document_databases dd
    WHERE dd.id = ANY(v_db_ids) AND dd.table_name IS NOT NULL
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', v_doc.table_name);
    v_cascade_count := v_cascade_count + 1;
  END LOOP;

  -- Drop dynamic spreadsheet tables
  FOR v_doc IN
    SELECT ds.id, ds.table_name
    FROM document_spreadsheets ds
    WHERE ds.id = ANY(v_ss_ids) AND ds.table_name IS NOT NULL
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', v_doc.table_name);
    v_cascade_count := v_cascade_count + 1;
  END LOOP;

  -- Delete metadata records
  DELETE FROM document_databases WHERE id = ANY(v_db_ids);
  DELETE FROM document_spreadsheets WHERE id = ANY(v_ss_ids);
  DELETE FROM documents WHERE id = ANY(v_doc_ids);

  -- Clean up trash_items for all cascade-deleted children (using collected IDs)
  DELETE FROM trash_items
  WHERE user_id = p_user_id
  AND (
    (item_type = 'document' AND item_id = ANY(SELECT unnest(v_doc_ids)::text))
    OR (item_type = 'database' AND item_id = ANY(SELECT unnest(v_db_ids)::text))
    OR (item_type = 'spreadsheet' AND item_id = ANY(SELECT unnest(v_ss_ids)::text))
  );

  RETURN v_cascade_count;
END;
$$;

-- =============================================================================
-- 3. Atomic permanent_delete_item: hard-deletes from original table + removes
--    from trash_items. For projects, cascades via helper.
-- =============================================================================

CREATE OR REPLACE FUNCTION permanent_delete_item(p_trash_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_record RECORD;
  v_cascade_count INTEGER := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Get the trash item (verify ownership)
  SELECT * INTO v_record
  FROM trash_items
  WHERE id = p_trash_item_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trash item not found or access denied';
  END IF;

  -- For projects: cascade hard-delete children first
  IF v_record.item_type = 'project' THEN
    v_cascade_count := _cascade_hard_delete_project(v_record.item_id::uuid, v_user_id);
  END IF;

  -- Hard delete from original table
  BEGIN
    EXECUTE format('DELETE FROM %I WHERE id = $1', v_record.item_table)
      USING v_record.item_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    -- Item may already be gone (e.g., FK cascade); continue cleanup
    NULL;
  END;

  -- Remove from trash_items
  DELETE FROM trash_items WHERE id = p_trash_item_id;

  RETURN jsonb_build_object(
    'success', true,
    'item_type', v_record.item_type,
    'item_id', v_record.item_id,
    'cascade_count', v_cascade_count
  );
END;
$$;

COMMENT ON FUNCTION permanent_delete_item IS
'Atomic permanent delete: hard-deletes from original table and removes from trash_items. Cascades for projects.';

-- =============================================================================
-- 4. soft_delete_trash_only: inserts into trash_items using auth.uid() server-side
--    Avoids N client-side getUser() calls.
-- =============================================================================

CREATE OR REPLACE FUNCTION soft_delete_trash_only(
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

  -- Insert into trash_items only (deleted_at already set by caller)
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

COMMENT ON FUNCTION soft_delete_trash_only IS
'Insert into trash_items only (deleted_at already set by caller). Uses auth.uid() server-side to avoid N getUser() calls.';

-- =============================================================================
-- 5. remove_trash_entries: removes trash_items by type and IDs.
--    Used when undoing a soft-delete to clean up orphaned entries.
-- =============================================================================

CREATE OR REPLACE FUNCTION remove_trash_entries(
  p_item_type TEXT,
  p_item_ids TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_deleted_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  DELETE FROM trash_items
  WHERE user_id = v_user_id
  AND item_type = p_item_type
  AND item_id = ANY(p_item_ids);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count
  );
END;
$$;

COMMENT ON FUNCTION remove_trash_entries IS
'Removes trash_items entries by item type and IDs. Used for undo operations.';

-- Grant permissions (note: _cascade_hard_delete_project is internal only, no direct GRANT)
GRANT EXECUTE ON FUNCTION restore_item TO authenticated;
GRANT EXECUTE ON FUNCTION permanent_delete_item TO authenticated;
GRANT EXECUTE ON FUNCTION soft_delete_trash_only TO authenticated;
GRANT EXECUTE ON FUNCTION remove_trash_entries TO authenticated;
