-- Migration: Create document organization tables (tabs and sections)
-- Date: 2025-12-20
-- Description: Creates tables for organizing documents into tabs and sections with drag & drop support

-- =====================================================================
-- document_tabs: Stores tab metadata for organizing documents
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.document_tabs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name text NOT NULL DEFAULT 'Nouveau tab',
    icon text DEFAULT 'folder',
    color text DEFAULT '#6366f1',
    position integer NOT NULL DEFAULT 0,
    is_default boolean NOT NULL DEFAULT false,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.document_tabs IS 'Stores tabs for organizing documents within a project';
COMMENT ON COLUMN public.document_tabs.position IS 'Order of the tab (0-based)';
COMMENT ON COLUMN public.document_tabs.is_default IS 'If true, this tab is shown when none selected';
COMMENT ON COLUMN public.document_tabs.icon IS 'Material icon name for the tab';
COMMENT ON COLUMN public.document_tabs.color IS 'Hex color code for the tab';

-- Indexes for document_tabs
CREATE INDEX IF NOT EXISTS idx_document_tabs_project_id ON public.document_tabs(project_id);
CREATE INDEX IF NOT EXISTS idx_document_tabs_position ON public.document_tabs(project_id, position);
CREATE INDEX IF NOT EXISTS idx_document_tabs_user_id ON public.document_tabs(user_id);

-- RLS for document_tabs
ALTER TABLE public.document_tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view document tabs" ON public.document_tabs
    FOR SELECT USING (true);
CREATE POLICY "Users can create document tabs" ON public.document_tabs
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update document tabs" ON public.document_tabs
    FOR UPDATE USING (true);
CREATE POLICY "Users can delete document tabs" ON public.document_tabs
    FOR DELETE USING (true);

-- Trigger for updated_at on document_tabs
CREATE TRIGGER update_document_tabs_updated_at
    BEFORE UPDATE ON public.document_tabs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- document_sections: Stores section dividers within tabs
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.document_sections (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    tab_id uuid NOT NULL REFERENCES public.document_tabs(id) ON DELETE CASCADE,
    title text NOT NULL DEFAULT 'Nouvelle section',
    position integer NOT NULL DEFAULT 0,
    is_collapsed boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.document_sections IS 'Stores titled section dividers within tabs';
COMMENT ON COLUMN public.document_sections.position IS 'Order of the section within the tab (0-based)';
COMMENT ON COLUMN public.document_sections.is_collapsed IS 'Whether the section is collapsed in the UI';

-- Indexes for document_sections
CREATE INDEX IF NOT EXISTS idx_document_sections_tab_id ON public.document_sections(tab_id);
CREATE INDEX IF NOT EXISTS idx_document_sections_position ON public.document_sections(tab_id, position);

-- RLS for document_sections
ALTER TABLE public.document_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view document sections" ON public.document_sections
    FOR SELECT USING (true);
CREATE POLICY "Users can create document sections" ON public.document_sections
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update document sections" ON public.document_sections
    FOR UPDATE USING (true);
CREATE POLICY "Users can delete document sections" ON public.document_sections
    FOR DELETE USING (true);

-- Trigger for updated_at on document_sections
CREATE TRIGGER update_document_sections_updated_at
    BEFORE UPDATE ON public.document_sections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- document_tab_items: Links documents to tabs with position tracking
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.document_tab_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    tab_id uuid NOT NULL REFERENCES public.document_tabs(id) ON DELETE CASCADE,
    section_id uuid REFERENCES public.document_sections(id) ON DELETE SET NULL,
    position integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

    CONSTRAINT unique_document_in_tab UNIQUE(document_id, tab_id)
);

COMMENT ON TABLE public.document_tab_items IS 'Links documents to tabs with position within tab/section';
COMMENT ON COLUMN public.document_tab_items.section_id IS 'Optional section within the tab (NULL = unsectioned)';
COMMENT ON COLUMN public.document_tab_items.position IS 'Order within section (or within unsectioned area if section_id is NULL)';

-- Indexes for document_tab_items
CREATE INDEX IF NOT EXISTS idx_document_tab_items_tab_id ON public.document_tab_items(tab_id);
CREATE INDEX IF NOT EXISTS idx_document_tab_items_document_id ON public.document_tab_items(document_id);
CREATE INDEX IF NOT EXISTS idx_document_tab_items_section_id ON public.document_tab_items(section_id);
CREATE INDEX IF NOT EXISTS idx_document_tab_items_position ON public.document_tab_items(tab_id, section_id, position);

-- RLS for document_tab_items
ALTER TABLE public.document_tab_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view document tab items" ON public.document_tab_items
    FOR SELECT USING (true);
CREATE POLICY "Users can create document tab items" ON public.document_tab_items
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update document tab items" ON public.document_tab_items
    FOR UPDATE USING (true);
CREATE POLICY "Users can delete document tab items" ON public.document_tab_items
    FOR DELETE USING (true);

-- Trigger for updated_at on document_tab_items
CREATE TRIGGER update_document_tab_items_updated_at
    BEFORE UPDATE ON public.document_tab_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- Helper function: Get next position for a new tab in a project
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_next_tab_position(p_project_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_max_position INTEGER;
BEGIN
    SELECT COALESCE(MAX(position), -1) + 1 INTO v_max_position
    FROM document_tabs
    WHERE project_id = p_project_id;

    RETURN v_max_position;
END;
$$;

-- =====================================================================
-- Helper function: Get next position for a new section in a tab
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_next_section_position(p_tab_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_max_position INTEGER;
BEGIN
    SELECT COALESCE(MAX(position), -1) + 1 INTO v_max_position
    FROM document_sections
    WHERE tab_id = p_tab_id;

    RETURN v_max_position;
END;
$$;

-- =====================================================================
-- Helper function: Get next position for a new item in a section/tab
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_next_item_position(p_tab_id UUID, p_section_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_max_position INTEGER;
BEGIN
    IF p_section_id IS NULL THEN
        SELECT COALESCE(MAX(position), -1) + 1 INTO v_max_position
        FROM document_tab_items
        WHERE tab_id = p_tab_id AND section_id IS NULL;
    ELSE
        SELECT COALESCE(MAX(position), -1) + 1 INTO v_max_position
        FROM document_tab_items
        WHERE tab_id = p_tab_id AND section_id = p_section_id;
    END IF;

    RETURN v_max_position;
END;
$$;
