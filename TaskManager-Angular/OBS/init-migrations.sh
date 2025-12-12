#!/bin/bash
# ===================================================================
# Auto-apply Database Migrations at Container Startup
# ===================================================================
# This script runs automatically when PostgreSQL container starts
# It applies all pending migrations from /migrations directory
# ===================================================================

set -euo pipefail

echo "🚀 [Auto-Migrations] Starting migration check..."

# Wait for PostgreSQL to be ready
until pg_isready -U postgres -h localhost; do
  echo "⏳ [Auto-Migrations] Waiting for PostgreSQL to be ready..."
  sleep 2
done

echo "✅ [Auto-Migrations] PostgreSQL is ready"

# Check if schema_migrations table exists
TABLE_EXISTS=$(psql -U postgres -d postgres -tAc "
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema='public' AND table_name='schema_migrations'
")

if [ "$TABLE_EXISTS" -eq 0 ]; then
  echo "📋 [Auto-Migrations] Creating schema_migrations table..."

  # Create schema_migrations table
  psql -U postgres -d postgres <<-EOSQL
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

  echo "✅ [Auto-Migrations] schema_migrations table created"
fi

# Apply migrations
MIGRATION_DIR="/migrations"

if [ ! -d "$MIGRATION_DIR" ]; then
  echo "⚠️  [Auto-Migrations] Migration directory not found: $MIGRATION_DIR"
  echo "ℹ️  [Auto-Migrations] Skipping migration application"
  exit 0
fi

# Count total migrations
TOTAL_MIGRATIONS=$(find "$MIGRATION_DIR" -name "*.sql" -type f | wc -l | xargs)

if [ "$TOTAL_MIGRATIONS" -eq 0 ]; then
  echo "ℹ️  [Auto-Migrations] No migration files found"
  exit 0
fi

echo "📦 [Auto-Migrations] Found $TOTAL_MIGRATIONS migration files"

# Apply each migration in order
APPLIED=0
SKIPPED=0
FAILED=0

for migration_file in $(find "$MIGRATION_DIR" -name "*.sql" -type f | sort); do
  migration_name=$(basename "$migration_file")
  version="${migration_name%%_*}"  # Extract YYYYMMDDHHMMSS

  # Check if already applied
  already_applied=$(psql -U postgres -d postgres -tAc "
    SELECT COUNT(*) FROM public.schema_migrations WHERE version='$version'
  " | xargs)

  if [ "$already_applied" -gt 0 ]; then
    echo "⏭️  [Auto-Migrations] Skipping: $migration_name (already applied)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "▶️  [Auto-Migrations] Applying: $migration_name"

  start_time=$(date +%s)

  if psql -U postgres -d postgres -f "$migration_file" > /dev/null 2>&1; then
    end_time=$(date +%s)
    execution_time=$(( (end_time - start_time) * 1000 ))

    # Record in schema_migrations
    psql -U postgres -d postgres -tAc "
      INSERT INTO public.schema_migrations (version, name, execution_time_ms)
      VALUES ('$version', '$migration_name', $execution_time)
    " > /dev/null

    echo "   ✅ Success (${execution_time}ms)"
    APPLIED=$((APPLIED + 1))
  else
    echo "   ❌ Failed: $migration_name"
    FAILED=$((FAILED + 1))
    # Don't exit, continue with next migrations
  fi
done

echo ""
echo "📊 [Auto-Migrations] Summary:"
echo "   ✅ Applied:  $APPLIED"
echo "   ⏭️  Skipped:  $SKIPPED"
echo "   ❌ Failed:   $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "🎉 [Auto-Migrations] All migrations completed successfully!"
else
  echo "⚠️  [Auto-Migrations] Some migrations failed (see logs above)"
  exit 1
fi
