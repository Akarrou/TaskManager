-- =====================================================
-- TaskManager Database Schema
-- Complete database creation script
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: projects
-- =====================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT projects_pkey PRIMARY KEY (id)
);

-- =====================================================
-- TABLE: tasks
-- =====================================================
-- Create sequence for task_number
CREATE SEQUENCE IF NOT EXISTS tasks_task_number_seq;

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  project_id uuid,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending'::text,
  priority text NOT NULL DEFAULT 'medium'::text,
  assigned_to text,
  created_by text,
  due_date timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at timestamp with time zone,
  tags text[] DEFAULT '{}'::text[],
  slug text,
  prd_slug text,
  estimated_hours numeric,
  actual_hours numeric,
  task_number integer NOT NULL DEFAULT nextval('tasks_task_number_seq'::regclass),
  environment text[] DEFAULT '{}'::text[],
  guideline_refs text[] DEFAULT '{}'::text[],
  type text NOT NULL CHECK (type = ANY (ARRAY['epic'::text, 'feature'::text, 'task'::text])),
  parent_task_id uuid,
  epic_id uuid,
  feature_id uuid,
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT tasks_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

-- =====================================================
-- TABLE: subtasks
-- =====================================================
CREATE TABLE IF NOT EXISTS public.subtasks (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  task_id uuid,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending'::text,
  priority text NOT NULL DEFAULT 'medium'::text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  environment text,
  slug text,
  estimated_hours numeric,
  guideline_refs text[] DEFAULT '{}'::text[],
  tags text[] DEFAULT '{}'::text[],
  task_number integer,
  CONSTRAINT subtasks_pkey PRIMARY KEY (id),
  CONSTRAINT subtasks_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

-- =====================================================
-- TABLE: task_comments
-- =====================================================
CREATE TABLE IF NOT EXISTS public.task_comments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  task_id uuid,
  user_id uuid,
  comment text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT task_comments_pkey PRIMARY KEY (id),
  CONSTRAINT task_comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE,
  CONSTRAINT task_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- =====================================================
-- TABLE: task_attachments
-- =====================================================
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  task_id uuid,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size numeric,
  uploaded_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT task_attachments_pkey PRIMARY KEY (id),
  CONSTRAINT task_attachments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

-- =====================================================
-- TABLE: documents
-- =====================================================
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  title text NOT NULL DEFAULT 'Sans titre'::text,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  parent_id uuid,
  CONSTRAINT documents_pkey PRIMARY KEY (id),
  CONSTRAINT documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT documents_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.documents(id) ON DELETE CASCADE
);

-- =====================================================
-- TABLE: document_task_relations
-- =====================================================
CREATE TABLE IF NOT EXISTS public.document_task_relations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  document_id uuid NOT NULL,
  task_id uuid NOT NULL,
  relation_type text NOT NULL DEFAULT 'linked'::text CHECK (relation_type = ANY (ARRAY['linked'::text, 'embedded'::text])),
  position_in_document integer,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by uuid,
  CONSTRAINT document_task_relations_pkey PRIMARY KEY (id),
  CONSTRAINT document_task_relations_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE,
  CONSTRAINT document_task_relations_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE,
  CONSTRAINT document_task_relations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- =====================================================
-- TABLE: document_databases
-- =====================================================
CREATE TABLE IF NOT EXISTS public.document_databases (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  document_id uuid,
  database_id text NOT NULL UNIQUE,
  table_name text NOT NULL UNIQUE,
  name text NOT NULL,
  config jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT document_databases_pkey PRIMARY KEY (id),
  CONSTRAINT document_databases_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE
);

-- =====================================================
-- INDEXES
-- =====================================================
-- Indexes for tasks
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON public.tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_epic_id ON public.tasks(epic_id);
CREATE INDEX IF NOT EXISTS idx_tasks_feature_id ON public.tasks(feature_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON public.tasks(type);

-- Indexes for subtasks
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON public.subtasks(task_id);

-- Indexes for task_comments
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON public.task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_user_id ON public.task_comments(user_id);

-- Indexes for task_attachments
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON public.task_attachments(task_id);

-- Indexes for documents
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_parent_id ON public.documents(parent_id);

-- Indexes for document_task_relations
CREATE INDEX IF NOT EXISTS idx_document_task_relations_document_id ON public.document_task_relations(document_id);
CREATE INDEX IF NOT EXISTS idx_document_task_relations_task_id ON public.document_task_relations(task_id);

-- Indexes for document_databases
CREATE INDEX IF NOT EXISTS idx_document_databases_document_id ON public.document_databases(document_id);
CREATE INDEX IF NOT EXISTS idx_document_databases_database_id ON public.document_databases(database_id);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
-- Enable RLS on all tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_task_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_databases ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES
-- =====================================================
-- Projects: Public read access
CREATE POLICY "Enable read access for all users" ON public.projects
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON public.projects
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON public.projects
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Tasks: Public read access
CREATE POLICY "Enable read access for all users" ON public.tasks
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON public.tasks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON public.tasks
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Subtasks: Public read access
CREATE POLICY "Enable read access for all users" ON public.subtasks
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON public.subtasks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON public.subtasks
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Task Comments: Users can read all, modify their own
CREATE POLICY "Enable read access for all users" ON public.task_comments
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON public.task_comments
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for users based on user_id" ON public.task_comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Enable delete for users based on user_id" ON public.task_comments
  FOR DELETE USING (auth.uid() = user_id);

-- Task Attachments: Public read access
CREATE POLICY "Enable read access for all users" ON public.task_attachments
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON public.task_attachments
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Documents: Users can only access their own documents
CREATE POLICY "Users can view their own documents" ON public.documents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents" ON public.documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents" ON public.documents
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents" ON public.documents
  FOR DELETE USING (auth.uid() = user_id);

-- Document Task Relations: Based on document ownership
CREATE POLICY "Users can view relations for their documents" ON public.document_task_relations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_task_relations.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert relations for their documents" ON public.document_task_relations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_task_relations.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update relations for their documents" ON public.document_task_relations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_task_relations.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete relations for their documents" ON public.document_task_relations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_task_relations.document_id
      AND documents.user_id = auth.uid()
    )
  );

-- Document Databases: Based on document ownership
CREATE POLICY "Users can view databases for their documents" ON public.document_databases
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_databases.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert databases for their documents" ON public.document_databases
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_databases.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update databases for their documents" ON public.document_databases
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_databases.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete databases for their documents" ON public.document_databases
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_databases.document_id
      AND documents.user_id = auth.uid()
    )
  );

-- =====================================================
-- TRIGGERS
-- =====================================================
-- Trigger to update updated_at on documents
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subtasks_updated_at
  BEFORE UPDATE ON public.subtasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_document_databases_updated_at
  BEFORE UPDATE ON public.document_databases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
