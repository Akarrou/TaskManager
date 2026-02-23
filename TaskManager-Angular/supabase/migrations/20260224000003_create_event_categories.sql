-- ============================================================================
-- Migration: Create event_categories table for custom event categories
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  color_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_categories_user_key_unique UNIQUE (user_id, key)
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_event_categories_user_id ON public.event_categories(user_id);

-- Reuse the existing updated_at trigger function
CREATE TRIGGER set_event_categories_updated_at
  BEFORE UPDATE ON public.event_categories
  FOR EACH ROW
  EXECUTE FUNCTION google_calendar_update_updated_at();

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own categories"
  ON public.event_categories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own categories"
  ON public.event_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own categories"
  ON public.event_categories FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own categories"
  ON public.event_categories FOR DELETE
  USING (auth.uid() = user_id);
