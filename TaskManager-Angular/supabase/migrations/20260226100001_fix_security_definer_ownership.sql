-- =============================================================================
-- Migration: Fix SECURITY DEFINER functions that accept untrusted p_user_id
-- Date: 2026-02-26
-- Description:
--   Several RPC functions accept a p_user_id parameter and trust it blindly,
--   or run as SECURITY DEFINER without any user-scoping. This allows any
--   authenticated user to read/modify other users' data.
--
--   Pattern applied:
--     - If auth.uid() IS NOT NULL (PostgREST/frontend context): verify p_user_id = auth.uid()
--     - If auth.uid() IS NULL (service_role/MCP context): trust the passed p_user_id
--     - Add SET search_path = public to prevent search_path hijacking
--
--   Functions fixed:
--     1. search_documents_fulltext — was STABLE without auth check
--     2. get_task_stats_aggregated — was SECURITY DEFINER without any user scoping
--     3. restore_item             — already used auth.uid() but lacked SET search_path
--     4. _cascade_hard_delete_project — accepted p_user_id without auth check
-- =============================================================================


-- =============================================================================
-- 1. Fix search_documents_fulltext
--    Previously: STABLE function, accepted p_user_id and trusted it blindly.
--    Now: Adds auth check and pins search_path. Keeps STABLE (not SECURITY
--    DEFINER) since the function only reads user-scoped data via p_user_id.
--    Keeps p_user_id parameter for backward compatibility with MCP server,
--    but verifies it matches auth.uid() when called from an authenticated
--    (non-service_role) context.
-- =============================================================================

