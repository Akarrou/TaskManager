import { Component, input, output, signal, forwardRef, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';

type EditorMode = 'write' | 'preview' | 'split';

interface ToolbarButton {
  icon: string;
  label: string;
  action: string;
  prefix?: string;
  suffix?: string;
  blockPrefix?: string;
  tooltip: string;
}

@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatMenuModule
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RichTextEditorComponent),
      multi: true
    }
  ],
  templateUrl: './rich-text-editor.component.html',
  styleUrls: ['./rich-text-editor.component.scss']
})
export class RichTextEditorComponent implements ControlValueAccessor, OnInit {
  @ViewChild('textareaRef') textareaRef!: ElementRef<HTMLTextAreaElement>;

  placeholder = input<string>('Écrivez votre description ici...');
  minHeight = input<string>('200px');
  maxHeight = input<string>('500px');

  content = signal<string>('');
  mode = signal<EditorMode>('write');
  renderedHtml = signal<string>('');

  // Toolbar configuration
  toolbarButtons: ToolbarButton[] = [
    { icon: 'format_bold', label: 'Gras', action: 'bold', prefix: '**', suffix: '**', tooltip: 'Gras (Ctrl+B)' },
    { icon: 'format_italic', label: 'Italique', action: 'italic', prefix: '_', suffix: '_', tooltip: 'Italique (Ctrl+I)' },
    { icon: 'strikethrough_s', label: 'Barré', action: 'strikethrough', prefix: '~~', suffix: '~~', tooltip: 'Barré' },
    { icon: 'code', label: 'Code', action: 'code', prefix: '`', suffix: '`', tooltip: 'Code inline' },
    { icon: 'link', label: 'Lien', action: 'link', prefix: '[', suffix: '](url)', tooltip: 'Insérer un lien' },
  ];

  headingButtons: ToolbarButton[] = [
    { icon: 'title', label: 'Titre 1', action: 'h1', blockPrefix: '# ', tooltip: 'Titre 1' },
    { icon: 'title', label: 'Titre 2', action: 'h2', blockPrefix: '## ', tooltip: 'Titre 2' },
    { icon: 'title', label: 'Titre 3', action: 'h3', blockPrefix: '### ', tooltip: 'Titre 3' },
  ];

  listButtons: ToolbarButton[] = [
    { icon: 'format_list_bulleted', label: 'Liste à puces', action: 'ul', blockPrefix: '- ', tooltip: 'Liste à puces' },
    { icon: 'format_list_numbered', label: 'Liste numérotée', action: 'ol', blockPrefix: '1. ', tooltip: 'Liste numérotée' },
    { icon: 'checklist', label: 'Liste de tâches', action: 'checklist', blockPrefix: '- [ ] ', tooltip: 'Liste de tâches' },
  ];

  blockButtons: ToolbarButton[] = [
    { icon: 'format_quote', label: 'Citation', action: 'quote', blockPrefix: '> ', tooltip: 'Citation' },
    { icon: 'data_object', label: 'Bloc de code', action: 'codeblock', prefix: '```\n', suffix: '\n```', tooltip: 'Bloc de code' },
    { icon: 'horizontal_rule', label: 'Ligne horizontale', action: 'hr', blockPrefix: '---\n', tooltip: 'Ligne horizontale' },
  ];

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  ngOnInit() {
    this.updatePreview();
  }

