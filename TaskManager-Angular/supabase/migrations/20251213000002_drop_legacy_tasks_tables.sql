-- Migration: Drop legacy tasks tables
-- Description: Remove obsolete task management system tables
-- The new system uses document_databases with type='task' instead

-- ⚠️ WARNING: This migration will permanently delete the following tables:
-- - tasks (legacy task management)
-- - subtasks (legacy subtask management)
-- - task_comments (legacy task comments)
--
-- Make sure you have backed up any important data before running this migration!

-- Drop dependent tables first (foreign key constraints)
DROP TABLE IF EXISTS task_comments CASCADE;
DROP TABLE IF EXISTS subtasks CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;

-- Drop any related functions or triggers (if they exist)
DROP FUNCTION IF EXISTS get_legacy_task_stats() CASCADE;
DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks CASCADE;

-- Add a comment to document this migration
COMMENT ON SCHEMA public IS 'Legacy tasks tables removed on 2025-12-13. New task system uses document_databases with type=''task''.';
