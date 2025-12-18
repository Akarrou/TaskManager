-- Migration: Add create_dynamic_table RPC function
-- Date: 2025-12-12
-- Description: Creates dynamic tables for document database blocks with RLS policies

CREATE OR REPLACE FUNCTION public.create_dynamic_table(table_name text, columns jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  column_def text;
  column_defs text := '';
  col jsonb;
  result json;
BEGIN
  -- Validate table name (prevent SQL injection)
  IF table_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', table_name;
  END IF;

  -- Build column definitions
  FOR col IN SELECT * FROM jsonb_array_elements(columns)
  LOOP
    IF column_defs != '' THEN
      column_defs := column_defs || ', ';
    END IF;

    column_def := quote_ident(col->>'name') || ' ' || (col->>'type');

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

-- Grant execution to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.create_dynamic_table(text, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_dynamic_table IS 'Creates a dynamic table for document database blocks with base columns and RLS policies';
