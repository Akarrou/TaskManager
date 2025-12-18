-- Migration: Create Project Invitations System
-- Date: 2025-12-12
-- Description: Creates system for inviting users to projects via email with pending/accepted/rejected status

-- Table: project_invitations
CREATE TABLE IF NOT EXISTS public.project_invitations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    email text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invited_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at timestamp with time zone DEFAULT (timezone('utc'::text, now()) + interval '7 days') NOT NULL,
    accepted_at timestamp with time zone,
    rejected_at timestamp with time zone,
    token text UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
    CONSTRAINT project_invitations_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text, 'viewer'::text]))),
    CONSTRAINT project_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'expired'::text]))),
    CONSTRAINT unique_pending_invitation UNIQUE (project_id, email, status)
);

COMMENT ON TABLE public.project_invitations IS 'Stores pending and historical project invitations';
COMMENT ON COLUMN public.project_invitations.token IS 'Unique token for accepting invitation (used in invitation link)';
COMMENT ON COLUMN public.project_invitations.expires_at IS 'Invitation expiration date (default 7 days)';
COMMENT ON COLUMN public.project_invitations.status IS 'Invitation status: pending, accepted, rejected, expired';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_project_invitations_project_id ON public.project_invitations(project_id);
CREATE INDEX IF NOT EXISTS idx_project_invitations_email ON public.project_invitations(email);
CREATE INDEX IF NOT EXISTS idx_project_invitations_token ON public.project_invitations(token);
CREATE INDEX IF NOT EXISTS idx_project_invitations_status ON public.project_invitations(status);

-- Enable Row Level Security
ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for project_invitations

-- View invitations: project members can see invitations for their projects
CREATE POLICY "Project members can view invitations"
ON public.project_invitations FOR SELECT
USING (
    user_has_project_access(project_id, auth.uid())
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Create invitations: only project owners can create invitations
CREATE POLICY "Project owners can create invitations"
ON public.project_invitations FOR INSERT
WITH CHECK (
    user_is_project_owner(project_id, auth.uid())
);

-- Update invitations: owner can update, or invited user can accept/reject
CREATE POLICY "Owners can update invitations"
ON public.project_invitations FOR UPDATE
USING (
    user_is_project_owner(project_id, auth.uid())
    OR (
        email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND status = 'pending'
    )
);

-- Delete invitations: only project owners
CREATE POLICY "Project owners can delete invitations"
ON public.project_invitations FOR DELETE
USING (
    user_is_project_owner(project_id, auth.uid())
);

-- Function to accept invitation
CREATE OR REPLACE FUNCTION public.accept_project_invitation(invitation_token text)
RETURNS jsonb AS $$
DECLARE
    invitation_record record;
    user_email text;
    new_member record;
BEGIN
    -- Get current user email
    SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();

    IF user_email IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not authenticated'
        );
    END IF;

    -- Get invitation
    SELECT * INTO invitation_record
    FROM public.project_invitations
    WHERE token = invitation_token
    AND status = 'pending'
    AND expires_at > now()
    AND email = user_email;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid, expired, or already processed invitation'
        );
    END IF;

    -- Check if user is already a member
    IF EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = invitation_record.project_id
        AND user_id = auth.uid()
    ) THEN
        -- Update invitation status but don't add duplicate member
        UPDATE public.project_invitations
        SET status = 'accepted',
            accepted_at = now()
        WHERE id = invitation_record.id;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Already a member of this project'
        );
    END IF;

    -- Add user to project members
    INSERT INTO public.project_members (project_id, user_id, role, invited_by)
    VALUES (
        invitation_record.project_id,
        auth.uid(),
        invitation_record.role,
        invitation_record.invited_by
    )
    RETURNING * INTO new_member;

    -- Update invitation status
    UPDATE public.project_invitations
    SET status = 'accepted',
        accepted_at = now()
    WHERE id = invitation_record.id;

    RETURN jsonb_build_object(
        'success', true,
        'member', row_to_json(new_member)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.accept_project_invitation IS 'Accepts a project invitation using the unique token';

-- Function to reject invitation
CREATE OR REPLACE FUNCTION public.reject_project_invitation(invitation_token text)
RETURNS jsonb AS $$
DECLARE
    user_email text;
BEGIN
    -- Get current user email
    SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();

    IF user_email IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not authenticated'
        );
    END IF;

    -- Update invitation status
    UPDATE public.project_invitations
    SET status = 'rejected',
        rejected_at = now()
    WHERE token = invitation_token
    AND status = 'pending'
    AND expires_at > now()
    AND email = user_email;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid, expired, or already processed invitation'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Invitation rejected'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.reject_project_invitation IS 'Rejects a project invitation using the unique token';

-- Function to get invitation details by token (public, no auth required for display)
CREATE OR REPLACE FUNCTION public.get_invitation_details(invitation_token text)
RETURNS TABLE (
    id uuid,
    project_id uuid,
    project_name text,
    role text,
    invited_by_email text,
    expires_at timestamp with time zone,
    status text
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        i.id,
        i.project_id,
        p.name as project_name,
        i.role,
        u.email as invited_by_email,
        i.expires_at,
        i.status
    FROM public.project_invitations i
    JOIN public.projects p ON p.id = i.project_id
    JOIN auth.users u ON u.id = i.invited_by
    WHERE i.token = invitation_token
    AND i.status = 'pending'
    AND i.expires_at > now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_invitation_details IS 'Gets invitation details for display on invitation page (no auth required)';

-- Function to expire old invitations (can be called by a cron job)
CREATE OR REPLACE FUNCTION public.expire_old_invitations()
RETURNS integer AS $$
DECLARE
    expired_count integer;
BEGIN
    UPDATE public.project_invitations
    SET status = 'expired'
    WHERE status = 'pending'
    AND expires_at < now();

    GET DIAGNOSTICS expired_count = ROW_COUNT;

    RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.expire_old_invitations IS 'Marks expired invitations as expired. Returns count of expired invitations.';

-- Function to get pending invitations for current user
CREATE OR REPLACE FUNCTION public.get_my_pending_invitations()
RETURNS TABLE (
    id uuid,
    project_id uuid,
    project_name text,
    role text,
    invited_by_email text,
    invited_at timestamp with time zone,
    expires_at timestamp with time zone,
    token text
) AS $$
DECLARE
    user_email text;
BEGIN
    -- Get current user email
    SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();

    IF user_email IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        i.id,
        i.project_id,
        p.name as project_name,
        i.role,
        u.email as invited_by_email,
        i.invited_at,
        i.expires_at,
        i.token
    FROM public.project_invitations i
    JOIN public.projects p ON p.id = i.project_id
    JOIN auth.users u ON u.id = i.invited_by
    WHERE i.email = user_email
    AND i.status = 'pending'
    AND i.expires_at > now()
    ORDER BY i.invited_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_my_pending_invitations IS 'Returns all pending invitations for the current authenticated user';
