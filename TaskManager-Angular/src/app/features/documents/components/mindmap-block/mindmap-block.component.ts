import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ElementRef,
  ViewChild,
  signal,
  computed,
  inject,
  AfterViewInit,
  HostListener,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import undoRedo from 'cytoscape-undo-redo';
import expandCollapse from 'cytoscape-expand-collapse';
import contextMenus from 'cytoscape-context-menus';
import navigator from 'cytoscape-navigator';

// Type for Cytoscape stylesheet
type CytoscapeStylesheet = {
  selector: string;
  style: Record<string, unknown>;
};
import { Subject, debounceTime, takeUntil } from 'rxjs';
import {
  MindmapData,
  MindmapNode,
  MindmapLayoutType,
  MindmapTheme,
  createDefaultMindmapData,
  getNodeColorByDepth,
} from '../../models/mindmap.model';

// Register extensions
cytoscape.use(dagre);
cytoscape.use(undoRedo);
cytoscape.use(expandCollapse);
cytoscape.use(contextMenus);
cytoscape.use(navigator);

@Component({
  selector: 'app-mindmap-block',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
  ],
  templateUrl: './mindmap-block.component.html',
  styleUrl: './mindmap-block.component.scss',
})
export class MindmapBlockComponent
  implements OnInit, OnDestroy, OnChanges, AfterViewInit
{
  private ngZone = inject(NgZone);

  // Inputs
  @Input() mindmapId!: string;
  @Input() data!: MindmapData;
  @Input() onDataChange?: (data: MindmapData) => void;
  @Input() onDelete?: () => void;

  // Container references
  @ViewChild('cyContainer', { static: true })
  cyContainer!: ElementRef<HTMLDivElement>;

  @ViewChild('navigatorContainer', { static: false })
  navigatorContainer!: ElementRef<HTMLDivElement>;

  // State signals
  mindmapData = signal<MindmapData>(createDefaultMindmapData());
  selectedNodeId = signal<string | null>(null);
  editingNodeId = signal<string | null>(null);
  editingLabel = '';

  // Flag to prevent re-render when we emit our own changes
  private isEmittingChange = false;

  // View state
  currentZoom = signal(1);
  canUndo = signal(false);
  canRedo = signal(false);
  showNavigator = signal(false);

  // Computed
  config = computed(() => this.mindmapData().config);
  nodes = computed(() => this.mindmapData().nodes);

  // Cytoscape instance and extensions
  private cy!: cytoscape.Core;
  private ur!: cytoscape.UndoRedoInstance;
  private ec!: cytoscape.ExpandCollapseInstance;
  private cm!: cytoscape.ContextMenuInstance;
  private nav!: cytoscape.NavigatorInstance;

  // Drag state for reparenting
  private draggedNode: cytoscape.NodeSingular | null = null;
  private dropTarget: cytoscape.NodeSingular | null = null;

  // Cleanup
  private destroy$ = new Subject<void>();
  private changeSubject = new Subject<void>();

  ngOnInit() {
    if (this.data) {
      this.mindmapData.set(this.data);
    }

    // Debounced save
    this.changeSubject
      .pipe(debounceTime(500), takeUntil(this.destroy$))
      .subscribe(() => {
        this.emitChange();
      });
  }

  ngAfterViewInit() {
    // Run Cytoscape operations outside Angular zone for performance
    this.ngZone.runOutsideAngular(() => {
      this.initializeCytoscape();
      this.initializeExtensions();
      this.setupEventHandlers();
      this.setupContextMenu();
      this.renderMindmap();
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['data'] && !changes['data'].firstChange) {
      // Skip if this change came from our own emit
      if (this.isEmittingChange) {
        this.isEmittingChange = false;
        return;
      }

      // Compare data to see if we really need to re-render
      const currentData = this.mindmapData();
      const newData = this.data;

      // If data is structurally the same, don't re-render
      if (JSON.stringify(currentData) === JSON.stringify(newData)) {
        return;
      }

      // Only re-render if external data changed
      this.mindmapData.set(newData);
      this.ngZone.runOutsideAngular(() => {
        this.renderMindmap(true); // Preserve viewport for external updates
      });
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    // Cleanup extensions
    if (this.nav) {
      this.nav.destroy();
    }
    if (this.cm) {
      this.cm.destroy();
    }
    if (this.cy) {
      this.cy.destroy();
    }
  }

  // =====================================================================
  // Cytoscape Initialization
  // =====================================================================

  private initializeCytoscape() {
    const container = this.cyContainer.nativeElement;

    this.cy = cytoscape({
      container,
      style: this.getCytoscapeStyle(),
      layout: { name: 'preset' },
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.3,
      boxSelectionEnabled: true,
      autounselectify: false,
      userZoomingEnabled: true,
      userPanningEnabled: true,
    });

    // Track zoom level
    this.cy.on('zoom', () => {
      this.ngZone.run(() => {
        this.currentZoom.set(this.cy.zoom());
      });
    });
  }

  private initializeExtensions() {
    // Initialize Undo/Redo
    this.ur = this.cy.undoRedo({
      isDebug: false,
      undoableDrag: true,
      stackSizeLimit: 50,
    });

    // Initialize Expand/Collapse
    this.ec = this.cy.expandCollapse({
      layoutBy: null, // We'll run layout manually
      fisheye: false,
      animate: true,
      animationDuration: 300,
      undoable: true,
      cueEnabled: true,
      expandCollapseCuePosition: 'top-left',
      expandCollapseCueSize: 12,
      expandCollapseCueLineSize: 8,
      expandCollapseCueSensitivity: 1,
    });

    // Update undo/redo state
    this.cy.on('afterUndo afterRedo', () => {
      this.updateUndoRedoState();
    });
  }

  private setupContextMenu() {
    // Store reference to component for use in callbacks
    const component = this;

    this.cm = this.cy.contextMenus({
      evtType: 'cxttap',
      menuItems: [
        {
          id: 'add-child',
          content: 'Ajouter un enfant',
          tooltipText: 'Ajouter un noeud enfant',
          selector: 'node',
          onClickFunction: function(event: cytoscape.EventObject) {
            const node = event.target as cytoscape.NodeSingular;
            const nodeId = node.id();
            component.ngZone.run(() => {
              component.addChildNode(nodeId);
            });
          },
        },
        {
          id: 'edit-node',
          content: 'Modifier',
          tooltipText: 'Modifier le texte',
          selector: 'node',
          onClickFunction: function(event: cytoscape.EventObject) {
            const node = event.target as cytoscape.NodeSingular;
            const nodeId = node.id();
            const label = node.data('label');
            component.ngZone.run(() => {
              component.startEditing(nodeId, label);
            });
          },
        },
        {
          id: 'collapse-node',
          content: 'Replier',
          tooltipText: 'Replier les enfants',
          selector: 'node',
          onClickFunction: function(event: cytoscape.EventObject) {
            const node = event.target as cytoscape.NodeSingular;
            const nodeId = node.id();
            component.ngZone.run(() => {
              if (component.canCollapseNode(nodeId)) {
                component.collapseNode(nodeId);
              }
            });
          },
        },
        {
          id: 'expand-node',
          content: 'Déplier',
          tooltipText: 'Déplier les enfants',
          selector: 'node',
          onClickFunction: function(event: cytoscape.EventObject) {
            const node = event.target as cytoscape.NodeSingular;
            const nodeId = node.id();
            component.ngZone.run(() => {
              if (component.canExpandNode(nodeId)) {
                component.expandNode(nodeId);
              }
            });
          },
        },
        {
          id: 'delete-node',
          content: 'Supprimer',
          tooltipText: 'Supprimer le noeud et ses enfants',
          selector: 'node',
          onClickFunction: function(event: cytoscape.EventObject) {
            const node = event.target as cytoscape.NodeSingular;
            const nodeId = node.id();
            const data = component.mindmapData();
            if (nodeId !== data.rootId) {
              component.ngZone.run(() => {
                component.deleteNode(nodeId);
              });
            }
          },
        },
        {
          id: 'add-sibling',
          content: 'Ajouter un frère',
          tooltipText: 'Ajouter un noeud au même niveau',
          selector: 'node',
          onClickFunction: function(event: cytoscape.EventObject) {
            const node = event.target as cytoscape.NodeSingular;
            const parentId = node.data('parentNodeId');
            if (parentId) {
              component.ngZone.run(() => {
                component.addChildNode(parentId);
              });
            }
          },
        },
      ],
    });
  }

  private getCytoscapeStyle(): CytoscapeStylesheet[] {
    return [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)',
          'border-color': 'data(borderColor)',
          'border-width': 2,
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'color': '#ffffff',
          'font-size': '13px',
          'text-wrap': 'ellipsis',
          'text-max-width': '120px',
          'width': 140,
          'height': 36,
          'shape': 'round-rectangle',
          'text-outline-color': 'data(color)',
          'text-outline-width': 1,
          'transition-property': 'background-color, border-color, width, height',
          'transition-duration': 200,
        },
      },
      {
        selector: 'node:selected',
        style: {
          'border-color': '#3b82f6',
          'border-width': 3,
          'background-color': 'data(selectedColor)',
        },
      },
      {
        selector: 'node.drop-target',
        style: {
          'border-color': '#22c55e',
          'border-width': 4,
          'border-style': 'dashed',
        },
      },
      {
        selector: 'node.dragging',
        style: {
          'opacity': 0.7,
        },
      },
      {
        selector: 'node.cy-expand-collapse-collapsed-node',
        style: {
          'border-style': 'double',
          'border-width': 4,
        },
      },
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#94a3b8',
          'target-arrow-color': '#94a3b8',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 0.8,
        },
      },
      {
        selector: 'edge.highlighted',
        style: {
          'line-color': '#3b82f6',
          'target-arrow-color': '#3b82f6',
          'width': 3,
        },
      },
      {
        selector: '.hidden',
        style: {
          'display': 'none',
        },
      },
    ];
  }

  private setupEventHandlers() {
    // Node click - select
    this.cy.on('tap', 'node', (event: cytoscape.EventObject) => {
      const node = event.target as cytoscape.NodeSingular;
      this.ngZone.run(() => {
        this.onNodeClick(node.id());
      });
    });

    // Double click - edit
    this.cy.on('dbltap', 'node', (event: cytoscape.EventObject) => {
      const node = event.target as cytoscape.NodeSingular;
      this.ngZone.run(() => {
        this.startEditing(node.id(), node.data('label'));
      });
    });

    // Click on background - deselect
    this.cy.on('tap', (event: cytoscape.EventObject) => {
      if (event.target === this.cy) {
        this.ngZone.run(() => {
          this.selectedNodeId.set(null);
        });
      }
    });

    // Drag start
    this.cy.on('grab', 'node', (event: cytoscape.EventObject) => {
      const node = event.target as cytoscape.NodeSingular;
      this.draggedNode = node;
      node.addClass('dragging');
    });

    // Drag over nodes - highlight potential drop targets
    this.cy.on('drag', 'node', (event: cytoscape.EventObject) => {
      if (!this.draggedNode) return;

      const draggedNode = event.target as cytoscape.NodeSingular;
      const pos = draggedNode.position();

      // Find potential drop target
      const potentialTarget = this.findDropTarget(draggedNode, pos);

      // Update visual feedback
      this.cy.nodes().removeClass('drop-target');
      if (potentialTarget && potentialTarget.id() !== draggedNode.id()) {
        potentialTarget.addClass('drop-target');
        this.dropTarget = potentialTarget;
      } else {
        this.dropTarget = null;
      }
    });

    // Drag end - potentially reparent
    this.cy.on('free', 'node', (event: cytoscape.EventObject) => {
      const node = event.target as cytoscape.NodeSingular;
      node.removeClass('dragging');
      this.cy.nodes().removeClass('drop-target');

      const hadDropTarget = this.draggedNode && this.dropTarget;
      const draggedId = this.draggedNode?.id();
      const newParentId = this.dropTarget?.id();

      this.draggedNode = null;
      this.dropTarget = null;

      if (hadDropTarget && draggedId && newParentId) {
        // Don't allow dropping on self or own descendants
        if (!this.isDescendantOf(newParentId, draggedId)) {
          this.ngZone.run(() => {
            this.reparentNode(draggedId, newParentId);
          });
        } else {
          // Invalid drop - re-run layout to reset position
          this.runLayout();
        }
      } else {
        // No reparenting - re-run layout to reset position
        this.runLayout();
      }

      this.updateUndoRedoState();
    });
  }

  private findDropTarget(draggedNode: cytoscape.NodeSingular, pos: { x: number; y: number }): cytoscape.NodeSingular | null {
    const threshold = 80;
    let closest: cytoscape.NodeSingular | null = null;
    let minDist = threshold;

    this.cy.nodes().forEach((node) => {
      if (node.id() === draggedNode.id()) return;

      const nodePos = node.position();
      const dist = Math.sqrt(
        Math.pow(pos.x - nodePos.x, 2) + Math.pow(pos.y - nodePos.y, 2)
      );

      if (dist < minDist) {
        minDist = dist;
        closest = node;
      }
    });

    return closest;
  }

  private isDescendantOf(potentialDescendant: string, ancestorId: string): boolean {
    const data = this.mindmapData();
    let currentId: string | null = potentialDescendant;

    while (currentId) {
      if (currentId === ancestorId) return true;
      const node = data.nodes.find((n) => n.id === currentId);
      currentId = node?.parentId || null;
    }

    return false;
  }

  // =====================================================================
  // Rendering
  // =====================================================================

  private renderMindmap(preserveViewport = false) {
    if (!this.cy) return;

    // Save viewport state if needed
    const savedZoom = preserveViewport ? this.cy.zoom() : null;
    const savedPan = preserveViewport ? { ...this.cy.pan() } : null;

    const data = this.mindmapData();

    // Build Cytoscape elements
    const elements = this.buildCytoscapeElements(data);

    // Clear and add elements
    this.cy.elements().remove();
    this.cy.add(elements);

    // Run layout with viewport restoration callback
    this.runLayout(preserveViewport, savedZoom, savedPan);

    // Reset undo/redo stack on new render
    if (this.ur) {
      this.ur.reset();
      this.updateUndoRedoState();
    }
  }

  private buildCytoscapeElements(data: MindmapData): cytoscape.ElementDefinition[] {
    const elements: cytoscape.ElementDefinition[] = [];
    const nodeDepths = this.calculateNodeDepths(data);

    // Add nodes
    data.nodes.forEach((node) => {
      const depth = nodeDepths.get(node.id) || 0;
      const color = node.style?.backgroundColor || getNodeColorByDepth(depth, data.config.theme);
      const darkerColor = this.darkenColor(color, 0.2);

      elements.push({
        data: {
          id: node.id,
          label: node.label,
          color,
          borderColor: darkerColor,
          selectedColor: this.darkenColor(color, 0.1),
          depth,
          parentNodeId: node.parentId,
        },
      });
    });

    // Add edges
    data.nodes.forEach((node) => {
      if (node.parentId) {
        elements.push({
          data: {
            id: `edge-${node.parentId}-${node.id}`,
            source: node.parentId,
            target: node.id,
          },
        });
      }
    });

    return elements;
  }

  private calculateNodeDepths(data: MindmapData): Map<string, number> {
    const depths = new Map<string, number>();

    const calculateDepth = (nodeId: string, depth: number) => {
      depths.set(nodeId, depth);
      data.nodes
        .filter((n) => n.parentId === nodeId)
        .forEach((child) => calculateDepth(child.id, depth + 1));
    };

    calculateDepth(data.rootId, 0);
    return depths;
  }

  private runLayout(
    preserveViewport = false,
    savedZoom: number | null = null,
    savedPan: { x: number; y: number } | null = null
  ) {
    const config = this.config();
    const layoutOptions = this.getLayoutOptions(config.layout);

    // If preserving viewport, disable animation to avoid zoom effect
    if (preserveViewport && savedZoom !== null && savedPan !== null) {
      const noAnimOptions = {
        ...layoutOptions,
        animate: false,
      };

      const layout = this.cy.layout(noAnimOptions);
      layout.run();

      // Restore viewport immediately after layout
      this.cy.zoom(savedZoom);
      this.cy.pan(savedPan);
    } else {
      this.cy.layout(layoutOptions).run();
    }
  }

  private getLayoutOptions(layoutType: MindmapLayoutType): cytoscape.LayoutOptions {
    const config = this.config();

    switch (layoutType) {
      case 'horizontal':
        return {
          name: 'dagre',
          rankDir: 'LR',
          nodeSep: config.nodeSpacing,
          rankSep: config.levelSpacing,
          animate: true,
          animationDuration: config.animationDuration,
        } as unknown as cytoscape.LayoutOptions;

      case 'tree':
        return {
          name: 'dagre',
          rankDir: 'TB',
          nodeSep: config.nodeSpacing,
          rankSep: config.levelSpacing,
          animate: true,
          animationDuration: config.animationDuration,
        } as unknown as cytoscape.LayoutOptions;

      case 'radial':
        return {
          name: 'concentric',
          concentric: (node: cytoscape.NodeSingular) => {
            const maxDepth = Math.max(...this.cy.nodes().map((n) => n.data('depth') || 0));
            return maxDepth - (node.data('depth') || 0);
          },
          levelWidth: () => 1,
          animate: true,
          animationDuration: config.animationDuration,
          minNodeSpacing: config.nodeSpacing,
        } as unknown as cytoscape.LayoutOptions;

      default:
        return {
          name: 'dagre',
          rankDir: 'LR',
          nodeSep: config.nodeSpacing,
          rankSep: config.levelSpacing,
          animate: true,
          animationDuration: config.animationDuration,
        } as unknown as cytoscape.LayoutOptions;
    }
  }

  // =====================================================================
  // Undo/Redo
  // =====================================================================

  private updateUndoRedoState() {
    this.ngZone.run(() => {
      this.canUndo.set(!this.ur.isUndoStackEmpty());
      this.canRedo.set(!this.ur.isRedoStackEmpty());
    });
  }

  undo() {
    if (!this.ur.isUndoStackEmpty()) {
      this.ngZone.runOutsideAngular(() => {
        this.ur.undo();
        this.updateUndoRedoState();
      });
    }
  }

  redo() {
    if (!this.ur.isRedoStackEmpty()) {
      this.ngZone.runOutsideAngular(() => {
        this.ur.redo();
        this.updateUndoRedoState();
      });
    }
  }

  // =====================================================================
  // Collapse/Expand (Manual implementation since cytoscape-expand-collapse
  // requires compound nodes which we don't use)
  // =====================================================================

  collapseNode(nodeId: string) {
    const data = this.mindmapData();
    const updatedNodes = data.nodes.map((n) =>
      n.id === nodeId ? { ...n, collapsed: true } : n
    );

    this.mindmapData.set({
      ...data,
      nodes: updatedNodes,
    });

    this.ngZone.runOutsideAngular(() => {
      // Hide all descendants
      this.hideDescendants(nodeId);
      this.runLayout();
    });

    this.changeSubject.next();
  }

  expandNode(nodeId: string) {
    const data = this.mindmapData();
    const updatedNodes = data.nodes.map((n) =>
      n.id === nodeId ? { ...n, collapsed: false } : n
    );

    this.mindmapData.set({
      ...data,
      nodes: updatedNodes,
    });

    this.ngZone.runOutsideAngular(() => {
      // Show direct children (respecting their collapsed state)
      this.showChildren(nodeId);
      this.runLayout();
    });

    this.changeSubject.next();
  }

  private hideDescendants(nodeId: string) {
    const data = this.mindmapData();

    // Find all descendants
    const getDescendants = (parentId: string): string[] => {
      const children = data.nodes.filter((n) => n.parentId === parentId);
      const descendants: string[] = [];
      children.forEach((child) => {
        descendants.push(child.id);
        descendants.push(...getDescendants(child.id));
      });
      return descendants;
    };

    const descendants = getDescendants(nodeId);

    // Hide nodes and their edges
    descendants.forEach((id) => {
      const node = this.cy.getElementById(id);
      if (node.length) {
        node.addClass('hidden');
        node.connectedEdges().addClass('hidden');
      }
    });

    // Mark parent node as collapsed visually
    const parentNode = this.cy.getElementById(nodeId);
    if (parentNode.length) {
      parentNode.addClass('cy-expand-collapse-collapsed-node');
    }
  }

  private showChildren(nodeId: string) {
    const data = this.mindmapData();

    // Find direct children
    const children = data.nodes.filter((n) => n.parentId === nodeId);

    // Show direct children and their incoming edges
    children.forEach((child) => {
      const node = this.cy.getElementById(child.id);
      if (node.length) {
        node.removeClass('hidden');
        // Show edge from parent
        const edge = this.cy.getElementById(`edge-${nodeId}-${child.id}`);
        if (edge.length) {
          edge.removeClass('hidden');
        }

        // If this child is not collapsed, recursively show its children
        if (!child.collapsed) {
          this.showChildren(child.id);
        }
      }
    });

    // Remove collapsed visual from parent
    const parentNode = this.cy.getElementById(nodeId);
    if (parentNode.length) {
      parentNode.removeClass('cy-expand-collapse-collapsed-node');
    }
  }

  collapseAll() {
    const data = this.mindmapData();
    // Collapse all nodes that have children
    const nodesWithChildren = data.nodes.filter((node) =>
      data.nodes.some((n) => n.parentId === node.id)
    );

    const updatedNodes = data.nodes.map((n) => {
      if (nodesWithChildren.some((nc) => nc.id === n.id)) {
        return { ...n, collapsed: true };
      }
      return n;
    });

    this.mindmapData.set({
      ...data,
      nodes: updatedNodes,
    });

    this.ngZone.runOutsideAngular(() => {
      // Hide all non-root nodes
      data.nodes.forEach((node) => {
        if (node.id !== data.rootId) {
          const cyNode = this.cy.getElementById(node.id);
          if (cyNode.length) {
            cyNode.addClass('hidden');
            cyNode.connectedEdges().addClass('hidden');
          }
        }
      });

      // Mark root as collapsed if it has children
      const rootNode = this.cy.getElementById(data.rootId);
      if (rootNode.length && nodesWithChildren.some((n) => n.id === data.rootId)) {
        rootNode.addClass('cy-expand-collapse-collapsed-node');
      }

      this.runLayout();
    });

    this.changeSubject.next();
  }

  expandAll() {
    const data = this.mindmapData();

    // Expand all nodes
    const updatedNodes = data.nodes.map((n) => ({ ...n, collapsed: false }));

    this.mindmapData.set({
      ...data,
      nodes: updatedNodes,
    });

    this.ngZone.runOutsideAngular(() => {
      // Show all nodes and edges
      this.cy.nodes().removeClass('hidden');
      this.cy.edges().removeClass('hidden');
      this.cy.nodes().removeClass('cy-expand-collapse-collapsed-node');
      this.runLayout();
    });

    this.changeSubject.next();
  }

  // Check if a node can be collapsed (has visible children)
  canCollapseNode(nodeId: string): boolean {
    const data = this.mindmapData();
    const node = data.nodes.find((n) => n.id === nodeId);
    if (!node || node.collapsed) return false;

    // Check if it has children
    return data.nodes.some((n) => n.parentId === nodeId);
  }

  // Check if a node can be expanded (is collapsed and has children)
  canExpandNode(nodeId: string): boolean {
    const data = this.mindmapData();
    const node = data.nodes.find((n) => n.id === nodeId);
    if (!node || !node.collapsed) return false;

    // Check if it has children
    return data.nodes.some((n) => n.parentId === nodeId);
  }

  // =====================================================================
  // Export
  // =====================================================================

  exportPng() {
    const pngData = this.cy.png({
      output: 'base64uri',
      bg: '#ffffff',
      full: true,
      scale: 2,
    });

    const link = document.createElement('a');
    link.download = `mindmap-${this.mindmapId}.png`;
    link.href = pngData;
    link.click();
  }

  exportSvg() {
    const svgData = this.cy.svg({
      output: 'string',
      bg: '#ffffff',
      full: true,
      scale: 1,
    });

    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.download = `mindmap-${this.mindmapId}.svg`;
    link.href = url;
    link.click();

    URL.revokeObjectURL(url);
  }

  // =====================================================================
  // Navigator (Minimap)
  // =====================================================================

  toggleNavigator() {
    this.showNavigator.update((v) => !v);

    if (this.showNavigator()) {
      // Initialize navigator after view updates
      setTimeout(() => {
        if (this.navigatorContainer?.nativeElement) {
          this.ngZone.runOutsideAngular(() => {
            this.nav = this.cy.navigator({
              container: this.navigatorContainer.nativeElement,
              viewLiveFramerate: 0,
              thumbnailEventFramerate: 30,
              thumbnailLiveFramerate: 0,
              dblClickDelay: 200,
              removeCustomContainer: false,
              rerenderDelay: 100,
            });
          });
        }
      }, 0);
    } else {
      if (this.nav) {
        this.nav.destroy();
      }
    }
  }

  // =====================================================================
  // Node Interactions
  // =====================================================================

  onNodeClick(nodeId: string) {
    this.selectedNodeId.set(nodeId === this.selectedNodeId() ? null : nodeId);
  }

  startEditing(nodeId: string, currentLabel: string) {
    this.editingNodeId.set(nodeId);
    this.editingLabel = currentLabel;
  }

  saveLabel() {
    const nodeId = this.editingNodeId();
    const newLabel = this.editingLabel.trim();

    if (nodeId && newLabel) {
      this.updateNode(nodeId, { label: newLabel });
    }

    this.editingNodeId.set(null);
    this.editingLabel = '';
  }

  cancelEditing() {
    this.editingNodeId.set(null);
    this.editingLabel = '';
  }

  /**
   * Handle blur event on edit input
   * Save if the blur wasn't caused by clicking the action buttons
   */
  onEditInputBlur(event: FocusEvent) {
    // Check if the new focus target is within the editing container (buttons)
    const relatedTarget = event.relatedTarget as HTMLElement;
    if (relatedTarget?.closest('.editing-input-container')) {
      // Focus moved to buttons, don't auto-save yet
      return;
    }
    // Focus left the editing area, save the label
    this.saveLabel();
  }

  addChildNode(parentId: string) {
    const data = this.mindmapData();
    const newNode: MindmapNode = {
      id: crypto.randomUUID(),
      label: 'Nouvelle idee',
      parentId,
      collapsed: false,
    };

    const updatedNodes = [...data.nodes, newNode];

    // Update parent's children array
    const parentIndex = updatedNodes.findIndex((n) => n.id === parentId);
    if (parentIndex >= 0) {
      const parent = { ...updatedNodes[parentIndex] };
      parent.children = [...(parent.children || []), newNode.id];
      updatedNodes[parentIndex] = parent;
    }

    this.mindmapData.set({
      ...data,
      nodes: updatedNodes,
    });

    this.ngZone.runOutsideAngular(() => {
      this.renderMindmap(true); // Preserve viewport
    });
    this.changeSubject.next();

    // Start editing the new node
    setTimeout(() => this.startEditing(newNode.id, newNode.label), 100);
  }

  reparentNode(nodeId: string, newParentId: string) {
    const data = this.mindmapData();

    // Cannot reparent root
    if (nodeId === data.rootId) return;

    const node = data.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Don't reparent to the same parent
    if (node.parentId === newParentId) {
      this.ngZone.runOutsideAngular(() => {
        this.runLayout();
      });
      return;
    }

    const oldParentId = node.parentId;

    // Update nodes
    const updatedNodes = data.nodes.map((n) => {
      // Update the moved node's parent
      if (n.id === nodeId) {
        return { ...n, parentId: newParentId };
      }

      // Remove from old parent's children
      if (n.id === oldParentId) {
        return {
          ...n,
          children: (n.children || []).filter((cid) => cid !== nodeId),
        };
      }

      // Add to new parent's children
      if (n.id === newParentId) {
        return {
          ...n,
          children: [...(n.children || []), nodeId],
        };
      }

      return n;
    });

    this.mindmapData.set({
      ...data,
      nodes: updatedNodes,
    });

    // Re-render the mindmap with new structure
    this.ngZone.runOutsideAngular(() => {
      this.renderMindmap(true); // Preserve viewport
    });

    this.changeSubject.next();
  }

  deleteSelectedNode() {
    const nodeId = this.selectedNodeId();
    if (!nodeId) return;
    this.deleteNode(nodeId);
  }

  deleteNode(nodeId: string) {
    const data = this.mindmapData();

    // Cannot delete root
    if (nodeId === data.rootId) return;

    // Get all descendant IDs to delete
    const toDelete = new Set<string>();
    const collectDescendants = (id: string) => {
      toDelete.add(id);
      data.nodes
        .filter((n) => n.parentId === id)
        .forEach((n) => collectDescendants(n.id));
    };
    collectDescendants(nodeId);

    // Remove nodes and update parent's children
    const deletedNode = data.nodes.find((n) => n.id === nodeId);
    const updatedNodes = data.nodes
      .filter((n) => !toDelete.has(n.id))
      .map((n) => {
        if (n.id === deletedNode?.parentId) {
          return {
            ...n,
            children: (n.children || []).filter((cid) => cid !== nodeId),
          };
        }
        return n;
      });

    this.mindmapData.set({
      ...data,
      nodes: updatedNodes,
    });

    this.selectedNodeId.set(null);
    this.ngZone.runOutsideAngular(() => {
      this.renderMindmap(true); // Preserve viewport
    });
    this.changeSubject.next();
  }

  private updateNode(nodeId: string, updates: Partial<MindmapNode>) {
    const data = this.mindmapData();
    const updatedNodes = data.nodes.map((n) =>
      n.id === nodeId ? { ...n, ...updates } : n
    );

    this.mindmapData.set({
      ...data,
      nodes: updatedNodes,
    });

    // Update only the specific node in Cytoscape (no full re-render)
    this.ngZone.runOutsideAngular(() => {
      this.updateCytoscapeNode(nodeId, updates);
    });
    this.changeSubject.next();
  }

  /**
   * Update a single node in Cytoscape without re-rendering the whole graph
   */
  private updateCytoscapeNode(nodeId: string, updates: Partial<MindmapNode>) {
    if (!this.cy) return;

    const cyNode = this.cy.getElementById(nodeId);
    if (cyNode.length === 0) return;

    // Update node data in Cytoscape
    if (updates.label !== undefined) {
      cyNode.data('label', updates.label);
    }
    if (updates.style?.backgroundColor) {
      cyNode.data('color', updates.style.backgroundColor);
      cyNode.data('borderColor', this.darkenColor(updates.style.backgroundColor, 0.2));
      cyNode.data('selectedColor', this.darkenColor(updates.style.backgroundColor, 0.1));
    }
  }

  // =====================================================================
  // Zoom Controls
  // =====================================================================

  zoomIn() {
    this.ngZone.runOutsideAngular(() => {
      this.cy.zoom({
        level: this.cy.zoom() * 1.3,
        renderedPosition: { x: this.cy.width() / 2, y: this.cy.height() / 2 },
      });
    });
  }

  zoomOut() {
    this.ngZone.runOutsideAngular(() => {
      this.cy.zoom({
        level: this.cy.zoom() * 0.7,
        renderedPosition: { x: this.cy.width() / 2, y: this.cy.height() / 2 },
      });
    });
  }

  resetZoom() {
    this.ngZone.runOutsideAngular(() => {
      this.cy.reset();
      this.runLayout();
    });
  }

  fitToContent() {
    this.ngZone.runOutsideAngular(() => {
      this.cy.fit(undefined, 50);
    });
  }

  // =====================================================================
  // Config Changes
  // =====================================================================

  setLayout(layout: MindmapLayoutType) {
    const data = this.mindmapData();
    this.mindmapData.set({
      ...data,
      config: { ...data.config, layout },
    });
    this.ngZone.runOutsideAngular(() => {
      this.runLayout();
    });
    this.changeSubject.next();
  }

  setTheme(theme: MindmapTheme) {
    const data = this.mindmapData();
    this.mindmapData.set({
      ...data,
      config: { ...data.config, theme },
    });
    this.ngZone.runOutsideAngular(() => {
      this.renderMindmap(true); // Preserve viewport
    });
    this.changeSubject.next();
  }

  deleteMindmap() {
    if (this.onDelete) {
      this.onDelete();
    }
  }

  // =====================================================================
  // Context Menu - Add Child
  // =====================================================================

  addChildToSelected() {
    const selectedId = this.selectedNodeId();
    if (selectedId) {
      this.addChildNode(selectedId);
    }
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  private darkenColor(color: string, amount: number): string {
    // Simple color darkening
    const hex = color.replace('#', '');
    const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - Math.round(255 * amount));
    const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - Math.round(255 * amount));
    const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - Math.round(255 * amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  private emitChange() {
    if (this.onDataChange) {
      // Set flag to prevent ngOnChanges from re-rendering
      this.isEmittingChange = true;
      this.onDataChange(this.mindmapData());
    }
  }

  // =====================================================================
  // Keyboard Handling
  // =====================================================================

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    event.stopPropagation();

    // Undo/Redo shortcuts
    if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
      return;
    }

    if (this.editingNodeId()) {
      if (event.key === 'Enter') {
        this.saveLabel();
      } else if (event.key === 'Escape') {
        this.cancelEditing();
      }
      return;
    }

    const selectedId = this.selectedNodeId();
    if (!selectedId) return;

    switch (event.key) {
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        this.deleteSelectedNode();
        break;
      case 'Tab':
        event.preventDefault();
        this.addChildNode(selectedId);
        break;
      case 'Enter':
        event.preventDefault();
        const node = this.nodes().find((n) => n.id === selectedId);
        if (node) {
          this.startEditing(selectedId, node.label);
        }
        break;
      case ' ':
        // Space to toggle collapse/expand
        event.preventDefault();
        if (this.canExpandNode(selectedId)) {
          this.expandNode(selectedId);
        } else if (this.canCollapseNode(selectedId)) {
          this.collapseNode(selectedId);
        }
        break;
    }
  }
}