  // ControlValueAccessor implementation
  writeValue(value: string): void {
    this.content.set(value || '');
    this.updatePreview();
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  onContentChange(value: string) {
    this.content.set(value);
    this.onChange(value);
    this.updatePreview();
  }

  setMode(mode: EditorMode) {
    this.mode.set(mode);
    if (mode !== 'write') {
      this.updatePreview();
    }
  }

  applyFormat(button: ToolbarButton) {
    const textarea = this.textareaRef?.nativeElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = this.content();
    const selectedText = text.substring(start, end);

    let newText = '';
    let cursorOffset = 0;

    if (button.blockPrefix) {
      // Block-level formatting (headings, lists, quotes)
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const beforeLine = text.substring(0, lineStart);
      const afterLineStart = text.substring(lineStart);

      newText = beforeLine + button.blockPrefix + afterLineStart;
      cursorOffset = button.blockPrefix.length;
    } else if (button.prefix && button.suffix) {
      // Inline formatting
      const before = text.substring(0, start);
      const after = text.substring(end);

      newText = before + button.prefix + selectedText + button.suffix + after;
      cursorOffset = button.prefix.length;
    }

    this.content.set(newText);
    this.onChange(newText);
    this.updatePreview();

    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + cursorOffset + (selectedText.length || 0);
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }

  onKeyDown(event: KeyboardEvent) {
    // Handle keyboard shortcuts
    if (event.ctrlKey || event.metaKey) {
      switch (event.key.toLowerCase()) {
        case 'b':
          event.preventDefault();
          this.applyFormat(this.toolbarButtons.find(b => b.action === 'bold')!);
          break;
        case 'i':
          event.preventDefault();
          this.applyFormat(this.toolbarButtons.find(b => b.action === 'italic')!);
          break;
        case 'k':
          event.preventDefault();
          this.applyFormat(this.toolbarButtons.find(b => b.action === 'link')!);
          break;
      }
    }

    // Handle Tab for indentation
    if (event.key === 'Tab') {
      event.preventDefault();
      const textarea = this.textareaRef?.nativeElement;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = this.content();
        const newText = text.substring(0, start) + '  ' + text.substring(end);
        this.content.set(newText);
        this.onChange(newText);
        setTimeout(() => {
          textarea.setSelectionRange(start + 2, start + 2);
        }, 0);
      }
    }
  }

  private updatePreview() {
    const markdown = this.content();
    this.renderedHtml.set(this.parseMarkdown(markdown));
  }

  private parseMarkdown(text: string): string {
    if (!text) return '';

    let html = text;

    // Escape HTML
    html = html.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;')
               .replace(/"/g, '&quot;')
               .replace(/'/g, '&#39;');

    // Code blocks (must be first to prevent other formatting inside)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold and Italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Images (before links to avoid conflicts with ![...] syntax)
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match: string, alt: string, src: string) => {
      const decodedSrc = src.replace(/&amp;/g, '&');
      if (/^https?:\/\//i.test(decodedSrc) || /^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml);/i.test(decodedSrc)) {
        return `<img src="${src}" alt="${alt}" />`;
      }
      return `<img src="" alt="${alt}" />`;
    });

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match: string, text: string, href: string) => {
      const decodedHref = href.replace(/&amp;/g, '&');
      if (/^https?:\/\//i.test(decodedHref) || /^mailto:/i.test(decodedHref)) {
        return `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
      }
      return `<a href="" target="_blank" rel="noopener">${text}</a>`;
    });

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr />');

    // Task lists
    html = html.replace(/^- \[x\] (.+)$/gm, '<div class="task-item completed"><input type="checkbox" checked disabled /> $1</div>');
    html = html.replace(/^- \[ \] (.+)$/gm, '<div class="task-item"><input type="checkbox" disabled /> $1</div>');

    // Unordered lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Paragraphs (simple approach)
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>(<h[1-3]>)/g, '$1');
    html = html.replace(/(<\/h[1-3]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p>(<blockquote>)/g, '$1');
    html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
    html = html.replace(/<p>(<pre>)/g, '$1');
    html = html.replace(/(<\/pre>)<\/p>/g, '$1');
    html = html.replace(/<p>(<hr \/>)/g, '$1');
    html = html.replace(/(<hr \/>)<\/p>/g, '$1');
    html = html.replace(/<p>(<div class="task-item)/g, '$1');
    html = html.replace(/(<\/div>)<\/p>/g, '$1');

    // Line breaks within paragraphs
    html = html.replace(/\n/g, '<br />');

    return html;
  }
}
