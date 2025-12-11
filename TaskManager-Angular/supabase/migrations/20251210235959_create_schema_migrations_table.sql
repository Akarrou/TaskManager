-- Infrastructure: Schema Migrations Tracking Table
-- Date: 2025-12-10
-- Description: Track applied database migrations with timestamps

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id serial PRIMARY KEY,
  version text NOT NULL UNIQUE,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  checksum text,
  execution_time_ms integer,
  applied_by text DEFAULT current_user
);

-- Index for fast version lookups
CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON public.schema_migrations(version);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON public.schema_migrations(applied_at DESC);

-- Comments
COMMENT ON TABLE public.schema_migrations IS 'Tracks all applied database migrations with version control';
COMMENT ON COLUMN public.schema_migrations.version IS 'Migration version in format YYYYMMDDHHMMSS';
COMMENT ON COLUMN public.schema_migrations.checksum IS 'Optional MD5 checksum of migration file for integrity verification';
