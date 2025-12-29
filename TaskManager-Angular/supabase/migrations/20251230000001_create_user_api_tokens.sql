-- Migration: Create User API Tokens System
-- Date: 2025-12-30
-- Description: Creates system for user-generated API tokens for MCP authentication (alternative to Basic Auth)

-- Note: pgcrypto is already available in Supabase via extensions schema

-- Table: user_api_tokens
CREATE TABLE IF NOT EXISTS public.user_api_tokens (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    token_hash text NOT NULL,
    token_prefix text NOT NULL,
    scopes text[] DEFAULT ARRAY['all']::text[],
    expires_at timestamp with time zone,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    revoked_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT user_api_tokens_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 50)
);

COMMENT ON TABLE public.user_api_tokens IS 'Stores hashed API tokens for MCP server authentication (alternative to Basic Auth)';
COMMENT ON COLUMN public.user_api_tokens.token_hash IS 'SHA-256 hash of the token (token shown only once at creation)';
COMMENT ON COLUMN public.user_api_tokens.token_prefix IS 'First 12 characters of token for user identification (e.g., kodo_abc12345)';
COMMENT ON COLUMN public.user_api_tokens.scopes IS 'Token permissions: all, read, write, projects, tasks, documents';
COMMENT ON COLUMN public.user_api_tokens.expires_at IS 'Optional expiration date (null = never expires)';
COMMENT ON COLUMN public.user_api_tokens.last_used_at IS 'Last time the token was used for authentication';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_api_tokens_user_id ON public.user_api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_tokens_token_hash ON public.user_api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_api_tokens_is_active ON public.user_api_tokens(is_active);
CREATE INDEX IF NOT EXISTS idx_user_api_tokens_prefix ON public.user_api_tokens(token_prefix);
CREATE INDEX IF NOT EXISTS idx_user_api_tokens_user_active ON public.user_api_tokens(user_id, is_active);

-- Enable Row Level Security
ALTER TABLE public.user_api_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only manage their own tokens

CREATE POLICY "Users can view own tokens"
ON public.user_api_tokens FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create own tokens"
ON public.user_api_tokens FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own tokens"
ON public.user_api_tokens FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own tokens"
ON public.user_api_tokens FOR DELETE
USING (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_user_api_tokens_updated_at
    BEFORE UPDATE ON public.user_api_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function: Generate new API token (returns unhashed token ONCE)
CREATE OR REPLACE FUNCTION public.create_api_token(
    p_name text,
    p_scopes text[] DEFAULT ARRAY['all']::text[],
    p_expires_at timestamp with time zone DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_user_id uuid;
    v_raw_token text;
    v_token_hash text;
    v_token_prefix text;
    v_new_token record;
BEGIN
    -- Get current user
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not authenticated'
        );
    END IF;

    -- Check token limit per user (max 10 active tokens)
    IF (SELECT COUNT(*) FROM public.user_api_tokens WHERE user_id = v_user_id AND is_active = true) >= 10 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Maximum number of active tokens reached (10)'
        );
    END IF;

    -- Check duplicate name for active tokens
    IF EXISTS (SELECT 1 FROM public.user_api_tokens WHERE user_id = v_user_id AND name = p_name AND is_active = true) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'A token with this name already exists'
        );
    END IF;

    -- Generate token: kodo_ prefix + 32 bytes hex (64 chars) = 69 chars total
    v_raw_token := 'kodo_' || encode(extensions.gen_random_bytes(32), 'hex');
    v_token_prefix := substring(v_raw_token from 1 for 12);
    v_token_hash := encode(extensions.digest(v_raw_token::bytea, 'sha256'), 'hex');

    -- Insert token record
    INSERT INTO public.user_api_tokens (
        user_id,
        name,
        token_hash,
        token_prefix,
        scopes,
        expires_at
    ) VALUES (
        v_user_id,
        p_name,
        v_token_hash,
        v_token_prefix,
        p_scopes,
        p_expires_at
    )
    RETURNING * INTO v_new_token;

    -- Return token (only time it's visible!)
    RETURN jsonb_build_object(
        'success', true,
        'token', v_raw_token,
        'id', v_new_token.id,
        'name', v_new_token.name,
        'prefix', v_token_prefix,
        'scopes', v_new_token.scopes,
        'expires_at', v_new_token.expires_at,
        'created_at', v_new_token.created_at
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.create_api_token IS 'Creates a new API token. Returns the unhashed token ONCE - it cannot be retrieved later.';

-- Function: Validate API token (for MCP server - no auth required, uses service role)
CREATE OR REPLACE FUNCTION public.validate_api_token(p_token text)
RETURNS TABLE (
    user_id uuid,
    email text,
    token_id uuid,
    token_name text,
    scopes text[]
) AS $$
DECLARE
    v_token_hash text;
    v_found boolean := false;
BEGIN
    -- Check token format
    IF p_token IS NULL OR NOT p_token LIKE 'kodo_%' THEN
        RETURN;
    END IF;

    -- Hash the provided token
    v_token_hash := encode(extensions.digest(p_token::bytea, 'sha256'), 'hex');

    RETURN QUERY
    SELECT
        t.user_id,
        u.email,
        t.id as token_id,
        t.name as token_name,
        t.scopes
    FROM public.user_api_tokens t
    JOIN auth.users u ON u.id = t.user_id
    WHERE t.token_hash = v_token_hash
    AND t.is_active = true
    AND (t.expires_at IS NULL OR t.expires_at > now())
    AND t.revoked_at IS NULL;

    -- Check if we found a token to update last_used_at
    IF FOUND THEN
        UPDATE public.user_api_tokens
        SET last_used_at = now()
        WHERE token_hash = v_token_hash;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.validate_api_token IS 'Validates an API token and returns user info. Used by MCP server for Bearer auth.';

-- Function: Revoke API token
CREATE OR REPLACE FUNCTION public.revoke_api_token(p_token_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not authenticated'
        );
    END IF;

    UPDATE public.user_api_tokens
    SET is_active = false,
        revoked_at = now()
    WHERE id = p_token_id
    AND user_id = v_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Token not found or not owned by user'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Token revoked successfully'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.revoke_api_token IS 'Revokes an API token by setting is_active to false';

-- Function: List user tokens (without hash)
CREATE OR REPLACE FUNCTION public.list_my_api_tokens()
RETURNS TABLE (
    id uuid,
    name text,
    token_prefix text,
    scopes text[],
    expires_at timestamp with time zone,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone,
    is_active boolean
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.name,
        t.token_prefix,
        t.scopes,
        t.expires_at,
        t.last_used_at,
        t.created_at,
        t.is_active
    FROM public.user_api_tokens t
    WHERE t.user_id = auth.uid()
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.list_my_api_tokens IS 'Lists all API tokens for the current user (without sensitive data)';
