-- Migration: Add parent_id column to documents table for hierarchical navigation
-- This enables breadcrumb navigation like: Documents / Parent / Child

-- Add parent_id column (nullable, allows documents without parents)
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES documents(id) ON DELETE CASCADE;

-- Create index for faster parent lookups
CREATE INDEX IF NOT EXISTS idx_documents_parent_id ON documents(parent_id);

-- Add comment for documentation
COMMENT ON COLUMN documents.parent_id IS 'Reference to parent document for hierarchical navigation (breadcrumb trail)';

-- Example usage:
-- When creating a linked document from "coucou", set parent_id to coucou's id
-- This creates: Documents / coucou / nouvellePage
