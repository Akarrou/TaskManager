-- Migration: Enable Supabase Realtime on dynamic tables + update ensure_table_exists
-- Date: 2026-02-27
-- Description:
--   1. Adds all existing dynamic database_* tables to supabase_realtime publication
--   2. Updates ensure_table_exists to automatically add newly created dynamic tables
--      to the publication so they are included in Realtime broadcasts

-- =============================================================================
-- Step 1: Add existing dynamic database_* tables to Realtime publication
-- =============================================================================

DO $$
DECLARE
  v_table_name TEXT;
BEGIN
  FOR v_table_name IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name LIKE 'database_%'
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', v_table_name);
    EXCEPTION WHEN duplicate_object THEN
      -- Table already in publication, skip
      NULL;
    END;
  END LOOP;
END;
$$;

-- =============================================================================
-- Step 2: Update ensure_table_exists to add new dynamic tables to publication
-- =============================================================================

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

  -- 8. Add to Realtime publication for live updates
  BEGIN
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', v_table_name);
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- Already in publication, skip
  END;

  -- 9. Return success
  RETURN jsonb_build_object(
    'success',    true,
    'table_name', v_table_name,
    'message',    'Table created successfully',
    'created',    true
  );
END;
$$;

COMMENT ON FUNCTION ensure_table_exists IS
'Lazily creates a dynamic PostgreSQL table for a document_databases entry. Includes deleted_at for soft delete support, full column type mapping, and automatic addition to supabase_realtime publication for live updates.';
