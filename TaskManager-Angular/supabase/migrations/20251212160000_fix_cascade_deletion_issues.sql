-- Migration: Fix CASCADE deletion issues for data integrity
-- Created: 2025-12-12
-- Description:
--   1. Protect projects from being deleted when owner is deleted (CASCADE → SET NULL)
--   2. Ensure documents are deleted when project is deleted (SET NULL → CASCADE)
--   3. Synchronize documents and database rows (trigger for document → row cleanup)
--   4. Add cleanup function for orphaned database documents
--   5. Strengthen RLS policies for document relations

-- ============================================================================
-- CORRECTION 1: Protect projects from owner deletion
-- ============================================================================
-- Current issue: When project owner account is deleted, entire project is deleted
-- Solution: Change CASCADE to SET NULL to preserve projects

ALTER TABLE public.projects
ALTER COLUMN owner_id DROP NOT NULL;

ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_owner_id_fkey;

ALTER TABLE public.projects
ADD CONSTRAINT projects_owner_id_fkey
FOREIGN KEY (owner_id)
REFERENCES auth.users(id)
ON DELETE SET NULL;

COMMENT ON COLUMN public.projects.owner_id IS 'Project owner (nullable). Set to NULL when owner account is deleted to preserve project data.';

-- ============================================================================
-- CORRECTION 2: Ensure documents are deleted with projects
-- ============================================================================
-- Current issue: Documents with NULL project_id accumulate when projects are deleted
-- Solution: Change SET NULL to CASCADE for consistency with tasks behavior

ALTER TABLE public.documents
DROP CONSTRAINT IF EXISTS documents_project_id_fkey;

ALTER TABLE public.documents
ADD CONSTRAINT documents_project_id_fkey
FOREIGN KEY (project_id)
REFERENCES public.projects(id)
ON DELETE CASCADE;

COMMENT ON COLUMN public.documents.project_id IS 'Project reference. Document is deleted when project is deleted (CASCADE).';

-- ============================================================================
-- CORRECTION 3: Synchronize documents and database rows
-- ============================================================================
-- Current issue: No cascade between documents and their database row counterparts
-- Solution: Trigger to delete database row when document is deleted

CREATE OR REPLACE FUNCTION cleanup_database_row_on_document_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_table_name TEXT;
BEGIN
  -- Only process documents that represent database rows
  IF OLD.database_id IS NOT NULL AND OLD.database_row_id IS NOT NULL THEN

    -- Get the physical table name from metadata
    SELECT table_name INTO v_table_name
    FROM public.document_databases
    WHERE database_id = OLD.database_id;

    -- If table exists, delete the corresponding row
    IF v_table_name IS NOT NULL THEN
      BEGIN
        EXECUTE format('DELETE FROM %I WHERE id = $1', v_table_name)
        USING OLD.database_row_id;

        RAISE NOTICE 'Deleted database row % from table % (triggered by document %)',
          OLD.database_row_id, v_table_name, OLD.id;
      EXCEPTION WHEN OTHERS THEN
        -- Log error but don't block document deletion
        RAISE WARNING 'Failed to delete database row % from table %: %',
          OLD.database_row_id, v_table_name, SQLERRM;
      END;
    END IF;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;

-- Create trigger on documents table
DROP TRIGGER IF EXISTS cleanup_database_row_on_document_delete_trigger ON public.documents;

CREATE TRIGGER cleanup_database_row_on_document_delete_trigger
BEFORE DELETE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION cleanup_database_row_on_document_delete();

COMMENT ON FUNCTION cleanup_database_row_on_document_delete() IS
  'Automatically delete database row when its corresponding document is deleted. Prevents orphaned rows in database_<uuid> tables.';

-- ============================================================================
-- CORRECTION 4: Cleanup function for orphaned database documents
-- ============================================================================
-- Purpose: Periodic cleanup of documents pointing to non-existent database rows
-- Usage: SELECT * FROM cleanup_orphaned_database_documents();

