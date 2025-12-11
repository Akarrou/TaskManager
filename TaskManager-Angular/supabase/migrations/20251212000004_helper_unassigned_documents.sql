-- Migration: Helper view for unassigned documents
-- Description: Creates a view to easily identify documents without a project_id

-- Create view for unassigned documents
CREATE OR REPLACE VIEW public.unassigned_documents AS
SELECT
    d.id,
    d.title,
    d.created_at,
    d.updated_at,
    d.user_id,
    COUNT(dtr.task_id) as linked_tasks_count,
    -- Get potential project from linked tasks (if any)
    (
        SELECT DISTINCT t.project_id
        FROM public.document_task_relations dtr2
        JOIN public.tasks t ON t.id = dtr2.task_id
        WHERE dtr2.document_id = d.id
        LIMIT 1
    ) as suggested_project_id
FROM public.documents d
LEFT JOIN public.document_task_relations dtr ON dtr.document_id = d.id
WHERE d.project_id IS NULL
GROUP BY d.id, d.title, d.created_at, d.updated_at, d.user_id;

-- Add comment
COMMENT ON VIEW public.unassigned_documents IS 'Lists documents without a project_id and suggests a project based on linked tasks';

-- Grant access to authenticated users
GRANT SELECT ON public.unassigned_documents TO authenticated;
