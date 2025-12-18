-- Migration: Add get_all_users RPC function
-- Date: 2025-12-12
-- Description: Admin function to list all users from auth schema

CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE(id uuid, email text, created_at timestamp with time zone)
LANGUAGE sql
SECURITY DEFINER
AS $function$
  SELECT id, email, created_at
  FROM auth.users
  ORDER BY email;
$function$;

-- Grant execution ONLY to service_role (admin only)
GRANT EXECUTE ON FUNCTION public.get_all_users() TO service_role;

COMMENT ON FUNCTION public.get_all_users IS 'Admin-only: Returns list of all users from auth.users';
