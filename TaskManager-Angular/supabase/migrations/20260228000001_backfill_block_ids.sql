-- =============================================================================
-- Backfill blockIds on all existing document blocks
-- =============================================================================
-- Creates a persistent function assign_block_ids(JSONB) → JSONB that recursively
-- assigns 'block-<uuid>' to every eligible node missing a blockId.
-- Then runs a one-time UPDATE on all documents.
-- Idempotent: existing blockIds are never overwritten.
-- =============================================================================

-- 1. Create the persistent function
CREATE OR REPLACE FUNCTION assign_block_ids(node JSONB) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  eligible_types TEXT[] := ARRAY[
    'paragraph', 'heading', 'blockquote', 'codeBlock',
    'bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem',
    'table', 'tableRow', 'tableCell', 'tableHeader',
    'horizontalRule', 'image', 'columns', 'column',
    'databaseTable', 'taskSection',
    'accordionGroup', 'accordionItem', 'accordionTitle', 'accordionContent'
  ];
  node_type TEXT;
  attrs JSONB;
  children JSONB;
  child JSONB;
  new_children JSONB := '[]'::JSONB;
  i INT;
BEGIN
  -- Get the node type
  node_type := node->>'type';

  -- If this node's type is eligible, ensure it has a blockId
  IF node_type = ANY(eligible_types) THEN
    attrs := COALESCE(node->'attrs', '{}'::JSONB);
    IF attrs->>'blockId' IS NULL THEN
      attrs := attrs || jsonb_build_object('blockId', 'block-' || gen_random_uuid()::TEXT);
      node := jsonb_set(node, '{attrs}', attrs);
    END IF;
  END IF;

  -- Recurse into content array if present
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

-- 2. Backfill all documents (including soft-deleted ones that can be restored)
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
  RAISE NOTICE 'Backfilled blockIds on % documents', updated_count;
END;
$$;
