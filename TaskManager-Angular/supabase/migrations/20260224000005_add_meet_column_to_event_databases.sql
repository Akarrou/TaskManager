-- Migration: Add "Google Meet" and "Color" columns to existing event databases
-- These columns were added to the template for new databases but existing ones need migration.
-- This migration:
--   1. Finds all event-type databases (config->>'type' = 'event')
--   2. For each one, checks if "Google Meet" / "Color" columns exist in config
--   3. If config has them but physical table doesn't, adds the physical column
--   4. If config is missing them entirely, adds both config entry + physical column

DO $$
DECLARE
  db_record RECORD;
  col_record RECORD;
  v_col_id UUID;
  v_phys_col TEXT;
  v_max_order INT;
  v_config JSONB;
  v_has_meet_config BOOLEAN;
  v_has_color_config BOOLEAN;
  v_meet_col_id TEXT;
  v_color_col_id TEXT;
BEGIN
  -- Loop through all event-type databases
  FOR db_record IN
    SELECT id, table_name, config
    FROM document_databases
    WHERE config->>'type' = 'event'
  LOOP
    v_config := db_record.config;

    -- ================================================================
    -- Google Meet column
    -- ================================================================
    v_has_meet_config := FALSE;
    v_meet_col_id := NULL;

    -- Check if "Google Meet" exists in config columns
    FOR col_record IN
      SELECT c->>'id' AS col_id, c->>'name' AS col_name
      FROM jsonb_array_elements(v_config->'columns') AS c
      WHERE c->>'name' = 'Google Meet'
    LOOP
      v_has_meet_config := TRUE;
      v_meet_col_id := col_record.col_id;
    END LOOP;

    IF v_has_meet_config AND v_meet_col_id IS NOT NULL THEN
      -- Config exists; ensure physical column exists
      v_phys_col := 'col_' || replace(v_meet_col_id, '-', '_');
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = db_record.table_name
          AND column_name = v_phys_col
      ) THEN
        EXECUTE format('ALTER TABLE %I ADD COLUMN %I TEXT', db_record.table_name, v_phys_col);
        RAISE NOTICE 'Added physical column % to %', v_phys_col, db_record.table_name;
      END IF;
    ELSIF NOT v_has_meet_config THEN
      -- Config missing; add both config entry and physical column
      v_col_id := gen_random_uuid();
      v_phys_col := 'col_' || replace(v_col_id::TEXT, '-', '_');

      SELECT COALESCE(MAX((c->>'order')::INT), 0) INTO v_max_order
      FROM jsonb_array_elements(v_config->'columns') AS c;

      v_config := jsonb_set(
        v_config,
        '{columns}',
        (v_config->'columns') || jsonb_build_object(
          'id', v_col_id::TEXT,
          'name', 'Google Meet',
          'type', 'url',
          'visible', true,
          'readonly', true,
          'order', v_max_order + 1,
          'width', 250,
          'color', 'green'
        )
      );

      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I TEXT', db_record.table_name, v_phys_col);
      UPDATE document_databases SET config = v_config WHERE id = db_record.id;
      RAISE NOTICE 'Added Google Meet column (config + physical) to %', db_record.table_name;
    END IF;

    -- ================================================================
    -- Color column
    -- ================================================================
    v_has_color_config := FALSE;
    v_color_col_id := NULL;

    FOR col_record IN
      SELECT c->>'id' AS col_id, c->>'name' AS col_name
      FROM jsonb_array_elements(v_config->'columns') AS c
      WHERE c->>'name' = 'Color'
    LOOP
      v_has_color_config := TRUE;
      v_color_col_id := col_record.col_id;
    END LOOP;

    IF v_has_color_config AND v_color_col_id IS NOT NULL THEN
      v_phys_col := 'col_' || replace(v_color_col_id, '-', '_');
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = db_record.table_name
          AND column_name = v_phys_col
      ) THEN
        EXECUTE format('ALTER TABLE %I ADD COLUMN %I TEXT', db_record.table_name, v_phys_col);
        RAISE NOTICE 'Added physical column % to %', v_phys_col, db_record.table_name;
      END IF;
    ELSIF NOT v_has_color_config THEN
      v_col_id := gen_random_uuid();
      v_phys_col := 'col_' || replace(v_col_id::TEXT, '-', '_');

      -- Re-read config in case it was updated above
      SELECT config INTO v_config FROM document_databases WHERE id = db_record.id;

      SELECT COALESCE(MAX((c->>'order')::INT), 0) INTO v_max_order
      FROM jsonb_array_elements(v_config->'columns') AS c;

      v_config := jsonb_set(
        v_config,
        '{columns}',
        (v_config->'columns') || jsonb_build_object(
          'id', v_col_id::TEXT,
          'name', 'Color',
          'type', 'text',
          'visible', false,
          'readonly', true,
          'order', v_max_order + 1,
          'width', 120,
          'color', 'gray'
        )
      );

      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I TEXT', db_record.table_name, v_phys_col);
      UPDATE document_databases SET config = v_config WHERE id = db_record.id;
      RAISE NOTICE 'Added Color column (config + physical) to %', db_record.table_name;
    END IF;

  END LOOP;

  -- Reload PostgREST schema cache
  NOTIFY pgrst, 'reload schema';
END;
$$;
