-- =====================================================================
-- Script de Vérification Supabase
-- =====================================================================
-- Exécutez ce script dans Supabase SQL Editor pour vérifier l'état
-- de votre installation
-- =====================================================================

-- 1. Vérifier si la table document_databases existe
SELECT
  'Table document_databases' as check_type,
  CASE
    WHEN EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'document_databases'
    )
    THEN '✅ EXISTE'
    ELSE '❌ MANQUANTE - Exécutez supabase-rpc-functions.sql'
  END as status;

-- 2. Vérifier si la table documents existe (prérequis)
SELECT
  'Table documents (prérequis)' as check_type,
  CASE
    WHEN EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'documents'
    )
    THEN '✅ EXISTE'
    ELSE '❌ MANQUANTE - Créez d''abord la table documents'
  END as status;

-- 3. Compter les fonctions RPC créées
SELECT
  'Fonctions RPC' as check_type,
  COUNT(*)::text || ' fonctions trouvées (attendu: 8)' as status
FROM information_schema.routines
WHERE routine_schema = 'public'
AND (
  routine_name = 'create_dynamic_table'
  OR routine_name = 'add_column_to_table'
  OR routine_name = 'delete_column_from_table'
  OR routine_name = 'rename_column_in_table'
  OR routine_name = 'delete_dynamic_table'
  OR routine_name = 'change_column_type'
  OR routine_name = 'update_updated_at_column'
  OR routine_name = 'create_update_trigger'
);

-- 4. Lister les fonctions RPC trouvées
SELECT
  routine_name as fonction_rpc,
  '✅' as status
FROM information_schema.routines
WHERE routine_schema = 'public'
AND (
  routine_name = 'create_dynamic_table'
  OR routine_name = 'add_column_to_table'
  OR routine_name = 'delete_column_from_table'
  OR routine_name = 'rename_column_in_table'
  OR routine_name = 'delete_dynamic_table'
  OR routine_name = 'change_column_type'
  OR routine_name = 'update_updated_at_column'
  OR routine_name = 'create_update_trigger'
)
ORDER BY routine_name;

-- 5. Vérifier les permissions
SELECT
  'Permissions authenticated' as check_type,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE grantee = 'authenticated'
      AND table_name = 'document_databases'
    )
    THEN '✅ CONFIGURÉES'
    ELSE '⚠️ À VÉRIFIER'
  END as status;

-- =====================================================================
-- Résumé
-- =====================================================================
-- Si tous les checks montrent ✅, vous êtes prêt !
-- Sinon, exécutez supabase-rpc-functions.sql
-- =====================================================================
