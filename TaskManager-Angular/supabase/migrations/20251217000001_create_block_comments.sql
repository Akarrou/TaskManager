-- Migration: Create block_comments table for document block comments (Notion-style)
-- This table stores comments attached to specific blocks within documents

-- Create the block_comments table
CREATE TABLE IF NOT EXISTS public.block_comments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    block_id text NOT NULL,
    content text NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_block_comments_document_id ON public.block_comments(document_id);
CREATE INDEX IF NOT EXISTS idx_block_comments_block_id ON public.block_comments(block_id);
CREATE INDEX IF NOT EXISTS idx_block_comments_user_id ON public.block_comments(user_id);

-- Enable RLS
ALTER TABLE public.block_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT - Authenticated users can view all comments
CREATE POLICY "Authenticated users can view block comments"
    ON public.block_comments
    FOR SELECT
    TO authenticated
    USING (true);

-- RLS Policy: INSERT - Authenticated users can create comments
CREATE POLICY "Authenticated users can create block comments"
    ON public.block_comments
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- RLS Policy: UPDATE - Users can only update their own comments
CREATE POLICY "Users can update their own block comments"
    ON public.block_comments
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS Policy: DELETE - Users can only delete their own comments
CREATE POLICY "Users can delete their own block comments"
    ON public.block_comments
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER block_comments_updated_at
    BEFORE UPDATE ON public.block_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
