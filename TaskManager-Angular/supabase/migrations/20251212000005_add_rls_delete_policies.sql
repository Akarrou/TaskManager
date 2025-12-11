-- Migration: Add RLS DELETE policies for tasks and related tables
-- Description: Enables authenticated users to delete tasks, subtasks, and attachments
-- Date: 2025-12-12
-- Issue: Task deletion was failing silently due to missing RLS DELETE policies

-- Tasks: Allow authenticated users to delete any task
CREATE POLICY "Enable delete for authenticated users only" ON public.tasks
  FOR DELETE USING (auth.role() = 'authenticated');

-- Subtasks: Allow authenticated users to delete any subtask
CREATE POLICY "Enable delete for authenticated users only" ON public.subtasks
  FOR DELETE USING (auth.role() = 'authenticated');

-- Task Attachments: Allow authenticated users to delete any attachment
CREATE POLICY "Enable delete for authenticated users only" ON public.task_attachments
  FOR DELETE USING (auth.role() = 'authenticated');

-- Comment
COMMENT ON POLICY "Enable delete for authenticated users only" ON public.tasks IS
'Allows authenticated users to delete tasks. This maintains consistency with INSERT and UPDATE policies which also use auth.role() = authenticated.';

COMMENT ON POLICY "Enable delete for authenticated users only" ON public.subtasks IS
'Allows authenticated users to delete subtasks. Maintains consistency with other CRUD operations.';

COMMENT ON POLICY "Enable delete for authenticated users only" ON public.task_attachments IS
'Allows authenticated users to delete task attachments. Maintains consistency with other CRUD operations.';
