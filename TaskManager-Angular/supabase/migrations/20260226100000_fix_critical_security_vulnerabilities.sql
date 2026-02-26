-- Migration: Fix critical security vulnerabilities in SECURITY DEFINER functions
-- Date: 2026-02-26
-- Description: Addresses SQL injection risks, missing search_path pinning,
--   overly permissive RLS policies, and excessive function privileges.
--
-- Summary of fixes:
--   1. add_column_to_table     - Whitelist column_type, restrict table prefix, pin search_path
--   2. create_dynamic_table    - Whitelist column types, pin search_path
--   3. delete_dynamic_table    - Restrict table prefix, add ownership check, pin search_path
--   4. delete_column_from_table- Restrict table prefix, pin search_path
--   5. delete_database_cascade - Add ownership verification via auth.uid(), pin search_path
--   6. mcp_snapshots RLS       - Replace permissive policy with proper per-user + service_role policies
--   7. validate_api_token      - Revoke EXECUTE from anon
--   8. reload_schema_cache     - Revoke EXECUTE from anon
--   9. REVOKE EXECUTE FROM PUBLIC on all dynamic-table functions, grant only to authenticated + service_role

-- ============================================================================
-- 1. FIX: add_column_to_table - SQL injection via unvalidated column_type
-- ============================================================================
-- VULNERABILITY: column_type was interpolated directly into EXECUTE format() using %s
-- (not %I), allowing arbitrary SQL injection (e.g. "TEXT; DROP TABLE users; --").
-- FIX: Validate column_type against a strict whitelist of allowed PostgreSQL types.
--      Restrict table_name to tables starting with 'database_' or 'spreadsheet_'.
--      Pin search_path to public to prevent search_path hijacking.

