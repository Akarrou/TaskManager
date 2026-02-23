-- Change google_calendar_event_mapping.sync_config_id from ON DELETE CASCADE to ON DELETE SET NULL.
-- This preserves mappings when a user disconnects and reconnects Google Calendar,
-- preventing duplicate events on re-sync.

ALTER TABLE public.google_calendar_event_mapping
  ALTER COLUMN sync_config_id DROP NOT NULL;

ALTER TABLE public.google_calendar_event_mapping
  DROP CONSTRAINT google_calendar_event_mapping_sync_config_id_fkey;

ALTER TABLE public.google_calendar_event_mapping
  ADD CONSTRAINT google_calendar_event_mapping_sync_config_id_fkey
    FOREIGN KEY (sync_config_id)
    REFERENCES public.google_calendar_sync_config(id)
    ON DELETE SET NULL;
