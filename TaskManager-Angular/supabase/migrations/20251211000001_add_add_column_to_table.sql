-- Migration: Add add_column_to_table RPC function
-- Description: Ajoute dynamiquement une colonne à une table database

DROP FUNCTION IF EXISTS add_column_to_table(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION add_column_to_table(
  table_name TEXT,
  column_name TEXT,
  column_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Add column to table
  EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', table_name, column_name, column_type);

  RETURN jsonb_build_object(
    'success', true,
    'table_name', table_name,
    'column_name', column_name,
    'column_type', column_type
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'error_code', SQLSTATE
  );
END;
$$;

COMMENT ON FUNCTION add_column_to_table IS
'Ajoute dynamiquement une colonne à une table de base de données. Utilisée par database.service.ts pour ajouter des colonnes aux tables dynamiques database_*.';
