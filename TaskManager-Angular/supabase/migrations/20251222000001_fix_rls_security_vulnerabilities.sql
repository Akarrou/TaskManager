-- Migration: Fix RLS Security Vulnerabilities
-- Date: 2025-12-22
-- Description: Corrects overly permissive RLS policies on newer tables
-- Security Audit: 7 tables had USING(true) policies allowing cross-user access

-- =====================================================================
-- 1. FIX document_spreadsheets
-- =====================================================================

DROP POLICY IF EXISTS "Users can view all document spreadsheets" ON public.document_spreadsheets;
DROP POLICY IF EXISTS "Users can create document spreadsheets" ON public.document_spreadsheets;
DROP POLICY IF EXISTS "Users can update document spreadsheets" ON public.document_spreadsheets;
DROP POLICY IF EXISTS "Users can delete document spreadsheets" ON public.document_spreadsheets;

CREATE POLICY "Users can view own document spreadsheets"
    ON public.document_spreadsheets FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.id = document_spreadsheets.document_id
            AND d.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create own document spreadsheets"
    ON public.document_spreadsheets FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.id = document_id AND d.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own document spreadsheets"
    ON public.document_spreadsheets FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.id = document_spreadsheets.document_id
            AND d.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own document spreadsheets"
    ON public.document_spreadsheets FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.id = document_spreadsheets.document_id
            AND d.user_id = auth.uid()
        )
    );

-- =====================================================================
-- 2. FIX document_tabs (project-based access)
-- =====================================================================

DROP POLICY IF EXISTS "Users can view document tabs" ON public.document_tabs;
DROP POLICY IF EXISTS "Users can create document tabs" ON public.document_tabs;
DROP POLICY IF EXISTS "Users can update document tabs" ON public.document_tabs;
DROP POLICY IF EXISTS "Users can delete document tabs" ON public.document_tabs;

CREATE POLICY "Users can view project document tabs"
    ON public.document_tabs FOR SELECT
    USING (user_has_project_access(project_id, auth.uid()));

CREATE POLICY "Users can create project document tabs"
    ON public.document_tabs FOR INSERT
    WITH CHECK (user_has_project_access(project_id, auth.uid()));

CREATE POLICY "Users can update project document tabs"
    ON public.document_tabs FOR UPDATE
    USING (user_has_project_access(project_id, auth.uid()));

CREATE POLICY "Users can delete project document tabs"
    ON public.document_tabs FOR DELETE
    USING (user_has_project_access(project_id, auth.uid()));

-- =====================================================================
-- 3. FIX document_sections (inherits from tab -> project)
-- =====================================================================

DROP POLICY IF EXISTS "Users can view document sections" ON public.document_sections;
DROP POLICY IF EXISTS "Users can create document sections" ON public.document_sections;
DROP POLICY IF EXISTS "Users can update document sections" ON public.document_sections;
DROP POLICY IF EXISTS "Users can delete document sections" ON public.document_sections;

CREATE POLICY "Users can view document sections"
    ON public.document_sections FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.document_tabs t
            WHERE t.id = document_sections.tab_id
            AND user_has_project_access(t.project_id, auth.uid())
        )
    );

CREATE POLICY "Users can create document sections"
    ON public.document_sections FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.document_tabs t
            WHERE t.id = tab_id
            AND user_has_project_access(t.project_id, auth.uid())
        )
    );

CREATE POLICY "Users can update document sections"
    ON public.document_sections FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.document_tabs t
            WHERE t.id = document_sections.tab_id
            AND user_has_project_access(t.project_id, auth.uid())
        )
    );

CREATE POLICY "Users can delete document sections"
    ON public.document_sections FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.document_tabs t
            WHERE t.id = document_sections.tab_id
            AND user_has_project_access(t.project_id, auth.uid())
        )
    );

-- =====================================================================
-- 4. FIX document_tab_items (inherits from tab -> project)
-- =====================================================================

DROP POLICY IF EXISTS "Users can view document tab items" ON public.document_tab_items;
DROP POLICY IF EXISTS "Users can create document tab items" ON public.document_tab_items;
DROP POLICY IF EXISTS "Users can update document tab items" ON public.document_tab_items;
DROP POLICY IF EXISTS "Users can delete document tab items" ON public.document_tab_items;

CREATE POLICY "Users can view document tab items"
    ON public.document_tab_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.document_tabs t
            WHERE t.id = document_tab_items.tab_id
            AND user_has_project_access(t.project_id, auth.uid())
        )
    );

