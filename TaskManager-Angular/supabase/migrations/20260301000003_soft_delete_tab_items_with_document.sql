-- Soft-delete / restore document_tab_items when a document is trashed / restored.
-- This keeps pinned references recoverable when the origin document is restored from trash.

-- 1. Add deleted_at column for soft-delete support
ALTER TABLE document_tab_items ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- 2. Replace the trigger function: soft-delete on trash, restore on un-trash
CREATE OR REPLACE FUNCTION cleanup_document_tab_items_on_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Document soft-deleted → soft-delete its tab item references
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE document_tab_items
    SET deleted_at = NEW.deleted_at
    WHERE document_id = NEW.id AND deleted_at IS NULL;
  END IF;

  -- Document restored → restore its tab item references
  IF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
    UPDATE document_tab_items
    SET deleted_at = NULL
    WHERE document_id = NEW.id AND deleted_at IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger (DROP IF EXISTS then CREATE)
DROP TRIGGER IF EXISTS trg_cleanup_document_tab_items ON documents;
CREATE TRIGGER trg_cleanup_document_tab_items
  AFTER UPDATE OF deleted_at ON documents
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_document_tab_items_on_soft_delete();

-- 3. Update get_next_item_position to exclude soft-deleted items
CREATE OR REPLACE FUNCTION get_next_item_position(p_tab_id uuid, p_section_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_max_position INTEGER;
BEGIN
    IF p_section_id IS NULL THEN
        SELECT COALESCE(MAX(position), -1) + 1 INTO v_max_position
        FROM document_tab_items
        WHERE tab_id = p_tab_id AND section_id IS NULL AND deleted_at IS NULL;
    ELSE
        SELECT COALESCE(MAX(position), -1) + 1 INTO v_max_position
        FROM document_tab_items
        WHERE tab_id = p_tab_id AND section_id = p_section_id AND deleted_at IS NULL;
    END IF;

    RETURN v_max_position;
END;
$$;
