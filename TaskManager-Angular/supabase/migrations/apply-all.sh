#!/bin/bash
# Script pour appliquer toutes les migrations Supabase dans l'ordre

set -e  # Exit on error

MIGRATIONS_DIR="$(dirname "$0")"

echo "🚀 Application des migrations Supabase..."
echo ""

# Liste des migrations dans l'ordre
migrations=(
  "20251211000000_add_update_updated_at_helper.sql"
  "20251211000001_add_add_column_to_table.sql"
  "20251211000002_add_delete_column_from_table.sql"
  "20251211000003_add_ensure_table_exists.sql"
  "20251211000004_add_bulk_insert_rows.sql"
  "20251211000005_add_delete_database_cascade.sql"
)

for migration in "${migrations[@]}"; do
  echo "📝 Application de: $migration"

  if [ ! -f "$MIGRATIONS_DIR/$migration" ]; then
    echo "❌ Fichier non trouvé: $migration"
    exit 1
  fi

  # Appliquer via CLI Supabase (nécessite supabase CLI installé)
  supabase db execute --file "$MIGRATIONS_DIR/$migration"

  echo "✅ $migration appliquée avec succès"
  echo ""
done

echo "🎉 Toutes les migrations ont été appliquées avec succès!"
echo ""
echo "Vérification des fonctions RPC..."
supabase db execute --sql "
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'update_updated_at_column',
    'add_column_to_table',
    'delete_column_from_table',
    'ensure_table_exists',
    'bulk_insert_rows',
    'delete_database_cascade'
  )
ORDER BY routine_name;
"
