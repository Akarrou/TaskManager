/**
 * Document Tab Group - A collapsible container for organizing tabs (like Chrome/Brave)
 */
export interface DocumentTabGroup {
  id: string;
  project_id: string;
  name: string;
  color: string;
  position: number;
  is_collapsed: boolean;
  created_at?: string;
  updated_at?: string;
}

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
  tab_group_id?: string | null;
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
  icon: string;
  color: string;
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
  is_pinned: boolean;
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
 * Create DTO for DocumentTabGroup
 */
export type CreateDocumentTabGroup = Pick<DocumentTabGroup, 'project_id' | 'name'> &
  Partial<Pick<DocumentTabGroup, 'color' | 'position'>>;

/**
 * Update DTO for DocumentTabGroup
 */
export type UpdateDocumentTabGroup = Partial<
  Pick<DocumentTabGroup, 'name' | 'color' | 'position' | 'is_collapsed'>
>;

/**
 * Tab Group with its tabs - Aggregated view for display
 */
export interface TabGroupWithTabs extends DocumentTabGroup {
  tabs: DocumentTab[];
}

/**
 * Create DTO for DocumentTab
 */
export type CreateDocumentTab = Pick<DocumentTab, 'project_id' | 'name'> &
  Partial<Pick<DocumentTab, 'icon' | 'color' | 'position' | 'is_default' | 'tab_group_id'>>;

/**
 * Update DTO for DocumentTab
 */
export type UpdateDocumentTab = Partial<Pick<DocumentTab, 'name' | 'icon' | 'color' | 'position' | 'is_default'>>;

/**
 * Create DTO for DocumentSection
 */
export type CreateDocumentSection = Pick<DocumentSection, 'tab_id' | 'title'> &
  Partial<Pick<DocumentSection, 'icon' | 'color' | 'position'>>;

/**
 * Update DTO for DocumentSection
 */
export type UpdateDocumentSection = Partial<Pick<DocumentSection, 'title' | 'icon' | 'color' | 'position' | 'is_collapsed'>>;

/**
 * Result of loading tabs with all related data
 */
export interface TabsLoadResult {
  tabs: DocumentTab[];
  groups: DocumentTabGroup[];
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
