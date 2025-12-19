import {
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
  ElementRef,
  ViewChild,
  AfterViewInit,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDragEnd, CdkDragStart } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import {
  StickyNote,
  StickyNoteColor,
  STICKY_NOTE_COLORS,
} from '../../models/mindmap.model';

/**
 * Sticky note component - draggable note on the mindmap canvas
 */
@Component({
  selector: 'app-sticky-note',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkDrag,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
  ],
  templateUrl: './sticky-note.component.html',
  styleUrl: './sticky-note.component.scss',
})
export class StickyNoteComponent implements AfterViewInit {
  @Input({ required: true }) note!: StickyNote;
  @Input() scale = 1;

  @Output() contentChange = new EventEmitter<string>();
  @Output() positionChange = new EventEmitter<{ x: number; y: number }>();
  @Output() sizeChange = new EventEmitter<{ width: number; height: number }>();
  @Output() colorChange = new EventEmitter<StickyNoteColor>();
  @Output() deleteNote = new EventEmitter<void>();

  @ViewChild('textarea') textareaRef!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('colorMenuTrigger') colorMenuTrigger!: MatMenuTrigger;

  editing = signal(false);
  readonly colors = Object.keys(STICKY_NOTE_COLORS) as StickyNoteColor[];

  ngAfterViewInit(): void {
    // Auto-focus if note is new (empty content)
    if (!this.note.content && this.textareaRef) {
      setTimeout(() => {
        this.editing.set(true);
        this.textareaRef.nativeElement.focus();
      }, 100);
    }
  }

  onDragStarted(event: CdkDragStart): void {
    // Stop propagation to prevent Cytoscape from capturing the event
    event.event?.stopPropagation();
    event.event?.preventDefault();
  }

  onDragEnded(event: CdkDragEnd): void {
    const distance = event.distance;
    // Emit the delta (distance moved), not absolute position
    // The parent component will handle the scale conversion
    this.positionChange.emit({
      x: distance.x,
      y: distance.y,
    });
    // Reset the CDK drag position since we're using absolute positioning
    event.source.reset();
  }

  /**
   * Prevent mouse events from propagating to Cytoscape
   */
  @HostListener('mousedown', ['$event'])
  @HostListener('touchstart', ['$event'])
  onPointerDown(event: Event): void {
    event.stopPropagation();
  }

  onContentBlur(): void {
    this.editing.set(false);
    this.contentChange.emit(this.note.content);
  }

  onContentChange(): void {
    // Emit on each change for debounced save
    this.contentChange.emit(this.note.content);
  }

  selectColor(color: StickyNoteColor): void {
    this.colorChange.emit(color);
    // Close the menu after selection
    this.colorMenuTrigger?.closeMenu();
  }

  getColorHex(color: StickyNoteColor): string {
    return STICKY_NOTE_COLORS[color];
  }

  startEditing(): void {
    this.editing.set(true);
    setTimeout(() => {
      this.textareaRef?.nativeElement.focus();
    }, 0);
  }

  @HostListener('dblclick')
  onDoubleClick(): void {
    this.startEditing();
  }
}
