-- Migration: Add event number generation sequence and RPC
-- Description: Creates sequence and function for auto-generating event numbers (EVT-XXXX)

-- Create the sequence for event numbers
CREATE SEQUENCE IF NOT EXISTS public.events_event_number_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- Grant usage on the sequence
GRANT USAGE ON SEQUENCE public.events_event_number_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.events_event_number_seq TO service_role;

-- Create the function to get the next event number
CREATE OR REPLACE FUNCTION get_next_event_number()
RETURNS TEXT AS $$
DECLARE
  v_next_num INTEGER;
  v_formatted TEXT;
BEGIN
  v_next_num := nextval('public.events_event_number_seq'::regclass);
  v_formatted := 'EVT-' || lpad(v_next_num::text, 4, '0');
  RETURN v_formatted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_next_event_number IS
'Generates the next event number in the format EVT-XXXX (e.g., EVT-0001, EVT-0042).';

-- Update ensure_table_exists to handle new column types (datetime, date-range, linked-items)
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
  v_config JSONB;
  v_columns JSONB;
  v_col_name TEXT;
  v_col_type TEXT;
  v_table_exists BOOLEAN;
BEGIN
  -- 1. Get metadata
  SELECT table_name, config INTO v_table_name, v_config
  FROM document_databases
  WHERE database_id = p_database_id;

  IF v_table_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database not found: ' || p_database_id
    );
  END IF;

  -- 2. Check if table already exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = v_table_name
  ) INTO v_table_exists;

  IF v_table_exists THEN
    RETURN jsonb_build_object(
      'success', true,
      'table_name', v_table_name,
      'message', 'Table already exists',
      'created', false
    );
  END IF;

  -- 3. Create table with base columns
  EXECUTE format(
    'CREATE TABLE %I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      row_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )',
    v_table_name
  );

  -- 4. Add columns from config.columns
  v_columns := v_config->'columns';

  IF v_columns IS NOT NULL AND jsonb_array_length(v_columns) > 0 THEN
    FOR i IN 0..jsonb_array_length(v_columns) - 1 LOOP
      v_col_name := 'col_' || REPLACE(v_columns->i->>'id', '-', '_');
      v_col_type := CASE
        WHEN v_columns->i->>'type' = 'text' THEN 'TEXT'
        WHEN v_columns->i->>'type' = 'number' THEN 'NUMERIC'
        WHEN v_columns->i->>'type' = 'date' THEN 'DATE'
        WHEN v_columns->i->>'type' = 'datetime' THEN 'TIMESTAMPTZ'
        WHEN v_columns->i->>'type' = 'date-range' THEN 'JSONB'
        WHEN v_columns->i->>'type' = 'checkbox' THEN 'BOOLEAN'
        WHEN v_columns->i->>'type' = 'select' THEN 'TEXT'
        WHEN v_columns->i->>'type' = 'multi-select' THEN 'TEXT[]'
        WHEN v_columns->i->>'type' = 'url' THEN 'TEXT'
        WHEN v_columns->i->>'type' = 'email' THEN 'TEXT'
        WHEN v_columns->i->>'type' = 'linked-items' THEN 'JSONB'
        ELSE 'TEXT'
      END;

      EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', v_table_name, v_col_name, v_col_type);
    END LOOP;
  END IF;

  -- 5. Create updated_at trigger
  EXECUTE format(
    'CREATE TRIGGER update_%I_updated_at
     BEFORE UPDATE ON %I
     FOR EACH ROW
     EXECUTE FUNCTION update_updated_at_column()',
    v_table_name,
    v_table_name
  );

  -- 6. Set owner and grant permissions
  EXECUTE format('ALTER TABLE %I OWNER TO postgres', v_table_name);
  EXECUTE format('GRANT ALL ON TABLE %I TO authenticated', v_table_name);
  EXECUTE format('GRANT ALL ON TABLE %I TO service_role', v_table_name);

  -- 7. Return success
  RETURN jsonb_build_object(
    'success', true,
    'table_name', v_table_name,
    'message', 'Table created successfully',
    'created', true
  );
END;
$$;

COMMENT ON FUNCTION ensure_table_exists IS
'Creates the dynamic PostgreSQL table if it does not exist yet. Supports all column types including datetime (TIMESTAMPTZ), date-range (JSONB), and linked-items (JSONB).';
