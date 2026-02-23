-- Migration: Create trash_items table for centralized soft delete tracking
-- Description: Each soft deletion inserts a record here. Items remain in their original table with deleted_at set.

CREATE TABLE IF NOT EXISTS trash_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL,        -- 'document','project','event','database_row','comment','spreadsheet'
  item_id TEXT NOT NULL,
  item_table TEXT NOT NULL,       -- table d'origine (ex: 'documents', 'database_xxx')
  display_name TEXT NOT NULL,
  parent_info JSONB,              -- contexte: { projectName, databaseId, databaseName, ... }
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  UNIQUE(item_type, item_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trash_items_user_id ON trash_items(user_id);
CREATE INDEX IF NOT EXISTS idx_trash_items_expires_at ON trash_items(expires_at);
CREATE INDEX IF NOT EXISTS idx_trash_items_item_type ON trash_items(item_type);

-- RLS
ALTER TABLE trash_items ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their own trash items
CREATE POLICY "Users can view own trash items"
  ON trash_items FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: users can insert their own trash items
CREATE POLICY "Users can insert own trash items"
  ON trash_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: users can delete their own trash items
CREATE POLICY "Users can delete own trash items"
  ON trash_items FOR DELETE
  USING (auth.uid() = user_id);

-- Policy: users can update their own trash items (for restore)
CREATE POLICY "Users can update own trash items"
  ON trash_items FOR UPDATE
  USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON TABLE trash_items TO authenticated;
GRANT ALL ON TABLE trash_items TO service_role;
