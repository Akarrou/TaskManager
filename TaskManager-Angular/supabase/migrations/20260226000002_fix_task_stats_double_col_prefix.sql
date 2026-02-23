-- Migration: Fix double col_ prefix in get_task_stats_aggregated
-- Description: Column IDs in config may already include 'col_' prefix,
-- causing the function to generate 'col_col_...' which doesn't exist.
-- This fix strips any existing 'col_' prefix before adding it.

CREATE OR REPLACE FUNCTION get_task_stats_aggregated(
  p_project_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_databases RECORD;
  v_total INT := 0;
  v_pending INT := 0;
  v_in_progress INT := 0;
  v_completed INT := 0;
  v_blocked INT := 0;
  v_backlog INT := 0;
  v_awaiting_info INT := 0;
  v_cancelled INT := 0;
  v_sql TEXT;
  v_result RECORD;
  v_status_col_id TEXT;
  v_phys_col TEXT;
BEGIN
  -- Iterate over all databases with type 'task'
  FOR v_databases IN
    SELECT
      database_id,
      table_name,
      config
    FROM document_databases
    WHERE config->>'type' = 'task'
      AND (p_project_id IS NULL OR (config->'projectId')::text = p_project_id::text)
  LOOP
    -- Find the Status column in the config
    SELECT (col->>'id')::text INTO v_status_col_id
    FROM jsonb_array_elements(v_databases.config->'columns') AS col
    WHERE col->>'name' = 'Status'
    LIMIT 1;

    IF v_status_col_id IS NOT NULL THEN
      -- Strip 'col_' prefix if already present to avoid double-prefixing
      IF v_status_col_id LIKE 'col_%' THEN
        v_status_col_id := substring(v_status_col_id from 5);
      END IF;

      -- Build physical column name
      v_phys_col := 'col_' || replace(v_status_col_id, '-', '_');

      -- Check if the column actually exists in the table before querying
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = v_databases.table_name
          AND column_name = v_phys_col
      ) THEN
        -- Build dynamic query to count by status
        v_sql := format(
          'SELECT
            COALESCE(%I, ''pending'') AS status,
            COUNT(*) AS count
          FROM %I
          WHERE deleted_at IS NULL
          GROUP BY %I',
          v_phys_col,
          v_databases.table_name,
          v_phys_col
        );

        -- Execute and aggregate results
        FOR v_result IN EXECUTE v_sql LOOP
          CASE
            -- Normalize status values (supports French and English)
            WHEN lower(v_result.status::text) SIMILAR TO '%(backlog)%' THEN
              v_backlog := v_backlog + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(pending|en.?attente|à.?faire|todo)%' THEN
              v_pending := v_pending + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(in.?progress|en.?cours)%' THEN
              v_in_progress := v_in_progress + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(completed|terminée?|done)%' THEN
              v_completed := v_completed + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(blocked|bloquée?)%' THEN
              v_blocked := v_blocked + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(awaiting.?info|en.?attente.?d.?info)%' THEN
              v_awaiting_info := v_awaiting_info + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(cancelled|annulée?)%' THEN
              v_cancelled := v_cancelled + v_result.count;
            ELSE
              -- Default unknown statuses to pending
              v_pending := v_pending + v_result.count;
          END CASE;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  -- Calculate total
  v_total := v_backlog + v_pending + v_in_progress + v_completed + v_blocked + v_awaiting_info + v_cancelled;

  -- Return JSON with aggregated statistics
  RETURN json_build_object(
    'total', v_total,
    'backlog', v_backlog,
    'pending', v_pending,
    'inProgress', v_in_progress,
    'completed', v_completed,
    'blocked', v_blocked,
    'awaitingInfo', v_awaiting_info,
    'cancelled', v_cancelled,
    'completionRate', CASE WHEN v_total > 0 THEN (v_completed::float / v_total::float) * 100 ELSE 0 END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_task_stats_aggregated IS 'Aggregates task statistics across all task-type databases. Supports optional filtering by project_id. Returns JSON with total, backlog, pending, inProgress, completed, blocked, awaitingInfo, cancelled counts and completionRate percentage.';
