import { Component, Input, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Editor } from '@tiptap/core';

interface ColorOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-table-bubble-menu',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './table-bubble-menu.component.html',
  styleUrl: './table-bubble-menu.component.scss',
})
export class TableBubbleMenuComponent implements OnInit, OnDestroy {
  @Input() editor!: Editor;

  isVisible = signal(false);
  position = signal({ top: '0px', left: '0px' });
  showCellColorPicker = signal(false);
  showBorderColorPicker = signal(false);
  showBorderWidthPicker = signal(false);

  cellColors: ColorOption[] = [
    { label: 'Aucune', value: '' },
    { label: 'Rouge clair', value: '#fef2f2' },
    { label: 'Orange clair', value: '#fff7ed' },
    { label: 'Jaune clair', value: '#fefce8' },
    { label: 'Vert clair', value: '#f0fdf4' },
    { label: 'Bleu clair', value: '#eff6ff' },
    { label: 'Violet clair', value: '#f5f3ff' },
    { label: 'Rose clair', value: '#fdf2f8' },
    { label: 'Gris clair', value: '#f3f4f6' },
    { label: 'Rouge', value: '#fecaca' },
    { label: 'Orange', value: '#fed7aa' },
    { label: 'Jaune', value: '#fef08a' },
    { label: 'Vert', value: '#bbf7d0' },
    { label: 'Bleu', value: '#bfdbfe' },
    { label: 'Violet', value: '#ddd6fe' },
    { label: 'Rose', value: '#fbcfe8' },
    { label: 'Gris', value: '#e5e7eb' },
  ];

  borderColors: ColorOption[] = [
    { label: 'Par défaut', value: '' },
    { label: 'Noir', value: '#000000' },
    { label: 'Gris foncé', value: '#374151' },
    { label: 'Gris', value: '#9ca3af' },
    { label: 'Gris clair', value: '#d1d5db' },
    { label: 'Rouge', value: '#ef4444' },
    { label: 'Orange', value: '#f97316' },
    { label: 'Jaune', value: '#eab308' },
    { label: 'Vert', value: '#22c55e' },
    { label: 'Bleu', value: '#3b82f6' },
    { label: 'Violet', value: '#8b5cf6' },
    { label: 'Rose', value: '#ec4899' },
  ];

  borderWidths: ColorOption[] = [
    { label: 'Par défaut', value: '' },
    { label: 'Aucune bordure', value: '0px' },
    { label: 'Fine (1px)', value: '1px' },
    { label: 'Moyenne (2px)', value: '2px' },
    { label: 'Épaisse (3px)', value: '3px' },
    { label: 'Très épaisse (4px)', value: '4px' },
  ];

  private updateInterval?: number;

  ngOnInit() {
    this.updateInterval = window.setInterval(() => {
      this.updateMenuState();
    }, 100);
  }

  ngOnDestroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  updateMenuState() {
    if (!this.editor) return;

    const isInTable = this.editor.isActive('table');
    this.isVisible.set(isInTable);

    if (isInTable) {
      this.calculatePosition();
    } else {
      this.closeAllPickers();
    }
  }

  calculatePosition() {
    const { view } = this.editor;
    const { state } = view;
    const { selection } = state;

    const $pos = selection.$from;
    let tableDepth = -1;

    for (let d = $pos.depth; d >= 0; d--) {
      if ($pos.node(d).type.name === 'table') {
        tableDepth = d;
        break;
      }
    }

    if (tableDepth < 0) return;

    const tableStart = $pos.before(tableDepth);
    const dom = view.nodeDOM(tableStart) as HTMLElement;

    if (dom) {
      const tableEl = dom.querySelector('table') || dom;
      const rect = tableEl.getBoundingClientRect();

      this.position.set({
        top: `${rect.top + window.scrollY - 50}px`,
        left: `${rect.left + window.scrollX + rect.width / 2}px`,
      });
    }
  }

  closeAllPickers() {
    this.showCellColorPicker.set(false);
    this.showBorderColorPicker.set(false);
    this.showBorderWidthPicker.set(false);
  }

  addColumnBefore() {
    this.editor.chain().focus().addColumnBefore().run();
  }

  addColumnAfter() {
    this.editor.chain().focus().addColumnAfter().run();
  }

  deleteColumn() {
    this.editor.chain().focus().deleteColumn().run();
  }

  addRowBefore() {
    this.editor.chain().focus().addRowBefore().run();
  }

  addRowAfter() {
    this.editor.chain().focus().addRowAfter().run();
  }

  deleteRow() {
    this.editor.chain().focus().deleteRow().run();
  }

  deleteTable() {
    this.editor.chain().focus().deleteTable().run();
  }

  toggleHeaderRow() {
    this.editor.chain().focus().toggleHeaderRow().run();
  }

  mergeCells() {
    this.editor.chain().focus().mergeCells().run();
  }

  splitCell() {
    this.editor.chain().focus().splitCell().run();
  }

  // Cell background color
  toggleCellColorPicker() {
    const current = this.showCellColorPicker();
    this.closeAllPickers();
    this.showCellColorPicker.set(!current);
  }

  setCellColor(color: string) {
    this.editor.chain().focus().setCellAttribute('backgroundColor', color || null).run();
    this.showCellColorPicker.set(false);
  }

  // Border color
  toggleBorderColorPicker() {
    const current = this.showBorderColorPicker();
    this.closeAllPickers();
    this.showBorderColorPicker.set(!current);
  }

  setBorderColor(color: string) {
    this.editor.chain().focus().setCellAttribute('borderColor', color || null).run();
    this.showBorderColorPicker.set(false);
  }

  // Border width
  toggleBorderWidthPicker() {
    const current = this.showBorderWidthPicker();
    this.closeAllPickers();
    this.showBorderWidthPicker.set(!current);
  }

  setBorderWidth(width: string) {
    this.editor.chain().focus().setCellAttribute('borderWidth', width || null).run();
    this.showBorderWidthPicker.set(false);
  }
}
