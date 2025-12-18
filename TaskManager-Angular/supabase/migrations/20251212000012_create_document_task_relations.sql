-- Migration: Create document_task_relations table
-- Date: 2025-12-12
-- Description: Creates table for linking documents to tasks

CREATE TABLE IF NOT EXISTS public.document_task_relations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    position_in_document integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_document_task UNIQUE (document_id, task_id)
);

COMMENT ON TABLE public.document_task_relations IS 'Links documents to tasks with position tracking';
COMMENT ON COLUMN public.document_task_relations.position_in_document IS 'Position/order of the task mention within the document';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_document_task_relations_document_id ON public.document_task_relations(document_id);
CREATE INDEX IF NOT EXISTS idx_document_task_relations_task_id ON public.document_task_relations(task_id);
CREATE INDEX IF NOT EXISTS idx_document_task_relations_position ON public.document_task_relations(document_id, position_in_document);

-- Enable Row Level Security
ALTER TABLE public.document_task_relations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow all authenticated users to manage document-task relations
CREATE POLICY "Users can view all document-task relations"
    ON public.document_task_relations FOR SELECT
    USING (true);

CREATE POLICY "Users can create document-task relations"
    ON public.document_task_relations FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can update document-task relations"
    ON public.document_task_relations FOR UPDATE
    USING (true);

CREATE POLICY "Users can delete document-task relations"
    ON public.document_task_relations FOR DELETE
    USING (true);
