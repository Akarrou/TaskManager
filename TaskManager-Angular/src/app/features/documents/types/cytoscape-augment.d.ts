/* eslint-disable @typescript-eslint/no-explicit-any */
import 'cytoscape';

declare module 'cytoscape' {
  // Undo/Redo Types
  interface UndoRedoOptions {
    isDebug?: boolean;
    actions?: Record<string, UndoRedoAction>;
    undoableDrag?: boolean;
    stackSizeLimit?: number;
    ready?: () => void;
  }

  interface UndoRedoAction {
    undo: (args: any) => any;
    redo: (args: any) => any;
  }

  interface UndoRedoInstance {
    action(name: string, doFunc: (args: any) => any, undoFunc: (args: any) => any): void;
    do(name: string, args: any): any;
    undo(): any;
    redo(): any;
    isUndoStackEmpty(): boolean;
    isRedoStackEmpty(): boolean;
    getUndoStack(): any[];
    getRedoStack(): any[];
    reset(undos?: any[], redos?: any[]): void;
  }

  // Expand/Collapse Types
  interface ExpandCollapseOptions {
    layoutBy?: LayoutOptions | null;
    fisheye?: boolean;
    animate?: boolean;
    animationDuration?: number;
    ready?: () => void;
    undoable?: boolean;
    cueEnabled?: boolean;
    expandCollapseCuePosition?: string;
    expandCollapseCueSize?: number;
    expandCollapseCueLineSize?: number;
    expandCueImage?: string;
    collapseCueImage?: string;
    expandCollapseCueSensitivity?: number;
    zIndex?: number;
  }

  interface ExpandCollapseInstance {
    collapse(nodes: NodeCollection): void;
    collapseRecursively(nodes: NodeCollection): void;
    collapseAll(): void;
    expand(nodes: NodeCollection): void;
    expandRecursively(nodes: NodeCollection): void;
    expandAll(): void;
    isExpandable(node: NodeSingular): boolean;
    isCollapsible(node: NodeSingular): boolean;
    expandableNodes(): NodeCollection;
    collapsibleNodes(): NodeCollection;
    setOptions(options: Partial<ExpandCollapseOptions>): void;
  }

  // Context Menu Types
  interface ContextMenuOptions {
    evtType?: string;
    menuItems: ContextMenuItem[];
    menuItemClasses?: string[];
    contextMenuClasses?: string[];
    submenuIndicator?: { src: string; width: number; height: number };
  }

  interface ContextMenuItem {
    id: string;
    content: string;
    tooltipText?: string;
    image?: { src: string; width: number; height: number; x: number; y: number };
    selector?: string;
    coreAsWell?: boolean;
    onClickFunction?: (event: EventObject) => void;
    disabled?: boolean;
    show?: boolean;
    hasTrailingDivider?: boolean;
    submenu?: ContextMenuItem[];
  }

  interface ContextMenuInstance {
    appendMenuItem(item: ContextMenuItem, parentId?: string): void;
    appendMenuItems(items: ContextMenuItem[], parentId?: string): void;
    removeMenuItem(id: string): void;
    setTrailingDivider(id: string, status: boolean): void;
    insertBeforeMenuItem(item: ContextMenuItem, existingItemId: string): void;
    moveToSubmenu(id: string, parentId?: string): void;
    moveBeforeOtherMenuItem(id: string, existingItemId: string): void;
    disableMenuItem(id: string): void;
    enableMenuItem(id: string): void;
    hideMenuItem(id: string): void;
    showMenuItem(id: string): void;
    destroy(): void;
    isActive(): boolean;
  }

  // Navigator Types
  interface NavigatorOptions {
    container?: HTMLElement | string | boolean;
    viewLiveFramerate?: number;
    thumbnailEventFramerate?: number;
    thumbnailLiveFramerate?: number;
    dblClickDelay?: number;
    removeCustomContainer?: boolean;
    rerenderDelay?: number;
  }

  interface NavigatorInstance {
    destroy(): void;
  }

  // Extend Core interface with extension methods
  interface Core {
    // Undo/Redo extension
    undoRedo(options?: UndoRedoOptions): UndoRedoInstance;

    // Expand/Collapse extension
    expandCollapse(options?: ExpandCollapseOptions): ExpandCollapseInstance;

    // Context menus extension
    contextMenus(options?: ContextMenuOptions): ContextMenuInstance;

    // Navigator extension
    navigator(options?: NavigatorOptions): NavigatorInstance;

    // SVG export (missing from base types)
    svg(options?: SvgExportOptions): string;
  }

  // SVG Export Options
  interface SvgExportOptions {
    output?: 'string' | 'blob';
    bg?: string;
    full?: boolean;
    scale?: number;
  }
}
