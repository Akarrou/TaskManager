-- =====================================================================
-- FORCER LE RAFRAÎCHISSEMENT DU CACHE PostgREST
-- =====================================================================
-- Ce script envoie un signal NOTIFY à PostgREST pour forcer le
-- rafraîchissement immédiat du cache du schéma
-- =====================================================================

-- Envoyer le signal de rafraîchissement à PostgREST
NOTIFY pgrst, 'reload schema';

-- Message de confirmation
SELECT 'Signal NOTIFY envoyé à PostgREST - Le cache devrait se rafraîchir dans quelques secondes' as status;

-- Vérifier que les fonctions existent toujours
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
  'create_dynamic_table',
  'add_column_to_table',
  'delete_column_from_table',
  'delete_dynamic_table',
  'create_update_trigger',
  'update_updated_at_column'
)
ORDER BY routine_name;