CREATE OR REPLACE FUNCTION cleanup_orphaned_database_documents()
RETURNS TABLE(
  database_id TEXT,
  database_name TEXT,
  deleted_documents INTEGER,
  orphaned_rows INTEGER
) AS $$
DECLARE
  v_database RECORD;
  v_deleted INTEGER := 0;
  v_orphaned_rows INTEGER := 0;
BEGIN
  -- Iterate through all registered databases
  FOR v_database IN
    SELECT db.database_id, db.table_name, db.name
    FROM public.document_databases db
    ORDER BY db.created_at
  LOOP

    -- Count and delete documents pointing to non-existent rows
    BEGIN
      EXECUTE format('
        WITH deleted AS (
          DELETE FROM public.documents
          WHERE database_id = $1
            AND database_row_id IS NOT NULL
            AND database_row_id NOT IN (SELECT id FROM %I)
          RETURNING id
        )
        SELECT COUNT(*) FROM deleted
      ', v_database.table_name)
      USING v_database.database_id
      INTO v_deleted;

      -- Count orphaned rows (rows without corresponding document)
      EXECUTE format('
        SELECT COUNT(*)
        FROM %I db_row
        WHERE NOT EXISTS (
          SELECT 1 FROM public.documents d
          WHERE d.database_id = $1
            AND d.database_row_id = db_row.id
        )
      ', v_database.table_name)
      USING v_database.database_id
      INTO v_orphaned_rows;

      -- Return result for this database
      RETURN QUERY SELECT
        v_database.database_id,
        v_database.name,
        v_deleted,
        v_orphaned_rows;

    EXCEPTION WHEN OTHERS THEN
      -- Log error and continue with next database
      RAISE WARNING 'Error processing database % (%): %',
        v_database.name, v_database.database_id, SQLERRM;

      RETURN QUERY SELECT
        v_database.database_id,
        v_database.name,
        -1, -- Error indicator
        -1;
    END;

  END LOOP;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_orphaned_database_documents() IS
  'Cleanup orphaned database documents and report orphaned rows. Run periodically to maintain data integrity.';

-- ============================================================================
-- CORRECTION 5: Strengthen RLS policies for document relations
-- ============================================================================
-- Current issue: All authenticated users can view/modify document relations
-- Solution: Restrict access to document owners only

-- Remove permissive policies for document_task_relations
DROP POLICY IF EXISTS "Allow all authenticated users" ON public.document_task_relations;
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.document_task_relations;

-- Create strict policies based on document ownership
CREATE POLICY "Users can view own document task relations"
ON public.document_task_relations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id
      AND d.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own document task relations"
ON public.document_task_relations FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id
      AND d.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own document task relations"
ON public.document_task_relations FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id
      AND d.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own document task relations"
ON public.document_task_relations FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id
      AND d.user_id = auth.uid()
  )
);

-- Remove permissive policies for document_databases
DROP POLICY IF EXISTS "Allow all authenticated users" ON public.document_databases;
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.document_databases;

-- Create strict policies based on document ownership
CREATE POLICY "Users can view own document databases"
ON public.document_databases FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id
      AND d.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own document databases"
ON public.document_databases FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id
      AND d.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own document databases"
ON public.document_databases FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id
      AND d.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own document databases"
ON public.document_databases FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id
      AND d.user_id = auth.uid()
  )
);

-- ============================================================================
-- VERIFICATION QUERIES (for manual testing)
-- ============================================================================

-- Test 1: Verify projects.owner_id constraint
-- SELECT constraint_name, constraint_type, table_name
-- FROM information_schema.table_constraints
-- WHERE table_name = 'projects' AND constraint_name LIKE '%owner%';

-- Test 2: Verify documents.project_id constraint
-- SELECT constraint_name, constraint_type, table_name
-- FROM information_schema.table_constraints
-- WHERE table_name = 'documents' AND constraint_name LIKE '%project%';

-- Test 3: List all triggers on documents table
-- SELECT trigger_name, event_manipulation, action_statement
-- FROM information_schema.triggers
-- WHERE event_object_table = 'documents';

-- Test 4: Run cleanup function
-- SELECT * FROM cleanup_orphaned_database_documents();

-- Test 5: Check RLS policies
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN ('document_task_relations', 'document_databases')
-- ORDER BY tablename, policyname;
