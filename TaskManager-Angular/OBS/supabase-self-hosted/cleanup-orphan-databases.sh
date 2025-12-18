#!/bin/bash

echo "=========================================================================="
echo "🧹 Cleaning up orphan databases"
echo "=========================================================================="
echo ""

docker exec supabase-db psql -U postgres -d postgres <<'EOF'
DO $
BEGIN
  -- Drop all dynamic tables for this document
  FOR r IN
    SELECT table_name
    FROM document_databases
    WHERE document_id = '8d56a287-3623-4166-b248-3bcb34403004'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', r.table_name);
    RAISE NOTICE 'Dropped table: %', r.table_name;
  END LOOP;

  -- Delete all metadata records
  DELETE FROM document_databases
  WHERE document_id = '8d56a287-3623-4166-b248-3bcb34403004';

  RAISE NOTICE 'Deleted all metadata records';
END
$;

-- Verify cleanup
SELECT COUNT(*) as remaining_databases
FROM document_databases
WHERE document_id = '8d56a287-3623-4166-b248-3bcb34403004';
EOF

echo ""
echo "=========================================================================="
echo "✅ Cleanup complete!"
echo "=========================================================================="
echo ""
echo "Next steps:"
echo "1. Refresh your browser"
echo "2. The database will be created fresh with the new code fix"
echo ""
