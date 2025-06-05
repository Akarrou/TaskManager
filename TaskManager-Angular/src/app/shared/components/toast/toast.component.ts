import { Component, signal, effect, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
}

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container" role="region" aria-label="Notifications">
      <div 
        *ngFor="let toast of visibleToasts(); trackBy: trackByToastId"
        class="toast"
        [class]="'toast-' + toast.type"
        role="alert"
        [attr.aria-live]="toast.type === 'error' ? 'assertive' : 'polite'">
        
        <div class="toast-icon">
          <svg *ngIf="toast.type === 'success'" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/>
          </svg>
          <svg *ngIf="toast.type === 'error'" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/>
          </svg>
          <svg *ngIf="toast.type === 'warning'" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13,13H11V7H13M11,15H13V17H11M15.73,3H8.27L3,8.27V15.73L8.27,21H15.73L21,15.73V8.27L15.73,3Z"/>
          </svg>
          <svg *ngIf="toast.type === 'info'" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/>
          </svg>
        </div>

        <div class="toast-content">
          <h4 class="toast-title">{{ toast.title }}</h4>
          <p class="toast-message">{{ toast.message }}</p>
        </div>

        <button 
          class="toast-close"
          (click)="dismissToast(toast.id)"
          aria-label="Fermer la notification"
          title="Fermer">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
          </svg>
        </button>

        <div class="toast-progress" *ngIf="toast.duration">
          <div class="toast-progress-bar" 
               [style.animation-duration.ms]="toast.duration"></div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 90px; /* Sous le header */
      right: 1rem;
      z-index: 1050;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      max-width: 400px;
      width: 100%;
    }

    .toast {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 1rem;
      background: white;
      border-radius: 0.75rem;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
      border-left: 4px solid;
      position: relative;
      overflow: hidden;
      animation: slideIn 0.3s ease-out;
    }

    .toast-success {
      border-left-color: #10b981;
    }

    .toast-error {
      border-left-color: #ef4444;
    }

    .toast-warning {
      border-left-color: #f59e0b;
    }

    .toast-info {
      border-left-color: #3b82f6;
    }

    .toast-icon {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      margin-top: 0.125rem;
    }

    .toast-success .toast-icon {
      color: #10b981;
    }

    .toast-error .toast-icon {
      color: #ef4444;
    }

    .toast-warning .toast-icon {
      color: #f59e0b;
    }

    .toast-info .toast-icon {
      color: #3b82f6;
    }

    .toast-content {
      flex: 1;
      min-width: 0;
    }

    .toast-title {
      margin: 0 0 0.25rem 0;
      font-size: 0.875rem;
      font-weight: 600;
      color: #1f2937;
    }

    .toast-message {
      margin: 0;
      font-size: 0.875rem;
      color: #6b7280;
      line-height: 1.4;
    }

    .toast-close {
      flex-shrink: 0;
      background: none;
      border: none;
      color: #9ca3af;
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 0.25rem;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s;
    }

    .toast-close:hover {
      color: #6b7280;
      background: #f3f4f6;
    }

    .toast-close:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    .toast-progress {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: rgba(0, 0, 0, 0.1);
    }

    .toast-progress-bar {
      height: 100%;
      background: currentColor;
      animation: progressDecrease linear;
      transform-origin: left;
    }

    .toast-success .toast-progress-bar {
      background: #10b981;
    }

    .toast-error .toast-progress-bar {
      background: #ef4444;
    }

    .toast-warning .toast-progress-bar {
      background: #f59e0b;
    }

    .toast-info .toast-progress-bar {
      background: #3b82f6;
    }

    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }

    @keyframes progressDecrease {
      from {
        transform: scaleX(1);
      }
      to {
        transform: scaleX(0);
      }
    }

    .toast.leaving {
      animation: slideOut 0.3s ease-in forwards;
    }

    /* Responsive */
    @media (max-width: 640px) {
      .toast-container {
        right: 0.5rem;
        left: 0.5rem;
        max-width: none;
      }
    }
  `]
})
export class ToastComponent {
  visibleToasts = signal<ToastMessage[]>([]);
  private timeouts = new Map<string, number>();

  addToast(toast: Omit<ToastMessage, 'id'>) {
    const id = Date.now().toString();
    const newToast: ToastMessage = {
      ...toast,
      id,
      duration: toast.duration ?? 5000
    };

    this.visibleToasts.update(toasts => [...toasts, newToast]);

    // Auto-dismiss après la durée spécifiée
    if (newToast.duration && newToast.duration > 0) {
      const timeoutId = window.setTimeout(() => {
        this.dismissToast(id);
      }, newToast.duration);
      
      this.timeouts.set(id, timeoutId);
    }
  }

  dismissToast(id: string) {
    // Annuler le timeout si il existe
    const timeoutId = this.timeouts.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timeouts.delete(id);
    }

    // Retirer le toast de la liste
    this.visibleToasts.update(toasts => 
      toasts.filter(toast => toast.id !== id)
    );
  }

  clearAll() {
    // Annuler tous les timeouts
    this.timeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.timeouts.clear();
    
    // Vider la liste
    this.visibleToasts.set([]);
  }

  trackByToastId(index: number, toast: ToastMessage): string {
    return toast.id;
  }
}

// Service pour gérer les toasts globalement
export class ToastService {
  private toastComponent: ToastComponent | null = null;

  setComponent(component: ToastComponent) {
    this.toastComponent = component;
  }

  success(title: string, message: string, duration?: number) {
    this.toastComponent?.addToast({
      type: 'success',
      title,
      message,
      duration
    });
  }

  error(title: string, message: string, duration?: number) {
    this.toastComponent?.addToast({
      type: 'error',
      title,
      message,
      duration: duration ?? 0 // Les erreurs restent jusqu'à fermeture manuelle
    });
  }

  warning(title: string, message: string, duration?: number) {
    this.toastComponent?.addToast({
      type: 'warning',
      title,
      message,
      duration
    });
  }

  info(title: string, message: string, duration?: number) {
    this.toastComponent?.addToast({
      type: 'info',
      title,
      message,
      duration
    });
  }

  clear() {
    this.toastComponent?.clearAll();
  }
} 