-- =====================================================================
-- Supabase RPC Functions for Dynamic Database Tables
-- =====================================================================
-- Execute this SQL script in Supabase SQL Editor to create all required
-- functions for the dynamic database table system.
-- =====================================================================

-- =====================================================================
-- 1. Create document_databases metadata table
-- =====================================================================
-- This table stores metadata about each dynamic database (config, table name, etc.)
CREATE TABLE IF NOT EXISTS document_databases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  database_id TEXT UNIQUE NOT NULL,  -- UUID from TipTap node
  table_name TEXT UNIQUE NOT NULL,   -- Physical table name (database_abc123)
  name TEXT NOT NULL,                -- User-facing database name
  config JSONB NOT NULL,             -- Database configuration (columns, views, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_document_databases_doc_id ON document_databases(document_id);
CREATE INDEX IF NOT EXISTS idx_document_databases_db_id ON document_databases(database_id);

-- =====================================================================
-- 2. Function: create_dynamic_table
-- =====================================================================
-- Creates a new PostgreSQL table dynamically for a database
-- Parameters:
--   - table_name: Name of the table to create (e.g., 'database_abc123')
--   - columns: JSONB array of column definitions [{"name": "col_uuid", "type": "TEXT"}, ...]
CREATE OR REPLACE FUNCTION create_dynamic_table(
  table_name TEXT,
  columns JSONB
)
RETURNS VOID AS $$
DECLARE
  col RECORD;
  sql TEXT;
BEGIN
  -- Validate table name (security)
  IF table_name !~ '^database_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid table name format. Must start with database_ and contain only lowercase alphanumeric and underscores.';
  END IF;

  -- Start building CREATE TABLE statement
  sql := 'CREATE TABLE ' || quote_ident(table_name) || ' (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    row_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()';

  -- Add dynamic columns
  FOR col IN SELECT * FROM jsonb_array_elements(columns)
  LOOP
    sql := sql || ', ' ||
           quote_ident(col->>'name') || ' ' ||
           (col->>'type');
  END LOOP;

  sql := sql || ')';

  -- Execute CREATE TABLE
  EXECUTE sql;

  -- Create index on row_order for efficient sorting
  EXECUTE 'CREATE INDEX idx_' || table_name || '_order ON ' ||
          quote_ident(table_name) || '(row_order)';

  -- Enable Row Level Security
  EXECUTE 'ALTER TABLE ' || quote_ident(table_name) || ' ENABLE ROW LEVEL SECURITY';

  -- Create RLS policy: users can only access their own data
  -- Note: This assumes documents table has user_id column
  EXECUTE 'CREATE POLICY user_policy ON ' || quote_ident(table_name) || '
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM document_databases db
        JOIN documents d ON d.id = db.document_id
        WHERE db.table_name = ' || quote_literal(table_name) || '
        AND d.user_id = auth.uid()
      )
    )';

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 3. Function: add_column_to_table
-- =====================================================================
-- Adds a new column to an existing dynamic table
-- Parameters:
--   - table_name: Name of the table
--   - column_name: Name of the new column (e.g., 'col_uuid')
--   - column_type: PostgreSQL type (TEXT, NUMERIC, DATE, BOOLEAN, etc.)
CREATE OR REPLACE FUNCTION add_column_to_table(
  table_name TEXT,
  column_name TEXT,
  column_type TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Validate table name
  IF table_name !~ '^database_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid table name format';
  END IF;

  -- Validate column name
  IF column_name !~ '^col_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid column name format. Must start with col_';
  END IF;

  -- Add column
  EXECUTE 'ALTER TABLE ' || quote_ident(table_name) ||
          ' ADD COLUMN ' || quote_ident(column_name) ||
          ' ' || column_type;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 4. Function: delete_column_from_table
-- =====================================================================
-- Removes a column from a dynamic table
-- Parameters:
--   - table_name: Name of the table
--   - column_name: Name of the column to delete
CREATE OR REPLACE FUNCTION delete_column_from_table(
  table_name TEXT,
  column_name TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Validate table name
  IF table_name !~ '^database_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid table name format';
  END IF;

  -- Validate column name
  IF column_name !~ '^col_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid column name format. Must start with col_';
  END IF;

  -- Drop column
  EXECUTE 'ALTER TABLE ' || quote_ident(table_name) ||
          ' DROP COLUMN ' || quote_ident(column_name);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 5. Function: rename_column_in_table
-- =====================================================================
-- Renames a column in a dynamic table
-- Parameters:
--   - table_name: Name of the table
--   - old_column_name: Current column name
--   - new_column_name: New column name
CREATE OR REPLACE FUNCTION rename_column_in_table(
  table_name TEXT,
  old_column_name TEXT,
  new_column_name TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Validate table name
  IF table_name !~ '^database_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid table name format';
  END IF;

  -- Validate column names
  IF old_column_name !~ '^col_[a-z0-9_]+$' OR new_column_name !~ '^col_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid column name format. Must start with col_';
  END IF;

  -- Rename column
  EXECUTE 'ALTER TABLE ' || quote_ident(table_name) ||
          ' RENAME COLUMN ' || quote_ident(old_column_name) ||
          ' TO ' || quote_ident(new_column_name);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 6. Function: delete_dynamic_table
-- =====================================================================
-- Drops a dynamic table completely
-- Parameters:
--   - table_name: Name of the table to delete
CREATE OR REPLACE FUNCTION delete_dynamic_table(
  table_name TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Validate table name
  IF table_name !~ '^database_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid table name format';
  END IF;

  -- Drop table (CASCADE will drop all constraints, indexes, etc.)
  EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(table_name) || ' CASCADE';

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 7. Function: change_column_type
-- =====================================================================
-- Changes the data type of a column in a dynamic table
-- Parameters:
--   - table_name: Name of the table
--   - column_name: Name of the column
--   - new_type: New PostgreSQL type
CREATE OR REPLACE FUNCTION change_column_type(
  table_name TEXT,
  column_name TEXT,
  new_type TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Validate table name
  IF table_name !~ '^database_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid table name format';
  END IF;

  -- Validate column name
  IF column_name !~ '^col_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid column name format. Must start with col_';
  END IF;

  -- Alter column type (USING clause handles conversion)
  EXECUTE 'ALTER TABLE ' || quote_ident(table_name) ||
          ' ALTER COLUMN ' || quote_ident(column_name) ||
          ' TYPE ' || new_type || ' USING ' || quote_ident(column_name) || '::' || new_type;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 8. Trigger function: update_updated_at
-- =====================================================================
-- Automatically updates the updated_at column on row updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 9. Function: create_update_trigger
-- =====================================================================
-- Creates an update trigger for a dynamic table
-- Parameters:
--   - table_name: Name of the table
CREATE OR REPLACE FUNCTION create_update_trigger(
  table_name TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Validate table name
  IF table_name !~ '^database_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid table name format';
  END IF;

  -- Create trigger
  EXECUTE 'CREATE TRIGGER update_' || table_name || '_updated_at
    BEFORE UPDATE ON ' || quote_ident(table_name) || '
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()';

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- Grant necessary permissions
-- =====================================================================
-- Allow authenticated users to execute these functions
GRANT EXECUTE ON FUNCTION create_dynamic_table(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION add_column_to_table(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_column_from_table(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rename_column_in_table(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_dynamic_table(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION change_column_type(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_update_trigger(TEXT) TO authenticated;

-- Grant permissions on document_databases table
GRANT ALL ON document_databases TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =====================================================================
-- End of SQL script
-- =====================================================================
