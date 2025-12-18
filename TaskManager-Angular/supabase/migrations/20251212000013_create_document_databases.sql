-- Migration: Create document_databases table
-- Date: 2025-12-12
-- Description: Creates table for storing database metadata (Notion-like databases in documents)

CREATE TABLE IF NOT EXISTS public.document_databases (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    database_id text NOT NULL UNIQUE,
    table_name text NOT NULL UNIQUE,
    name text NOT NULL,
    config jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.document_databases IS 'Stores metadata for Notion-like databases embedded in documents';
COMMENT ON COLUMN public.document_databases.database_id IS 'Unique database identifier (format: db-<uuid>)';
COMMENT ON COLUMN public.document_databases.table_name IS 'Physical PostgreSQL table name storing the database rows (format: database_<uuid>)';
COMMENT ON COLUMN public.document_databases.config IS 'JSON configuration containing columns, views, and settings';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_document_databases_document_id ON public.document_databases(document_id);
CREATE INDEX IF NOT EXISTS idx_document_databases_database_id ON public.document_databases(database_id);
CREATE INDEX IF NOT EXISTS idx_document_databases_table_name ON public.document_databases(table_name);

-- Enable Row Level Security
ALTER TABLE public.document_databases ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow all authenticated users to manage document databases
CREATE POLICY "Users can view all document databases"
    ON public.document_databases FOR SELECT
    USING (true);

CREATE POLICY "Users can create document databases"
    ON public.document_databases FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can update document databases"
    ON public.document_databases FOR UPDATE
    USING (true);

CREATE POLICY "Users can delete document databases"
    ON public.document_databases FOR DELETE
    USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_document_databases_updated_at
    BEFORE UPDATE ON public.document_databases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
