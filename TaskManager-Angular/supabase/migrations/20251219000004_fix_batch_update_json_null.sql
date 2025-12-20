-- =====================================================================
-- Fix batch_update_spreadsheet_cells for JSON null handling
-- =====================================================================
-- Problem: COALESCE doesn't work with JSON null values because
-- v_cell->'raw_value' returns JSON null (not SQL NULL) when the value is null.
--
-- Solution: Check if the JSON value is null using jsonb_typeof or IS NULL
-- and only update if the new value is not null.
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
    v_raw_value JSONB;
    v_formula TEXT;
    v_format JSONB;
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
        -- Extract values, treating JSON null as SQL NULL
        v_raw_value := CASE
            WHEN v_cell->'raw_value' IS NULL OR v_cell->'raw_value' = 'null'::jsonb
            THEN NULL
            ELSE v_cell->'raw_value'
        END;

        v_formula := CASE
            WHEN v_cell->>'formula' IS NULL OR v_cell->>'formula' = ''
            THEN NULL
            ELSE v_cell->>'formula'
        END;

        v_format := CASE
            WHEN v_cell->'format' IS NULL OR v_cell->'format' = 'null'::jsonb
            THEN NULL
            ELSE v_cell->'format'
        END;

        EXECUTE format('
            INSERT INTO public.%I (sheet_id, row_idx, col_idx, raw_value, formula, computed_value, format, validation, merge, note, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            ON CONFLICT (sheet_id, row_idx, col_idx)
            DO UPDATE SET
                raw_value = CASE WHEN $4 IS NULL THEN %I.raw_value ELSE $4 END,
                formula = CASE WHEN $5 IS NULL THEN %I.formula ELSE $5 END,
                computed_value = COALESCE($6, %I.computed_value),
                format = CASE WHEN $7 IS NULL THEN %I.format ELSE $7 END,
                validation = COALESCE($8, %I.validation),
                merge = CASE WHEN $9 IS NULL THEN %I.merge ELSE $9 END,
                note = COALESCE($10, %I.note),
                updated_at = NOW()
        ', v_table_name, v_table_name, v_table_name, v_table_name, v_table_name, v_table_name, v_table_name, v_table_name)
        USING
            v_cell->>'sheet_id',
            (v_cell->>'row_idx')::INTEGER,
            (v_cell->>'col_idx')::INTEGER,
            v_raw_value,
            v_formula,
            v_cell->'computed_value',
            v_format,
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

COMMENT ON FUNCTION public.batch_update_spreadsheet_cells IS 'Batch upsert cells with proper JSON null handling for partial updates';
