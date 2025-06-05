import { Component, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ViewMode = 'grid' | 'list';

@Component({
  selector: 'app-view-toggle',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="view-toggle" role="group" aria-label="Mode d'affichage">
      <button 
        type="button"
        class="toggle-btn"
        [class.active]="currentView() === 'grid'"
        (click)="setView('grid')"
        aria-label="Vue en grille"
        title="Affichage en grille">
        <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3,11H11V3H3M3,21H11V13H3M13,21H21V13H13M13,3V11H21V3"/>
        </svg>
        <span class="btn-text">Grille</span>
      </button>
      
      <button 
        type="button"
        class="toggle-btn"
        [class.active]="currentView() === 'list'"
        (click)="setView('list')"
        aria-label="Vue en liste"
        title="Affichage en liste">
        <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3,5H21V7H3V5M3,11H21V13H3V11M3,17H21V19H3V17Z"/>
        </svg>
        <span class="btn-text">Liste</span>
      </button>
    </div>
  `,
  styles: [`
    .view-toggle {
      display: inline-flex;
      background: #f1f5f9;
      border-radius: 0.5rem;
      padding: 0.25rem;
      gap: 0.25rem;
    }

    .toggle-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: transparent;
      border: none;
      border-radius: 0.375rem;
      color: #64748b;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
    }

    .toggle-btn:hover {
      color: #3b82f6;
      background: rgba(59, 130, 246, 0.1);
    }

    .toggle-btn:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    .toggle-btn.active {
      background: white;
      color: #3b82f6;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .icon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    .btn-text {
      white-space: nowrap;
    }

    /* Responsive - masquer le texte sur mobile */
    @media (max-width: 640px) {
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
  currentView = signal<ViewMode>('grid');
  viewChange = output<ViewMode>();

  setView(view: ViewMode) {
    this.currentView.set(view);
    this.viewChange.emit(view);
  }
}
