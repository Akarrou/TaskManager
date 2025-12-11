-- Migration: Add bulk_insert_rows RPC function for CSV import
-- Description: Permet l'insertion en batch de lignes CSV dans les tables dynamiques de base de données

CREATE OR REPLACE FUNCTION bulk_insert_rows(
  p_database_id TEXT,
  p_rows TEXT[] -- Array de JSON strings
)
RETURNS TABLE (
  inserted_count INTEGER,
  failed_count INTEGER,
  errors JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_name TEXT;
  v_row_json TEXT;
  v_row_data JSONB;
  v_cells JSONB;
  v_col_names TEXT[];
  v_col_values TEXT[];
  v_sql TEXT;
  v_inserted INTEGER := 0;
  v_failed INTEGER := 0;
  v_errors JSONB := '[]'::JSONB;
  v_max_row_order INTEGER;
  v_key TEXT;
  v_value JSONB;
BEGIN
  -- 1. Récupérer table_name depuis metadata
  SELECT table_name INTO v_table_name
  FROM document_databases
  WHERE database_id = p_database_id;

  IF v_table_name IS NULL THEN
    RAISE EXCEPTION 'Database not found: %', p_database_id;
  END IF;

  -- 2. Récupérer max row_order actuel
  EXECUTE format('SELECT COALESCE(MAX(row_order), 0) FROM %I', v_table_name)
  INTO v_max_row_order;

  -- 3. Insérer chaque ligne
  FOREACH v_row_json IN ARRAY p_rows
  LOOP
    BEGIN
      v_row_data := v_row_json::JSONB;
      v_cells := v_row_data->'cells';

      -- Réinitialiser arrays
      v_col_names := ARRAY[]::TEXT[];
      v_col_values := ARRAY[]::TEXT[];

      -- Construire colonnes et valeurs dynamiquement
      -- cells format: {"columnId": "value", ...}
      -- DB format: col_<columnId> (avec tirets remplacés par underscores)
      FOR v_key, v_value IN SELECT * FROM jsonb_each(v_cells)
      LOOP
        v_col_names := v_col_names || ('col_' || REPLACE(v_key, '-', '_'));

        -- Gérer les différents types de valeurs
        IF jsonb_typeof(v_value) = 'string' THEN
          v_col_values := v_col_values || quote_literal(v_value#>>'{}');
        ELSIF jsonb_typeof(v_value) = 'number' THEN
          v_col_values := v_col_values || (v_value#>>'{}');
        ELSIF jsonb_typeof(v_value) = 'boolean' THEN
          v_col_values := v_col_values || (v_value#>>'{}');
        ELSIF jsonb_typeof(v_value) = 'array' THEN
          -- Pour multi-select (array de strings)
          v_col_values := v_col_values || quote_literal(v_value::TEXT);
        ELSE
          v_col_values := v_col_values || 'NULL';
        END IF;
      END LOOP;

      -- Incrémenter row_order
      v_max_row_order := v_max_row_order + 1;

      -- Construire et exécuter INSERT
      IF array_length(v_col_names, 1) > 0 THEN
        v_sql := format(
          'INSERT INTO %I (row_order, %s) VALUES (%s, %s)',
          v_table_name,
          array_to_string(v_col_names, ', '),
          v_max_row_order,
          array_to_string(v_col_values, ', ')
        );

        EXECUTE v_sql;
        v_inserted := v_inserted + 1;
      ELSE
        -- Ligne vide, insertion avec seulement row_order
        v_sql := format(
          'INSERT INTO %I (row_order) VALUES (%s)',
          v_table_name,
          v_max_row_order
        );
        EXECUTE v_sql;
        v_inserted := v_inserted + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object(
        'row', v_inserted + v_failed,
        'message', SQLERRM,
        'detail', SQLSTATE
      );
    END;
  END LOOP;

  -- Retourner résultats
  RETURN QUERY SELECT v_inserted, v_failed, v_errors;
END;
$$;

-- Commentaire
COMMENT ON FUNCTION bulk_insert_rows IS
'Insère en batch des lignes CSV dans une table dynamique de base de données. Utilisé pour l''import CSV.';
