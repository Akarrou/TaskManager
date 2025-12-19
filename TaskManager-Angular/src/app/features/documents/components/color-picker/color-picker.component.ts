import {
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
  HostListener,
  ElementRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { NODE_PRESET_COLORS } from '../../models/mindmap.model';

/**
 * Color picker component for mindmap nodes
 * Shows preset colors + custom color input
 */
@Component({
  selector: 'app-color-picker',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.scss',
})
export class ColorPickerComponent {
  private elementRef = inject(ElementRef);

  @Input() selectedColor: string = '#3b82f6';
  @Input() presetColors: string[] = NODE_PRESET_COLORS;
  @Input() showTrigger = true;
  @Output() colorChange = new EventEmitter<string>();

  showPicker = signal(false);

  togglePicker(): void {
    this.showPicker.update((v) => !v);
  }

  selectColor(color: string): void {
    this.colorChange.emit(color);
    this.showPicker.set(false);
  }

  onCustomColorChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.colorChange.emit(input.value);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.showPicker.set(false);
    }
  }
}