CREATE POLICY "Users can create document tab items"
    ON public.document_tab_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.document_tabs t
            WHERE t.id = tab_id
            AND user_has_project_access(t.project_id, auth.uid())
        )
    );

CREATE POLICY "Users can update document tab items"
    ON public.document_tab_items FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.document_tabs t
            WHERE t.id = document_tab_items.tab_id
            AND user_has_project_access(t.project_id, auth.uid())
        )
    );

CREATE POLICY "Users can delete document tab items"
    ON public.document_tab_items FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.document_tabs t
            WHERE t.id = document_tab_items.tab_id
            AND user_has_project_access(t.project_id, auth.uid())
        )
    );

-- =====================================================================
-- 5. FIX document_tab_groups (project-based access)
-- =====================================================================

DROP POLICY IF EXISTS "Users can view document tab groups" ON public.document_tab_groups;
DROP POLICY IF EXISTS "Users can create document tab groups" ON public.document_tab_groups;
DROP POLICY IF EXISTS "Users can update document tab groups" ON public.document_tab_groups;
DROP POLICY IF EXISTS "Users can delete document tab groups" ON public.document_tab_groups;

CREATE POLICY "Users can view document tab groups"
    ON public.document_tab_groups FOR SELECT
    USING (user_has_project_access(project_id, auth.uid()));

CREATE POLICY "Users can create document tab groups"
    ON public.document_tab_groups FOR INSERT
    WITH CHECK (user_has_project_access(project_id, auth.uid()));

CREATE POLICY "Users can update document tab groups"
    ON public.document_tab_groups FOR UPDATE
    USING (user_has_project_access(project_id, auth.uid()));

CREATE POLICY "Users can delete document tab groups"
    ON public.document_tab_groups FOR DELETE
    USING (user_has_project_access(project_id, auth.uid()));

-- =====================================================================
-- 6. FIX block_comments (document owner only)
-- =====================================================================

DROP POLICY IF EXISTS "Authenticated users can view block comments" ON public.block_comments;

CREATE POLICY "Users can view own document block comments"
    ON public.block_comments FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.id = block_comments.document_id
            AND d.user_id = auth.uid()
        )
    );

