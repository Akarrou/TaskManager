-- Migration: Add delete_column_from_table RPC function
-- Description: Supprime dynamiquement une colonne d'une table database

DROP FUNCTION IF EXISTS delete_column_from_table(TEXT, TEXT);

CREATE OR REPLACE FUNCTION delete_column_from_table(
  table_name TEXT,
  column_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Drop column from table
  EXECUTE format('ALTER TABLE %I DROP COLUMN %I', table_name, column_name);

  RETURN jsonb_build_object(
    'success', true,
    'table_name', table_name,
    'column_name', column_name
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'error_code', SQLSTATE
  );
END;
$$;

COMMENT ON FUNCTION delete_column_from_table IS
'Supprime dynamiquement une colonne d''une table de base de données. Utilisée par database.service.ts pour supprimer des colonnes des tables dynamiques database_*.';