DROP FUNCTION IF EXISTS add_column_to_table(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION add_column_to_table(
  table_name TEXT,
  column_name TEXT,
  column_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_upper_type TEXT;
BEGIN
  -- Validate table name prefix: only dynamic tables are allowed
  IF table_name !~ '^(database_|spreadsheet_)' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Table name must start with database_ or spreadsheet_'
    );
  END IF;

  -- Validate column_type against whitelist (case-insensitive)
  -- Strip parenthetical parameters (e.g. VARCHAR(255) -> VARCHAR, NUMERIC(10,2) -> NUMERIC)
  v_upper_type := upper(trim(column_type));
  IF regexp_replace(v_upper_type, '\(.*\)$', '') NOT IN (
    'TEXT', 'VARCHAR', 'CHAR', 'INTEGER', 'INT', 'INT4', 'INT8',
    'BIGINT', 'NUMERIC', 'DECIMAL',
    'BOOLEAN', 'BOOL', 'DATE', 'TIME', 'TIMESTAMPTZ', 'TIMESTAMP',
    'JSONB', 'JSON', 'UUID', 'SMALLINT', 'REAL', 'FLOAT', 'DOUBLE PRECISION',
    'TEXT[]', 'SERIAL', 'BIGSERIAL'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid column type: ' || column_type,
      'allowed_types', 'TEXT, VARCHAR, CHAR, INTEGER, INT, INT4, INT8, BIGINT, NUMERIC, DECIMAL, BOOLEAN, BOOL, DATE, TIME, TIMESTAMPTZ, TIMESTAMP, JSONB, JSON, UUID, SMALLINT, REAL, FLOAT, DOUBLE PRECISION, TEXT[], SERIAL, BIGSERIAL'
    );
  END IF;

  -- Verify ownership: caller must own the table (service_role bypasses via NULL auth.uid())
  IF auth.uid() IS NOT NULL THEN
    PERFORM 1
    FROM public.document_databases dd
    LEFT JOIN public.documents d ON d.id = dd.document_id
    WHERE dd.table_name = add_column_to_table.table_name
    AND (d.user_id = auth.uid() OR dd.document_id IS NULL);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Permission denied: you do not own this table';
    END IF;
  END IF;

  -- Add column using format %I for identifiers, %s is safe now because column_type is whitelisted
  EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', table_name, column_name, v_upper_type);

  RETURN jsonb_build_object(
    'success', true,
    'table_name', table_name,
    'column_name', column_name,
    'column_type', v_upper_type
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'error_code', SQLSTATE
  );
END;
$$;

COMMENT ON FUNCTION add_column_to_table IS
'Adds a column to a dynamic database/spreadsheet table. Column type is validated against a strict whitelist to prevent SQL injection.';


-- ============================================================================
-- 2. FIX: create_dynamic_table - SQL injection via unvalidated column types
-- ============================================================================
-- VULNERABILITY: Column types from the JSONB array were interpolated directly via
-- (col->>'type') without validation, allowing SQL injection through malicious type values.
-- FIX: Validate each column type against the same strict whitelist.
--      Pin search_path to public.

CREATE OR REPLACE FUNCTION public.create_dynamic_table(table_name text, columns jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  column_def text;
  column_defs text := '';
  col jsonb;
  v_col_type text;
  result json;
BEGIN
  -- Validate table name format (prevent SQL injection)
  IF table_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', table_name;
  END IF;

  -- Validate table name prefix: only dynamic tables are allowed
  IF table_name !~ '^(database_|spreadsheet_)' THEN
    RAISE EXCEPTION 'Table name must start with database_ or spreadsheet_: %', table_name;
  END IF;

  -- Build column definitions with type validation
  FOR col IN SELECT * FROM jsonb_array_elements(columns)
  LOOP
    -- Validate each column type against the whitelist
    -- Strip parenthetical parameters (e.g. VARCHAR(255) -> VARCHAR, NUMERIC(10,2) -> NUMERIC)
    v_col_type := upper(trim(col->>'type'));
    IF regexp_replace(v_col_type, '\(.*\)$', '') NOT IN (
      'TEXT', 'VARCHAR', 'CHAR', 'INTEGER', 'INT', 'INT4', 'INT8',
      'BIGINT', 'NUMERIC', 'DECIMAL',
      'BOOLEAN', 'BOOL', 'DATE', 'TIME', 'TIMESTAMPTZ', 'TIMESTAMP',
      'JSONB', 'JSON', 'UUID', 'SMALLINT', 'REAL', 'FLOAT', 'DOUBLE PRECISION',
      'TEXT[]', 'SERIAL', 'BIGSERIAL'
    ) THEN
      RAISE EXCEPTION 'Invalid column type "%" for column "%"', col->>'type', col->>'name';
    END IF;

    IF column_defs != '' THEN
      column_defs := column_defs || ', ';
    END IF;

    column_def := quote_ident(col->>'name') || ' ' || v_col_type;

    IF (col->>'required')::boolean THEN
      column_def := column_def || ' NOT NULL';
    END IF;

    column_defs := column_defs || column_def;
  END LOOP;

  -- Create the table with id, row_order, created_at, updated_at
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      %s,
      row_order integer NOT NULL DEFAULT 0,
      created_at timestamptz DEFAULT timezone(''utc''::text, now()) NOT NULL,
      updated_at timestamptz DEFAULT timezone(''utc''::text, now()) NOT NULL
    )',
    table_name,
    column_defs
  );

  -- Enable RLS
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);

  -- Create RLS policies
  EXECUTE format(
    'CREATE POLICY "Users can view all rows" ON %I FOR SELECT USING (true)',
    table_name
  );

  EXECUTE format(
    'CREATE POLICY "Users can insert rows" ON %I FOR INSERT WITH CHECK (true)',
    table_name
  );

  EXECUTE format(
    'CREATE POLICY "Users can update rows" ON %I FOR UPDATE USING (true)',
    table_name
  );

  EXECUTE format(
    'CREATE POLICY "Users can delete rows" ON %I FOR DELETE USING (true)',
    table_name
  );

  -- CRITICAL: Notify PostgREST to reload schema cache
  PERFORM pg_notify('pgrst', 'reload schema');

  result := json_build_object('success', true, 'table_name', table_name);
  RETURN result;
END;
$function$;

COMMENT ON FUNCTION public.create_dynamic_table IS 'Creates a dynamic table for document database blocks with validated column types, base columns, and RLS policies';


-- ============================================================================
-- 3. FIX: delete_dynamic_table - No table prefix restriction, no ownership check
-- ============================================================================
-- VULNERABILITY: Any authenticated user could drop ANY table by name, including
-- system tables like 'documents', 'tasks', 'projects', etc.
-- FIX: Restrict to tables starting with 'database_' or 'spreadsheet_'.
--      Add ownership check via the documents table.
--      Pin search_path to public.

