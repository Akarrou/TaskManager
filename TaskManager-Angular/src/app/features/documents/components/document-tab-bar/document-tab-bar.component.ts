import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { DocumentTab, UpdateDocumentTab } from '../../models/document-tabs.model';
import {
  TabEditDialogComponent,
  TabEditDialogData,
  TabEditDialogResult,
} from '../tab-edit-dialog/tab-edit-dialog.component';

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

  @Output() tabSelect = new EventEmitter<string>();
  @Output() tabCreate = new EventEmitter<{ name: string; icon: string; color: string }>();
  @Output() tabUpdate = new EventEmitter<{ tabId: string; updates: UpdateDocumentTab }>();
  @Output() tabDelete = new EventEmitter<string>();
  @Output() tabsReorder = new EventEmitter<string[]>();

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

  onDeleteTab(tabId: string, event: Event): void {
    event.stopPropagation();
    // Confirm before delete
    if (confirm('Supprimer cet onglet ? Les documents ne seront pas supprimés.')) {
      this.tabDelete.emit(tabId);
    }
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
}
