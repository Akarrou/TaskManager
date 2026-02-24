-- Migration: Enable Supabase Realtime on static tables
-- Date: 2026-02-27
-- Description: Adds static application tables to the supabase_realtime publication
-- so that changes (INSERT/UPDATE/DELETE) are broadcast via WebSocket to connected clients.
-- This enables the Angular app to automatically refresh when the MCP server modifies data.

DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'projects',
    'documents',
    'document_databases',
    'trash_items',
    'event_categories',
    'document_tabs',
    'document_sections',
    'document_tab_items',
    'document_tab_groups',
    'block_comments',
    'project_members'
  ];
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- Table already in publication, skip
    END;
  END LOOP;
END;
$$;
