import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { TrashStore } from '../../store/trash.store';
import { TrashItem, TrashItemType } from '../../../../core/models/trash.model';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

interface FilterOption {
  label: string;
  value: TrashItemType | null;
  icon: string;
}

const ITEM_ICONS: Record<TrashItemType, string> = {
  document: 'description',
  project: 'folder',
  event: 'event',
  database: 'storage',
  database_row: 'task_alt',
  comment: 'comment',
  spreadsheet: 'grid_on',
};

const ITEM_TYPE_LABELS: Record<TrashItemType, string> = {
  document: 'Document',
  project: 'Projet',
  event: 'Événement',
  database: 'Base de données',
  database_row: 'Tâche',
  comment: 'Commentaire',
  spreadsheet: 'Tableur',
};

@Component({
  selector: 'app-trash-page',
  standalone: true,
  imports: [],
  templateUrl: './trash-page.component.html',
  styleUrls: ['./trash-page.component.scss'],
})
export class TrashPageComponent implements OnInit {
  readonly trashStore = inject(TrashStore);
  private dialog = inject(MatDialog);
  private destroyRef = inject(DestroyRef);

  readonly filterOptions: FilterOption[] = [
    { label: 'Tous', value: null, icon: 'select_all' },
    { label: 'Documents', value: 'document', icon: 'description' },
    { label: 'Projets', value: 'project', icon: 'folder' },
    { label: 'Événements', value: 'event', icon: 'event' },
    { label: 'Bases de données', value: 'database', icon: 'storage' },
    { label: 'Tâches', value: 'database_row', icon: 'task_alt' },
    { label: 'Tableurs', value: 'spreadsheet', icon: 'grid_on' },
    { label: 'Commentaires', value: 'comment', icon: 'comment' },
  ];

  ngOnInit(): void {
    this.trashStore.loadItems();
  }

  onFilterChange(value: TrashItemType | null): void {
    this.trashStore.setFilter(value);
  }

  onRestore(item: TrashItem): void {
    this.trashStore.restoreItem(item);
  }

  onPermanentDelete(item: TrashItem): void {
    const dialogRef = this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        width: '500px',
        data: {
          title: 'Supprimer définitivement',
          message: `Voulez-vous supprimer définitivement "${item.display_name}" ? Cette action est irréversible.`,
          permanent: true,
        },
      },
    );

    dialogRef.afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((confirmed) => {
      if (confirmed) {
        this.trashStore.permanentDeleteItem(item);
      }
    });
  }

  onEmptyTrash(): void {
    const dialogRef = this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        width: '500px',
        data: {
          title: 'Vider la corbeille',
          message: `Voulez-vous supprimer définitivement les ${this.trashStore.items().length} éléments de la corbeille ?`,
          warningTitle: 'Action irréversible',
          warningMessage: 'Tous les éléments seront supprimés définitivement et ne pourront pas être récupérés.',
          permanent: true,
        },
      },
    );

    dialogRef.afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((confirmed) => {
      if (confirmed) {
        this.trashStore.emptyTrash();
      }
    });
  }

  isProcessing(itemId: string): boolean {
    return this.trashStore.processingIds().includes(itemId);
  }

  getItemIcon(itemType: TrashItemType): string {
    return ITEM_ICONS[itemType] || 'delete';
  }

  getItemTypeLabel(itemType: TrashItemType): string {
    return ITEM_TYPE_LABELS[itemType] || itemType;
  }

  getRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "aujourd'hui";
    if (diffDays === 1) return 'hier';
    if (diffDays < 7) return `il y a ${diffDays} jours`;
    if (diffDays < 30) return `il y a ${Math.floor(diffDays / 7)} semaine(s)`;
    return `il y a ${Math.floor(diffDays / 30)} mois`;
  }

  getDaysUntilExpiry(expiresAt: string): number {
    const expires = new Date(expiresAt);
    const now = new Date();
    return Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }

  getParentContext(item: TrashItem): string {
    if (!item.parent_info) return '';
    const parts: string[] = [];
    if (item.parent_info['projectName']) {
      parts.push(item.parent_info['projectName']);
    }
    if (item.parent_info['databaseName']) {
      parts.push(item.parent_info['databaseName']);
    }
    return parts.join(' > ');
  }
}
