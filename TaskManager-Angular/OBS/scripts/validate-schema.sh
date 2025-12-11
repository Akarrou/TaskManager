#!/bin/bash
set -euo pipefail

DB_CONTAINER="supabase-db"
DB_USER="postgres"
DB_NAME="postgres"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== 🔍 Validation du Schéma PostgreSQL ==="
echo ""

echo "📋 1. Tables Publiques"
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "\dt public.*"
echo ""

echo "🔧 2. Fonctions RPC"
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
  SELECT routine_name, routine_type
  FROM information_schema.routines
  WHERE routine_schema='public'
  ORDER BY routine_name;
"
echo ""

echo "🔒 3. RLS Policies"
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
  SELECT tablename, COUNT(*) as policy_count
  FROM pg_policies
  WHERE schemaname='public'
  GROUP BY tablename
  ORDER BY tablename;
"
echo ""

echo "📊 4. Migrations Appliquées"
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
  SELECT version, name, applied_at, execution_time_ms
  FROM public.schema_migrations
  ORDER BY version DESC
  LIMIT 10;
"
echo ""

echo "🏗️ 5. Structure Table Projects (avec archived)"
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='projects'
  ORDER BY ordinal_position;
"
echo ""

echo "📄 6. Structure Table Documents (avec project_id)"
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='documents'
  ORDER BY ordinal_position;
"
echo ""

echo -e "${GREEN}✓ Validation terminée${NC}"
