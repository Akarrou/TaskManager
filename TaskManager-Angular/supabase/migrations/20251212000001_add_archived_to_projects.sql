-- Migration: Add archived column to projects table
-- Date: 2025-12-12
-- Description: Add support for archiving projects without deleting them

-- Add archived column to projects table
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- Create index for filtering archived projects
CREATE INDEX IF NOT EXISTS idx_projects_archived ON public.projects(archived);

-- Add comment for documentation
COMMENT ON COLUMN public.projects.archived IS 'Indicates if the project is archived. Archived projects are hidden by default but can be restored.';
