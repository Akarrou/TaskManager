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
import * as d3 from 'd3';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import {
  MindmapData,
  MindmapNode,
  MindmapConfig,
  MindmapLayoutType,
  MindmapTheme,
  createDefaultMindmapData,
  getNodeColorByDepth,
} from '../../models/mindmap.model';

// D3 Hierarchy types
type HierarchyNode = d3.HierarchyPointNode<MindmapNode>;
type HierarchyLink = d3.HierarchyPointLink<MindmapNode>;

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

  // SVG container reference
  @ViewChild('svgContainer', { static: true })
  svgContainer!: ElementRef<HTMLDivElement>;

  // State signals
  mindmapData = signal<MindmapData>(createDefaultMindmapData());
  selectedNodeId = signal<string | null>(null);
  editingNodeId = signal<string | null>(null);
  editingLabel = signal<string>('');

  // View state
  currentZoom = signal(1);

  // Computed
  config = computed(() => this.mindmapData().config);
  nodes = computed(() => this.mindmapData().nodes);

  // D3 elements
  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private g!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private zoom!: d3.ZoomBehavior<SVGSVGElement, unknown>;

  // Dimensions
  private width = 800;
  private height = 500;
  private nodeWidth = 140;
  private nodeHeight = 36;

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
    // Run D3 operations outside Angular zone for performance
    this.ngZone.runOutsideAngular(() => {
      this.initializeSvg();
      this.initializeZoom();
      this.renderMindmap();
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['data'] && !changes['data'].firstChange) {
      this.mindmapData.set(this.data);
      this.ngZone.runOutsideAngular(() => {
        this.renderMindmap();
      });
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // =====================================================================
  // SVG Initialization
  // =====================================================================

  private initializeSvg() {
    const container = this.svgContainer.nativeElement;
    this.width = container.clientWidth || 800;
    this.height = 500;

    // Clear existing SVG
    d3.select(container).selectAll('svg').remove();

    // Create SVG
    this.svg = d3
      .select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', this.height)
      .attr('class', 'mindmap-svg');

    // Create main group for zoom/pan
    this.g = this.svg.append('g').attr('class', 'mindmap-canvas');

    // Add links group (rendered behind nodes)
    this.g.append('g').attr('class', 'links-group');

    // Add nodes group
    this.g.append('g').attr('class', 'nodes-group');
  }

  private initializeZoom() {
    const config = this.config();

    this.zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([config.minZoom, config.maxZoom])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        this.g.attr('transform', event.transform.toString());
        this.ngZone.run(() => {
          this.currentZoom.set(event.transform.k);
        });
      });

    if (config.enableZoom) {
      this.svg.call(this.zoom);
    }

    // Initial transform (center the root)
    const initialX = this.width / 4;
    const initialY = this.height / 2;
    this.svg.call(
      this.zoom.transform,
      d3.zoomIdentity.translate(initialX, initialY)
    );
  }

  // =====================================================================
  // Rendering
  // =====================================================================

  private renderMindmap() {
    if (!this.g) return;

    const data = this.mindmapData();
    const config = data.config;

    // Build hierarchy from flat nodes
    const hierarchyData = this.buildHierarchy(data);
    if (!hierarchyData) return;

    // Create tree layout based on layout type
    const treeLayout = this.createTreeLayout(config);

    // Apply layout
    const root = d3.hierarchy(hierarchyData, (d) => {
      if (d.collapsed) return undefined;
      return d.children
        ?.map((childId) => data.nodes.find((n) => n.id === childId))
        .filter(Boolean) as MindmapNode[];
    });

    treeLayout(root);

    // Get nodes and links
    const nodes = root.descendants() as HierarchyNode[];
    const links = root.links() as HierarchyLink[];

    // Render
    this.renderLinks(links, config);
    this.renderNodes(nodes, config);
  }

  private createTreeLayout(
    config: MindmapConfig
  ): d3.TreeLayout<MindmapNode> {
    const layout = d3
      .tree<MindmapNode>()
      .nodeSize([config.nodeSpacing + this.nodeHeight, config.levelSpacing]);

    return layout;
  }

  private buildHierarchy(data: MindmapData): MindmapNode | null {
    const root = data.nodes.find((n) => n.id === data.rootId);
    if (!root) return null;

    // Build children arrays
    const nodeMap = new Map(data.nodes.map((n) => [n.id, { ...n }]));

    data.nodes.forEach((node) => {
      if (node.parentId) {
        const parent = nodeMap.get(node.parentId);
        if (parent) {
          if (!parent.children) parent.children = [];
          if (!parent.children.includes(node.id)) {
            parent.children.push(node.id);
          }
        }
      }
    });

    return nodeMap.get(data.rootId) || null;
  }

  private renderLinks(links: HierarchyLink[], config: MindmapConfig) {
    const linksGroup = this.g.select('.links-group');
    const duration = config.animationDuration;

    // Link generator (curved paths for horizontal layout)
    const linkGenerator = d3
      .linkHorizontal<HierarchyLink, HierarchyNode>()
      .x((d) => d.y)
      .y((d) => d.x);

    // Bind data
    const linkSelection = linksGroup
      .selectAll<SVGPathElement, HierarchyLink>('.mindmap-link')
      .data(links, (d) => `${d.source.data.id}-${d.target.data.id}`);

    // Enter
    linkSelection
      .enter()
      .append('path')
      .attr('class', 'mindmap-link')
      .attr('fill', 'none')
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 2)
      .attr('d', linkGenerator as unknown as string)
      .attr('opacity', 0)
      .transition()
      .duration(duration)
      .attr('opacity', 1);

    // Update
    linkSelection
      .transition()
      .duration(duration)
      .attr('d', linkGenerator as unknown as string);

    // Exit
    linkSelection
      .exit()
      .transition()
      .duration(duration)
      .attr('opacity', 0)
      .remove();
  }

  private renderNodes(nodes: HierarchyNode[], config: MindmapConfig) {
    const nodesGroup = this.g.select('.nodes-group');
    const duration = config.animationDuration;
    const self = this;

    // Bind data
    const nodeSelection = nodesGroup
      .selectAll<SVGGElement, HierarchyNode>('.mindmap-node')
      .data(nodes, (d) => d.data.id);

    // Enter
    const nodeEnter = nodeSelection
      .enter()
      .append('g')
      .attr('class', 'mindmap-node')
      .attr('transform', (d) => `translate(${d.y},${d.x})`)
      .attr('opacity', 0)
      .on('click', function (event: MouseEvent, d: HierarchyNode) {
        event.stopPropagation();
        self.ngZone.run(() => {
          self.onNodeClick(d.data.id);
        });
      })
      .on('dblclick', function (event: MouseEvent, d: HierarchyNode) {
        event.stopPropagation();
        self.ngZone.run(() => {
          self.startEditing(d.data.id, d.data.label);
        });
      });

    // Node rectangle
    nodeEnter
      .append('rect')
      .attr('class', 'node-bg')
      .attr('x', -this.nodeWidth / 2)
      .attr('y', -this.nodeHeight / 2)
      .attr('width', this.nodeWidth)
      .attr('height', this.nodeHeight)
      .attr('rx', 8)
      .attr('ry', 8)
      .attr('fill', (d) => this.getNodeColor(d))
      .attr('stroke', (d) => this.getNodeBorderColor(d))
      .attr('stroke-width', 2)
      .attr('cursor', 'pointer');

    // Node label
    nodeEnter
      .append('text')
      .attr('class', 'node-label')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', '#ffffff')
      .attr('font-size', '13px')
      .attr('pointer-events', 'none')
      .text((d) => this.truncateLabel(d.data.label, 18));

    // Add button (appears on hover)
    nodeEnter
      .append('circle')
      .attr('class', 'add-child-btn')
      .attr('cx', this.nodeWidth / 2 + 12)
      .attr('cy', 0)
      .attr('r', 10)
      .attr('fill', '#22c55e')
      .attr('cursor', 'pointer')
      .attr('opacity', 0)
      .on('click', function (event: MouseEvent, d: HierarchyNode) {
        event.stopPropagation();
        self.ngZone.run(() => {
          self.addChildNode(d.data.id);
        });
      });

    nodeEnter
      .append('text')
      .attr('class', 'add-child-icon')
      .attr('x', this.nodeWidth / 2 + 12)
      .attr('y', 1)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', '#ffffff')
      .attr('font-size', '14px')
      .attr('font-weight', 'bold')
      .attr('pointer-events', 'none')
      .attr('opacity', 0)
      .text('+');

    // Show add button on hover
    nodeEnter
      .on('mouseenter', function () {
        d3.select(this).select('.add-child-btn').attr('opacity', 1);
        d3.select(this).select('.add-child-icon').attr('opacity', 1);
      })
      .on('mouseleave', function () {
        d3.select(this).select('.add-child-btn').attr('opacity', 0);
        d3.select(this).select('.add-child-icon').attr('opacity', 0);
      });

    // Animate entrance
    nodeEnter.transition().duration(duration).attr('opacity', 1);

    // Update
    nodeSelection
      .transition()
      .duration(duration)
      .attr('transform', (d) => `translate(${d.y},${d.x})`);

    nodeSelection
      .select('.node-bg')
      .attr('fill', (d) => this.getNodeColor(d))
      .attr('stroke', (d) => this.getNodeBorderColor(d));

    nodeSelection
      .select('.node-label')
      .text((d) => this.truncateLabel(d.data.label, 18));

    // Exit
    nodeSelection
      .exit()
      .transition()
      .duration(duration)
      .attr('opacity', 0)
      .remove();
  }

  // =====================================================================
  // Node Interactions
  // =====================================================================

  onNodeClick(nodeId: string) {
    this.selectedNodeId.set(
      nodeId === this.selectedNodeId() ? null : nodeId
    );
  }

  startEditing(nodeId: string, currentLabel: string) {
    this.editingNodeId.set(nodeId);
    this.editingLabel.set(currentLabel);
  }

  saveLabel() {
    const nodeId = this.editingNodeId();
    const newLabel = this.editingLabel().trim();

    if (nodeId && newLabel) {
      this.updateNode(nodeId, { label: newLabel });
    }

    this.editingNodeId.set(null);
    this.editingLabel.set('');
  }

  cancelEditing() {
    this.editingNodeId.set(null);
    this.editingLabel.set('');
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
      this.renderMindmap();
    });
    this.changeSubject.next();

    // Start editing the new node
    setTimeout(() => this.startEditing(newNode.id, newNode.label), 100);
  }

  deleteSelectedNode() {
    const nodeId = this.selectedNodeId();
    if (!nodeId) return;

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
      this.renderMindmap();
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

    this.ngZone.runOutsideAngular(() => {
      this.renderMindmap();
    });
    this.changeSubject.next();
  }

  // =====================================================================
  // Zoom Controls
  // =====================================================================

  zoomIn() {
    this.ngZone.runOutsideAngular(() => {
      this.svg.transition().duration(300).call(this.zoom.scaleBy, 1.3);
    });
  }

  zoomOut() {
    this.ngZone.runOutsideAngular(() => {
      this.svg.transition().duration(300).call(this.zoom.scaleBy, 0.7);
    });
  }

  resetZoom() {
    this.ngZone.runOutsideAngular(() => {
      const initialX = this.width / 4;
      const initialY = this.height / 2;
      this.svg
        .transition()
        .duration(300)
        .call(this.zoom.transform, d3.zoomIdentity.translate(initialX, initialY));
    });
  }

  fitToContent() {
    this.ngZone.runOutsideAngular(() => {
      const bounds = this.g.node()?.getBBox();
      if (!bounds) return;

      const fullWidth = bounds.width + 100;
      const fullHeight = bounds.height + 100;
      const midX = bounds.x + bounds.width / 2;
      const midY = bounds.y + bounds.height / 2;

      const scale = Math.min(
        this.width / fullWidth,
        this.height / fullHeight,
        1
      );

      this.svg
        .transition()
        .duration(500)
        .call(
          this.zoom.transform,
          d3.zoomIdentity
            .translate(this.width / 2, this.height / 2)
            .scale(scale)
            .translate(-midX, -midY)
        );
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
      this.renderMindmap();
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
      this.renderMindmap();
    });
    this.changeSubject.next();
  }

  deleteMindmap() {
    if (this.onDelete) {
      this.onDelete();
    }
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  private getNodeColor(d: HierarchyNode): string {
    const nodeStyle = d.data.style;
    if (nodeStyle?.backgroundColor) {
      return nodeStyle.backgroundColor;
    }
    return getNodeColorByDepth(d.depth, this.config().theme);
  }

  private getNodeBorderColor(d: HierarchyNode): string {
    const color = this.getNodeColor(d);
    const darkerColor = d3.color(color)?.darker(0.5);
    return darkerColor?.toString() || color;
  }

  private truncateLabel(label: string, maxLength: number): string {
    if (label.length <= maxLength) return label;
    return label.substring(0, maxLength - 3) + '...';
  }

  private emitChange() {
    if (this.onDataChange) {
      this.onDataChange(this.mindmapData());
    }
  }

  // =====================================================================
  // Keyboard Handling
  // =====================================================================

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    event.stopPropagation();

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
    }
  }
}
