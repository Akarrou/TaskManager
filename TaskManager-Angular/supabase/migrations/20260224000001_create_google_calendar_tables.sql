-- Migration: Create Google Calendar Sync Tables
-- Date: 2026-02-24
-- Description: Creates tables for Google Calendar OAuth connections, sync configuration, event mapping, and sync logging

-- ============================================================================
-- Table: google_calendar_connections
-- Stores OAuth2 connections between Kodo users and their Google accounts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.google_calendar_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    google_email text NOT NULL,
    access_token_encrypted text NOT NULL,
    refresh_token_encrypted text NOT NULL,
    token_expires_at timestamp with time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT google_calendar_connections_user_id_unique UNIQUE (user_id)
);

COMMENT ON TABLE public.google_calendar_connections IS 'OAuth2 connections between Kodo users and their Google Calendar accounts. One connection per user.';

-- ============================================================================
-- Table: google_calendar_sync_config
-- Stores per-calendar sync configuration (which Google calendars to sync and how)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.google_calendar_sync_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    connection_id uuid REFERENCES public.google_calendar_connections(id) ON DELETE CASCADE NOT NULL,
    google_calendar_id text NOT NULL,
    google_calendar_name text NOT NULL,
    kodo_database_id uuid,
    sync_direction text DEFAULT 'bidirectional' NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    sync_token text,
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT google_calendar_sync_config_direction_check CHECK (sync_direction IN ('to_google', 'from_google', 'bidirectional')),
    CONSTRAINT google_calendar_sync_config_connection_calendar_unique UNIQUE (connection_id, google_calendar_id)
);

COMMENT ON TABLE public.google_calendar_sync_config IS 'Per-calendar sync configuration. Defines which Google calendars are synced, in which direction, and stores incremental sync tokens.';

-- ============================================================================
-- Table: google_calendar_event_mapping
-- Maps Kodo database rows to Google Calendar events for bidirectional sync
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.google_calendar_event_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    sync_config_id uuid REFERENCES public.google_calendar_sync_config(id) ON DELETE CASCADE NOT NULL,
    kodo_database_id uuid NOT NULL,
    kodo_row_id uuid NOT NULL,
    google_event_id text NOT NULL,
    google_calendar_id text NOT NULL,
    kodo_updated_at timestamp with time zone,
    google_updated_at timestamp with time zone,
    sync_status text DEFAULT 'pending' NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT google_calendar_event_mapping_status_check CHECK (sync_status IN ('synced', 'pending', 'conflict', 'error')),
    CONSTRAINT google_calendar_event_mapping_kodo_unique UNIQUE (kodo_database_id, kodo_row_id),
    CONSTRAINT google_calendar_event_mapping_google_unique UNIQUE (google_event_id, google_calendar_id)
);

COMMENT ON TABLE public.google_calendar_event_mapping IS 'Maps Kodo database rows to Google Calendar events. Tracks sync status and timestamps for conflict detection.';

-- ============================================================================
-- Table: google_calendar_sync_log
-- Audit log for all sync operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.google_calendar_sync_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    sync_config_id uuid REFERENCES public.google_calendar_sync_config(id) ON DELETE CASCADE NOT NULL,
    sync_type text NOT NULL,
    direction text NOT NULL,
    events_created integer DEFAULT 0 NOT NULL,
    events_updated integer DEFAULT 0 NOT NULL,
    events_deleted integer DEFAULT 0 NOT NULL,
    events_skipped integer DEFAULT 0 NOT NULL,
    errors jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT google_calendar_sync_log_type_check CHECK (sync_type IN ('full', 'incremental', 'push')),
    CONSTRAINT google_calendar_sync_log_direction_check CHECK (direction IN ('to_google', 'from_google')),
    CONSTRAINT google_calendar_sync_log_status_check CHECK (status IN ('success', 'partial', 'error'))
);

COMMENT ON TABLE public.google_calendar_sync_log IS 'Audit log for Google Calendar sync operations. Records event counts, errors, and timing for each sync run.';

-- ============================================================================
-- Indexes
-- ============================================================================

-- google_calendar_connections
CREATE INDEX IF NOT EXISTS idx_gc_connections_user_id ON public.google_calendar_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_gc_connections_is_active ON public.google_calendar_connections(is_active);

-- google_calendar_sync_config
CREATE INDEX IF NOT EXISTS idx_gc_sync_config_connection_id ON public.google_calendar_sync_config(connection_id);
CREATE INDEX IF NOT EXISTS idx_gc_sync_config_is_enabled ON public.google_calendar_sync_config(is_enabled);
CREATE INDEX IF NOT EXISTS idx_gc_sync_config_kodo_database_id ON public.google_calendar_sync_config(kodo_database_id);

