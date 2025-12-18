-- Migration: Add database_id and database_row_id to documents table
-- This enables Notion-style database pages where each database row is a document

-- Add columns to link documents to database rows
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS database_id TEXT,
ADD COLUMN IF NOT EXISTS database_row_id UUID;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_database_id ON documents(database_id);
CREATE INDEX IF NOT EXISTS idx_documents_database_row_id ON documents(database_row_id);
CREATE INDEX IF NOT EXISTS idx_documents_database_link ON documents(database_id, database_row_id);

-- Add comments for documentation
COMMENT ON COLUMN documents.database_id IS 'ID de la database (format: db-<uuid>) si ce document représente une row de database';
COMMENT ON COLUMN documents.database_row_id IS 'ID de la row dans la table database_<uuid> si ce document représente une row de database';
