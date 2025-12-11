#!/bin/bash

echo "==========================================================================="
echo "🧹 Nettoyage de TOUTES les bases de données orphelines"
echo "==========================================================================="
echo ""

DOCUMENT_ID="8d56a287-3623-4166-b248-3bcb34403004"

echo "⚠️  ATTENTION: Cette opération va supprimer TOUTES les bases de données"
echo "   pour le document $DOCUMENT_ID"
echo ""
echo "Bases qui seront supprimées:"
docker exec supabase-db psql -U postgres -d postgres -c "SELECT database_id, table_name FROM document_databases WHERE document_id = '$DOCUMENT_ID';"
echo ""

read -p "Voulez-vous continuer? (oui/non) " -n 3 -r
echo
if [[ ! $REPLY =~ ^[Oo][Uu][Ii]$ ]]
then
    echo "❌ Annulé"
    exit 1
fi

echo ""
echo "🗑️  Suppression en cours..."
echo ""

docker exec supabase-db psql -U postgres -d postgres <<EOF
DO \$\$
DECLARE
  db_record RECORD;
BEGIN
  -- Drop all dynamic tables for this document
  FOR db_record IN
    SELECT table_name, database_id
    FROM document_databases
    WHERE document_id = '$DOCUMENT_ID'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', db_record.table_name);
    RAISE NOTICE 'Dropped table: % (database_id: %)', db_record.table_name, db_record.database_id;
  END LOOP;

  -- Delete all metadata records
  DELETE FROM document_databases
  WHERE document_id = '$DOCUMENT_ID';

  RAISE NOTICE 'Deleted all metadata records for document $DOCUMENT_ID';
END
\$\$;
EOF

echo ""
echo "✅ Vérification du nettoyage:"
docker exec supabase-db psql -U postgres -d postgres -c "SELECT COUNT(*) as remaining_databases FROM document_databases WHERE document_id = '$DOCUMENT_ID';"

echo ""
echo "==========================================================================="
echo "✅ Nettoyage terminé!"
echo "==========================================================================="
echo ""
echo "💡 Prochaines étapes:"
echo "   1. Rafraîchir votre navigateur (F5)"
echo "   2. L'application va créer une nouvelle base avec le code corrigé"
echo "   3. Cette fois, le databaseId sera correctement sauvegardé dans le document"
echo ""
