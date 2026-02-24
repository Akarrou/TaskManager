-- =============================================================================
-- Full-text search for documents (titles + TipTap content)
-- =============================================================================

-- 1. Function to extract plain text from TipTap JSON content
CREATE OR REPLACE FUNCTION extract_tiptap_text(content JSONB)
RETURNS TEXT AS $$
DECLARE
  result TEXT := '';
  node JSONB;
BEGIN
  IF content IS NULL THEN
    RETURN '';
  END IF;

  -- Only access properties on JSONB objects (not arrays, strings, etc.)
  IF jsonb_typeof(content) = 'object' THEN
    -- If this node has a 'text' field, append it
    IF content->>'text' IS NOT NULL THEN
      result := result || (content->>'text') || ' ';
    END IF;

    -- Recursively process 'content' array
    IF content->'content' IS NOT NULL AND jsonb_typeof(content->'content') = 'array' THEN
      FOR node IN SELECT * FROM jsonb_array_elements(content->'content')
      LOOP
        result := result || extract_tiptap_text(node);
      END LOOP;
    END IF;
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Add search_vector column
ALTER TABLE documents ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 3. Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_documents_search_vector ON documents USING GIN (search_vector);

-- 4. Trigger function to auto-update search_vector on insert/update
CREATE OR REPLACE FUNCTION documents_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('french', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('french', COALESCE(extract_tiptap_text(NEW.content), '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger (drop first to be idempotent)
DROP TRIGGER IF EXISTS documents_search_vector_trigger ON documents;
CREATE TRIGGER documents_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, content ON documents
  FOR EACH ROW
  EXECUTE FUNCTION documents_search_vector_update();

-- 6. Backfill existing documents
UPDATE documents SET
  search_vector =
    setweight(to_tsvector('french', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('french', COALESCE(extract_tiptap_text(content), '')), 'B')
WHERE search_vector IS NULL;

-- 7. Add content_preview generated column (first 300 chars of extracted text)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS
  content_preview TEXT GENERATED ALWAYS AS (LEFT(extract_tiptap_text(content), 300)) STORED;

-- 8. RPC function for full-text search with ranking and excerpts
CREATE OR REPLACE FUNCTION search_documents_fulltext(
  p_user_id UUID,
  p_query TEXT,
  p_project_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  excerpt TEXT,
  parent_id UUID,
  project_id UUID,
  rank REAL,
  updated_at TIMESTAMPTZ
) AS $$
DECLARE
  tsquery_val TSQUERY;
BEGIN
  tsquery_val := plainto_tsquery('french', p_query);

  RETURN QUERY
  SELECT
    d.id,
    d.title,
    ts_headline('french',
      COALESCE(d.title, '') || ' ' || COALESCE(extract_tiptap_text(d.content), ''),
      tsquery_val,
      'StartSel=>>>, StopSel=<<<, MaxWords=35, MinWords=15'
    ) AS excerpt,
    d.parent_id,
    d.project_id,
    ts_rank(d.search_vector, tsquery_val) AS rank,
    d.updated_at
  FROM documents d
  WHERE d.user_id = p_user_id
    AND d.deleted_at IS NULL
    AND d.search_vector @@ tsquery_val
    AND (p_project_id IS NULL OR d.project_id = p_project_id)
  ORDER BY rank DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;