-- =====================================================================
-- 7. FIX create_spreadsheet_table function (secure cell table policies)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_spreadsheet_table(
    p_spreadsheet_id TEXT,
    p_document_id UUID,
    p_config JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table_name TEXT;
    v_safe_id TEXT;
    v_result JSONB;
BEGIN
    -- Generate safe table name from spreadsheet_id
    v_safe_id := replace(replace(p_spreadsheet_id, 'ss-', ''), '-', '_');
    v_table_name := 'spreadsheet_' || v_safe_id || '_cells';

    -- Check if spreadsheet already exists
    IF EXISTS (SELECT 1 FROM document_spreadsheets WHERE spreadsheet_id = p_spreadsheet_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Spreadsheet already exists',
            'spreadsheet_id', p_spreadsheet_id
        );
    END IF;

    -- Verify user owns the document
    IF NOT EXISTS (SELECT 1 FROM documents WHERE id = p_document_id AND user_id = auth.uid()) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Access denied: you do not own this document',
            'spreadsheet_id', p_spreadsheet_id
        );
    END IF;

    -- Create the cells table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS public.%I (
            id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
            sheet_id text NOT NULL,
            row_idx integer NOT NULL,
            col_idx integer NOT NULL,
            raw_value jsonb,
            formula text,
            computed_value jsonb,
            format jsonb,
            validation jsonb,
            merge jsonb,
            note text,
            created_at timestamp with time zone DEFAULT timezone(''utc''::text, now()) NOT NULL,
            updated_at timestamp with time zone DEFAULT timezone(''utc''::text, now()) NOT NULL,
            UNIQUE(sheet_id, row_idx, col_idx)
        )', v_table_name);

    -- Create indexes for efficient queries
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_position ON public.%I(sheet_id, row_idx, col_idx)',
        v_table_name, v_table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_sheet ON public.%I(sheet_id)',
        v_table_name, v_table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_row ON public.%I(sheet_id, row_idx)',
        v_table_name, v_table_name);

    -- Enable RLS on the new table
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table_name);

    -- Create SECURE RLS policies for the cells table (based on document ownership)
    EXECUTE format('
        CREATE POLICY "Owner can view spreadsheet cells" ON public.%I
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM document_spreadsheets ds
                JOIN documents d ON d.id = ds.document_id
                WHERE ds.table_name = %L AND d.user_id = auth.uid()
            )
        )', v_table_name, v_table_name);
    EXECUTE format('
        CREATE POLICY "Owner can insert spreadsheet cells" ON public.%I
        FOR INSERT WITH CHECK (
            EXISTS (
                SELECT 1 FROM document_spreadsheets ds
                JOIN documents d ON d.id = ds.document_id
                WHERE ds.table_name = %L AND d.user_id = auth.uid()
            )
        )', v_table_name, v_table_name);
    EXECUTE format('
        CREATE POLICY "Owner can update spreadsheet cells" ON public.%I
        FOR UPDATE USING (
            EXISTS (
                SELECT 1 FROM document_spreadsheets ds
                JOIN documents d ON d.id = ds.document_id
                WHERE ds.table_name = %L AND d.user_id = auth.uid()
            )
        )', v_table_name, v_table_name);
    EXECUTE format('
        CREATE POLICY "Owner can delete spreadsheet cells" ON public.%I
        FOR DELETE USING (
            EXISTS (
                SELECT 1 FROM document_spreadsheets ds
                JOIN documents d ON d.id = ds.document_id
                WHERE ds.table_name = %L AND d.user_id = auth.uid()
            )
        )', v_table_name, v_table_name);

    -- Create trigger for updated_at on cells table
    EXECUTE format('
        CREATE TRIGGER update_%I_updated_at
        BEFORE UPDATE ON public.%I
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()', v_table_name, v_table_name);

    -- Insert metadata into document_spreadsheets
    INSERT INTO document_spreadsheets (
        document_id,
        spreadsheet_id,
        table_name,
        config,
        user_id
    ) VALUES (
        p_document_id,
        p_spreadsheet_id,
        v_table_name,
        p_config,
        auth.uid()
    );

    -- Reload schema cache
    PERFORM reload_schema_cache();

    RETURN jsonb_build_object(
        'success', true,
        'spreadsheet_id', p_spreadsheet_id,
        'table_name', v_table_name
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'spreadsheet_id', p_spreadsheet_id
        );
END;
$$;

-- =====================================================================
-- 8. FIX existing spreadsheet cell tables (update RLS policies)
-- =====================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT table_name FROM document_spreadsheets LOOP
        -- Drop old permissive policies
        EXECUTE format('DROP POLICY IF EXISTS "Users can view spreadsheet cells" ON public.%I', r.table_name);
        EXECUTE format('DROP POLICY IF EXISTS "Users can insert spreadsheet cells" ON public.%I', r.table_name);
        EXECUTE format('DROP POLICY IF EXISTS "Users can update spreadsheet cells" ON public.%I', r.table_name);
        EXECUTE format('DROP POLICY IF EXISTS "Users can delete spreadsheet cells" ON public.%I', r.table_name);

        -- Create secure policies
        EXECUTE format('
            CREATE POLICY "Owner can view spreadsheet cells" ON public.%I
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM document_spreadsheets ds
                    JOIN documents d ON d.id = ds.document_id
                    WHERE ds.table_name = %L AND d.user_id = auth.uid()
                )
            )', r.table_name, r.table_name);
        EXECUTE format('
            CREATE POLICY "Owner can insert spreadsheet cells" ON public.%I
            FOR INSERT WITH CHECK (
                EXISTS (
                    SELECT 1 FROM document_spreadsheets ds
                    JOIN documents d ON d.id = ds.document_id
                    WHERE ds.table_name = %L AND d.user_id = auth.uid()
                )
            )', r.table_name, r.table_name);
        EXECUTE format('
            CREATE POLICY "Owner can update spreadsheet cells" ON public.%I
            FOR UPDATE USING (
                EXISTS (
                    SELECT 1 FROM document_spreadsheets ds
                    JOIN documents d ON d.id = ds.document_id
                    WHERE ds.table_name = %L AND d.user_id = auth.uid()
                )
            )', r.table_name, r.table_name);
        EXECUTE format('
            CREATE POLICY "Owner can delete spreadsheet cells" ON public.%I
            FOR DELETE USING (
                EXISTS (
                    SELECT 1 FROM document_spreadsheets ds
                    JOIN documents d ON d.id = ds.document_id
                    WHERE ds.table_name = %L AND d.user_id = auth.uid()
                )
            )', r.table_name, r.table_name);
    END LOOP;
END $$;
