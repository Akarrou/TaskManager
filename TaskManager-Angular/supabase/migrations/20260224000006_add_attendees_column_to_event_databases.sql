-- Migration: Add "Attendees" column to existing event databases
-- Stores attendees and guest permissions as JSONB:
--   { "attendees": [...], "permissions": {...} }

DO $$
DECLARE
  db_record RECORD;
  col_record RECORD;
  v_col_id UUID;
  v_phys_col TEXT;
  v_max_order INT;
  v_config JSONB;
  v_has_attendees_config BOOLEAN;
  v_attendees_col_id TEXT;
BEGIN
  FOR db_record IN
    SELECT id, table_name, config
    FROM document_databases
    WHERE config->>'type' = 'event'
  LOOP
    v_config := db_record.config;

    v_has_attendees_config := FALSE;
    v_attendees_col_id := NULL;

    -- Check if "Attendees" exists in config columns
    FOR col_record IN
      SELECT c->>'id' AS col_id, c->>'name' AS col_name
      FROM jsonb_array_elements(v_config->'columns') AS c
      WHERE c->>'name' = 'Attendees'
    LOOP
      v_has_attendees_config := TRUE;
      v_attendees_col_id := col_record.col_id;
    END LOOP;

    IF v_has_attendees_config AND v_attendees_col_id IS NOT NULL THEN
      -- Config exists; ensure physical column exists
      v_phys_col := 'col_' || replace(v_attendees_col_id, '-', '_');
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = db_record.table_name
          AND column_name = v_phys_col
      ) THEN
        EXECUTE format('ALTER TABLE %I ADD COLUMN %I JSONB', db_record.table_name, v_phys_col);
        RAISE NOTICE 'Added physical column % to %', v_phys_col, db_record.table_name;
      END IF;
    ELSIF NOT v_has_attendees_config THEN
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
          'name', 'Attendees',
          'type', 'json',
          'visible', false,
          'readonly', true,
          'order', v_max_order + 1,
          'width', 250,
          'color', 'blue'
        )
      );

      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I JSONB', db_record.table_name, v_phys_col);
      UPDATE document_databases SET config = v_config WHERE id = db_record.id;
      RAISE NOTICE 'Added Attendees column (config + physical) to %', db_record.table_name;
    END IF;

  END LOOP;

  -- Reload PostgREST schema cache
  NOTIFY pgrst, 'reload schema';
END;
$$;
