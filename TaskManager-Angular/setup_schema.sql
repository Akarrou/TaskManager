
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tasks Table
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT NOT NULL DEFAULT 'medium',
    
    assigned_to TEXT, -- Could be UUID if linking to auth.users, keeping flexible as text for now
    created_by TEXT,
    
    due_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    tags TEXT[] DEFAULT '{}',
    slug TEXT,
    prd_slug TEXT,
    
    estimated_hours NUMERIC,
    actual_hours NUMERIC,
    task_number SERIAL, -- Auto-incrementing number
    
    environment TEXT[] DEFAULT '{}',
    guideline_refs TEXT[] DEFAULT '{}',
    
    type TEXT NOT NULL CHECK (type IN ('epic', 'feature', 'task')),
    parent_task_id UUID REFERENCES public.tasks(id),
    
    epic_id UUID, -- Optional loose link
    feature_id UUID -- Optional loose link
);

-- 3. Subtasks Table
CREATE TABLE IF NOT EXISTS public.subtasks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT NOT NULL DEFAULT 'medium',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    environment TEXT, -- Enum in TS, text here
    slug TEXT,
    estimated_hours NUMERIC,
    guideline_refs TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    task_number INTEGER
);

-- 4. Task Comments Table
CREATE TABLE IF NOT EXISTS public.task_comments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id), -- Assuming linked to authenticated user
    comment TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Enable RLS (Row Level Security) - permissive for development
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

-- Policy to allow all access for authenticated users (adjust as needed for anon)
-- Policy to allow all access for authenticated users (adjust as needed for anon)
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.projects;
CREATE POLICY "Enable all access for authenticated users" ON public.projects FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.tasks;
CREATE POLICY "Enable all access for authenticated users" ON public.tasks FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.subtasks;
CREATE POLICY "Enable all access for authenticated users" ON public.subtasks FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.task_comments;
CREATE POLICY "Enable all access for authenticated users" ON public.task_comments FOR ALL USING (auth.role() = 'authenticated');

-- Also allow anon read if needed (for initial fetching before login?)
-- But your app seems to require login. 
-- However, for the demo script or public parts:
DROP POLICY IF EXISTS "Enable read access for anon" ON public.projects;
CREATE POLICY "Enable read access for anon" ON public.projects FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable read access for anon" ON public.tasks;
CREATE POLICY "Enable read access for anon" ON public.tasks FOR SELECT USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON public.tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON public.subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_task_id ON public.task_comments(task_id);

-- 6. RPC Function to get all users (for assigning tasks)
-- Accesses auth.users, so needs SECURITY DEFINER to bypass RLS on auth.users (which is usually restricted)
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE (
  id uuid,
  email varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT auth.users.id, auth.users.email::varchar
  FROM auth.users;
END;
$$;

-- 7. Task Attachments Table
CREATE TABLE IF NOT EXISTS public.task_attachments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT,
    file_size NUMERIC,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Enable RLS for Attachments
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.task_attachments;
CREATE POLICY "Enable all access for authenticated users" ON public.task_attachments FOR ALL USING (auth.role() = 'authenticated');

-- 9. Public Users View (for joining with comments/tasks safe access)
-- note: this view exposes email. Ensure this is acceptable for your app privacy.
CREATE OR REPLACE VIEW public.public_users AS
SELECT id, email
FROM auth.users;

-- 10. Storage Bucket Setup (Idempotent-ish)
-- Note: 'storage' schema is usually managed by Supabase internals, but we can try inserting if missing.
-- This might need to be run in the SQL editor specifically or configured via UI if script fails on permissions.
INSERT INTO storage.buckets (id, name, public)
SELECT 'task-attachments', 'task-attachments', true
WHERE NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'task-attachments'
);

-- Policies for storage objects
DROP POLICY IF EXISTS "Give users access to own folder 1ok12a_0" ON storage.objects;
CREATE POLICY "Give users access to own folder 1ok12a_0" ON storage.objects FOR SELECT TO public USING (bucket_id = 'task-attachments');

DROP POLICY IF EXISTS "Give users access to own folder 1ok12a_1" ON storage.objects;
CREATE POLICY "Give users access to own folder 1ok12a_1" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'task-attachments');

DROP POLICY IF EXISTS "Give users access to own folder 1ok12a_2" ON storage.objects;
CREATE POLICY "Give users access to own folder 1ok12a_2" ON storage.objects FOR DELETE TO public USING (bucket_id = 'task-attachments');

-- 11. Seed Data (Optional but recommended)
-- Ensure at least one project exists to avoid FK errors on Task creation
INSERT INTO public.projects (id, name, description)
SELECT '550e8400-e29b-41d4-a716-446655440000', 'Projet Principal', 'Projet par défaut généré automatiquement'
WHERE NOT EXISTS (
    SELECT 1 FROM public.projects LIMIT 1
);
