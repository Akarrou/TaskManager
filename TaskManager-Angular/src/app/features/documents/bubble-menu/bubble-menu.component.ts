import { Component, Input } from '@angular/core';
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
}
