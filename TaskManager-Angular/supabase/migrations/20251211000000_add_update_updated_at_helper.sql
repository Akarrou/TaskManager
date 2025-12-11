-- Migration: Add update_updated_at_column helper function
-- Description: Helper function utilisée par tous les triggers updated_at
-- IMPORTANT: Cette migration DOIT être exécutée en premier (prerequis pour toutes les autres)

DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_updated_at_column IS
'Helper function pour les triggers qui mettent à jour automatiquement updated_at. Cette fonction est appelée par les triggers créés sur les tables dynamiques database_*.';
