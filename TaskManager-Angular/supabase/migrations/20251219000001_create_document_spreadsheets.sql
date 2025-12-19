-- Migration: Create document_spreadsheets table
-- Date: 2025-12-19
-- Description: Creates table for storing spreadsheet metadata (Excel-like spreadsheets in documents)

-- =====================================================================
-- Main Metadata Table
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.document_spreadsheets (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    spreadsheet_id text NOT NULL UNIQUE,
    table_name text NOT NULL UNIQUE,
    config jsonb NOT NULL DEFAULT '{}',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.document_spreadsheets IS 'Stores metadata for Excel-like spreadsheets embedded in documents';
COMMENT ON COLUMN public.document_spreadsheets.spreadsheet_id IS 'Unique spreadsheet identifier (format: ss-<uuid>)';
COMMENT ON COLUMN public.document_spreadsheets.table_name IS 'Physical PostgreSQL table name storing the spreadsheet cells (format: spreadsheet_<uuid>_cells)';
COMMENT ON COLUMN public.document_spreadsheets.config IS 'JSON configuration containing sheets, named ranges, and settings';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_document_spreadsheets_document_id ON public.document_spreadsheets(document_id);
CREATE INDEX IF NOT EXISTS idx_document_spreadsheets_spreadsheet_id ON public.document_spreadsheets(spreadsheet_id);
CREATE INDEX IF NOT EXISTS idx_document_spreadsheets_table_name ON public.document_spreadsheets(table_name);
CREATE INDEX IF NOT EXISTS idx_document_spreadsheets_user_id ON public.document_spreadsheets(user_id);

-- Enable Row Level Security
ALTER TABLE public.document_spreadsheets ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow authenticated users to manage their spreadsheets
CREATE POLICY "Users can view all document spreadsheets"
    ON public.document_spreadsheets FOR SELECT
    USING (true);

CREATE POLICY "Users can create document spreadsheets"
    ON public.document_spreadsheets FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can update document spreadsheets"
    ON public.document_spreadsheets FOR UPDATE
    USING (true);

CREATE POLICY "Users can delete document spreadsheets"
    ON public.document_spreadsheets FOR DELETE
    USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_document_spreadsheets_updated_at
    BEFORE UPDATE ON public.document_spreadsheets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- RPC: Create Dynamic Spreadsheet Table
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

    -- Create RLS policies for the cells table
    EXECUTE format('
        CREATE POLICY "Users can view spreadsheet cells" ON public.%I
        FOR SELECT USING (true)', v_table_name);
    EXECUTE format('
        CREATE POLICY "Users can insert spreadsheet cells" ON public.%I
        FOR INSERT WITH CHECK (true)', v_table_name);
    EXECUTE format('
        CREATE POLICY "Users can update spreadsheet cells" ON public.%I
        FOR UPDATE USING (true)', v_table_name);
    EXECUTE format('
        CREATE POLICY "Users can delete spreadsheet cells" ON public.%I
        FOR DELETE USING (true)', v_table_name);

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

COMMENT ON FUNCTION public.create_spreadsheet_table IS 'Creates a new spreadsheet with its dynamic cells table';

-- =====================================================================
-- RPC: Batch Update Spreadsheet Cells
-- =====================================================================

CREATE OR REPLACE FUNCTION public.batch_update_spreadsheet_cells(
    p_spreadsheet_id TEXT,
    p_cells JSONB[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table_name TEXT;
    v_cell JSONB;
    v_updated_count INTEGER := 0;
BEGIN
    -- Get table name from metadata
    SELECT table_name INTO v_table_name
    FROM document_spreadsheets
    WHERE spreadsheet_id = p_spreadsheet_id;

    IF v_table_name IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Spreadsheet not found',
            'spreadsheet_id', p_spreadsheet_id
        );
    END IF;

    -- Upsert each cell
    FOREACH v_cell IN ARRAY p_cells LOOP
        EXECUTE format('
            INSERT INTO public.%I (sheet_id, row_idx, col_idx, raw_value, formula, computed_value, format, validation, merge, note, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            ON CONFLICT (sheet_id, row_idx, col_idx)
            DO UPDATE SET
                raw_value = EXCLUDED.raw_value,
                formula = EXCLUDED.formula,
                computed_value = EXCLUDED.computed_value,
                format = COALESCE(EXCLUDED.format, %I.format),
                validation = COALESCE(EXCLUDED.validation, %I.validation),
                merge = EXCLUDED.merge,
                note = COALESCE(EXCLUDED.note, %I.note),
                updated_at = NOW()
        ', v_table_name, v_table_name, v_table_name, v_table_name)
        USING
            v_cell->>'sheet_id',
            (v_cell->>'row_idx')::INTEGER,
            (v_cell->>'col_idx')::INTEGER,
            v_cell->'raw_value',
            v_cell->>'formula',
            v_cell->'computed_value',
            v_cell->'format',
            v_cell->'validation',
            v_cell->'merge',
            v_cell->>'note';

        v_updated_count := v_updated_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'updated', v_updated_count
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

COMMENT ON FUNCTION public.batch_update_spreadsheet_cells IS 'Batch upsert cells in a spreadsheet for efficient saves';

-- =====================================================================
-- RPC: Delete Spreadsheet (Cascade)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.delete_spreadsheet_cascade(
    p_spreadsheet_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table_name TEXT;
BEGIN
    -- Get table name
    SELECT table_name INTO v_table_name
    FROM document_spreadsheets
    WHERE spreadsheet_id = p_spreadsheet_id;

    IF v_table_name IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Spreadsheet not found'
        );
    END IF;

    -- Drop the cells table
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', v_table_name);

    -- Delete metadata
    DELETE FROM document_spreadsheets WHERE spreadsheet_id = p_spreadsheet_id;

    -- Reload schema cache
    PERFORM reload_schema_cache();

    RETURN jsonb_build_object(
        'success', true,
        'spreadsheet_id', p_spreadsheet_id,
        'table_dropped', v_table_name
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

COMMENT ON FUNCTION public.delete_spreadsheet_cascade IS 'Deletes a spreadsheet and its cells table';

-- =====================================================================
-- RPC: Get Spreadsheet Cells (with optional range filter)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_spreadsheet_cells(
    p_spreadsheet_id TEXT,
    p_sheet_id TEXT,
    p_row_start INTEGER DEFAULT NULL,
    p_row_end INTEGER DEFAULT NULL,
    p_col_start INTEGER DEFAULT NULL,
    p_col_end INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table_name TEXT;
    v_result JSONB;
    v_query TEXT;
BEGIN
    -- Get table name
    SELECT table_name INTO v_table_name
    FROM document_spreadsheets
    WHERE spreadsheet_id = p_spreadsheet_id;

    IF v_table_name IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Spreadsheet not found'
        );
    END IF;

    -- Build dynamic query with optional range filters
    v_query := format('
        SELECT jsonb_agg(
            jsonb_build_object(
                ''id'', id,
                ''sheet_id'', sheet_id,
                ''row'', row_idx,
                ''col'', col_idx,
                ''raw_value'', raw_value,
                ''formula'', formula,
                ''computed_value'', computed_value,
                ''format'', format,
                ''validation'', validation,
                ''merge'', merge,
                ''note'', note,
                ''updated_at'', updated_at
            )
        )
        FROM public.%I
        WHERE sheet_id = $1
    ', v_table_name);

    IF p_row_start IS NOT NULL THEN
        v_query := v_query || ' AND row_idx >= ' || p_row_start;
    END IF;
    IF p_row_end IS NOT NULL THEN
        v_query := v_query || ' AND row_idx <= ' || p_row_end;
    END IF;
    IF p_col_start IS NOT NULL THEN
        v_query := v_query || ' AND col_idx >= ' || p_col_start;
    END IF;
    IF p_col_end IS NOT NULL THEN
        v_query := v_query || ' AND col_idx <= ' || p_col_end;
    END IF;

    v_query := v_query || ' ORDER BY row_idx, col_idx';

    EXECUTE v_query INTO v_result USING p_sheet_id;

    RETURN jsonb_build_object(
        'success', true,
        'cells', COALESCE(v_result, '[]'::jsonb)
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

COMMENT ON FUNCTION public.get_spreadsheet_cells IS 'Gets cells from a spreadsheet with optional range filtering for virtual scroll';

-- =====================================================================
-- RPC: Clear Spreadsheet Range
-- =====================================================================

CREATE OR REPLACE FUNCTION public.clear_spreadsheet_range(
    p_spreadsheet_id TEXT,
    p_sheet_id TEXT,
    p_row_start INTEGER,
    p_row_end INTEGER,
    p_col_start INTEGER,
    p_col_end INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table_name TEXT;
    v_deleted_count INTEGER;
BEGIN
    -- Get table name
    SELECT table_name INTO v_table_name
    FROM document_spreadsheets
    WHERE spreadsheet_id = p_spreadsheet_id;

    IF v_table_name IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Spreadsheet not found'
        );
    END IF;

    -- Delete cells in range
    EXECUTE format('
        DELETE FROM public.%I
        WHERE sheet_id = $1
        AND row_idx >= $2 AND row_idx <= $3
        AND col_idx >= $4 AND col_idx <= $5
    ', v_table_name)
    USING p_sheet_id, p_row_start, p_row_end, p_col_start, p_col_end;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'deleted', v_deleted_count
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

COMMENT ON FUNCTION public.clear_spreadsheet_range IS 'Clears all cells in a specified range';
