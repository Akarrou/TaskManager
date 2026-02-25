-- Add is_pinned column to document_tab_items
-- Pinned items are added via the document picker (links/references)
-- Non-pinned items are added via drag & drop (organized documents)
ALTER TABLE document_tab_items
  ADD COLUMN is_pinned boolean NOT NULL DEFAULT false;
