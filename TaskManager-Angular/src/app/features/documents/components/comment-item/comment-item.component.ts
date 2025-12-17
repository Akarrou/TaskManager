import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BlockComment } from '../../models/block-comment.model';

@Component({
  selector: 'app-comment-item',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  templateUrl: './comment-item.component.html',
  styleUrl: './comment-item.component.scss',
})
export class CommentItemComponent {
  @Input({ required: true }) comment!: BlockComment;
  @Input() currentUserId: string | null = null;
  @Output() edit = new EventEmitter<{ id: string; content: string }>();
  @Output() delete = new EventEmitter<string>();

  isEditing = signal(false);
  editContent = signal('');

  isOwner = computed(() => {
    return this.currentUserId !== null && this.comment.user_id === this.currentUserId;
  });

  get relativeTime(): string {
    const date = new Date(this.comment.created_at);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return "À l'instant";
    } else if (diffMins < 60) {
      return `Il y a ${diffMins} min`;
    } else if (diffHours < 24) {
      return `Il y a ${diffHours}h`;
    } else if (diffDays < 7) {
      return `Il y a ${diffDays}j`;
    } else {
      return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
      });
    }
  }

  get userInitial(): string {
    if (this.comment.user_email) {
      return this.comment.user_email.charAt(0).toUpperCase();
    }
    return '?';
  }

  get displayName(): string {
    if (this.comment.user_email) {
      // Extract name from email (before @)
      const name = this.comment.user_email.split('@')[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return 'Utilisateur';
  }

  startEdit(): void {
    this.editContent.set(this.comment.content);
    this.isEditing.set(true);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
    this.editContent.set('');
  }

  saveEdit(): void {
    const content = this.editContent().trim();
    if (content && content !== this.comment.content) {
      this.edit.emit({ id: this.comment.id, content });
    }
    this.isEditing.set(false);
    this.editContent.set('');
  }

  confirmDelete(): void {
    this.delete.emit(this.comment.id);
  }

  onEditKeydown(event: KeyboardEvent): void {
    // Save on Ctrl+Enter or Cmd+Enter
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.saveEdit();
    }
  }
}
