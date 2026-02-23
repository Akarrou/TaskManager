import { Component, inject, OnInit } from '@angular/core';
import { TrashStore } from '../../store/trash.store';
import { TrashItem, TrashItemType } from '../../../../core/models/trash.model';

interface FilterOption {
  label: string;
  value: TrashItemType | null;
  icon: string;
}

@Component({
  selector: 'app-trash-page',
  standalone: true,
  imports: [],
  templateUrl: './trash-page.component.html',
  styleUrls: ['./trash-page.component.scss'],
})
export class TrashPageComponent implements OnInit {
  readonly trashStore = inject(TrashStore);

  readonly filterOptions: FilterOption[] = [
    { label: 'Tous', value: null, icon: 'select_all' },
    { label: 'Documents', value: 'document', icon: 'description' },
    { label: 'Projets', value: 'project', icon: 'folder' },
    { label: 'Événements', value: 'event', icon: 'event' },
    { label: 'Bases de données', value: 'database', icon: 'storage' },
    { label: 'Tâches', value: 'database_row', icon: 'task_alt' },
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
    this.trashStore.permanentDeleteItem(item);
  }

  onEmptyTrash(): void {
    this.trashStore.emptyTrash();
  }

  getItemIcon(itemType: TrashItemType): string {
    const icons: Record<TrashItemType, string> = {
      document: 'description',
      project: 'folder',
      event: 'event',
      database: 'storage',
      database_row: 'task_alt',
      comment: 'comment',
      spreadsheet: 'grid_on',
    };
    return icons[itemType] || 'delete';
  }

  getItemTypeLabel(itemType: TrashItemType): string {
    const labels: Record<TrashItemType, string> = {
      document: 'Document',
      project: 'Projet',
      event: 'Événement',
      database: 'Base de données',
      database_row: 'Tâche',
      comment: 'Commentaire',
      spreadsheet: 'Tableur',
    };
    return labels[itemType] || itemType;
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
