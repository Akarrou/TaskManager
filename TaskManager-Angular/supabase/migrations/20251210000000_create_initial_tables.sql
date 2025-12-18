-- Migration: Create Initial Database Schema
-- Date: 2025-12-10
-- Description: Creates all main application tables (projects, tasks, subtasks, documents, task_attachments)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create sequence for task numbers
CREATE SEQUENCE IF NOT EXISTS public.tasks_task_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Table: projects
CREATE TABLE IF NOT EXISTS public.projects (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    archived boolean DEFAULT false NOT NULL
);

COMMENT ON TABLE public.projects IS 'Stores project information';
COMMENT ON COLUMN public.projects.archived IS 'Indicates if the project is archived. Archived projects are hidden by default but can be restored.';

-- Table: tasks
CREATE TABLE IF NOT EXISTS public.tasks (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    status text DEFAULT 'pending'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    assigned_to text,
    created_by text,
    due_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at timestamp with time zone,
    tags text[] DEFAULT '{}'::text[],
    slug text,
    prd_slug text,
    estimated_hours numeric,
    actual_hours numeric,
    task_number integer DEFAULT nextval('public.tasks_task_number_seq'::regclass) NOT NULL,
    environment text[] DEFAULT '{}'::text[],
    guideline_refs text[] DEFAULT '{}'::text[],
    type text NOT NULL,
    parent_task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
    epic_id uuid,
    feature_id uuid,
    CONSTRAINT tasks_type_check CHECK ((type = ANY (ARRAY['epic'::text, 'feature'::text, 'task'::text])))
);

COMMENT ON TABLE public.tasks IS 'Stores tasks/features/epics for projects';

-- Table: subtasks
CREATE TABLE IF NOT EXISTS public.subtasks (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    status text DEFAULT 'pending'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    environment text,
    slug text,
    estimated_hours numeric,
    guideline_refs text[] DEFAULT '{}'::text[],
    tags text[] DEFAULT '{}'::text[],
    task_number integer
);

COMMENT ON TABLE public.subtasks IS 'Stores subtasks for tasks';

-- Table: task_attachments
CREATE TABLE IF NOT EXISTS public.task_attachments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_type text,
    file_size numeric,
    uploaded_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.task_attachments IS 'Stores file attachments for tasks';

-- Table: documents
CREATE TABLE IF NOT EXISTS public.documents (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    title text DEFAULT 'Sans titre'::text NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    parent_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
    project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.documents IS 'Stores documents with hierarchical structure';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON public.tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON public.subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON public.task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_documents_parent_id ON public.documents(parent_id);
CREATE INDEX IF NOT EXISTS idx_documents_project_id ON public.documents(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_archived ON public.projects(archived);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for projects
CREATE POLICY "Users can view all projects" ON public.projects FOR SELECT USING (true);
CREATE POLICY "Users can create projects" ON public.projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update all projects" ON public.projects FOR UPDATE USING (true);

-- RLS Policies for tasks
CREATE POLICY "Users can view all tasks" ON public.tasks FOR SELECT USING (true);
CREATE POLICY "Users can create tasks" ON public.tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update all tasks" ON public.tasks FOR UPDATE USING (true);
CREATE POLICY "Users can delete all tasks" ON public.tasks FOR DELETE USING (true);

-- RLS Policies for subtasks
CREATE POLICY "Users can view all subtasks" ON public.subtasks FOR SELECT USING (true);
CREATE POLICY "Users can create subtasks" ON public.subtasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update all subtasks" ON public.subtasks FOR UPDATE USING (true);
CREATE POLICY "Users can delete all subtasks" ON public.subtasks FOR DELETE USING (true);

-- RLS Policies for task_attachments
CREATE POLICY "Users can view all attachments" ON public.task_attachments FOR SELECT USING (true);
CREATE POLICY "Users can create attachments" ON public.task_attachments FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can delete all attachments" ON public.task_attachments FOR DELETE USING (true);

-- RLS Policies for documents
CREATE POLICY "Users can view own documents" ON public.documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own documents" ON public.documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own documents" ON public.documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own documents" ON public.documents FOR DELETE USING (auth.uid() = user_id);
