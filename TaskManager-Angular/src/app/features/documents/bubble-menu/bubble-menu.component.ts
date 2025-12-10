import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Editor } from '@tiptap/core';

@Component({
  selector: 'app-bubble-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bubble-menu.component.html',
  styleUrl: './bubble-menu.component.scss'
})
export class BubbleMenuComponent {
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
    { label: 'Times', value: 'Times New Roman, serif' },
    { label: 'Courier', value: 'Courier New, monospace' }
  ];

  fontSizes = [
    { label: 'Petit', value: '0.875rem' },
    { label: 'Normal', value: '1rem' },
    { label: 'Grand', value: '1.25rem' },
    { label: 'Énorme', value: '1.5rem' }
  ];

  textAlignments = [
    { icon: 'format_align_left', value: 'left', title: 'Gauche' },
    { icon: 'format_align_center', value: 'center', title: 'Centre' },
    { icon: 'format_align_right', value: 'right', title: 'Droite' },
    { icon: 'format_align_justify', value: 'justify', title: 'Justifier' }
  ];

  toggleBold() {
    this.editor.chain().focus().toggleBold().run();
  }

  toggleItalic() {
    this.editor.chain().focus().toggleItalic().run();
  }

  toggleStrike() {
    this.editor.chain().focus().toggleStrike().run();
  }

  toggleCode() {
    this.editor.chain().focus().toggleCode().run();
  }

  setHeading(level: 1 | 2 | 3) {
    this.editor.chain().focus().toggleHeading({ level }).run();
  }

  setParagraph() {
    this.editor.chain().focus().setParagraph().run();
  }

  isBold(): boolean {
    return this.editor.isActive('bold');
  }

  isItalic(): boolean {
    return this.editor.isActive('italic');
  }

  isStrike(): boolean {
    return this.editor.isActive('strike');
  }

  isCode(): boolean {
    return this.editor.isActive('code');
  }

  isHeading(level: number): boolean {
    return this.editor.isActive('heading', { level });
  }

  isParagraph(): boolean {
    return this.editor.isActive('paragraph');
  }

  // Font styling methods
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
