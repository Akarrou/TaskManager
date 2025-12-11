-- Migration: Add ensure_table_exists RPC function (with DROP first)
-- Description: Crée la table PostgreSQL dynamique si elle n'existe pas encore (lazy creation)

-- Drop existing function first to ensure clean slate
DROP FUNCTION IF EXISTS ensure_table_exists(TEXT);

-- Create the function
CREATE OR REPLACE FUNCTION ensure_table_exists(
  p_database_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_name TEXT;
  v_config JSONB;
  v_columns JSONB;
  v_col_name TEXT;
  v_col_type TEXT;
  v_table_exists BOOLEAN;
BEGIN
  -- 1. Récupérer metadata
  SELECT table_name, config INTO v_table_name, v_config
  FROM document_databases
  WHERE database_id = p_database_id;

  IF v_table_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database not found: ' || p_database_id
    );
  END IF;

  -- 2. Vérifier si la table existe déjà
  SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = v_table_name
  ) INTO v_table_exists;

  IF v_table_exists THEN
    -- Table existe déjà, rien à faire
    RETURN jsonb_build_object(
      'success', true,
      'table_name', v_table_name,
      'message', 'Table already exists',
      'created', false
    );
  END IF;

  -- 3. Créer la table avec colonnes de base
  EXECUTE format(
    'CREATE TABLE %I (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      row_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )',
    v_table_name
  );

  -- 4. Ajouter les colonnes depuis config.columns
  v_columns := v_config->'columns';

  IF v_columns IS NOT NULL AND jsonb_array_length(v_columns) > 0 THEN
    FOR i IN 0..jsonb_array_length(v_columns) - 1 LOOP
      -- Extraire column id et type
      v_col_name := 'col_' || REPLACE(v_columns->i->>'id', '-', '_');
      v_col_type := CASE
        WHEN v_columns->i->>'type' = 'text' THEN 'TEXT'
        WHEN v_columns->i->>'type' = 'number' THEN 'NUMERIC'
        WHEN v_columns->i->>'type' = 'date' THEN 'DATE'
        WHEN v_columns->i->>'type' = 'checkbox' THEN 'BOOLEAN'
        WHEN v_columns->i->>'type' = 'select' THEN 'TEXT'
        WHEN v_columns->i->>'type' = 'multi-select' THEN 'TEXT[]'
        WHEN v_columns->i->>'type' = 'url' THEN 'TEXT'
        WHEN v_columns->i->>'type' = 'email' THEN 'TEXT'
        ELSE 'TEXT'
      END;

      -- Ajouter la colonne
      EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', v_table_name, v_col_name, v_col_type);
    END LOOP;
  END IF;

  -- 5. Créer le trigger updated_at
  EXECUTE format(
    'CREATE TRIGGER update_%I_updated_at
     BEFORE UPDATE ON %I
     FOR EACH ROW
     EXECUTE FUNCTION update_updated_at_column()',
    v_table_name,
    v_table_name
  );

  -- 6. Définir le propriétaire et donner les permissions nécessaires
  -- CRITICAL: Le propriétaire doit être 'postgres' pour que les autres RPC SECURITY DEFINER puissent modifier la table
  EXECUTE format('ALTER TABLE %I OWNER TO postgres', v_table_name);

  -- Note: authenticated est le rôle par défaut des utilisateurs connectés via Supabase Auth
  EXECUTE format('GRANT ALL ON TABLE %I TO authenticated', v_table_name);
  EXECUTE format('GRANT ALL ON TABLE %I TO service_role', v_table_name);

  -- 7. Retourner succès
  RETURN jsonb_build_object(
    'success', true,
    'table_name', v_table_name,
    'message', 'Table created successfully',
    'created', true
  );
END;
$$;

-- Commentaire
COMMENT ON FUNCTION ensure_table_exists IS
'Crée la table PostgreSQL dynamique si elle n''existe pas encore. Utilisé pour lazy creation lors du premier usage (CSV import ou création colonne).';
