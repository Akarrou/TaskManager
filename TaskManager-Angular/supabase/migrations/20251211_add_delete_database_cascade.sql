-- Migration: Add delete_database_cascade RPC function
-- Description: Supprime une base de données et sa table PostgreSQL dynamique en cascade

CREATE OR REPLACE FUNCTION delete_database_cascade(
  p_database_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_name TEXT;
  v_result JSONB;
BEGIN
  -- 1. Récupérer table_name depuis metadata
  SELECT table_name INTO v_table_name
  FROM document_databases
  WHERE database_id = p_database_id;

  IF v_table_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database not found: ' || p_database_id
    );
  END IF;

  -- 2. Supprimer la table PostgreSQL dynamique
  BEGIN
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', v_table_name);
  EXCEPTION WHEN OTHERS THEN
    -- Log erreur mais continue (la table peut ne pas exister)
    RAISE NOTICE 'Error dropping table %: %', v_table_name, SQLERRM;
  END;

  -- 3. Supprimer l'entrée dans document_databases
  DELETE FROM document_databases
  WHERE database_id = p_database_id;

  -- 4. Retourner résultat
  RETURN jsonb_build_object(
    'success', true,
    'database_id', p_database_id,
    'table_name', v_table_name,
    'message', 'Database and table deleted successfully'
  );
END;
$$;

-- Commentaire
COMMENT ON FUNCTION delete_database_cascade IS
'Supprime une base de données et sa table PostgreSQL dynamique en cascade. Utilisé lors de la suppression de documents contenant des bases de données.';
