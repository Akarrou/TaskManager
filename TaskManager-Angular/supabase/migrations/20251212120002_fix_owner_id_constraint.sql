-- Migration: Fix owner_id constraint for better compatibility
-- Date: 2025-12-12
-- Description: Makes owner_id nullable and adds a default value trigger for backward compatibility

-- Make owner_id nullable temporarily (will be set by application or trigger)
ALTER TABLE public.projects
ALTER COLUMN owner_id DROP NOT NULL;

-- Create a function to set owner_id on insert if not provided
CREATE OR REPLACE FUNCTION public.set_project_owner()
RETURNS trigger AS $$
BEGIN
    -- If owner_id is not set, use the authenticated user
    IF NEW.owner_id IS NULL THEN
        NEW.owner_id = auth.uid();
    END IF;

    -- Ensure owner_id is set (fail if no auth user)
    IF NEW.owner_id IS NULL THEN
        RAISE EXCEPTION 'Cannot create project: user must be authenticated';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically set owner_id
DROP TRIGGER IF EXISTS trigger_set_project_owner ON public.projects;
CREATE TRIGGER trigger_set_project_owner
BEFORE INSERT ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.set_project_owner();

-- Update RLS policy for insert to allow auth.uid() usage
DROP POLICY IF EXISTS "Users can create their own projects" ON public.projects;
CREATE POLICY "Users can create their own projects"
ON public.projects FOR INSERT
WITH CHECK (
    -- Allow if owner_id matches authenticated user OR if owner_id will be set by trigger
    owner_id = auth.uid() OR owner_id IS NULL
);

-- Add comment
COMMENT ON FUNCTION public.set_project_owner() IS 'Automatically sets owner_id to authenticated user if not provided';
