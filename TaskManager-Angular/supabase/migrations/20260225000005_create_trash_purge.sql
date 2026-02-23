-- Migration: Create purge function for expired trash items
-- Description: Deletes items from their original tables and removes trash_items records
-- when expires_at has passed. Should be called daily (via pg_cron or edge function).

CREATE OR REPLACE FUNCTION purge_expired_trash()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record RECORD;
  v_purged_count INTEGER := 0;
  v_errors TEXT[] := '{}';
BEGIN
  FOR v_record IN
    SELECT id, item_type, item_id, item_table, display_name
    FROM trash_items
    WHERE expires_at <= now()
    ORDER BY deleted_at ASC
  LOOP
    BEGIN
      -- Hard delete from original table
      EXECUTE format(
        'DELETE FROM %I WHERE id = $1',
        v_record.item_table
      ) USING v_record.item_id::uuid;

      -- Remove trash record
      DELETE FROM trash_items WHERE id = v_record.id;

      v_purged_count := v_purged_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue with other items
      v_errors := array_append(v_errors,
        format('Failed to purge %s (%s): %s', v_record.display_name, v_record.item_id, SQLERRM)
      );
      -- Still remove trash record if original table deletion fails (item may already be gone)
      DELETE FROM trash_items WHERE id = v_record.id;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'purged_count', v_purged_count,
    'errors', to_jsonb(v_errors)
  );
END;
$$;

COMMENT ON FUNCTION purge_expired_trash IS
'Purge les éléments expirés de la corbeille. Supprime définitivement les items de leur table d''origine puis nettoie trash_items. À appeler quotidiennement.';

-- Grant execute to service_role (for edge function / cron invocation)
GRANT EXECUTE ON FUNCTION purge_expired_trash TO service_role;
