/**
 * Mind Map Data Models
 *
 * Type definitions for the mind map block integrated in TipTap editor.
 * Uses Cytoscape.js for visualization with Miro-like features.
 */

// =====================================================================
// Node Shape & Style Types
// =====================================================================

/**
 * Available node shapes (compatible with Cytoscape.js)
 */
export type MindmapNodeShape =
  | 'round-rectangle' // Default rounded rectangle
  | 'ellipse' // Oval/circle
  | 'diamond' // Diamond/rhombus
  | 'hexagon' // Hexagon
  | 'round-tag' // Pill/tag shape
  | 'rectangle'; // Sharp rectangle

/**
 * Border style options
 */
export type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'double';

/**
 * Style configuration for a mind map node
 */
export interface MindmapNodeStyle {
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  borderStyle: BorderStyle;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  shape: MindmapNodeShape;
}

// =====================================================================
// Rich Content Types
// =====================================================================

/**
 * Rich content for a node (title + description + formatted content)
 */
export interface MindmapNodeContent {
  title: string; // Primary label (required)
  description?: string; // Optional subtitle/description
  formattedContent?: string; // HTML content for rich text (bullet points, bold, etc.)
}

// =====================================================================
// Node Types
// =====================================================================

/**
 * A single node in the mind map
 */
export interface MindmapNode {
  id: string;
  label: string; // Kept for backwards compatibility
  content?: MindmapNodeContent; // Rich content (title + description)
  parentId: string | null;
  children?: string[];
  style?: Partial<MindmapNodeStyle>;
  collapsed?: boolean;
  metadata?: Record<string, unknown>;
  // Sizing options
  autoSize?: boolean; // Auto-size based on content
  customWidth?: number; // Custom width override
  customHeight?: number; // Custom height override
}

/**
 * Link between two nodes (derived from parent-child relationship)
 */
export interface MindmapLink {
  source: string;
  target: string;
}

// =====================================================================
// Sticky Notes Types
// =====================================================================

/**
 * Available sticky note colors (Miro-style)
 */
export type StickyNoteColor =
  | 'yellow'
  | 'pink'
  | 'blue'
  | 'green'
  | 'purple'
  | 'orange';

/**
 * Sticky note - free-positioned note on the canvas
 */
export interface StickyNote {
  id: string;
  content: string;
  color: StickyNoteColor;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  createdAt: string;
  updatedAt: string;
}

// =====================================================================
// Layout & Theme Types
// =====================================================================

/**
 * Layout algorithm options
 */
export type MindmapLayoutType = 'tree' | 'radial' | 'horizontal' | 'cluster';

/**
 * Theme presets for mind map
 */
export type MindmapTheme =
  | 'default'
  | 'ocean'
  | 'forest'
  | 'sunset'
  | 'monochrome';

// =====================================================================
// Configuration
// =====================================================================

/**
 * Mind map configuration
 */
export interface MindmapConfig {
  name: string;
  layout: MindmapLayoutType;
  theme: MindmapTheme;
  nodeSpacing: number;
  levelSpacing: number;
  animationDuration: number;
  showGrid: boolean;
  snapToGrid: boolean;
  enableZoom: boolean;
  enableDrag: boolean;
  minZoom: number;
  maxZoom: number;
}

// =====================================================================
// Main Data Structure
// =====================================================================

/**
 * Current view state (zoom, pan position)
 */
export interface MindmapViewState {
  zoom: number;
  panX: number;
  panY: number;
}

/**
 * Complete mind map data (stored in TipTap node)
 */
export interface MindmapData {
  nodes: MindmapNode[];
  stickyNotes?: StickyNote[]; // Free-positioned sticky notes
  rootId: string;
  config: MindmapConfig;
  viewState?: MindmapViewState;
}

/**
 * Attributes stored in the TipTap node
 */
export interface MindmapNodeAttributes {
  mindmapId: string;
  data: MindmapData;
  deleted?: boolean;
}

// =====================================================================
// D3 Internal Types (for component use)
// =====================================================================

/**
 * D3 hierarchy node with position data
 */
