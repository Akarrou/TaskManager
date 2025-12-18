-- Migration: Update RLS Policies for Tasks, Subtasks, and Attachments
-- Date: 2025-12-12
-- Description: Updates RLS policies to restrict access based on project membership

-- Drop existing permissive RLS policies for tasks
DROP POLICY IF EXISTS "Users can view all tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can create tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can update all tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can delete all tasks" ON public.tasks;

-- New RLS Policies for tasks (project-based access)
CREATE POLICY "Users can view tasks from their projects"
ON public.tasks FOR SELECT
USING (
    user_has_project_access(project_id, auth.uid())
);

CREATE POLICY "Users can create tasks in their projects"
ON public.tasks FOR INSERT
WITH CHECK (
    user_has_project_access(project_id, auth.uid())
);

CREATE POLICY "Users can update tasks in their projects"
ON public.tasks FOR UPDATE
USING (
    user_has_project_access(project_id, auth.uid())
);

CREATE POLICY "Users can delete tasks in their projects"
ON public.tasks FOR DELETE
USING (
    user_has_project_access(project_id, auth.uid())
);

-- Drop existing permissive RLS policies for subtasks
DROP POLICY IF EXISTS "Users can view all subtasks" ON public.subtasks;
DROP POLICY IF EXISTS "Users can create subtasks" ON public.subtasks;
DROP POLICY IF EXISTS "Users can update all subtasks" ON public.subtasks;
DROP POLICY IF EXISTS "Users can delete all subtasks" ON public.subtasks;

-- New RLS Policies for subtasks (via parent task's project)
CREATE POLICY "Users can view subtasks from their projects"
ON public.subtasks FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_id
        AND user_has_project_access(t.project_id, auth.uid())
    )
);

CREATE POLICY "Users can create subtasks in their projects"
ON public.subtasks FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_id
        AND user_has_project_access(t.project_id, auth.uid())
    )
);

CREATE POLICY "Users can update subtasks in their projects"
ON public.subtasks FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_id
        AND user_has_project_access(t.project_id, auth.uid())
    )
);

CREATE POLICY "Users can delete subtasks in their projects"
ON public.subtasks FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_id
        AND user_has_project_access(t.project_id, auth.uid())
    )
);

-- Drop existing permissive RLS policies for task_attachments
DROP POLICY IF EXISTS "Users can view all attachments" ON public.task_attachments;
DROP POLICY IF EXISTS "Users can create attachments" ON public.task_attachments;
DROP POLICY IF EXISTS "Users can delete all attachments" ON public.task_attachments;

-- New RLS Policies for task_attachments (via parent task's project)
CREATE POLICY "Users can view attachments from their projects"
ON public.task_attachments FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_id
        AND user_has_project_access(t.project_id, auth.uid())
    )
);

CREATE POLICY "Users can create attachments in their projects"
ON public.task_attachments FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_id
        AND user_has_project_access(t.project_id, auth.uid())
    )
);

CREATE POLICY "Users can delete attachments in their projects"
ON public.task_attachments FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_id
        AND user_has_project_access(t.project_id, auth.uid())
    )
);
