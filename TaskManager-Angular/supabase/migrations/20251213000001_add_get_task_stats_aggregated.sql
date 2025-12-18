-- Migration: Add RPC function for aggregated task statistics
-- Description: This function aggregates task statistics across all task-type databases
-- Performance: Executes server-side SQL aggregation instead of client-side filtering

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
  v_sql TEXT;
  v_result RECORD;
  v_status_col_id TEXT;
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
      -- Build dynamic query to count by status
      v_sql := format(
        'SELECT
          COALESCE(%I, ''pending'') AS status,
          COUNT(*) AS count
        FROM %I
        GROUP BY %I',
        'col_' || replace(v_status_col_id, '-', '_'),
        v_databases.table_name,
        'col_' || replace(v_status_col_id, '-', '_')
      );

      -- Execute and aggregate results
      FOR v_result IN EXECUTE v_sql LOOP
        CASE
          -- Normalize status values (supports French and English)
          WHEN lower(v_result.status::text) SIMILAR TO '%(pending|en.?attente|à.?faire|todo)%' THEN
            v_pending := v_pending + v_result.count;
          WHEN lower(v_result.status::text) SIMILAR TO '%(in.?progress|en.?cours)%' THEN
            v_in_progress := v_in_progress + v_result.count;
          WHEN lower(v_result.status::text) SIMILAR TO '%(completed|terminée?|done)%' THEN
            v_completed := v_completed + v_result.count;
          WHEN lower(v_result.status::text) SIMILAR TO '%(blocked|bloquée?)%' THEN
            v_blocked := v_blocked + v_result.count;
          ELSE
            -- Default unknown statuses to pending
            v_pending := v_pending + v_result.count;
        END CASE;
      END LOOP;
    END IF;
  END LOOP;

  -- Calculate total
  v_total := v_pending + v_in_progress + v_completed + v_blocked;

  -- Return JSON with aggregated statistics
  RETURN json_build_object(
    'total', v_total,
    'pending', v_pending,
    'inProgress', v_in_progress,
    'completed', v_completed,
    'blocked', v_blocked,
    'completionRate', CASE WHEN v_total > 0 THEN (v_completed::float / v_total::float) * 100 ELSE 0 END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment for documentation
COMMENT ON FUNCTION get_task_stats_aggregated IS 'Aggregates task statistics across all task-type databases. Supports optional filtering by project_id. Returns JSON with total, pending, inProgress, completed, blocked counts and completionRate percentage.';
