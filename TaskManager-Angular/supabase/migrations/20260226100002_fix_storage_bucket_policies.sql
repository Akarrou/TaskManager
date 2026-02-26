-- =============================================================================
-- Migration: Fix overly permissive storage bucket policies
-- Date: 2026-02-26
-- Description:
--   The original bucket policies (created in 20251214000002 and 20251214000003)
--   allow ANY authenticated user to INSERT, UPDATE, and DELETE files in ALL
--   paths within the buckets. This means user A can overwrite or delete user B's
--   files — a serious data integrity and security issue.
--
--   Fix: Enforce ownership checks that match the app's existing upload paths.
--
--   documents-files bucket:
--     Upload path pattern: documents/{documentId}/files/{filename}
--     Security: JOIN with public.documents to verify the authenticated user
--     owns the document referenced by the 2nd path segment (the document ID).
--
--   documents-assets bucket:
--     Upload path pattern: documents/images/{filename}
--     Security: No document ID in path, so INSERT is allowed for any
--     authenticated user. UPDATE/DELETE use the owner column (automatically
--     set by Supabase on INSERT) to restrict to the file's uploader.
--
--   SELECT (read) remains public for both buckets since the buckets are public
--   and files need to be rendered in shared documents.
--
--   Buckets affected:
--     1. documents-assets — images and attachments embedded in documents
--     2. documents-files  — uploaded file attachments (PDF, DOCX, XLSX, TXT)
-- =============================================================================


-- =============================================================================
-- 1. FIX: documents-assets bucket policies
-- =============================================================================

-- Drop all existing permissive policies for documents-assets
DROP POLICY IF EXISTS "Authenticated users can upload documents assets" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for documents assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update documents assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete documents assets" ON storage.objects;

-- SELECT: Public read access (required for rendering images/attachments in documents)
-- This remains permissive because the bucket is public and URLs are shared in document content.
CREATE POLICY "Public read access for documents assets"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'documents-assets'
);

-- INSERT: Any authenticated user can upload assets.
-- The path pattern is documents/images/{filename} — no document ID or user ID is embedded,
-- so we simply require authentication. The owner column is set automatically by Supabase.
CREATE POLICY "Authenticated users can upload documents assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents-assets'
);

-- UPDATE: Only the original uploader can update their own assets.
-- Uses the owner/owner_id column (automatically set by Supabase on INSERT).
-- Depending on the Storage API version, the column may be `owner` or `owner_id`.
CREATE POLICY "Authenticated users can update documents assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents-assets'
  AND (owner = auth.uid() OR owner_id = auth.uid())
);

-- DELETE: Only the original uploader can delete their own assets.
-- Depending on the Storage API version, the column may be `owner` or `owner_id`.
CREATE POLICY "Authenticated users can delete documents assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents-assets'
  AND (owner = auth.uid() OR owner_id = auth.uid())
);


-- =============================================================================
-- 2. FIX: documents-files bucket policies
-- =============================================================================

-- Drop all existing permissive policies for documents-files
DROP POLICY IF EXISTS "Authenticated users can upload documents files" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for documents files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update documents files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete documents files" ON storage.objects;

-- SELECT: Public read access (required for downloading/previewing attached files)
-- This remains permissive because the bucket is public and download URLs are shared.
CREATE POLICY "Public read access for documents files"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'documents-files'
);

-- INSERT: Authenticated users can upload files only into documents they own.
-- The app uploads with path: documents/{documentId}/files/{filename}
-- storage.foldername(name) returns ['documents', '{documentId}', 'files']
-- We verify the user owns the document referenced by the 2nd path segment.
CREATE POLICY "Authenticated users can upload documents files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents-files'
  AND EXISTS (
    SELECT 1 FROM public.documents
    WHERE id::text = (storage.foldername(name))[2]
    AND user_id = auth.uid()
  )
);

-- UPDATE: Authenticated users can only update files in documents they own.
CREATE POLICY "Authenticated users can update documents files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents-files'
  AND EXISTS (
    SELECT 1 FROM public.documents
    WHERE id::text = (storage.foldername(name))[2]
    AND user_id = auth.uid()
  )
);

-- DELETE: Authenticated users can only delete files in documents they own.
CREATE POLICY "Authenticated users can delete documents files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents-files'
  AND EXISTS (
    SELECT 1 FROM public.documents
    WHERE id::text = (storage.foldername(name))[2]
    AND user_id = auth.uid()
  )
);
