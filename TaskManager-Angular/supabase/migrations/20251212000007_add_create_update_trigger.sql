-- Migration: Add create_update_trigger RPC function
-- Date: 2025-12-12
-- Description: Automates creation of updated_at triggers for dynamic tables

CREATE OR REPLACE FUNCTION public.create_update_trigger(table_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  trigger_name text;
  result json;
BEGIN
  -- Validate table name
  IF table_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', table_name;
  END IF;

  trigger_name := 'update_' || table_name || '_updated_at';

  -- Create trigger
  EXECUTE format(
    'CREATE TRIGGER %I
     BEFORE UPDATE ON %I
     FOR EACH ROW
     EXECUTE FUNCTION update_updated_at_column()',
    trigger_name,
    table_name
  );

  result := json_build_object('success', true, 'trigger_name', trigger_name);
  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_update_trigger(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_update_trigger IS 'Creates an updated_at trigger for a given table using update_updated_at_column()';