CREATE OR REPLACE FUNCTION public.delete_dynamic_table(table_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_owner_id uuid;
  v_caller_id uuid;
  result json;
BEGIN
  -- Validate table name format
  IF table_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', table_name;
  END IF;

  -- Restrict to dynamic tables only (database_ or spreadsheet_ prefix)
  IF table_name !~ '^(database_|spreadsheet_)' THEN
    RAISE EXCEPTION 'Only dynamic tables (database_* or spreadsheet_*) can be deleted via this function';
  END IF;

  -- Ownership check: verify the caller owns the document associated with this table
  -- service_role bypasses this check (auth.uid() returns NULL for service_role)
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL THEN
    SELECT d.user_id INTO v_owner_id
    FROM public.document_databases dd
    LEFT JOIN public.documents d ON d.id = dd.document_id
    WHERE dd.table_name = delete_dynamic_table.table_name;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Table not found in document_databases registry';
    END IF;

    IF v_owner_id IS NOT NULL AND v_owner_id != v_caller_id THEN
      RAISE EXCEPTION 'Permission denied: you do not own the document associated with this table';
    END IF;
  END IF;

  -- Drop the table
  EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', table_name);

  result := json_build_object('success', true, 'table_name', table_name);
  RETURN result;
END;
$function$;

COMMENT ON FUNCTION public.delete_dynamic_table IS 'Drops a dynamic table (database_* or spreadsheet_* only) with ownership verification';


-- ============================================================================
-- 4. FIX: delete_column_from_table - No table name restriction
-- ============================================================================
-- VULNERABILITY: Could be used to drop columns from ANY table, not just dynamic ones.
-- FIX: Restrict to tables starting with 'database_' or 'spreadsheet_'.
--      Pin search_path to public.

DROP FUNCTION IF EXISTS delete_column_from_table(TEXT, TEXT);

CREATE OR REPLACE FUNCTION delete_column_from_table(
  table_name TEXT,
  column_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate table name prefix: only dynamic tables are allowed
  IF table_name !~ '^(database_|spreadsheet_)' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Table name must start with database_ or spreadsheet_'
    );
  END IF;

  -- Verify ownership: caller must own the table (service_role bypasses via NULL auth.uid())
  IF auth.uid() IS NOT NULL THEN
    PERFORM 1
    FROM public.document_databases dd
    LEFT JOIN public.documents d ON d.id = dd.document_id
    WHERE dd.table_name = delete_column_from_table.table_name
    AND (d.user_id = auth.uid() OR dd.document_id IS NULL);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Permission denied: you do not own this table';
    END IF;
  END IF;

  -- Drop column from table (both identifiers are safely quoted with %I)
  EXECUTE format('ALTER TABLE %I DROP COLUMN %I', table_name, column_name);

  RETURN jsonb_build_object(
    'success', true,
    'table_name', table_name,
    'column_name', column_name
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'error_code', SQLSTATE
  );
END;
$$;

COMMENT ON FUNCTION delete_column_from_table IS
'Drops a column from a dynamic database/spreadsheet table. Restricted to tables starting with database_ or spreadsheet_.';


-- ============================================================================
-- 5. FIX: delete_database_cascade - No ownership verification
-- ============================================================================
-- VULNERABILITY: Any authenticated user could delete any database, even those
-- belonging to other users, because no ownership check was performed.
-- FIX: Verify auth.uid() matches the document owner's user_id.
--      service_role (auth.uid() = NULL) bypasses the check for MCP server usage.
--      Pin search_path to public.

CREATE OR REPLACE FUNCTION delete_database_cascade(
  p_database_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_name TEXT;
  v_owner_id uuid;
  v_caller_id uuid;
  v_result JSONB;
BEGIN
  -- 1. Retrieve table_name and owner from metadata + documents join
  SELECT dd.table_name, d.user_id
  INTO v_table_name, v_owner_id
  FROM document_databases dd
  LEFT JOIN documents d ON d.id = dd.document_id
  WHERE dd.database_id = p_database_id;

  IF v_table_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database not found: ' || p_database_id
    );
  END IF;

  -- 2. Ownership check: verify caller owns the document
  -- service_role (auth.uid() = NULL) bypasses this check for MCP server operations
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL AND v_owner_id IS NOT NULL AND v_caller_id != v_owner_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Permission denied: you do not own this database'
    );
  END IF;

  -- 3. Drop the dynamic PostgreSQL table
  BEGIN
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', v_table_name);
  EXCEPTION WHEN OTHERS THEN
    -- Log error but continue (the table may not exist)
    RAISE NOTICE 'Error dropping table %: %', v_table_name, SQLERRM;
  END;

  -- 4. Delete the entry from document_databases
  DELETE FROM document_databases
  WHERE database_id = p_database_id;

  -- 5. Return result
  RETURN jsonb_build_object(
    'success', true,
    'database_id', p_database_id,
    'table_name', v_table_name,
    'message', 'Database and table deleted successfully'
  );
END;
$$;

COMMENT ON FUNCTION delete_database_cascade IS
'Deletes a database and its dynamic PostgreSQL table with ownership verification. service_role bypasses ownership check.';


