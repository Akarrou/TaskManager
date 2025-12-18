-- Migration: Create documents-files storage bucket
-- Description: Creates a public storage bucket for document files (PDF, DOCX, XLSX, TXT)
-- Author: Claude Code
-- Date: 2025-12-14

-- Create the documents-files bucket
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'documents-files',
  'documents-files',
  true,  -- Public bucket for easy access via URLs
  10485760,  -- 10MB max file size
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  -- DOCX
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  -- XLSX
    'text/plain'  -- TXT
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for documents-files bucket

-- Policy: Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload documents files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents-files'
);

-- Policy: Allow public read access to all files
CREATE POLICY "Public read access for documents files"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'documents-files'
);

-- Policy: Allow authenticated users to update their own files
CREATE POLICY "Authenticated users can update documents files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents-files'
)
WITH CHECK (
  bucket_id = 'documents-files'
);

-- Policy: Allow authenticated users to delete their own files
CREATE POLICY "Authenticated users can delete documents files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents-files'
);

-- Add comment for documentation
COMMENT ON TABLE storage.buckets IS 'Storage buckets for Supabase Storage';
