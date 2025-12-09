
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
CREATE POLICY "Enable all access for authenticated users" ON public.projects FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON public.tasks FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON public.subtasks FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON public.task_comments FOR ALL USING (auth.role() = 'authenticated');

-- Also allow anon read if needed (for initial fetching before login?)
-- But your app seems to require login. 
-- However, for the demo script or public parts:
CREATE POLICY "Enable read access for anon" ON public.projects FOR SELECT USING (true);
CREATE POLICY "Enable read access for anon" ON public.tasks FOR SELECT USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON public.tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON public.subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_task_id ON public.task_comments(task_id);
