-- Migration: Add deleted_at column to existing dynamic tables
-- Description: Scans information_schema for all dynamic tables (database_* and spreadsheet_*)
-- and adds deleted_at column. Uses information_schema directly instead of querying
-- document_databases/document_spreadsheets, so it works even if those tables are empty
-- at migration time (e.g. fresh DB initialization).

DO $$
DECLARE
  v_table_name TEXT;
BEGIN
  -- Find all dynamic tables by naming pattern in information_schema
  -- Covers both database_<uuid> and spreadsheet_<uuid> tables
  FOR v_table_name IN
    SELECT t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND (t.table_name LIKE 'database\_%' OR t.table_name LIKE 'spreadsheet\_%')
      AND t.table_type = 'BASE TABLE'
  LOOP
    -- Check if column already exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = v_table_name
      AND column_name = 'deleted_at'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL', v_table_name);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_deleted_at ON %I(deleted_at) WHERE deleted_at IS NOT NULL', v_table_name, v_table_name);
      RAISE NOTICE 'Added deleted_at to %', v_table_name;
    END IF;
  END LOOP;
END;
$$;
