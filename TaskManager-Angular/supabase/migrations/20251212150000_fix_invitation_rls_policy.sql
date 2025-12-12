-- Migration: Fix Project Invitations RLS Policy
-- Date: 2025-12-12
-- Description: Fixes the INSERT policy for project_invitations to allow project owners and admins

-- Drop existing policy
DROP POLICY IF EXISTS "Project owners can create invitations" ON public.project_invitations;

-- Create improved policy that checks both owner_id and project_members
CREATE POLICY "Project owners and admins can create invitations"
ON public.project_invitations FOR INSERT
WITH CHECK (
    -- Check if user is the project owner
    EXISTS (
        SELECT 1 FROM public.projects
        WHERE id = project_id
        AND owner_id = auth.uid()
    )
    OR
    -- OR check if user is admin/owner in project_members
    EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = project_invitations.project_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
);

COMMENT ON POLICY "Project owners and admins can create invitations" ON public.project_invitations
IS 'Allows project owners and admins to create invitations. Checks both projects.owner_id and project_members table.';
