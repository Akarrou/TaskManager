#!/bin/bash
# ===================================================================
# Auto-apply Database Migrations at Container Startup
# ===================================================================
# This script runs as a one-shot service that applies migrations
# every time the stack starts (not just first initialization)
# ===================================================================

set -euo pipefail

echo "🚀 [Migrations] Starting auto-migration service..."

# Wait for PostgreSQL to be fully ready
echo "⏳ [Migrations] Waiting for PostgreSQL to be ready..."
until PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U postgres -d postgres -c "SELECT 1" > /dev/null 2>&1; do
  sleep 2
done

echo "✅ [Migrations] PostgreSQL is ready"

# Check if schema_migrations table exists
TABLE_EXISTS=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U postgres -d postgres -tAc "
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema='public' AND table_name='schema_migrations'
" || echo "0")

if [ "$TABLE_EXISTS" -eq 0 ]; then
  echo "📋 [Migrations] Creating schema_migrations table..."

  PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U postgres -d postgres <<-EOSQL
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id serial PRIMARY KEY,
      version text NOT NULL UNIQUE,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
      checksum text,
      execution_time_ms integer,
      applied_by text DEFAULT current_user
    );

    CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON public.schema_migrations(version);
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON public.schema_migrations(applied_at DESC);

    COMMENT ON TABLE public.schema_migrations IS 'Tracks all applied database migrations with version control';
EOSQL

  echo "✅ [Migrations] schema_migrations table created"
fi

# Apply migrations
MIGRATION_DIR="/migrations"

if [ ! -d "$MIGRATION_DIR" ]; then
  echo "⚠️  [Migrations] Migration directory not found: $MIGRATION_DIR"
  echo "ℹ️  [Migrations] Exiting"
  exit 0
fi

# Count total migrations
TOTAL_MIGRATIONS=$(find "$MIGRATION_DIR" -name "*.sql" -type f | wc -l | tr -d ' ')

if [ "$TOTAL_MIGRATIONS" -eq 0 ]; then
  echo "ℹ️  [Migrations] No migration files found"
  exit 0
fi

echo "📦 [Migrations] Found $TOTAL_MIGRATIONS migration files"

# Apply each migration in order
APPLIED=0
SKIPPED=0
FAILED=0

for migration_file in $(find "$MIGRATION_DIR" -name "*.sql" -type f | sort); do
  migration_name=$(basename "$migration_file")
  version="${migration_name%%_*}"  # Extract YYYYMMDDHHMMSS

  # Check if already applied
  already_applied=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U postgres -d postgres -tAc "
    SELECT COUNT(*) FROM public.schema_migrations WHERE version='$version'
  " | tr -d ' ')

  if [ "$already_applied" -gt 0 ]; then
    echo "⏭️  [Migrations] Skipping: $migration_name (already applied)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "▶️  [Migrations] Applying: $migration_name"

  start_time=$(date +%s)

  if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U postgres -d postgres -f "$migration_file" > /dev/null 2>&1; then
    end_time=$(date +%s)
    execution_time=$(( (end_time - start_time) * 1000 ))

    # Record in schema_migrations
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U postgres -d postgres -tAc "
      INSERT INTO public.schema_migrations (version, name, execution_time_ms)
      VALUES ('$version', '$migration_name', $execution_time)
    " > /dev/null

    echo "   ✅ Success (${execution_time}ms)"
    APPLIED=$((APPLIED + 1))
  else
    echo "   ❌ Failed: $migration_name"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "📊 [Migrations] Summary:"
echo "   ✅ Applied:  $APPLIED"
echo "   ⏭️  Skipped:  $SKIPPED"
echo "   ❌ Failed:   $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "🎉 [Migrations] All migrations completed successfully!"
  exit 0
else
  echo "⚠️  [Migrations] Some migrations failed"
  exit 1
fi
