-- =====================================================================
-- DIAGNOSTIC COMPLET - Système Base de Données
-- =====================================================================
-- Exécutez ce script dans Supabase SQL Editor pour diagnostiquer
-- l'état de votre installation
-- =====================================================================

-- 1️⃣ Vérifier si la table document_databases existe
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'document_databases'
  ) THEN
    RAISE NOTICE '✅ Table document_databases EXISTE';
  ELSE
    RAISE NOTICE '❌ Table document_databases MANQUANTE - Le script n''a PAS été exécuté';
  END IF;
END $$;

-- 2️⃣ Compter les fonctions RPC
DO $$
DECLARE
  func_count INT;
BEGIN
  SELECT COUNT(*) INTO func_count
  FROM information_schema.routines
  WHERE routine_schema = 'public'
  AND routine_name IN (
    'create_dynamic_table',
    'add_column_to_table',
    'delete_column_from_table',
    'delete_dynamic_table',
    'create_update_trigger',
    'update_updated_at_column'
  );

  IF func_count = 6 THEN
    RAISE NOTICE '✅ Toutes les fonctions RPC existent (6/6)';
  ELSIF func_count > 0 THEN
    RAISE NOTICE '⚠️  Seulement % fonctions RPC trouvées (attendu: 6)', func_count;
  ELSE
    RAISE NOTICE '❌ AUCUNE fonction RPC trouvée - Le script n''a PAS été exécuté';
  END IF;
END $$;

-- 3️⃣ Lister les fonctions trouvées
SELECT
  '📋 Fonctions RPC détectées:' as info,
  routine_name as fonction
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

-- 4️⃣ Vérifier les permissions
SELECT
  '🔐 Permissions:' as info,
  grantee as utilisateur,
  privilege_type as permission
FROM information_schema.role_table_grants
WHERE table_name = 'document_databases'
AND grantee = 'authenticated'
LIMIT 1;

-- =====================================================================
-- RÉSUMÉ
-- =====================================================================
DO $$
DECLARE
  table_exists BOOLEAN;
  func_count INT;
BEGIN
  -- Vérifier table
  SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'document_databases'
  ) INTO table_exists;

  -- Compter fonctions
  SELECT COUNT(*) INTO func_count
  FROM information_schema.routines
  WHERE routine_schema = 'public'
  AND routine_name IN (
    'create_dynamic_table',
    'add_column_to_table',
    'delete_column_from_table',
    'delete_dynamic_table',
    'create_update_trigger',
    'update_updated_at_column'
  );

  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════';
  RAISE NOTICE '           RÉSUMÉ DU DIAGNOSTIC';
  RAISE NOTICE '═══════════════════════════════════════';

  IF table_exists AND func_count = 6 THEN
    RAISE NOTICE '🎉 Installation COMPLÈTE et FONCTIONNELLE';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Table document_databases: OK';
    RAISE NOTICE '✅ Fonctions RPC: 6/6';
    RAISE NOTICE '';
    RAISE NOTICE '➡️  Vous pouvez utiliser le système de base de données';
    RAISE NOTICE '    Retournez dans l''application et tapez "/" → "Base de données"';
  ELSIF NOT table_exists AND func_count = 0 THEN
    RAISE NOTICE '❌ Installation ABSENTE';
    RAISE NOTICE '';
    RAISE NOTICE '❌ Table document_databases: MANQUANTE';
    RAISE NOTICE '❌ Fonctions RPC: 0/6';
    RAISE NOTICE '';
    RAISE NOTICE '➡️  ACTION REQUISE: Exécutez SIMPLE_SETUP.sql';
    RAISE NOTICE '    1. Ouvrez une nouvelle query dans SQL Editor';
    RAISE NOTICE '    2. Copiez TOUT le contenu de SIMPLE_SETUP.sql';
    RAISE NOTICE '    3. Collez et cliquez RUN';
  ELSE
    RAISE NOTICE '⚠️  Installation PARTIELLE';
    RAISE NOTICE '';
    IF table_exists THEN
      RAISE NOTICE '✅ Table document_databases: OK';
    ELSE
      RAISE NOTICE '❌ Table document_databases: MANQUANTE';
    END IF;
    RAISE NOTICE '⚠️  Fonctions RPC: %/6', func_count;
    RAISE NOTICE '';
    RAISE NOTICE '➡️  ACTION REQUISE: Réexécutez SIMPLE_SETUP.sql';
  END IF;

  RAISE NOTICE '═══════════════════════════════════════';
END $$;
