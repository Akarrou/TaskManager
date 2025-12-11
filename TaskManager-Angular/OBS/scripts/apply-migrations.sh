#!/bin/bash
set -euo pipefail

# Configuration
MIGRATION_DIR="../supabase/migrations"
DB_CONTAINER="supabase-db"
DB_USER="postgres"
DB_NAME="postgres"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== 🚀 Application des Migrations Supabase ==="
echo ""

# Check if schema_migrations table exists, create it if not
echo "📋 Vérification table schema_migrations..."
table_exists=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -t -c "
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema='public' AND table_name='schema_migrations'
" | xargs)

if [ "$table_exists" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  Table schema_migrations manquante, création en cours...${NC}"

  # Apply the schema_migrations table creation migration first
  schema_migration_file="$MIGRATION_DIR/20251210235959_create_schema_migrations_table.sql"

  if [ -f "$schema_migration_file" ]; then
    docker exec -i $DB_CONTAINER psql -U $DB_USER -d $DB_NAME < "$schema_migration_file" > /dev/null 2>&1
    echo -e "${GREEN}✓ Table schema_migrations créée${NC}"
  else
    echo -e "${RED}❌ Fichier de migration schema_migrations introuvable: $schema_migration_file${NC}"
    exit 1
  fi
else
  echo -e "${GREEN}✓ Table schema_migrations présente${NC}"
fi
echo ""

# Get list of migrations sorted by version
migrations=$(ls -1 $MIGRATION_DIR/*.sql | sort -V)

applied_count=0
skipped_count=0
failed_count=0

for migration_file in $migrations; do
  migration_name=$(basename "$migration_file")
  version="${migration_name%%_*}" # Extract YYYYMMDDHHMMSS

  # Check if already applied
  already_applied=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -t -c "
    SELECT COUNT(*) FROM public.schema_migrations WHERE version='$version'
  " | xargs)

  if [ "$already_applied" -gt 0 ]; then
    echo -e "${YELLOW}⏭️  Skipping: $migration_name (already applied)${NC}"
    ((skipped_count++))
    continue
  fi

  echo "▶️  Applying: $migration_name"

  start_time=$(date +%s)

  if docker exec -i $DB_CONTAINER psql -U $DB_USER -d $DB_NAME < "$migration_file" > /dev/null 2>&1; then
    end_time=$(date +%s)
    execution_time=$(((end_time - start_time) * 1000))

    # Record in schema_migrations
    docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
      INSERT INTO public.schema_migrations (version, name, execution_time_ms)
      VALUES ('$version', '$migration_name', $execution_time)
    " > /dev/null

    echo -e "${GREEN}   ✓ Success ($execution_time ms)${NC}"
    ((applied_count++))
  else
    echo -e "${RED}   ✗ Failed${NC}"
    echo "Migration $migration_name a échoué. Arrêt de l'application."
    ((failed_count++))
    exit 1
  fi

  echo ""
done

echo "=== 📊 Résumé ==="
echo -e "${GREEN}✓ Appliquées: $applied_count${NC}"
echo -e "${YELLOW}⏭ Ignorées: $skipped_count${NC}"
echo -e "${RED}✗ Échecs: $failed_count${NC}"
echo ""

if [ $failed_count -eq 0 ]; then
  echo -e "${GREEN}🎉 Toutes les migrations ont été appliquées avec succès !${NC}"
else
  echo -e "${RED}❌ Des migrations ont échoué. Consultez les logs ci-dessus.${NC}"
  exit 1
fi
