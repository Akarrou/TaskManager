-- ============================================================================
-- Migration: Add calendar_color column to google_calendar_sync_config
-- Stores the backgroundColor from Google Calendar API for color mapping
-- ============================================================================

ALTER TABLE public.google_calendar_sync_config
  ADD COLUMN IF NOT EXISTS calendar_color TEXT;
