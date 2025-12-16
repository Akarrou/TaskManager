-- Migration: Add reload_schema_cache function
-- This function notifies PostgREST to reload its schema cache
-- Needed when dynamically adding columns to tables

CREATE OR REPLACE FUNCTION public.reload_schema_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NOTIFY pgrst, 'reload schema';
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.reload_schema_cache() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reload_schema_cache() TO anon;
