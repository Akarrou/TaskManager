import { Component, Input, Output, EventEmitter, ElementRef, OnInit, OnDestroy, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export interface AccordionSettings {
  icon: string;
  iconColor: string;
  titleColor: string;
}

const AVAILABLE_ICONS = [
  'description', 'star', 'warning', 'info',
  'lightbulb', 'rocket_launch', 'check_circle', 'help',
  'settings', 'bookmark', 'favorite', 'bolt',
  'flag', 'push_pin', 'tips_and_updates', 'auto_awesome',
];

const COLOR_PALETTE = [
  { name: 'Bleu', value: '#3b82f6' },
  { name: 'Vert', value: '#22c55e' },
  { name: 'Rouge', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Rose', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Gris', value: '#6b7280' },
  { name: 'Jaune', value: '#eab308' },
  { name: 'Sombre', value: '#1f2937' },
];

@Component({
  selector: 'app-accordion-settings-popover',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './accordion-settings-popover.component.html',
  styleUrl: './accordion-settings-popover.component.scss',
})
export class AccordionSettingsPopoverComponent implements OnInit, OnDestroy {
  @Input() currentIcon = 'description';
  @Input() currentIconColor = '#3b82f6';
  @Input() currentTitleColor = '#1f2937';
  @Input() positionTop = 0;
  @Input() positionLeft = 0;

  @Output() settingsChanged = new EventEmitter<AccordionSettings>();
  @Output() closePopover = new EventEmitter<void>();

  icons = AVAILABLE_ICONS;
  colors = COLOR_PALETTE;

  selectedIcon = 'description';
  selectedIconColor = '#3b82f6';
  selectedTitleColor = '#1f2937';

  private elementRef = inject(ElementRef);
  private ngZone = inject(NgZone);

  private active = false;
  private onDocumentMouseDown = (event: MouseEvent) => {
    if (!this.active) return;
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.ngZone.run(() => this.closePopover.emit());
    }
  };

  ngOnInit() {
    this.selectedIcon = this.currentIcon;
    this.selectedIconColor = this.currentIconColor;
    this.selectedTitleColor = this.currentTitleColor;

    // Delay activation so the opening click doesn't immediately close the popover
    setTimeout(() => {
      this.active = true;
      document.addEventListener('mousedown', this.onDocumentMouseDown, true);
    }, 100);
  }

  ngOnDestroy() {
    document.removeEventListener('mousedown', this.onDocumentMouseDown, true);
  }

  selectIcon(icon: string) {
    this.selectedIcon = icon;
    this.emitChange();
  }

  selectIconColor(color: string) {
    this.selectedIconColor = color;
    this.emitChange();
  }

  selectTitleColor(color: string) {
    this.selectedTitleColor = color;
    this.emitChange();
  }

  private emitChange() {
    this.settingsChanged.emit({
      icon: this.selectedIcon,
      iconColor: this.selectedIconColor,
      titleColor: this.selectedTitleColor,
    });
  }
}
