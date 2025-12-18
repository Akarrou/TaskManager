/**
 * Mind Map Data Models
 *
 * Type definitions for the mind map block integrated in TipTap editor.
 * Uses D3.js tree layout for visualization.
 */

// =====================================================================
// Node Style Types
// =====================================================================

/**
 * Style configuration for a mind map node
 */
export interface MindmapNodeStyle {
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  shape: 'rectangle' | 'rounded' | 'ellipse' | 'pill';
}

// =====================================================================
// Node Types
// =====================================================================

/**
 * A single node in the mind map
 */
export interface MindmapNode {
  id: string;
  label: string;
  parentId: string | null;
  children?: string[];
  style?: Partial<MindmapNodeStyle>;
  collapsed?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Link between two nodes (derived from parent-child relationship)
 */
export interface MindmapLink {
  source: string;
  target: string;
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
  fontSize: 14,
  fontWeight: 'normal',
  shape: 'rounded',
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
