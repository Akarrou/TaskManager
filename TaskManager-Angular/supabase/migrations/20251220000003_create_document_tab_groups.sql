-- Migration: Create document_tab_groups table for organizing tabs into collapsible groups
-- Similar to Chrome/Brave browser tab groups

-- Create document_tab_groups table
CREATE TABLE IF NOT EXISTS public.document_tab_groups (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#6366f1',
    position integer NOT NULL DEFAULT 0,
    is_collapsed boolean NOT NULL DEFAULT false,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add tab_group_id column to document_tabs (nullable - tabs can be ungrouped)
ALTER TABLE public.document_tabs
ADD COLUMN IF NOT EXISTS tab_group_id uuid REFERENCES public.document_tab_groups(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_tab_groups_project_id
    ON public.document_tab_groups(project_id);
CREATE INDEX IF NOT EXISTS idx_document_tab_groups_position
    ON public.document_tab_groups(project_id, position);
CREATE INDEX IF NOT EXISTS idx_document_tabs_tab_group_id
    ON public.document_tabs(tab_group_id);

-- Enable RLS
ALTER TABLE public.document_tab_groups ENABLE ROW LEVEL SECURITY;

-- RLS Policies for document_tab_groups
CREATE POLICY "Users can view document tab groups"
    ON public.document_tab_groups FOR SELECT
    USING (true);

CREATE POLICY "Users can create document tab groups"
    ON public.document_tab_groups FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can update document tab groups"
    ON public.document_tab_groups FOR UPDATE
    USING (true);

CREATE POLICY "Users can delete document tab groups"
    ON public.document_tab_groups FOR DELETE
    USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_document_tab_groups_updated_at
    BEFORE UPDATE ON public.document_tab_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Helper function: Get next group position for a project
CREATE OR REPLACE FUNCTION public.get_next_tab_group_position(p_project_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_max_position INTEGER;
BEGIN
    SELECT COALESCE(MAX(position), -1) + 1 INTO v_max_position
    FROM document_tab_groups
    WHERE project_id = p_project_id;

    RETURN v_max_position;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_next_tab_group_position(UUID) TO authenticated;

COMMENT ON TABLE public.document_tab_groups IS 'Groups for organizing document tabs, similar to browser tab groups';
COMMENT ON COLUMN public.document_tab_groups.name IS 'Display name of the group (required)';
COMMENT ON COLUMN public.document_tab_groups.color IS 'Hex color for visual identification';
COMMENT ON COLUMN public.document_tab_groups.is_collapsed IS 'Whether the group is collapsed in the UI';
COMMENT ON COLUMN public.document_tabs.tab_group_id IS 'Reference to parent group (null = ungrouped tab)';
