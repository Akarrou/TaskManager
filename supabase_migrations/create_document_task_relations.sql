-- Migration: Create document_task_relations table for task integration in documents
-- This enables bidirectional relations between documents and tasks with inline display

-- Create document_task_relations table
CREATE TABLE IF NOT EXISTS public.document_task_relations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL DEFAULT 'linked' CHECK (relation_type IN ('linked', 'embedded')),
    position_in_document INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    CONSTRAINT unique_document_task UNIQUE (document_id, task_id)
);

-- Enable RLS
ALTER TABLE public.document_task_relations ENABLE ROW LEVEL SECURITY;

-- Policy: Enable all access for authenticated users
CREATE POLICY "Enable all access for authenticated users"
    ON public.document_task_relations
    FOR ALL
    USING (auth.role() = 'authenticated');

-- Indexes for performance
CREATE INDEX idx_doc_task_relations_document_id ON public.document_task_relations(document_id);
CREATE INDEX idx_doc_task_relations_task_id ON public.document_task_relations(task_id);
CREATE INDEX idx_doc_task_relations_created_at ON public.document_task_relations(created_at DESC);

-- Auto-increment position trigger
CREATE OR REPLACE FUNCTION set_document_task_position()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.position_in_document IS NULL THEN
        SELECT COALESCE(MAX(position_in_document), 0) + 1
        INTO NEW.position_in_document
        FROM public.document_task_relations
        WHERE document_id = NEW.document_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_doc_task_position_trigger
    BEFORE INSERT ON public.document_task_relations
    FOR EACH ROW
    EXECUTE FUNCTION set_document_task_position();

-- Add comments for documentation
COMMENT ON TABLE public.document_task_relations IS 'Bidirectional relations between documents and tasks';
COMMENT ON COLUMN public.document_task_relations.relation_type IS 'Type of relation: linked (existing task) vs embedded (created from document)';
COMMENT ON COLUMN public.document_task_relations.position_in_document IS 'Order of task mention within document (auto-incremented)';
