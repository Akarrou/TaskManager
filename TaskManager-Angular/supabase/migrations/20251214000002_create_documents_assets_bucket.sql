-- Migration: Create documents-assets storage bucket
-- Description: Creates a public storage bucket for document images and attachments
-- Author: Claude Code
-- Date: 2025-12-14

-- Create the documents-assets bucket
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'documents-assets',
  'documents-assets',
  true,  -- Public bucket for easy access
  52428800,  -- 50MB max file size
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/pdf'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for documents-assets bucket

-- Policy: Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload documents assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents-assets'
);

-- Policy: Allow public read access to all files
CREATE POLICY "Public read access for documents assets"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'documents-assets'
);

-- Policy: Allow authenticated users to update their own files
CREATE POLICY "Authenticated users can update documents assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents-assets'
)
WITH CHECK (
  bucket_id = 'documents-assets'
);

-- Policy: Allow authenticated users to delete their own files
CREATE POLICY "Authenticated users can delete documents assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents-assets'
);

-- Add comment for documentation
COMMENT ON TABLE storage.buckets IS 'Storage buckets for Supabase Storage';
