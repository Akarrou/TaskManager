import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import {
  CdkDragDrop,
  CdkDropList,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { DocumentTab, UpdateDocumentTab, DocumentTabItem } from '../../models/document-tabs.model';
import {
  TabEditDialogComponent,
  TabEditDialogData,
  TabEditDialogResult,
} from '../tab-edit-dialog/tab-edit-dialog.component';
import {
  DeleteTabDialogComponent,
  DeleteTabDialogData,
} from '../delete-tab-dialog/delete-tab-dialog.component';

@Component({
  selector: 'app-document-tab-bar',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    DragDropModule,
  ],
  templateUrl: './document-tab-bar.component.html',
  styleUrls: ['./document-tab-bar.component.scss'],
})
export class DocumentTabBarComponent {
  private dialog = inject(MatDialog);

  @Input() tabs: DocumentTab[] = [];
  @Input() selectedTabId: string | null = null;
  @Input() allDropListIds: string[] = [];
  @Input() tabItemCounts: Map<string, number> = new Map();

  @Output() tabSelect = new EventEmitter<string>();
  @Output() tabCreate = new EventEmitter<{ name: string; icon: string; color: string }>();
  @Output() tabUpdate = new EventEmitter<{ tabId: string; updates: UpdateDocumentTab }>();
  @Output() tabDelete = new EventEmitter<string>();
  @Output() tabsReorder = new EventEmitter<string[]>();
  @Output() documentDropOnTab = new EventEmitter<{ documentId: string; targetTabId: string }>();

  // Track which tab is being hovered during drag
  dragOverTabId: string | null = null;

  onTabClick(tabId: string): void {
    if (tabId !== this.selectedTabId) {
      this.tabSelect.emit(tabId);
    }
  }

  onAddTab(): void {
    const dialogRef = this.dialog.open(TabEditDialogComponent, {
      width: '500px',
      data: { mode: 'create' } as TabEditDialogData,
    });

    dialogRef.afterClosed().subscribe((result: TabEditDialogResult | undefined) => {
      if (result) {
        this.tabCreate.emit(result);
      }
    });
  }

  onEditTab(tab: DocumentTab, event: Event): void {
    event.stopPropagation();

    const dialogRef = this.dialog.open(TabEditDialogComponent, {
      width: '500px',
      data: { tab, mode: 'edit' } as TabEditDialogData,
    });

    dialogRef.afterClosed().subscribe((result: TabEditDialogResult | undefined) => {
      if (result) {
        this.tabUpdate.emit({ tabId: tab.id, updates: result });
      }
    });
  }

  onDeleteTab(tab: DocumentTab, event: Event): void {
    event.stopPropagation();

    const dialogRef = this.dialog.open(DeleteTabDialogComponent, {
      width: '450px',
      data: { tabName: tab.name } as DeleteTabDialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.tabDelete.emit(tab.id);
      }
    });
  }

  onTabDrop(event: CdkDragDrop<DocumentTab[]>): void {
    if (event.previousIndex !== event.currentIndex) {
      const reorderedTabs = [...this.tabs];
      moveItemInArray(reorderedTabs, event.previousIndex, event.currentIndex);
      this.tabsReorder.emit(reorderedTabs.map((t) => t.id));
    }
  }

  trackTab(index: number, tab: DocumentTab): string {
    return tab.id;
  }

  isSelected(tabId: string): boolean {
    return tabId === this.selectedTabId;
  }

  getTabItemCount(tabId: string): number {
    return this.tabItemCounts.get(tabId) || 0;
  }

  canDeleteTab(tabId: string): boolean {
    return this.getTabItemCount(tabId) === 0;
  }

  getTabDropListId(tabId: string): string {
    return `tab-drop-${tabId}`;
  }

  getTabDropListIds(): string[] {
    return this.tabs.map(t => this.getTabDropListId(t.id));
  }

  onDocumentDropOnTab(event: CdkDragDrop<unknown>, tabId: string): void {
    // Get the document data from the drag event
    const dragData = event.item.data;

    if (dragData && (dragData.document_id || dragData.isUnorganized)) {
      const documentId = dragData.document_id;
      if (documentId) {
        this.documentDropOnTab.emit({ documentId, targetTabId: tabId });
      }
    }

    this.dragOverTabId = null;
  }

  onDragEnterTab(tabId: string): void {
    this.dragOverTabId = tabId;
  }

  onDragLeaveTab(): void {
    this.dragOverTabId = null;
  }
}