CREATE OR REPLACE FUNCTION search_documents_fulltext(
  p_user_id UUID,
  p_query TEXT,
  p_project_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  excerpt TEXT,
  parent_id UUID,
  project_id UUID,
  rank REAL,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  tsquery_val TSQUERY;
BEGIN
  -- Verify authorization: frontend calls must match auth.uid()
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: user mismatch';
  END IF;

  tsquery_val := plainto_tsquery('french', p_query);

  RETURN QUERY
  SELECT
    d.id,
    d.title,
    ts_headline('french',
      COALESCE(d.title, '') || ' ' || COALESCE(extract_tiptap_text(d.content), ''),
      tsquery_val,
      'StartSel=>>>, StopSel=<<<, MaxWords=35, MinWords=15'
    ) AS excerpt,
    d.parent_id,
    d.project_id,
    ts_rank(d.search_vector, tsquery_val) AS rank,
    d.updated_at
  FROM documents d
  WHERE d.user_id = p_user_id
    AND d.deleted_at IS NULL
    AND d.search_vector @@ tsquery_val
    AND (p_project_id IS NULL OR d.project_id = p_project_id)
  ORDER BY rank DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION search_documents_fulltext IS
'Full-text search across documents. Accepts p_user_id for backward compatibility with MCP server. When called from an authenticated context (PostgREST), p_user_id must match auth.uid(). When called via service_role (auth.uid() is NULL), the passed p_user_id is trusted.';

-- Revoke default PUBLIC privilege and grant only to authenticated + service_role
REVOKE EXECUTE ON FUNCTION search_documents_fulltext FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_documents_fulltext TO authenticated;
GRANT EXECUTE ON FUNCTION search_documents_fulltext TO service_role;


-- =============================================================================
-- 2. Fix get_task_stats_aggregated
--    Previously: SECURITY DEFINER with no user scoping at all — any authenticated
--    user could read task stats from ALL users' task databases.
--    Now: Accepts optional p_user_id parameter. Scopes the query to databases
--    belonging to documents owned by the calling user. In service_role context,
--    trusts the passed p_user_id.
-- =============================================================================

-- Drop existing function first (signature changes: adding p_user_id parameter)
DROP FUNCTION IF EXISTS get_task_stats_aggregated(UUID);

CREATE OR REPLACE FUNCTION get_task_stats_aggregated(
  p_project_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_user_id UUID;
  v_databases RECORD;
  v_total INT := 0;
  v_pending INT := 0;
  v_in_progress INT := 0;
  v_completed INT := 0;
  v_blocked INT := 0;
  v_backlog INT := 0;
  v_awaiting_info INT := 0;
  v_cancelled INT := 0;
  v_sql TEXT;
  v_result RECORD;
  v_status_col_id TEXT;
  v_col_name TEXT;
BEGIN
  -- Determine effective user ID
  IF auth.uid() IS NOT NULL THEN
    -- Frontend/PostgREST context: always use auth.uid(), ignore p_user_id
    IF p_user_id IS NOT NULL AND auth.uid() != p_user_id THEN
      RAISE EXCEPTION 'Unauthorized: user mismatch';
    END IF;
    v_effective_user_id := auth.uid();
  ELSIF p_user_id IS NOT NULL THEN
    -- Service role context: trust the passed p_user_id
    v_effective_user_id := p_user_id;
  ELSE
    -- No user context at all — return empty stats
    RETURN json_build_object(
      'total', 0, 'backlog', 0, 'pending', 0, 'inProgress', 0,
      'completed', 0, 'blocked', 0, 'awaitingInfo', 0, 'cancelled', 0,
      'completionRate', 0
    );
  END IF;

  -- Iterate over task databases, scoped to the user's documents
  FOR v_databases IN
    SELECT
      dd.database_id,
      dd.table_name,
      dd.config
    FROM document_databases dd
    INNER JOIN documents doc ON doc.id = dd.document_id
    WHERE dd.config->>'type' = 'task'
      AND doc.user_id = v_effective_user_id
      AND doc.deleted_at IS NULL
      AND (p_project_id IS NULL OR (dd.config->'projectId')::text = p_project_id::text)
  LOOP
    -- Find the Status column in the config
    SELECT (col->>'id')::text INTO v_status_col_id
    FROM jsonb_array_elements(v_databases.config->'columns') AS col
    WHERE col->>'name' = 'Status'
    LIMIT 1;

    IF v_status_col_id IS NOT NULL THEN
      -- Strip existing col_ prefix to avoid double prefix (col_col_...)
      v_col_name := regexp_replace(v_status_col_id, '^col_', '');
      v_col_name := 'col_' || replace(v_col_name, '-', '_');

      -- Build dynamic query to count by status
      v_sql := format(
        'SELECT
          COALESCE(%I, ''pending'') AS status,
          COUNT(*) AS count
        FROM %I
        WHERE deleted_at IS NULL
        GROUP BY %I',
        v_col_name,
        v_databases.table_name,
        v_col_name
      );

      -- Execute and aggregate results
      BEGIN
        FOR v_result IN EXECUTE v_sql LOOP
          CASE
            -- Normalize status values (supports French and English)
            WHEN lower(v_result.status::text) SIMILAR TO '%(backlog|arriéré)%' THEN
              v_backlog := v_backlog + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(pending|en.?attente|à.?faire|todo)%' THEN
              v_pending := v_pending + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(in.?progress|en.?cours)%' THEN
              v_in_progress := v_in_progress + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(completed|terminée?|done)%' THEN
              v_completed := v_completed + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(blocked|bloquée?)%' THEN
              v_blocked := v_blocked + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(awaiting.?info|en.?attente.?info|waiting)%' THEN
              v_awaiting_info := v_awaiting_info + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(cancelled|annulée?)%' THEN
              v_cancelled := v_cancelled + v_result.count;
            ELSE
              -- Default unknown statuses to pending
              v_pending := v_pending + v_result.count;
          END CASE;
        END LOOP;
      EXCEPTION WHEN undefined_column THEN
        -- Column doesn't exist in physical table, skip this database
        CONTINUE;
      END;
    END IF;
  END LOOP;

  -- Calculate total
  v_total := v_backlog + v_pending + v_in_progress + v_completed + v_blocked + v_awaiting_info + v_cancelled;

  -- Return JSON with aggregated statistics
  RETURN json_build_object(
    'total', v_total,
    'backlog', v_backlog,
    'pending', v_pending,
    'inProgress', v_in_progress,
    'completed', v_completed,
    'blocked', v_blocked,
    'awaitingInfo', v_awaiting_info,
    'cancelled', v_cancelled,
    'completionRate', CASE WHEN v_total > 0 THEN (v_completed::float / v_total::float) * 100 ELSE 0 END
  );
END;
$$;

COMMENT ON FUNCTION get_task_stats_aggregated IS
'Aggregates task statistics across task-type databases owned by the calling user. Scoped via documents.user_id join. Accepts optional p_user_id for MCP service_role context. Frontend calls use auth.uid() and must match p_user_id if provided.';

REVOKE EXECUTE ON FUNCTION get_task_stats_aggregated FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_task_stats_aggregated TO authenticated;
GRANT EXECUTE ON FUNCTION get_task_stats_aggregated TO service_role;


-- =============================================================================
-- 3. Fix restore_item
--    Previously: Already used auth.uid() for ownership check on trash_items,
--    but lacked SET search_path = public (search_path hijacking risk).
--    Also only worked for frontend (auth.uid() required) — MCP service_role
--    could not restore items because auth.uid() is NULL.
--    Now: Accepts optional p_user_id for service_role context. Adds
--    SET search_path = public.
-- =============================================================================

-- Drop old single-parameter signature before creating new two-parameter version
DROP FUNCTION IF EXISTS restore_item(UUID);

CREATE OR REPLACE FUNCTION restore_item(
  p_trash_item_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_user_id UUID;
  v_record RECORD;
BEGIN
  -- Determine effective user ID
  IF auth.uid() IS NOT NULL THEN
    -- Frontend/PostgREST context
    IF p_user_id IS NOT NULL AND auth.uid() != p_user_id THEN
      RAISE EXCEPTION 'Unauthorized: user mismatch';
    END IF;
    v_effective_user_id := auth.uid();
  ELSIF p_user_id IS NOT NULL THEN
    -- Service role context: trust the passed p_user_id
    v_effective_user_id := p_user_id;
  ELSE
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Get the trash item (verify ownership)
  SELECT * INTO v_record
  FROM trash_items
  WHERE id = p_trash_item_id AND user_id = v_effective_user_id;

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
'Atomic restore: clears deleted_at on original table and removes from trash_items. Verifies ownership via user_id. Supports both frontend (auth.uid()) and MCP service_role (p_user_id) contexts.';

REVOKE EXECUTE ON FUNCTION restore_item FROM PUBLIC;
GRANT EXECUTE ON FUNCTION restore_item TO authenticated;
GRANT EXECUTE ON FUNCTION restore_item TO service_role;


-- =============================================================================
-- 4. Fix _cascade_hard_delete_project
--    Previously: Accepted p_user_id without any verification. Since this is
--    SECURITY DEFINER, a caller with EXECUTE privilege could pass any user_id.
--    Now: Verifies p_user_id matches auth.uid() in authenticated context.
--    Also adds SET search_path = public.
--    Note: This function is already restricted to service_role/postgres
--    (REVOKE from authenticated/PUBLIC was done in 20260226000001), but
--    defense-in-depth is still valuable.
-- =============================================================================

CREATE OR REPLACE FUNCTION _cascade_hard_delete_project(
  p_project_id UUID,
  p_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_ids UUID[];
  v_db_ids UUID[];
  v_ss_ids UUID[];
  v_doc RECORD;
  v_cascade_count INTEGER := 0;
BEGIN
  -- Verify authorization (defense-in-depth: function already restricted to service_role)
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: user mismatch';
  END IF;

  -- Verify the project belongs to the specified user
  -- When p_user_id is NULL (service_role context), skip the ownership check
  IF p_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM projects
    WHERE id = p_project_id
    AND owner_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Project not found or access denied';
  END IF;

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

-- Re-apply the same permission restrictions as in 20260226000001
REVOKE EXECUTE ON FUNCTION _cascade_hard_delete_project(UUID, UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION _cascade_hard_delete_project(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION _cascade_hard_delete_project(UUID, UUID) TO service_role;


-- =============================================================================
-- 5. Fix permanent_delete_item — add SET search_path and auth check
--    Previously: Used auth.uid() correctly but lacked SET search_path.
-- =============================================================================

-- Drop old single-parameter signature before creating new two-parameter version
DROP FUNCTION IF EXISTS permanent_delete_item(UUID);

CREATE OR REPLACE FUNCTION permanent_delete_item(
  p_trash_item_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_user_id UUID;
  v_record RECORD;
  v_cascade_count INTEGER := 0;
BEGIN
  -- Determine effective user ID
  IF auth.uid() IS NOT NULL THEN
    IF p_user_id IS NOT NULL AND auth.uid() != p_user_id THEN
      RAISE EXCEPTION 'Unauthorized: user mismatch';
    END IF;
    v_effective_user_id := auth.uid();
  ELSIF p_user_id IS NOT NULL THEN
    v_effective_user_id := p_user_id;
  ELSE
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Get the trash item (verify ownership)
  SELECT * INTO v_record
  FROM trash_items
  WHERE id = p_trash_item_id AND user_id = v_effective_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trash item not found or access denied';
  END IF;

  -- For projects: cascade hard-delete children first
  IF v_record.item_type = 'project' THEN
    v_cascade_count := _cascade_hard_delete_project(v_record.item_id::uuid, v_effective_user_id);
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
'Atomic permanent delete: hard-deletes from original table and removes from trash_items. Cascades for projects. Supports both frontend (auth.uid()) and MCP service_role (p_user_id) contexts.';

REVOKE EXECUTE ON FUNCTION permanent_delete_item FROM PUBLIC;
GRANT EXECUTE ON FUNCTION permanent_delete_item TO authenticated;
GRANT EXECUTE ON FUNCTION permanent_delete_item TO service_role;


-- =============================================================================
-- 6. Add SET search_path to other SECURITY DEFINER trash functions
--    These already use auth.uid() correctly but lack search_path pinning.
-- =============================================================================

-- 6a. soft_delete_item (latest version from 20260226000001)
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
SET search_path = public
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
  -- ownership at the SQL level.
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND   table_name   = p_item_table
    AND   column_name  = 'user_id'
  ) INTO v_has_user_id;

  IF v_has_user_id THEN
    -- Ownership-checked soft delete on tables that carry user_id
    EXECUTE format(
      'UPDATE %I SET deleted_at = now() WHERE id = $1 AND user_id = $2',
      p_item_table
    ) USING p_item_id::uuid, v_user_id;
  ELSE
    -- For dynamic item tables (no user_id column) fall back to id-only UPDATE.
    EXECUTE format(
      'UPDATE %I SET deleted_at = now() WHERE id = $1',
      p_item_table
    ) USING p_item_id::uuid;
  END IF;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'Item not found or access denied: % id=%', p_item_table, p_item_id;
  END IF;

  -- Insert into trash_items (upsert to handle re-deletion)
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

GRANT EXECUTE ON FUNCTION soft_delete_item TO authenticated;

-- 6b. empty_user_trash
CREATE OR REPLACE FUNCTION empty_user_trash()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION empty_user_trash TO authenticated;

-- 6c. soft_delete_trash_only
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
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_result RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

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

GRANT EXECUTE ON FUNCTION soft_delete_trash_only TO authenticated;

-- 6d. remove_trash_entries
CREATE OR REPLACE FUNCTION remove_trash_entries(
  p_item_type TEXT,
  p_item_ids TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION remove_trash_entries TO authenticated;

-- 6e. purge_expired_trash (already service_role only, but add search_path)
CREATE OR REPLACE FUNCTION purge_expired_trash()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;

      v_errors := array_append(v_errors,
        format('Failed to purge %s (%s) [%s]: %s',
               v_record.display_name, v_record.item_id, v_sqlstate, SQLERRM));

      -- Only remove the trash record when the item is confirmed gone
      IF v_sqlstate IN ('23503', '42P01', 'P0002') THEN
        DELETE FROM trash_items WHERE id = v_record.id;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success',      true,
    'purged_count', v_purged_count,
    'errors',       to_jsonb(v_errors)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION purge_expired_trash TO service_role;

-- ============================================================================
-- REVOKE EXECUTE FROM PUBLIC on trash management functions
-- ============================================================================
-- These SECURITY DEFINER functions must not be callable by anon.
-- purge_expired_trash is especially critical as it has no internal auth check.

REVOKE EXECUTE ON FUNCTION soft_delete_item(UUID, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soft_delete_item(UUID, TEXT, TEXT, UUID, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION empty_user_trash(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION empty_user_trash(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION soft_delete_trash_only(TEXT, UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soft_delete_trash_only(TEXT, UUID, TEXT, UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION remove_trash_entries(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION remove_trash_entries(TEXT, UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION purge_expired_trash() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_expired_trash() TO service_role;

NOTIFY pgrst, 'reload schema';
