import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Editor } from '@tiptap/core';

@Component({
  selector: 'app-format-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './format-toolbar.component.html',
  styleUrl: './format-toolbar.component.scss'
})
export class FormatToolbarComponent {
  @Input() editor!: Editor;

  // Color pickers visibility
  showTextColorPicker = signal(false);
  showBgColorPicker = signal(false);

  // Predefined colors
  textColors = [
    '#000000', '#374151', '#6b7280', '#9ca3af',
    '#dc2626', '#ea580c', '#d97706', '#ca8a04',
    '#65a30d', '#16a34a', '#059669', '#0d9488',
    '#0284c7', '#2563eb', '#4f46e5', '#7c3aed',
    '#c026d3', '#db2777', '#e11d48', '#ffffff'
  ];

  bgColors = [
    'transparent', '#f9fafb', '#f3f4f6', '#e5e7eb',
    '#fef2f2', '#fff7ed', '#fffbeb', '#fefce8',
    '#f7fee7', '#f0fdf4', '#ecfdf5', '#f0fdfa',
    '#f0f9ff', '#eff6ff', '#eef2ff', '#f5f3ff',
    '#faf5ff', '#fdf4ff', '#fef2f2', '#ffffff'
  ];

  fontFamilies = [
    { label: 'Défaut', value: '' },
    { label: 'Sans-serif', value: 'ui-sans-serif, system-ui, sans-serif' },
    { label: 'Serif', value: 'ui-serif, Georgia, serif' },
    { label: 'Monospace', value: 'ui-monospace, monospace' },
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'Times New Roman', value: 'Times New Roman, serif' },
    { label: 'Courier New', value: 'Courier New, monospace' },
    { label: 'Comic Sans', value: 'Comic Sans MS, cursive' }
  ];

  fontSizes = [
    { label: 'Petit', value: '0.875rem' },
    { label: 'Normal', value: '1rem' },
    { label: 'Moyen', value: '1.125rem' },
    { label: 'Grand', value: '1.25rem' },
    { label: 'Très grand', value: '1.5rem' },
    { label: 'Énorme', value: '2rem' }
  ];

  textAlignments = [
    { icon: 'format_align_left', value: 'left', title: 'Aligner à gauche' },
    { icon: 'format_align_center', value: 'center', title: 'Centrer' },
    { icon: 'format_align_right', value: 'right', title: 'Aligner à droite' },
    { icon: 'format_align_justify', value: 'justify', title: 'Justifier' }
  ];

  setTextColor(color: string) {
    this.editor.chain().focus().setColor(color).run();
    this.showTextColorPicker.set(false);
  }

  setBgColor(color: string) {
    if (color === 'transparent') {
      this.editor.chain().focus().unsetHighlight().run();
    } else {
      this.editor.chain().focus().setHighlight({ color }).run();
    }
    this.showBgColorPicker.set(false);
  }

  setFontFamily(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (value) {
      this.editor.chain().focus().setFontFamily(value).run();
    } else {
      this.editor.chain().focus().unsetFontFamily().run();
    }
  }

  setFontSize(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (value) {
      this.editor.chain().focus().setFontSize(value).run();
    } else {
      this.editor.chain().focus().unsetFontSize().run();
    }
  }

  setTextAlign(alignment: string) {
    this.editor.chain().focus().setTextAlign(alignment).run();
  }

  isTextAlignActive(alignment: string): boolean {
    return this.editor.isActive({ textAlign: alignment });
  }

  getCurrentTextColor(): string {
    const attributes = this.editor.getAttributes('textStyle');
    return attributes['color'] || '#000000';
  }

  getCurrentBgColor(): string {
    const highlight = this.editor.getAttributes('highlight');
    return highlight['color'] || 'transparent';
  }

  toggleTextColorPicker() {
    this.showTextColorPicker.update(v => !v);
    this.showBgColorPicker.set(false);
  }

  toggleBgColorPicker() {
    this.showBgColorPicker.update(v => !v);
    this.showTextColorPicker.set(false);
  }
}
