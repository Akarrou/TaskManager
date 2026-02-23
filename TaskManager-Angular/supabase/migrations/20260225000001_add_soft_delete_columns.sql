-- Migration: Add deleted_at column to static tables for soft delete support
-- Description: Adds deleted_at TIMESTAMPTZ column (default NULL) to all major tables.
-- Items with deleted_at IS NOT NULL are considered soft-deleted (in trash).

-- 1. documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at) WHERE deleted_at IS NOT NULL;

-- 2. projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at) WHERE deleted_at IS NOT NULL;

-- 3. block_comments
ALTER TABLE block_comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_block_comments_deleted_at ON block_comments(deleted_at) WHERE deleted_at IS NOT NULL;

-- 4. document_databases
ALTER TABLE document_databases ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_document_databases_deleted_at ON document_databases(deleted_at) WHERE deleted_at IS NOT NULL;

-- 5. document_spreadsheets
ALTER TABLE document_spreadsheets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_document_spreadsheets_deleted_at ON document_spreadsheets(deleted_at) WHERE deleted_at IS NOT NULL;
