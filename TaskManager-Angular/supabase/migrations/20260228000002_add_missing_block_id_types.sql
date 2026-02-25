-- =============================================================================
-- Add missing block types to assign_block_ids and re-run backfill
-- =============================================================================
-- The initial migration (20260228000001) missed spreadsheet, mindmap, taskMention.
-- This migration updates the function and re-runs the backfill.
-- Idempotent: only touches nodes that don't already have a blockId.
-- =============================================================================

-- 1. Replace the function with the complete type list
CREATE OR REPLACE FUNCTION assign_block_ids(node JSONB) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  eligible_types TEXT[] := ARRAY[
    'paragraph', 'heading', 'blockquote', 'codeBlock',
    'bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem',
    'table', 'tableRow', 'tableCell', 'tableHeader',
    'horizontalRule', 'image', 'columns', 'column',
    'databaseTable', 'taskSection',
    'accordionGroup', 'accordionItem', 'accordionTitle', 'accordionContent',
    'spreadsheet', 'mindmap', 'taskMention'
  ];
  node_type TEXT;
  attrs JSONB;
  children JSONB;
  child JSONB;
  new_children JSONB := '[]'::JSONB;
  i INT;
BEGIN
  node_type := node->>'type';

  IF node_type = ANY(eligible_types) THEN
    attrs := COALESCE(node->'attrs', '{}'::JSONB);
    IF attrs->>'blockId' IS NULL THEN
      attrs := attrs || jsonb_build_object('blockId', 'block-' || gen_random_uuid()::TEXT);
      node := jsonb_set(node, '{attrs}', attrs);
    END IF;
  END IF;

  children := node->'content';
  IF children IS NOT NULL AND jsonb_typeof(children) = 'array' AND jsonb_array_length(children) > 0 THEN
    FOR i IN 0..jsonb_array_length(children) - 1 LOOP
      child := assign_block_ids(children->i);
      new_children := new_children || jsonb_build_array(child);
    END LOOP;
    node := jsonb_set(node, '{content}', new_children);
  END IF;

  RETURN node;
END;
$$;

-- 2. Re-run backfill (idempotent — only assigns IDs to nodes that don't have one)
DO $$
DECLARE
  updated_count INT;
BEGIN
  UPDATE documents
  SET content = assign_block_ids(content)
  WHERE content IS NOT NULL
    AND jsonb_typeof(content) = 'object'
    AND content->>'type' = 'doc'
    AND content->'content' IS NOT NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled blockIds (with missing types) on % documents', updated_count;
END;
$$;
