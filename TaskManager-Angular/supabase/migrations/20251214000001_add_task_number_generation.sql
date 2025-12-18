-- Migration: Add Task Number Auto-Generation
-- Date: 2025-12-14
-- Description: Creates RPC function to generate formatted task numbers (ID-XXXX)

-- Function to get next formatted task number
CREATE OR REPLACE FUNCTION get_next_task_number()
RETURNS TEXT AS $$
DECLARE
  v_next_num INTEGER;
  v_formatted TEXT;
BEGIN
  -- Get next value from existing sequence
  v_next_num := nextval('public.tasks_task_number_seq'::regclass);

  -- Format as ID-XXXX (4 digits, zero-padded)
  v_formatted := 'ID-' || lpad(v_next_num::text, 4, '0');

  RETURN v_formatted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_next_task_number IS
  'Generates next task number in ID-XXXX format using global sequence. Returns formatted string like ID-0001, ID-0042, etc.';
