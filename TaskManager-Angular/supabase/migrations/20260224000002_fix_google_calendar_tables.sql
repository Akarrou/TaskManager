-- Migration: Fix Google Calendar Tables
-- Date: 2026-02-24
-- Description: Apply corrections from code review (M4)

-- M4: Drop redundant index (user_id already has UNIQUE constraint)
DROP INDEX IF EXISTS idx_gc_connections_user_id;
