import { JSONContent } from '@tiptap/core';

/**
 * Type alias for TipTap document content.
 * Uses ProseMirror's JSONContent schema for type safety.
 */
export type DocumentContent = JSONContent;

/**
 * Complete document state interface.
 * Single source of truth for all document-related state.
 */
export interface DocumentState {
  /** Document ID from Supabase (null for new documents) */
  id: string | null;
  /** Document title */
  title: string;
  /** Document content in TipTap's JSON format */
  content: DocumentContent;
  /** Whether the document has unsaved changes */
  isDirty: boolean;
  /** Whether a save operation is in progress */
  isSaving: boolean;
  /** Timestamp of last successful save */
  lastSaved: Date | null;
  /** Database ID if this document represents a database row (Notion-style) */
  database_id?: string | null;
  /** Database row ID if this document represents a database row */
  database_row_id?: string | null;
  /** Project ID this document belongs to */
  project_id?: string | null;
}

/**
 * Snapshot of document state for dirty tracking.
 * Contains only the fields that should be saved to the database.
 */
export interface DocumentSnapshot {
  title: string;
  content: DocumentContent;
}

/**
 * Helper function to create a snapshot from current state.
 * Used for dirty tracking by comparing current state with original snapshot.
 */
export function createSnapshot(state: DocumentState): DocumentSnapshot {
  return {
    title: state.title,
    content: state.content
  };
}

/**
 * Helper function to detect changes between snapshots.
 * Uses deep comparison for content (JSON.stringify).
 *
 * @param current - Current document snapshot
 * @param original - Original snapshot to compare against
 * @returns true if there are changes, false otherwise
 */
export function hasChanges(current: DocumentSnapshot, original: DocumentSnapshot | null): boolean {
  if (!original) return false;

  return current.title !== original.title ||
         JSON.stringify(current.content) !== JSON.stringify(original.content);
}
