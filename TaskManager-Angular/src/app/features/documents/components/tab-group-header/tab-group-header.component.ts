import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { DocumentTabGroup, DocumentTab, UpdateDocumentTabGroup } from '../../models/document-tabs.model';
import {
  GroupEditDialogComponent,
  GroupEditDialogData,
  GroupEditDialogResult,
} from '../group-edit-dialog/group-edit-dialog.component';

@Component({
  selector: 'app-tab-group-header',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    DragDropModule,
  ],
  templateUrl: './tab-group-header.component.html',
  styleUrls: ['./tab-group-header.component.scss'],
})
export class TabGroupHeaderComponent {
  private dialog = inject(MatDialog);

  @Input({ required: true }) group!: DocumentTabGroup;
  @Input() tabs: DocumentTab[] = [];
  @Input() selectedTabId: string | null = null;
  @Input() tabItemCounts: Map<string, number> = new Map();
  @Input() connectedDropListIds: string[] = [];

  @Output() toggleCollapse = new EventEmitter<void>();
  @Output() editGroup = new EventEmitter<UpdateDocumentTabGroup>();
  @Output() deleteGroup = new EventEmitter<void>();
  @Output() tabSelect = new EventEmitter<string>();
  @Output() tabEdit = new EventEmitter<DocumentTab>();
  @Output() tabDelete = new EventEmitter<string>();
  @Output() tabRemoveFromGroup = new EventEmitter<string>();
  @Output() tabDroppedInGroup = new EventEmitter<string>(); // tabId of dropped tab

  // Track drag over state
  isDragOver = false;

  onToggleCollapse(): void {
    this.toggleCollapse.emit();
  }

  onEditGroup(event: Event): void {
    event.stopPropagation();

    const dialogRef = this.dialog.open(GroupEditDialogComponent, {
      width: '500px',
      data: { group: this.group, mode: 'edit' } as GroupEditDialogData,
    });

    dialogRef.afterClosed().subscribe((result: GroupEditDialogResult | undefined) => {
      if (result) {
        this.editGroup.emit(result);
      }
    });
  }

  onDeleteGroup(event: Event): void {
    event.stopPropagation();
    this.deleteGroup.emit();
  }

  onTabClick(tabId: string, event: Event): void {
    event.stopPropagation();
    if (tabId !== this.selectedTabId) {
      this.tabSelect.emit(tabId);
    }
  }

  onTabEdit(tab: DocumentTab, event: Event): void {
    event.stopPropagation();
    this.tabEdit.emit(tab);
  }

  onTabDelete(tabId: string, event: Event): void {
    event.stopPropagation();
    this.tabDelete.emit(tabId);
  }

  onRemoveFromGroup(tabId: string, event: Event): void {
    event.stopPropagation();
    this.tabRemoveFromGroup.emit(tabId);
  }

  isTabSelected(tabId: string): boolean {
    return tabId === this.selectedTabId;
  }

  getTabItemCount(tabId: string): number {
    return this.tabItemCounts.get(tabId) || 0;
  }

  canDeleteTab(tabId: string): boolean {
    return this.getTabItemCount(tabId) === 0;
  }

  trackTab(index: number, tab: DocumentTab): string {
    return tab.id;
  }

  // Drag & Drop handlers
  onDragEnter(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onDragLeave(event: DragEvent): void {
    this.isDragOver = false;
  }

  onDrop(event: CdkDragDrop<DocumentTab[]>): void {
    this.isDragOver = false;
    const droppedTab = event.item.data as DocumentTab;

    // Only emit if tab is not already in this group
    if (droppedTab && droppedTab.tab_group_id !== this.group.id) {
      this.tabDroppedInGroup.emit(droppedTab.id);
    }
  }

  getDropListId(): string {
    return `group-${this.group.id}`;
  }
}
