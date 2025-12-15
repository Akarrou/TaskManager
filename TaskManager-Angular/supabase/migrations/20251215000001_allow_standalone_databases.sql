-- Migration: Allow standalone databases (without parent document)
-- This enables Task Databases to be created from CSV import without a parent document

-- Step 1: Drop the foreign key constraint temporarily
ALTER TABLE public.document_databases
DROP CONSTRAINT IF EXISTS document_databases_document_id_fkey;

-- Step 2: Alter the column to allow NULL values
ALTER TABLE public.document_databases
ALTER COLUMN document_id DROP NOT NULL;

-- Step 3: Re-add the foreign key constraint with ON DELETE SET NULL
-- This ensures that if a document is deleted, the database remains but loses its link
ALTER TABLE public.document_databases
ADD CONSTRAINT document_databases_document_id_fkey
FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;

-- Step 4: Add an index for querying standalone databases
CREATE INDEX IF NOT EXISTS idx_document_databases_standalone
ON public.document_databases (database_id)
WHERE document_id IS NULL;

-- Step 5: Update RLS policy to allow access to standalone databases
-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can view their own document databases" ON public.document_databases;

-- Create new policy that handles both document-linked and standalone databases
CREATE POLICY "Users can view their own document databases"
ON public.document_databases
FOR SELECT
USING (
  -- Can view if linked to a document they can access
  (document_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_databases.document_id
    AND d.user_id = auth.uid()
  ))
  OR
  -- Can view standalone databases (no document_id)
  -- For now, allow all authenticated users to see standalone databases
  -- This can be refined later with a created_by column
  (document_id IS NULL AND auth.uid() IS NOT NULL)
);

-- Update insert/update/delete policies similarly
DROP POLICY IF EXISTS "Users can insert their own document databases" ON public.document_databases;
CREATE POLICY "Users can insert their own document databases"
ON public.document_databases
FOR INSERT
WITH CHECK (
  -- Can insert if linked to own document
  (document_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_databases.document_id
    AND d.user_id = auth.uid()
  ))
  OR
  -- Can insert standalone databases
  (document_id IS NULL AND auth.uid() IS NOT NULL)
);

DROP POLICY IF EXISTS "Users can update their own document databases" ON public.document_databases;
CREATE POLICY "Users can update their own document databases"
ON public.document_databases
FOR UPDATE
USING (
  (document_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_databases.document_id
    AND d.user_id = auth.uid()
  ))
  OR
  (document_id IS NULL AND auth.uid() IS NOT NULL)
);

DROP POLICY IF EXISTS "Users can delete their own document databases" ON public.document_databases;
CREATE POLICY "Users can delete their own document databases"
ON public.document_databases
FOR DELETE
USING (
  (document_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_databases.document_id
    AND d.user_id = auth.uid()
  ))
  OR
  (document_id IS NULL AND auth.uid() IS NOT NULL)
);

COMMENT ON COLUMN public.document_databases.document_id IS
'Reference to parent document. NULL for standalone databases (e.g., Task databases created from CSV import).';
