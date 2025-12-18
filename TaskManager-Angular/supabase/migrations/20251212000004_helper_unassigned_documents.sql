-- Migration: Helper view for unassigned documents
-- Description: Creates a view to easily identify documents without a project_id

-- Create view for unassigned documents (simplified - no task relations)
CREATE OR REPLACE VIEW public.unassigned_documents AS
SELECT
    d.id,
    d.title,
    d.created_at,
    d.updated_at,
    d.user_id,
    d.parent_id
FROM public.documents d
WHERE d.project_id IS NULL;

-- Add comment
COMMENT ON VIEW public.unassigned_documents IS 'Lists documents without a project_id (excludes database row documents)';

-- Grant access to authenticated users
GRANT SELECT ON public.unassigned_documents TO authenticated;
