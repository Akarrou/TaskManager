-- Migration: Add Project Security
-- Date: 2025-12-12
-- Description: Adds owner_id to projects and creates project_members table for access control

-- Add owner_id column to projects table
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON public.projects(owner_id);

-- Set existing projects to have the first user as owner (migration safety)
-- In production, you should handle this differently based on your needs
DO $$
DECLARE
    first_user_id uuid;
BEGIN
    SELECT id INTO first_user_id FROM auth.users LIMIT 1;
    IF first_user_id IS NOT NULL THEN
        UPDATE public.projects
        SET owner_id = first_user_id
        WHERE owner_id IS NULL;
    END IF;
END $$;

-- Make owner_id required for new projects
ALTER TABLE public.projects
ALTER COLUMN owner_id SET NOT NULL;

-- Table: project_members
-- Stores which users have access to which projects
CREATE TABLE IF NOT EXISTS public.project_members (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text DEFAULT 'member'::text NOT NULL,
    invited_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT project_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text, 'viewer'::text]))),
    CONSTRAINT unique_project_user UNIQUE (project_id, user_id)
);

COMMENT ON TABLE public.project_members IS 'Stores project members and their roles';
COMMENT ON COLUMN public.project_members.role IS 'User role: owner (creator), admin (can manage members), member (can edit), viewer (read-only)';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON public.project_members(user_id);

-- Enable Row Level Security
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Function to check if user has access to a project
CREATE OR REPLACE FUNCTION public.user_has_project_access(project_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_uuid
        AND (
            p.owner_id = user_uuid
            OR EXISTS (
                SELECT 1 FROM public.project_members pm
                WHERE pm.project_id = project_uuid
                AND pm.user_id = user_uuid
            )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is project owner
CREATE OR REPLACE FUNCTION public.user_is_project_owner(project_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_uuid
        AND p.owner_id = user_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user role in project
CREATE OR REPLACE FUNCTION public.get_user_project_role(project_uuid uuid, user_uuid uuid)
RETURNS text AS $$
BEGIN
    -- Check if owner
    IF user_is_project_owner(project_uuid, user_uuid) THEN
        RETURN 'owner';
    END IF;

    -- Check project_members table
    RETURN (
        SELECT role FROM public.project_members
        WHERE project_id = project_uuid AND user_id = user_uuid
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically add owner to project_members when project is created
CREATE OR REPLACE FUNCTION public.add_owner_to_project_members()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.project_members (project_id, user_id, role, invited_by)
    VALUES (NEW.id, NEW.owner_id, 'owner', NEW.owner_id)
    ON CONFLICT (project_id, user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_add_owner_to_project_members
AFTER INSERT ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.add_owner_to_project_members();

-- Drop existing permissive RLS policies for projects
DROP POLICY IF EXISTS "Users can view all projects" ON public.projects;
DROP POLICY IF EXISTS "Users can create projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update all projects" ON public.projects;

-- New RLS Policies for projects (owner and members only)
CREATE POLICY "Users can view their own projects"
ON public.projects FOR SELECT
USING (
    auth.uid() = owner_id
    OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = id AND pm.user_id = auth.uid()
    )
);

CREATE POLICY "Users can create their own projects"
ON public.projects FOR INSERT
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Project owners can update their projects"
ON public.projects FOR UPDATE
USING (auth.uid() = owner_id);

CREATE POLICY "Project owners can delete their projects"
ON public.projects FOR DELETE
USING (auth.uid() = owner_id);

-- RLS Policies for project_members
CREATE POLICY "Users can view members of their projects"
ON public.project_members FOR SELECT
USING (
    user_has_project_access(project_id, auth.uid())
);

CREATE POLICY "Project owners can add members"
ON public.project_members FOR INSERT
WITH CHECK (
    user_is_project_owner(project_id, auth.uid())
);

CREATE POLICY "Project owners can update member roles"
ON public.project_members FOR UPDATE
USING (
    user_is_project_owner(project_id, auth.uid())
);

CREATE POLICY "Project owners can remove members"
ON public.project_members FOR DELETE
USING (
    user_is_project_owner(project_id, auth.uid())
);
