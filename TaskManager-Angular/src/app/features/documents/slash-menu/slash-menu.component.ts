import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SlashCommand {
  id: string;
  label: string;
  icon: string;
  action: () => void;
}

@Component({
  selector: 'app-slash-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './slash-menu.component.html',
  styleUrl: './slash-menu.component.scss'
})
export class SlashMenuComponent {
  @Input() items: SlashCommand[] = [];
  @Input() selectedIndex = 0;
  @Output() commandSelected = new EventEmitter<SlashCommand>();

  selectItem(index: number) {
    if (index >= 0 && index < this.items.length) {
      this.commandSelected.emit(this.items[index]);
    }
  }
}
