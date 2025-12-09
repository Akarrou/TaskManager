import { Component, signal, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

export type ViewMode = 'table' | 'kanban' | 'calendar' | 'timeline';

export interface ViewOption {
  value: ViewMode;
  label: string;
  icon: string;
  tooltip: string;
}

@Component({
  selector: 'app-view-toggle',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  template: `
    <div class="view-toggle" role="group" aria-label="Mode d'affichage">
      @for (option of viewOptions; track option.value) {
        <button
          type="button"
          class="toggle-btn"
          [class.active]="currentView() === option.value"
          (click)="setView(option.value)"
          [attr.aria-label]="option.tooltip"
          [matTooltip]="option.tooltip"
          matTooltipPosition="above">
          <mat-icon class="icon">{{ option.icon }}</mat-icon>
          <span class="btn-text">{{ option.label }}</span>
        </button>
      }
    </div>
  `,
  styles: [`
    .view-toggle {
      display: inline-flex;
      background: #f1f5f9; /* Solid light gray background */
      border-radius: 0.75rem;
      padding: 0.25rem;
      gap: 0.25rem;
      border: 1px solid #e2e8f0; /* Subtle border */
    }

    .toggle-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 0.5rem;
      color: #64748b; /* Slate 500 */
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
    }

    .toggle-btn:hover {
      color: #0f172a; /* Slate 900 */
      background: rgba(0, 0, 0, 0.03);
    }

    .toggle-btn:focus {
      outline: none;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
    }

    .toggle-btn.active {
      background: white;
      color: #3b82f6; /* Primary blue */
      border-color: rgba(0,0,0,0.04);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
      font-weight: 600;
      transform: none; /* Removed transform to keep layout stable */
    }

    .icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .btn-text {
      white-space: nowrap;
    }

    /* Responsive - masquer le texte sur mobile */
    @media (max-width: 768px) {
      .btn-text {
        display: none;
      }

      .toggle-btn {
        padding: 0.5rem;
      }
    }
  `]
})
export class ViewToggleComponent {
  initialView = input<ViewMode>('table');
  currentView = signal<ViewMode>('table');
  viewChange = output<ViewMode>();

  viewOptions: ViewOption[] = [
    { value: 'table', label: 'Table', icon: 'table_rows', tooltip: 'Vue tableau' },
    { value: 'kanban', label: 'Kanban', icon: 'view_kanban', tooltip: 'Vue Kanban' },
    { value: 'calendar', label: 'Calendrier', icon: 'calendar_month', tooltip: 'Vue calendrier' },
    { value: 'timeline', label: 'Timeline', icon: 'timeline', tooltip: 'Vue timeline / Gantt' }
  ];

  ngOnInit() {
    this.currentView.set(this.initialView());
  }

  setView(view: ViewMode) {
    this.currentView.set(view);
    this.viewChange.emit(view);
  }
}
