-- Migration: Fix get_task_stats_aggregated double col_ prefix and add missing statuses
-- Description: Strips existing col_ prefix from column IDs before prepending it,
--              and adds backlog, awaitingInfo, cancelled status counts

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
  v_col_name TEXT;
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
      -- Strip existing col_ prefix to avoid double prefix (col_col_...)
      v_col_name := regexp_replace(v_status_col_id, '^col_', '');
      v_col_name := 'col_' || replace(v_col_name, '-', '_');

      -- Build dynamic query to count by status
      v_sql := format(
        'SELECT
          COALESCE(%I, ''pending'') AS status,
          COUNT(*) AS count
        FROM %I
        WHERE deleted_at IS NULL
        GROUP BY %I',
        v_col_name,
        v_databases.table_name,
        v_col_name
      );

      -- Execute and aggregate results
      BEGIN
        FOR v_result IN EXECUTE v_sql LOOP
          CASE
            -- Normalize status values (supports French and English)
            WHEN lower(v_result.status::text) SIMILAR TO '%(backlog|arriéré)%' THEN
              v_backlog := v_backlog + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(pending|en.?attente|à.?faire|todo)%' THEN
              v_pending := v_pending + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(in.?progress|en.?cours)%' THEN
              v_in_progress := v_in_progress + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(completed|terminée?|done)%' THEN
              v_completed := v_completed + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(blocked|bloquée?)%' THEN
              v_blocked := v_blocked + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(awaiting.?info|en.?attente.?info|waiting)%' THEN
              v_awaiting_info := v_awaiting_info + v_result.count;
            WHEN lower(v_result.status::text) SIMILAR TO '%(cancelled|annulée?)%' THEN
              v_cancelled := v_cancelled + v_result.count;
            ELSE
              -- Default unknown statuses to pending
              v_pending := v_pending + v_result.count;
          END CASE;
        END LOOP;
      EXCEPTION WHEN undefined_column THEN
        -- Column doesn't exist in physical table, skip this database
        CONTINUE;
      END;
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

COMMENT ON FUNCTION get_task_stats_aggregated IS 'Aggregates task statistics across all task-type databases. Handles col_ prefix in column IDs. Supports backlog, pending, in_progress, completed, blocked, awaiting_info, cancelled statuses.';
