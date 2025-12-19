-- =====================================================================
-- Fix batch_update_spreadsheet_cells for partial updates
-- =====================================================================
-- Problem: When updating only format (numberFormat), raw_value and formula
-- were being overwritten with NULL because COALESCE was not applied to them.
--
-- Solution: Use COALESCE for raw_value and formula so that partial updates
-- preserve existing cell values.
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
                raw_value = COALESCE(EXCLUDED.raw_value, %I.raw_value),
                formula = COALESCE(EXCLUDED.formula, %I.formula),
                computed_value = COALESCE(EXCLUDED.computed_value, %I.computed_value),
                format = COALESCE(EXCLUDED.format, %I.format),
                validation = COALESCE(EXCLUDED.validation, %I.validation),
                merge = CASE
                    WHEN $9 IS NULL THEN %I.merge
                    ELSE EXCLUDED.merge
                END,
                note = COALESCE(EXCLUDED.note, %I.note),
                updated_at = NOW()
        ', v_table_name, v_table_name, v_table_name, v_table_name, v_table_name, v_table_name, v_table_name, v_table_name)
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

COMMENT ON FUNCTION public.batch_update_spreadsheet_cells IS 'Batch upsert cells in a spreadsheet with support for partial updates';
