-- Migration: Cascade soft-delete from projects to child documents and embedded items
-- When a project is soft-deleted, all its documents (and their databases/spreadsheets)
-- are also soft-deleted. When restored, only cascade-deleted items are restored
-- (individually-deleted items keep their own deleted_at timestamp).

CREATE OR REPLACE FUNCTION cascade_project_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Cascade soft-delete: project deleted -> documents + embedded items deleted
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    -- Soft-delete documents belonging to this project (only active ones)
    UPDATE documents
    SET deleted_at = NEW.deleted_at
    WHERE project_id = NEW.id AND deleted_at IS NULL;

    -- Soft-delete databases embedded in those documents
    UPDATE document_databases
    SET deleted_at = NEW.deleted_at
    WHERE document_id IN (
      SELECT id FROM documents WHERE project_id = NEW.id
    ) AND deleted_at IS NULL;

    -- Soft-delete spreadsheets embedded in those documents
    UPDATE document_spreadsheets
    SET deleted_at = NEW.deleted_at
    WHERE document_id IN (
      SELECT id FROM documents WHERE project_id = NEW.id
    ) AND deleted_at IS NULL;
  END IF;

  -- Cascade restore: only restore items that were cascade-deleted (same timestamp)
  IF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
    -- Restore databases/spreadsheets first (before documents, to keep referential integrity)
    UPDATE document_databases
    SET deleted_at = NULL
    WHERE document_id IN (
      SELECT id FROM documents WHERE project_id = NEW.id AND deleted_at = OLD.deleted_at
    ) AND deleted_at = OLD.deleted_at;

    UPDATE document_spreadsheets
    SET deleted_at = NULL
    WHERE document_id IN (
      SELECT id FROM documents WHERE project_id = NEW.id AND deleted_at = OLD.deleted_at
    ) AND deleted_at = OLD.deleted_at;

    -- Restore documents
    UPDATE documents
    SET deleted_at = NULL
    WHERE project_id = NEW.id AND deleted_at = OLD.deleted_at;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_soft_delete_cascade
  AFTER UPDATE OF deleted_at ON projects
  FOR EACH ROW
  EXECUTE FUNCTION cascade_project_soft_delete();

COMMENT ON FUNCTION cascade_project_soft_delete IS
'Cascade soft-delete/restore from projects to child documents and embedded databases/spreadsheets.';
