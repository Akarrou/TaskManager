-- Migration: Add delete_dynamic_table RPC function
-- Date: 2025-12-12
-- Description: Deletes dynamic tables with CASCADE (alternative to delete_database_cascade)

CREATE OR REPLACE FUNCTION public.delete_dynamic_table(table_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  result json;
BEGIN
  -- Validate table name
  IF table_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', table_name;
  END IF;

  -- Drop the table
  EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', table_name);

  result := json_build_object('success', true, 'table_name', table_name);
  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_dynamic_table(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.delete_dynamic_table IS 'Drops a dynamic table with CASCADE - use with caution';
