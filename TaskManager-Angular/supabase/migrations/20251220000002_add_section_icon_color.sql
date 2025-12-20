-- Migration: Add icon and color columns to document_sections
-- Date: 2025-12-20
-- Description: Adds icon and color customization to document sections

-- Add icon column with default value
ALTER TABLE public.document_sections
ADD COLUMN IF NOT EXISTS icon text DEFAULT 'folder_open';

-- Add color column with default value
ALTER TABLE public.document_sections
ADD COLUMN IF NOT EXISTS color text DEFAULT '#6366f1';

-- Add comments for new columns
COMMENT ON COLUMN public.document_sections.icon IS 'Material icon name for the section';
COMMENT ON COLUMN public.document_sections.color IS 'Hex color code for the section';
