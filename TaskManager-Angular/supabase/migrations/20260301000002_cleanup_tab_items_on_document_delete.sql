-- Automatically clean up document_tab_items when a document is soft-deleted
-- This ensures pinned references are removed regardless of the deletion code path
CREATE OR REPLACE FUNCTION cleanup_document_tab_items_on_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL) THEN
    DELETE FROM document_tab_items WHERE document_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cleanup_document_tab_items
  AFTER UPDATE OF deleted_at ON documents
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_document_tab_items_on_soft_delete();
