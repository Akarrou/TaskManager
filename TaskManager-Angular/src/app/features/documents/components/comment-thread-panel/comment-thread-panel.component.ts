import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  inject,
  OnChanges,
  SimpleChanges,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BlockComment } from '../../models/block-comment.model';
import { BlockCommentService } from '../../services/block-comment.service';
import { TrashService } from '../../../../core/services/trash.service';
import { TrashStore } from '../../../trash/store/trash.store';
import { CommentItemComponent } from '../comment-item/comment-item.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-comment-thread-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    CommentItemComponent,
  ],
  templateUrl: './comment-thread-panel.component.html',
  styleUrl: './comment-thread-panel.component.scss',
})
export class CommentThreadPanelComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() documentId: string | null = null;
  @Input() blockId: string | null = null;
  @Input() currentUserId: string | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() commentAdded = new EventEmitter<BlockComment>();
  @Output() commentUpdated = new EventEmitter<BlockComment>();
  @Output() commentDeleted = new EventEmitter<string>();

  @ViewChild('commentInput') commentInput?: ElementRef<HTMLTextAreaElement>;

  private commentService = inject(BlockCommentService);
  private trashService = inject(TrashService);
  private trashStore = inject(TrashStore);

  comments = signal<BlockComment[]>([]);
  isLoading = signal(false);
  newCommentContent = signal('');
  isSubmitting = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['blockId'] || changes['documentId']) && this.isOpen) {
      this.loadComments();
    }
  }

  loadComments(): void {
    if (!this.documentId || !this.blockId) {
      this.comments.set([]);
      return;
    }

    this.isLoading.set(true);
    this.commentService
      .getCommentsForBlock(this.documentId, this.blockId)
      .subscribe({
        next: (comments) => {
          this.comments.set(comments);
          this.isLoading.set(false);
          // Focus input after loading
          setTimeout(() => {
            this.commentInput?.nativeElement?.focus();
          }, 100);
        },
        error: (err) => {
          console.error('Failed to load comments:', err);
          this.comments.set([]);
          this.isLoading.set(false);
        },
      });
  }

  onClose(): void {
    this.close.emit();
  }

  submitComment(): void {
    const content = this.newCommentContent().trim();

    if (!content || !this.documentId || !this.blockId) {
      return;
    }

    this.isSubmitting.set(true);

    this.commentService
      .addComment(this.documentId, this.blockId, content)
      .subscribe({
        next: (comment) => {
          this.comments.update((list) => [...list, comment]);
          this.newCommentContent.set('');
          this.isSubmitting.set(false);
          this.commentAdded.emit(comment);
        },
        error: (err) => {
          console.error('Failed to add comment:', err);
          this.isSubmitting.set(false);
        },
      });
  }

  onEditComment(event: { id: string; content: string }): void {
    this.commentService.updateComment(event.id, event.content).subscribe({
      next: (updatedComment) => {
        this.comments.update((list) =>
          list.map((c) => (c.id === event.id ? updatedComment : c))
        );
        this.commentUpdated.emit(updatedComment);
      },
      error: (err) => {
        console.error('Failed to update comment:', err);
      },
    });
  }

  onDeleteComment(commentId: string): void {
    const comment = this.comments().find(c => c.id === commentId);
    const displayName = comment?.content?.substring(0, 50) || 'Commentaire';

    this.trashService.softDelete(
      'comment',
      commentId,
      'block_comments',
      displayName,
      this.documentId ? { documentId: this.documentId } : undefined,
    ).subscribe({
      next: () => {
        this.comments.update((list) => list.filter((c) => c.id !== commentId));
        this.commentDeleted.emit(commentId);
        this.trashStore.loadTrashCount();
      },
      error: (err) => {
        console.error('Failed to delete comment:', err);
      },
    });
  }

  onKeyDown(event: KeyboardEvent): void {
    // Submit on Ctrl+Enter or Cmd+Enter
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.submitComment();
    }
  }
}
