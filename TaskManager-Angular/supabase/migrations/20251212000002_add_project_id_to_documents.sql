-- Migration: Add project_id to documents table
-- Description: Links documents to projects via foreign key with CASCADE DELETE

-- Add project_id column to documents table
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_documents_project_id ON public.documents(project_id);

-- Add comment for documentation
COMMENT ON COLUMN public.documents.project_id IS 'Foreign key to projects table. When a project is deleted, all its documents are deleted.';