-- google_calendar_event_mapping
CREATE INDEX IF NOT EXISTS idx_gc_event_mapping_sync_config_id ON public.google_calendar_event_mapping(sync_config_id);
CREATE INDEX IF NOT EXISTS idx_gc_event_mapping_kodo_row ON public.google_calendar_event_mapping(kodo_database_id, kodo_row_id);
CREATE INDEX IF NOT EXISTS idx_gc_event_mapping_google_event ON public.google_calendar_event_mapping(google_event_id, google_calendar_id);
CREATE INDEX IF NOT EXISTS idx_gc_event_mapping_sync_status ON public.google_calendar_event_mapping(sync_status);

-- google_calendar_sync_log
CREATE INDEX IF NOT EXISTS idx_gc_sync_log_sync_config_id ON public.google_calendar_sync_log(sync_config_id);
CREATE INDEX IF NOT EXISTS idx_gc_sync_log_status ON public.google_calendar_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_gc_sync_log_started_at ON public.google_calendar_sync_log(started_at);

-- ============================================================================
-- Trigger: auto-update updated_at columns
-- ============================================================================
CREATE OR REPLACE FUNCTION public.google_calendar_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER google_calendar_connections_updated_at
    BEFORE UPDATE ON public.google_calendar_connections
    FOR EACH ROW EXECUTE FUNCTION public.google_calendar_update_updated_at();

CREATE TRIGGER google_calendar_sync_config_updated_at
    BEFORE UPDATE ON public.google_calendar_sync_config
    FOR EACH ROW EXECUTE FUNCTION public.google_calendar_update_updated_at();

CREATE TRIGGER google_calendar_event_mapping_updated_at
    BEFORE UPDATE ON public.google_calendar_event_mapping
    FOR EACH ROW EXECUTE FUNCTION public.google_calendar_update_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_sync_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_event_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_sync_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for google_calendar_connections (direct user_id check)
CREATE POLICY "Users can view own connections"
    ON public.google_calendar_connections FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own connections"
    ON public.google_calendar_connections FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections"
    ON public.google_calendar_connections FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections"
    ON public.google_calendar_connections FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policies for google_calendar_sync_config (through JOIN to connections)
CREATE POLICY "Users can view own sync configs"
    ON public.google_calendar_sync_config FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.google_calendar_connections c
            WHERE c.id = connection_id AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create own sync configs"
    ON public.google_calendar_sync_config FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.google_calendar_connections c
            WHERE c.id = connection_id AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own sync configs"
    ON public.google_calendar_sync_config FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.google_calendar_connections c
            WHERE c.id = connection_id AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own sync configs"
    ON public.google_calendar_sync_config FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.google_calendar_connections c
            WHERE c.id = connection_id AND c.user_id = auth.uid()
        )
    );

-- RLS Policies for google_calendar_event_mapping (through JOINs to connections)
CREATE POLICY "Users can view own event mappings"
    ON public.google_calendar_event_mapping FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.google_calendar_sync_config sc
            JOIN public.google_calendar_connections c ON c.id = sc.connection_id
            WHERE sc.id = sync_config_id AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create own event mappings"
    ON public.google_calendar_event_mapping FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.google_calendar_sync_config sc
            JOIN public.google_calendar_connections c ON c.id = sc.connection_id
            WHERE sc.id = sync_config_id AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own event mappings"
    ON public.google_calendar_event_mapping FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.google_calendar_sync_config sc
            JOIN public.google_calendar_connections c ON c.id = sc.connection_id
            WHERE sc.id = sync_config_id AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own event mappings"
    ON public.google_calendar_event_mapping FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.google_calendar_sync_config sc
            JOIN public.google_calendar_connections c ON c.id = sc.connection_id
            WHERE sc.id = sync_config_id AND c.user_id = auth.uid()
        )
    );

-- RLS Policies for google_calendar_sync_log (through JOINs to connections)
CREATE POLICY "Users can view own sync logs"
    ON public.google_calendar_sync_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.google_calendar_sync_config sc
            JOIN public.google_calendar_connections c ON c.id = sc.connection_id
            WHERE sc.id = sync_config_id AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create own sync logs"
    ON public.google_calendar_sync_log FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.google_calendar_sync_config sc
            JOIN public.google_calendar_connections c ON c.id = sc.connection_id
            WHERE sc.id = sync_config_id AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own sync logs"
    ON public.google_calendar_sync_log FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.google_calendar_sync_config sc
            JOIN public.google_calendar_connections c ON c.id = sc.connection_id
            WHERE sc.id = sync_config_id AND c.user_id = auth.uid()
        )
    );
