import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';

import { Task } from '../../../../core/services/task';
import { EpicMetrics } from '../../models/epic-board.model';

@Component({
  selector: 'app-epic-header',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressBarModule,
    MatChipsModule,
    MatInputModule,
    MatFormFieldModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
    MatExpansionModule
  ],
  templateUrl: './epic-header.component.html',
  styleUrls: ['./epic-header.component.scss']
})
export class EpicHeaderComponent {
  @Input() epic: Task | undefined;
  @Input() metrics: EpicMetrics | undefined;
  @Input() canEdit = true;
  
  @Output() navigateBack = new EventEmitter<void>();
  @Output() refreshBoard = new EventEmitter<void>();
  @Output() editEpic = new EventEmitter<Task>();
  @Output() saveEpic = new EventEmitter<Partial<Task>>();
  @Output() deleteEpic = new EventEmitter<Task>();
  @Output() exportBoard = new EventEmitter<void>();
  @Output() shareBoard = new EventEmitter<void>();

  // Signals pour l'édition inline
  isEditingTitle = signal(false);
  editedTitle = signal('');

  onNavigateBack(): void {
    this.navigateBack.emit();
  }

  onRefreshBoard(): void {
    this.refreshBoard.emit();
  }

  onEditEpic(): void {
    if (this.epic) {
      this.editEpic.emit(this.epic);
    }
  }

  onDeleteEpic(): void {
    if (this.epic) {
      this.deleteEpic.emit(this.epic);
    }
  }

  onExportBoard(): void {
    this.exportBoard.emit();
  }

  onShareBoard(): void {
    this.shareBoard.emit();
  }

  // Édition inline du titre
  startEditingTitle(): void {
    if (!this.canEdit || !this.epic) return;
    this.editedTitle.set(this.epic.title || '');
    this.isEditingTitle.set(true);
  }

  saveTitle(): void {
    if (!this.epic) return;
    const newTitle = this.editedTitle().trim();
    if (newTitle && newTitle !== this.epic.title) {
      this.saveEpic.emit({ title: newTitle });
    }
    this.cancelEditingTitle();
  }

  cancelEditingTitle(): void {
    this.isEditingTitle.set(false);
    this.editedTitle.set('');
  }

  onTitleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.saveTitle();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEditingTitle();
    }
  }

  // Configuration du numéro epic coloré
  get epicNumberConfig(): { color: string; bgColor: string; label: string } {
    return {
      color: 'text-red-700',
      bgColor: 'bg-red-100 border-red-300',
      label: 'Epic'
    };
  }

  // Status configuration enrichie
  getStatusIcon(): string {
    switch (this.epic?.status) {
      case 'completed': return 'check_circle';
      case 'in_progress': return 'hourglass_empty';
      case 'pending': return 'schedule';
      case 'cancelled': return 'cancel';
      default: return 'schedule';
    }
  }

  getStatusColor(): string {
    switch (this.epic?.status) {
      case 'completed': return 'text-green-600';
      case 'in_progress': return 'text-orange-500';
      case 'pending': return 'text-gray-500';
      case 'cancelled': return 'text-red-500';
      default: return 'text-gray-500';
    }
  }

  getStatusLabel(): string {
    switch (this.epic?.status) {
      case 'completed': return 'Terminé';
      case 'in_progress': return 'En cours';
      case 'pending': return 'En attente';
      case 'cancelled': return 'Annulé';
      default: return 'Inconnu';
    }
  }

  // Priority configuration
  getPriorityIcon(): string {
    switch (this.epic?.priority) {
      case 'urgent': return 'priority_high';
      case 'high': return 'arrow_upward';
      case 'medium': return 'remove';
      case 'low': return 'arrow_downward';
      default: return 'remove';
    }
  }

  getPriorityColor(): string {
    switch (this.epic?.priority) {
      case 'urgent': return 'text-red-600';
      case 'high': return 'text-orange-500';
      case 'medium': return 'text-blue-500';
      case 'low': return 'text-green-500';
      default: return 'text-gray-500';
    }
  }

  getPriorityLabel(): string {
    switch (this.epic?.priority) {
      case 'urgent': return 'Urgent';
      case 'high': return 'Haute';
      case 'medium': return 'Moyenne';
      case 'low': return 'Basse';
      default: return 'Non définie';
    }
  }

  // Computed properties for progress
  get progressColor(): string {
    const progress = this.metrics?.progressPercentage || 0;
    if (progress >= 80) return 'primary';
    if (progress >= 50) return 'accent';
    return 'warn';
  }

  get isOverdue(): boolean {
    if (!this.epic?.due_date) return false;
    const dueDate = new Date(this.epic.due_date);
    const today = new Date();
    return dueDate < today && this.epic.status !== 'completed';
  }

  // Formatage des dates
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { 
      day: '2-digit', 
      month: '2-digit',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  }

  // Estimation et temps
  get hasTimeTracking(): boolean {
    return (this.epic?.estimated_hours || 0) > 0 || (this.epic?.actual_hours || 0) > 0;
  }

  get timeTrackingProgress(): number {
    const estimated = this.epic?.estimated_hours || 0;
    const actual = this.epic?.actual_hours || 0;
    if (estimated === 0) return 0;
    return Math.min((actual / estimated) * 100, 100);
  }
} 