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
import { BlockCommentStore } from '../../store/block-comment.store';
import { CommentItemComponent } from '../comment-item/comment-item.component';

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

  readonly commentStore = inject(BlockCommentStore);

  comments = signal<BlockComment[]>([]);
  newCommentContent = signal('');

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

    const blockId = this.blockId;
    this.commentStore.loadCommentsForBlock({ documentId: this.documentId, blockId });

    // Sync local comments from store after load completes
    // We use a small timeout to let the rxMethod process
    setTimeout(() => {
      const storeComments = this.commentStore.commentsByBlock()[blockId] || [];
      this.comments.set(storeComments);
      this.commentInput?.nativeElement?.focus();
    }, 100);
  }

  onClose(): void {
    this.close.emit();
  }

  submitComment(): void {
    const content = this.newCommentContent().trim();

    if (!content || !this.documentId || !this.blockId) {
      return;
    }

    const blockId = this.blockId;
    this.commentStore.addComment({ documentId: this.documentId, blockId, content });

    // Optimistically clear input
    this.newCommentContent.set('');
  }

  onEditComment(event: { id: string; content: string }): void {
    if (!this.blockId) return;
    this.commentStore.updateComment({ commentId: event.id, content: event.content, blockId: this.blockId });
  }

  onDeleteComment(commentId: string): void {
    if (!this.documentId || !this.blockId) return;

    const comment = this.comments().find(c => c.id === commentId);
    const displayName = comment?.content?.substring(0, 50) || 'Commentaire';

    this.commentStore.deleteComment({
      commentId,
      blockId: this.blockId,
      documentId: this.documentId,
      displayName,
    });
    this.commentDeleted.emit(commentId);
  }

  onKeyDown(event: KeyboardEvent): void {
    // Submit on Ctrl+Enter or Cmd+Enter
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.submitComment();
    }
  }
}
