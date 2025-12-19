-- Migration: Fix get_spreadsheet_cells function
-- Date: 2025-12-19
-- Description: Fixes the ORDER BY clause issue in get_spreadsheet_cells RPC function
-- The previous version had ORDER BY outside the jsonb_agg, causing GROUP BY errors

-- Drop and recreate the function with correct syntax
DROP FUNCTION IF EXISTS public.get_spreadsheet_cells(TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER);

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
    -- Use subquery with ORDER BY, then aggregate the ordered results
    v_query := format('
        SELECT jsonb_agg(row_data)
        FROM (
            SELECT jsonb_build_object(
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
            ) AS row_data
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

    -- ORDER BY inside subquery, then close subquery
    v_query := v_query || ' ORDER BY row_idx, col_idx) AS ordered_rows';

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

COMMENT ON FUNCTION public.get_spreadsheet_cells IS 'Gets cells from a spreadsheet with optional range filtering for virtual scroll (fixed ORDER BY)';
