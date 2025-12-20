import { Document } from '../services/document.service';

/**
 * Document Tab - A container for organizing document cards within a project
 */
export interface DocumentTab {
  id: string;
  project_id: string;
  name: string;
  icon: string;
  color: string;
  position: number;
  is_default: boolean;
  user_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Document Section - A titled divider within a tab for grouping documents
 */
export interface DocumentSection {
  id: string;
  tab_id: string;
  title: string;
  position: number;
  is_collapsed: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * Document Tab Item - Links a document to a tab with position tracking
 */
export interface DocumentTabItem {
  id: string;
  document_id: string;
  tab_id: string;
  section_id: string | null;
  position: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Section with its document items - Aggregated view for display
 */
export interface SectionWithItems extends DocumentSection {
  items: DocumentTabItem[];
}

/**
 * Tab with its sections and items - Aggregated view for display
 */
export interface TabWithItems extends DocumentTab {
  sections: SectionWithItems[];
  unsectionedItems: DocumentTabItem[];
}

/**
 * Drag event payload for document drag operations
 */
export interface DocumentDragPayload {
  documentId: string;
  itemId: string;
  sourceTabId: string;
  sourceSectionId: string | null;
  sourcePosition: number;
}

/**
 * Drop target for document positioning
 */
export interface DocumentDropTarget {
  tabId: string;
  sectionId: string | null;
  position: number;
}

/**
 * Create DTO for DocumentTab
 */
export type CreateDocumentTab = Pick<DocumentTab, 'project_id' | 'name'> &
  Partial<Pick<DocumentTab, 'icon' | 'color' | 'position' | 'is_default'>>;

/**
 * Update DTO for DocumentTab
 */
export type UpdateDocumentTab = Partial<Pick<DocumentTab, 'name' | 'icon' | 'color' | 'position' | 'is_default'>>;

/**
 * Create DTO for DocumentSection
 */
export type CreateDocumentSection = Pick<DocumentSection, 'tab_id' | 'title'> &
  Partial<Pick<DocumentSection, 'position'>>;

/**
 * Update DTO for DocumentSection
 */
export type UpdateDocumentSection = Partial<Pick<DocumentSection, 'title' | 'position' | 'is_collapsed'>>;

/**
 * Result of loading tabs with all related data
 */
export interface TabsLoadResult {
  tabs: DocumentTab[];
  sections: DocumentSection[];
  items: DocumentTabItem[];
}

/**
 * Event emitted when a document is moved via drag & drop
 */
export interface DocumentMoveEvent {
  documentId: string;
  itemId: string;
  fromTabId: string;
  fromSectionId: string | null;
  toTabId: string;
  toSectionId: string | null;
  newPosition: number;
}

/**
 * Event emitted when documents are reordered within a section
 */
export interface DocumentReorderEvent {
  tabId: string;
  sectionId: string | null;
  documentIds: string[];
}

/**
 * Event emitted when sections are reordered within a tab
 */
export interface SectionReorderEvent {
  tabId: string;
  sectionIds: string[];
}

/**
 * Event emitted when tabs are reordered
 */
export interface TabReorderEvent {
  projectId: string;
  tabIds: string[];
}