-- ============================================================================
-- 6. FIX: mcp_snapshots RLS - Overly permissive "FOR ALL USING (true)" policy
-- ============================================================================
-- VULNERABILITY: The existing policy allowed ANY role (including anon) full access
-- to ALL snapshots via "FOR ALL USING (true) WITH CHECK (true)".
-- FIX: Drop the permissive policy. Create proper per-operation policies:
--   - service_role gets full access (MCP server uses service role key)
--   - authenticated users can only access their own snapshots (user_id = auth.uid())

-- Ensure user_id column exists (original CREATE TABLE includes it, but guard for safety)
ALTER TABLE public.mcp_snapshots ADD COLUMN IF NOT EXISTS user_id UUID;

-- Backfill user_id from snapshot_data JSONB if it was stored there instead of the column
UPDATE public.mcp_snapshots SET user_id = (snapshot_data->>'user_id')::uuid
  WHERE user_id IS NULL AND snapshot_data->>'user_id' IS NOT NULL;

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service role has full access to mcp_snapshots" ON public.mcp_snapshots;

-- service_role: full access (bypasses RLS by default in Supabase, but explicit policies
-- are good practice for clarity and if RLS bypass is ever changed)
DROP POLICY IF EXISTS "service_role_full_access_mcp_snapshots" ON public.mcp_snapshots;
CREATE POLICY "service_role_full_access_mcp_snapshots"
  ON public.mcp_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- authenticated: SELECT own snapshots only
DROP POLICY IF EXISTS "authenticated_select_own_mcp_snapshots" ON public.mcp_snapshots;
CREATE POLICY "authenticated_select_own_mcp_snapshots"
  ON public.mcp_snapshots
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- authenticated: INSERT own snapshots only
DROP POLICY IF EXISTS "authenticated_insert_own_mcp_snapshots" ON public.mcp_snapshots;
CREATE POLICY "authenticated_insert_own_mcp_snapshots"
  ON public.mcp_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- authenticated: UPDATE own snapshots only
DROP POLICY IF EXISTS "authenticated_update_own_mcp_snapshots" ON public.mcp_snapshots;
CREATE POLICY "authenticated_update_own_mcp_snapshots"
  ON public.mcp_snapshots
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- authenticated: DELETE own snapshots only
DROP POLICY IF EXISTS "authenticated_delete_own_mcp_snapshots" ON public.mcp_snapshots;
CREATE POLICY "authenticated_delete_own_mcp_snapshots"
  ON public.mcp_snapshots
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- ============================================================================
-- 7. FIX: validate_api_token - anon should not be able to call this function
-- ============================================================================
-- VULNERABILITY: The anon role had EXECUTE privilege on validate_api_token,
-- which could allow unauthenticated users to probe/validate API tokens.
-- FIX: Revoke EXECUTE from anon. Only authenticated and service_role need access.

REVOKE EXECUTE ON FUNCTION public.validate_api_token(text) FROM anon;


-- ============================================================================
-- 8. FIX: reload_schema_cache - anon should not be able to trigger schema reload
-- ============================================================================
-- VULNERABILITY: The anon role had EXECUTE privilege on reload_schema_cache,
-- allowing unauthenticated users to trigger PostgREST schema reloads (DoS vector).
-- FIX: Revoke EXECUTE from anon. Only authenticated and service_role need access.

REVOKE EXECUTE ON FUNCTION public.reload_schema_cache() FROM anon;

-- Ensure authenticated and service_role still have access
GRANT EXECUTE ON FUNCTION public.reload_schema_cache() TO authenticated, service_role;


-- ============================================================================
-- 9. REVOKE EXECUTE FROM PUBLIC on all dynamic-table management functions
-- ============================================================================
-- By default, PostgreSQL grants EXECUTE to PUBLIC on new functions.
-- This means any role (including anon) could call these SECURITY DEFINER functions.
-- FIX: Revoke from PUBLIC, grant only to authenticated and service_role.

-- add_column_to_table
REVOKE EXECUTE ON FUNCTION add_column_to_table(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_column_to_table(TEXT, TEXT, TEXT) TO authenticated, service_role;

-- delete_column_from_table
REVOKE EXECUTE ON FUNCTION delete_column_from_table(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_column_from_table(TEXT, TEXT) TO authenticated, service_role;

-- create_dynamic_table
REVOKE EXECUTE ON FUNCTION public.create_dynamic_table(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_dynamic_table(text, jsonb) TO authenticated, service_role;

-- delete_dynamic_table
REVOKE EXECUTE ON FUNCTION public.delete_dynamic_table(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_dynamic_table(text) TO authenticated, service_role;

-- delete_database_cascade
REVOKE EXECUTE ON FUNCTION delete_database_cascade(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_database_cascade(TEXT) TO authenticated, service_role;


-- ============================================================================
-- Notify PostgREST to pick up function changes
-- ============================================================================
NOTIFY pgrst, 'reload schema';
