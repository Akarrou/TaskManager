-- =====================================================================
-- Installation Simple - Base de Données Document
-- =====================================================================
-- Version simplifiée sans dépendances pour tester rapidement
-- =====================================================================

-- 1. Créer la table document_databases (SANS dépendance documents)
CREATE TABLE IF NOT EXISTS document_databases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID,  -- Pas de FOREIGN KEY pour l'instant
  database_id TEXT UNIQUE NOT NULL,
  table_name TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_document_databases_doc_id ON document_databases(document_id);
CREATE INDEX IF NOT EXISTS idx_document_databases_db_id ON document_databases(database_id);

-- 2. Fonction principale: create_dynamic_table
CREATE OR REPLACE FUNCTION create_dynamic_table(
  table_name TEXT,
  columns JSONB
)
RETURNS VOID AS $$
DECLARE
  col RECORD;
  sql TEXT;
BEGIN
  -- Validation
  IF table_name !~ '^database_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid table name format';
  END IF;

  -- Créer table
  sql := 'CREATE TABLE ' || quote_ident(table_name) || ' (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    row_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()';

  FOR col IN SELECT * FROM jsonb_array_elements(columns)
  LOOP
    sql := sql || ', ' || quote_ident(col->>'name') || ' ' || (col->>'type');
  END LOOP;

  sql := sql || ')';
  EXECUTE sql;

  -- Index
  EXECUTE 'CREATE INDEX idx_' || table_name || '_order ON ' ||
          quote_ident(table_name) || '(row_order)';

  -- RLS (simplifié sans auth.uid() pour test)
  EXECUTE 'ALTER TABLE ' || quote_ident(table_name) || ' ENABLE ROW LEVEL SECURITY';
  EXECUTE 'CREATE POLICY allow_all ON ' || quote_ident(table_name) || ' FOR ALL USING (true)';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Fonction: add_column_to_table
CREATE OR REPLACE FUNCTION add_column_to_table(
  table_name TEXT,
  column_name TEXT,
  column_type TEXT
)
RETURNS VOID AS $$
BEGIN
  IF table_name !~ '^database_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid table name format';
  END IF;

  EXECUTE 'ALTER TABLE ' || quote_ident(table_name) ||
          ' ADD COLUMN ' || quote_ident(column_name) || ' ' || column_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Fonction: delete_column_from_table
CREATE OR REPLACE FUNCTION delete_column_from_table(
  table_name TEXT,
  column_name TEXT
)
RETURNS VOID AS $$
BEGIN
  EXECUTE 'ALTER TABLE ' || quote_ident(table_name) ||
          ' DROP COLUMN ' || quote_ident(column_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Fonction: delete_dynamic_table
CREATE OR REPLACE FUNCTION delete_dynamic_table(
  table_name TEXT
)
RETURNS VOID AS $$
BEGIN
  EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(table_name) || ' CASCADE';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Fonction: update trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Fonction: create_update_trigger
CREATE OR REPLACE FUNCTION create_update_trigger(
  table_name TEXT
)
RETURNS VOID AS $$
BEGIN
  EXECUTE 'CREATE TRIGGER update_' || table_name || '_updated_at
    BEFORE UPDATE ON ' || quote_ident(table_name) || '
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Permissions
GRANT EXECUTE ON FUNCTION create_dynamic_table(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION add_column_to_table(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_column_from_table(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_dynamic_table(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_update_trigger(TEXT) TO authenticated;
GRANT ALL ON document_databases TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =====================================================================
-- Vérification rapide
-- =====================================================================
SELECT 'Installation terminée ✅' as status;
SELECT COUNT(*) as nb_fonctions FROM information_schema.routines
WHERE routine_name LIKE '%dynamic%' OR routine_name LIKE '%column%';
