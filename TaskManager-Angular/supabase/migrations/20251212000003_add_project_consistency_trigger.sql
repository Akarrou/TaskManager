-- Migration: Add project consistency validation trigger
-- Description: Ensures that tasks and documents linked together belong to the same project

-- Create validation function
CREATE OR REPLACE FUNCTION validate_document_task_project_consistency()
RETURNS TRIGGER AS $$
DECLARE
    doc_project_id uuid;
    task_project_id uuid;
BEGIN
    -- Get the project_id of the document
    SELECT project_id INTO doc_project_id
    FROM public.documents
    WHERE id = NEW.document_id;

    -- Get the project_id of the task
    SELECT project_id INTO task_project_id
    FROM public.tasks
    WHERE id = NEW.task_id;

    -- If the document has a project_id, validate consistency
    IF doc_project_id IS NOT NULL THEN
        IF doc_project_id != task_project_id THEN
            RAISE EXCEPTION 'Cannot link task from project % to document from project %. Tasks and documents must belong to the same project.',
                task_project_id, doc_project_id
                USING ERRCODE = '23514'; -- check_violation
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on document_task_relations (only if table exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'document_task_relations'
    ) THEN
        DROP TRIGGER IF EXISTS enforce_document_task_project_consistency ON public.document_task_relations;

        CREATE TRIGGER enforce_document_task_project_consistency
            BEFORE INSERT OR UPDATE ON public.document_task_relations
            FOR EACH ROW
            EXECUTE FUNCTION validate_document_task_project_consistency();
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON FUNCTION validate_document_task_project_consistency() IS 'Validates that tasks and documents belong to the same project when linked together';
