#!/bin/bash

echo "==========================================================================="
echo "📊 Liste des bases de données pour le document"
echo "==========================================================================="
echo ""

# Document ID from the error logs
DOCUMENT_ID="8d56a287-3623-4166-b248-3bcb34403004"

echo "Document ID: $DOCUMENT_ID"
echo ""

# List all databases for this document
echo "Bases de données enregistrées dans document_databases:"
echo "----------------------------------------------------------------------"
docker exec supabase-db psql -U postgres -d postgres <<EOF
SELECT
  database_id,
  table_name,
  name,
  created_at::timestamp(0) as created
FROM document_databases
WHERE document_id = '$DOCUMENT_ID'
ORDER BY created_at DESC;
EOF

echo ""
echo "----------------------------------------------------------------------"
echo "Tables dynamiques existantes dans PostgreSQL:"
echo "----------------------------------------------------------------------"
docker exec supabase-db psql -U postgres -d postgres <<EOF
SELECT
  schemaname,
  tablename,
  tableowner
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'database_%'
ORDER BY tablename;
EOF

echo ""
echo "==========================================================================="
echo "💡 Pour nettoyer les bases orphelines, exécutez:"
echo "   ./cleanup-orphan-databases.sh"
echo "==========================================================================="
