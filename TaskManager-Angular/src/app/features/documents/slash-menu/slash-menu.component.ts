import { Component, EventEmitter, Input, Output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SlashCommand {
  id: string;
  label: string;
  icon: string;
  action: () => void;
}

export interface SlashCommandSection {
  title: string;
  commands: SlashCommand[];
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

  // Organize commands into sections
  sections = computed<SlashCommandSection[]>(() => {
    const allItems = this.items;

    return [
      {
        title: 'Texte',
        commands: allItems.filter(item =>
          ['text', 'h1', 'h2', 'h3'].includes(item.id)
        )
      },
      {
        title: 'Listes',
        commands: allItems.filter(item =>
          ['bulletList', 'orderedList', 'taskList'].includes(item.id)
        )
      },
      {
        title: 'Format',
        commands: allItems.filter(item =>
          ['bold', 'italic', 'strike', 'code', 'quote'].includes(item.id)
        )
      },
      {
        title: 'Médias',
        commands: allItems.filter(item =>
          ['image', 'table', 'codeBlock'].includes(item.id)
        )
      },
      {
        title: 'Structure',
        commands: allItems.filter(item =>
          ['columns2', 'columns3', 'divider', 'newDocument'].includes(item.id)
        )
      },
      {
        title: 'Tâches',
        commands: allItems.filter(item =>
          ['linkTask', 'createTask'].includes(item.id)
        )
      },
      {
        title: 'Utilitaires',
        commands: allItems.filter(item =>
          ['break', 'clear'].includes(item.id)
        )
      }
    ].filter(section => section.commands.length > 0);
  });

  selectItem(index: number) {
    if (index >= 0 && index < this.items.length) {
      this.commandSelected.emit(this.items[index]);
    }
  }

  // Get global index for a command within a section
  getGlobalIndex(command: SlashCommand): number {
    return this.items.findIndex(item => item.id === command.id);
  }
}
