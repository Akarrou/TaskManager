import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';

import { Task } from '../../../../core/services/task';
import { EpicMetrics } from '../../models/epic-board.model';

@Component({
  selector: 'app-epic-header',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressBarModule,
    MatChipsModule
  ],
  templateUrl: './epic-header.component.html',
  styleUrls: ['./epic-header.component.scss']
})
export class EpicHeaderComponent {
  @Input() epic!: Task;
  @Input() metrics!: EpicMetrics;
  
  @Output() navigateBack = new EventEmitter<void>();
  @Output() refreshBoard = new EventEmitter<void>();

  onNavigateBack(): void {
    this.navigateBack.emit();
  }

  onRefreshBoard(): void {
    this.refreshBoard.emit();
  }

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
      case 'completed': return 'success';
      case 'in_progress': return 'primary';
      case 'pending': return 'warn';
      case 'cancelled': return 'warn';
      default: return 'primary';
    }
  }
} 