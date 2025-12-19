import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';

import {
  CellFormat,
  NumberFormatPattern,
  TextAlign,
  VerticalAlign,
} from '../../../models/spreadsheet.model';

/**
 * Format action types
 */
export type FormatAction =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'strikethrough' }
  | { type: 'textColor'; color: string }
  | { type: 'backgroundColor'; color: string }
  | { type: 'textAlign'; align: TextAlign }
  | { type: 'verticalAlign'; align: VerticalAlign }
  | { type: 'numberFormat'; format: NumberFormatPattern }
  | { type: 'fontSize'; size: number }
  | { type: 'borders'; style: 'all' | 'outer' | 'none' | 'top' | 'bottom' | 'left' | 'right' }
  | { type: 'merge' }
  | { type: 'unmerge' }
  | { type: 'wrapText' };

/**
 * Common colors for the color picker
 */
const COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
  '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
  '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0',
];

/**
 * Font sizes available
 */
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

/**
 * FormattingToolbarComponent
 *
 * Toolbar for cell formatting options (text styles, colors, alignment, etc.)
 */
@Component({
  selector: 'app-formatting-toolbar',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
  ],
  templateUrl: './formatting-toolbar.component.html',
  styleUrl: './formatting-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormattingToolbarComponent {
  @Input() currentFormat: CellFormat | undefined;
  @Input() hasSelection = false;
  @Input() isMerged = false;

  @Output() formatChange = new EventEmitter<FormatAction>();

  readonly colors = COLORS;
  readonly fontSizes = FONT_SIZES;

  readonly numberFormats: { label: string; value: NumberFormatPattern; example: string }[] = [
    { label: 'Automatique', value: 'general', example: '1234.5' },
    { label: 'Nombre', value: 'number', example: '1 234,50' },
    { label: 'Devise (€)', value: 'currency', example: '1 234,50 €' },
    { label: 'Pourcentage', value: 'percentage', example: '12,35%' },
    { label: 'Scientifique', value: 'scientific', example: '1,23E+03' },
    { label: 'Date courte', value: 'date-short', example: '19/12/2025' },
    { label: 'Date longue', value: 'date-long', example: '19 décembre 2025' },
    { label: 'Heure', value: 'time', example: '14:30:00' },
    { label: 'Date et heure', value: 'datetime', example: '19/12/2025 14:30' },
    { label: 'Texte', value: 'text', example: 'Texte brut' },
  ];

  // Check format states
  get isBold(): boolean {
    return this.currentFormat?.fontWeight === 'bold';
  }

  get isItalic(): boolean {
    return this.currentFormat?.fontStyle === 'italic';
  }

  get isUnderline(): boolean {
    return this.currentFormat?.textDecoration === 'underline';
  }

  get isStrikethrough(): boolean {
    return this.currentFormat?.textDecoration === 'line-through';
  }

  get currentFontSize(): number {
    return this.currentFormat?.fontSize || 11;
  }

  get currentTextAlign(): TextAlign {
    return this.currentFormat?.textAlign || 'left';
  }

  get currentTextColor(): string {
    return this.currentFormat?.textColor || '#000000';
  }

  get currentBackgroundColor(): string {
    return this.currentFormat?.backgroundColor || 'transparent';
  }

  get currentNumberFormat(): NumberFormatPattern {
    return this.currentFormat?.numberFormat || 'general';
  }

  // Format actions
  toggleBold(): void {
    this.formatChange.emit({ type: 'bold' });
  }

  toggleItalic(): void {
    this.formatChange.emit({ type: 'italic' });
  }

  toggleUnderline(): void {
    this.formatChange.emit({ type: 'underline' });
  }

  toggleStrikethrough(): void {
    this.formatChange.emit({ type: 'strikethrough' });
  }

  setTextColor(color: string): void {
    this.formatChange.emit({ type: 'textColor', color });
  }

  setBackgroundColor(color: string): void {
    this.formatChange.emit({ type: 'backgroundColor', color });
  }

  setTextAlign(align: TextAlign): void {
    this.formatChange.emit({ type: 'textAlign', align });
  }

  setVerticalAlign(align: VerticalAlign): void {
    this.formatChange.emit({ type: 'verticalAlign', align });
  }

  setNumberFormat(format: NumberFormatPattern): void {
    this.formatChange.emit({ type: 'numberFormat', format });
  }

  setFontSize(size: number): void {
    this.formatChange.emit({ type: 'fontSize', size });
  }

  setBorders(style: 'all' | 'outer' | 'none' | 'top' | 'bottom' | 'left' | 'right'): void {
    this.formatChange.emit({ type: 'borders', style });
  }

  toggleMerge(): void {
    if (this.isMerged) {
      this.formatChange.emit({ type: 'unmerge' });
    } else {
      this.formatChange.emit({ type: 'merge' });
    }
  }

  toggleWrapText(): void {
    this.formatChange.emit({ type: 'wrapText' });
  }
}
