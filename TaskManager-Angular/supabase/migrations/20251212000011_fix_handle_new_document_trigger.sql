-- Migration: Fix handle_new_document trigger (ensure it's created)
-- Date: 2025-12-12
-- Description: Recreate trigger that auto-sets user_id on document creation
--              This migration ensures the trigger exists even if previous attempt failed

-- Ensure the function exists first
CREATE OR REPLACE FUNCTION public.handle_new_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Set user_id to the authenticated user's ID if not already set
  IF NEW.user_id IS NULL THEN
    NEW.user_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

-- Drop and recreate trigger to ensure it exists
DROP TRIGGER IF EXISTS handle_new_document_trigger ON public.documents;

CREATE TRIGGER handle_new_document_trigger
  BEFORE INSERT ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_document();

COMMENT ON FUNCTION public.handle_new_document IS 'Trigger function that auto-sets user_id to authenticated user on document creation';
COMMENT ON TRIGGER handle_new_document_trigger ON public.documents IS 'Auto-fills user_id with authenticated user ID before insert';