export interface D3MindmapNode {
  id: string;
  label: string;
  style: MindmapNodeStyle;
  collapsed: boolean;
  x: number;
  y: number;
  depth: number;
  parent: D3MindmapNode | null;
  children?: D3MindmapNode[];
  data: MindmapNode;
}

// =====================================================================
// Default Values
// =====================================================================

export const DEFAULT_NODE_STYLE: MindmapNodeStyle = {
  backgroundColor: '#3b82f6',
  textColor: '#ffffff',
  borderColor: '#2563eb',
  borderWidth: 2,
  borderRadius: 8,
  borderStyle: 'solid',
  fontSize: 14,
  fontWeight: 'normal',
  shape: 'round-rectangle',
};

export const DEFAULT_ROOT_STYLE: Partial<MindmapNodeStyle> = {
  backgroundColor: '#1e40af',
  fontSize: 16,
  fontWeight: 'bold',
};

export const DEFAULT_MINDMAP_CONFIG: MindmapConfig = {
  name: 'Nouvelle Mind Map',
  layout: 'horizontal',
  theme: 'default',
  nodeSpacing: 50,
  levelSpacing: 200,
  animationDuration: 300,
  showGrid: false,
  snapToGrid: false,
  enableZoom: true,
  enableDrag: true,
  minZoom: 0.25,
  maxZoom: 3,
};

/**
 * Create default mind map data with a root node
 */
export function createDefaultMindmapData(
  rootLabel: string = 'Idee centrale'
): MindmapData {
  const rootId = crypto.randomUUID();
  return {
    nodes: [
      {
        id: rootId,
        label: rootLabel,
        parentId: null,
        children: [],
        style: DEFAULT_ROOT_STYLE,
        collapsed: false,
      },
    ],
    rootId,
    config: { ...DEFAULT_MINDMAP_CONFIG },
  };
}

/**
 * Theme color palettes
 */
export const THEME_PALETTES: Record<MindmapTheme, string[]> = {
  default: ['#1e40af', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#22c55e'],
  ocean: ['#0c4a6e', '#0284c7', '#06b6d4', '#0891b2', '#0e7490', '#155e75'],
  forest: ['#14532d', '#15803d', '#22c55e', '#4ade80', '#86efac', '#bbf7d0'],
  sunset: ['#7c2d12', '#c2410c', '#ea580c', '#f97316', '#fb923c', '#fdba74'],
  monochrome: ['#111827', '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af'],
};

/**
 * Get color for a node based on depth and theme
 */
export function getNodeColorByDepth(
  depth: number,
  theme: MindmapTheme
): string {
  const palette = THEME_PALETTES[theme];
  return palette[Math.min(depth, palette.length - 1)];
}

/**
 * Generate a unique mindmap ID
 */
export function generateMindmapId(): string {
  return 'mm-' + crypto.randomUUID();
}

// =====================================================================
// Sticky Note & Node Color Constants
// =====================================================================

/**
 * Sticky note color hex values (Miro-style)
 */
export const STICKY_NOTE_COLORS: Record<StickyNoteColor, string> = {
  yellow: '#fef08a',
  pink: '#fda4af',
  blue: '#93c5fd',
  green: '#86efac',
  purple: '#c4b5fd',
  orange: '#fed7aa',
};

/**
 * Preset colors for node customization
 */
export const NODE_PRESET_COLORS = [
  '#1e40af',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#22c55e',
  '#0284c7',
  '#0891b2',
  '#059669',
  '#dc2626',
  '#f59e0b',
  '#6366f1',
];

/**
 * Shape options with labels for UI
 */
export const SHAPE_OPTIONS: { value: MindmapNodeShape; label: string }[] = [
  { value: 'round-rectangle', label: 'Rectangle arrondi' },
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'diamond', label: 'Losange' },
  { value: 'hexagon', label: 'Hexagone' },
  { value: 'round-tag', label: 'Etiquette' },
];

/**
 * Create a default sticky note
 */
export function createDefaultStickyNote(
  position: { x: number; y: number } = { x: 100, y: 100 }
): StickyNote {
  return {
    id: crypto.randomUUID(),
    content: '',
    color: 'yellow',
    position,
    size: { width: 200, height: 150 },
    zIndex: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
