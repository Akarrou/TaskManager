-- Migration: Create pinned_documents table for quick access sidebar
-- Description: Allows users to pin documents for fast navigation from the global sidebar

CREATE TABLE IF NOT EXISTS public.pinned_documents (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT unique_pinned_document UNIQUE(user_id, document_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pinned_documents_user_id ON pinned_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_pinned_documents_project_id ON pinned_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_pinned_documents_document_id ON pinned_documents(document_id);

-- RLS
ALTER TABLE pinned_documents ENABLE ROW LEVEL SECURITY;

-- Policy: users can only view their own pinned documents
CREATE POLICY "Users can view own pinned documents"
  ON pinned_documents FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: users can insert their own pinned documents
CREATE POLICY "Users can insert own pinned documents"
  ON pinned_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: users can update their own pinned documents (reorder)
CREATE POLICY "Users can update own pinned documents"
  ON pinned_documents FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: users can delete their own pinned documents (unpin)
CREATE POLICY "Users can delete own pinned documents"
  ON pinned_documents FOR DELETE
  USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON TABLE pinned_documents TO authenticated;
GRANT ALL ON TABLE pinned_documents TO service_role;
