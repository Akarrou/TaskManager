import { Component, EventEmitter, Input, Output, signal, computed, OnChanges, SimpleChanges, HostListener, ElementRef } from '@angular/core';
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
export class SlashMenuComponent implements OnChanges {
  @Input() items: SlashCommand[] = [];
  @Input() selectedIndex = 0;
  @Input() filterText = '';
  @Output() commandSelected = new EventEmitter<SlashCommand>();
  @Output() closeMenu = new EventEmitter<void>();

  filterTextSignal = signal<string>('');

  constructor(private elementRef: ElementRef) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['filterText']) {
      this.filterTextSignal.set(this.filterText);
    }
  }

  // Filtered items based on filter text
  private filteredItems = computed<SlashCommand[]>(() => {
    const allItems = this.items;
    const filter = this.filterTextSignal().toLowerCase().trim();

    if (!filter) {
      return allItems;
    }

    return allItems.filter(item =>
      item.label.toLowerCase().includes(filter)
    );
  });

  // Organize commands into sections
  sections = computed<SlashCommandSection[]>(() => {
    const items = this.filteredItems();

    return [
      {
        title: 'Texte',
        commands: items.filter(item =>
          ['text', 'h1', 'h2', 'h3'].includes(item.id)
        )
      },
      {
        title: 'Listes',
        commands: items.filter(item =>
          ['bulletList', 'orderedList', 'taskList'].includes(item.id)
        )
      },
      {
        title: 'Format',
        commands: items.filter(item =>
          ['code', 'quote'].includes(item.id)
        )
      },
      {
        title: 'Contenu avancé',
        commands: items.filter(item =>
          ['image', 'table', 'codeBlock', 'database', 'taskDatabase'].includes(item.id)
        )
      },
      {
        title: 'Structure',
        commands: items.filter(item =>
          ['columns2', 'columns3', 'divider', 'newDocument'].includes(item.id)
        )
      },
      {
        title: 'Utilitaires',
        commands: items.filter(item =>
          ['break', 'clear'].includes(item.id)
        )
      }
    ].filter(section => section.commands.length > 0);
  });

  selectItem(index: number) {
    const items = this.filteredItems();
    if (index >= 0 && index < items.length) {
      this.commandSelected.emit(items[index]);
    }
  }

  // Get global index for a command within a section
  getGlobalIndex(command: SlashCommand): number {
    return this.filteredItems().findIndex(item => item.id === command.id);
  }

  // Close menu when clicking outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const clickedInside = this.elementRef.nativeElement.contains(event.target);
    if (!clickedInside) {
      this.closeMenu.emit();
    }
  }
}
