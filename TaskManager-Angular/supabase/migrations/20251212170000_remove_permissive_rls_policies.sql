-- Migration: Remove permissive RLS policies created in initial migrations
-- Date: 2025-12-12
-- Description: Removes overly permissive RLS policies that allow all users to view relations

-- Remove permissive policies from document_task_relations
DROP POLICY IF EXISTS "Users can view all document-task relations" ON public.document_task_relations;
DROP POLICY IF EXISTS "Users can create document-task relations" ON public.document_task_relations;
DROP POLICY IF EXISTS "Users can update document-task relations" ON public.document_task_relations;
DROP POLICY IF EXISTS "Users can delete document-task relations" ON public.document_task_relations;

-- Remove permissive policies from document_databases
DROP POLICY IF EXISTS "Users can view all document databases" ON public.document_databases;
DROP POLICY IF EXISTS "Users can create document databases" ON public.document_databases;
DROP POLICY IF EXISTS "Users can update document databases" ON public.document_databases;
DROP POLICY IF EXISTS "Users can delete document databases" ON public.document_databases;

-- Note: The strict owner-based policies have already been created by migration 20251212160000_fix_cascade_deletion_issues.sql
