import { Component, inject, signal, input, output, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TaskService, Task } from '../../../core/services/task';

@Component({
  selector: 'app-task-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="task-form-container">
      <div class="form-header">
        <h3>{{ isEditing() ? '📝 Modifier la tâche' : '➕ Nouvelle tâche' }}</h3>
        <button 
          class="close-btn" 
          (click)="handleCancel()" 
          type="button"
          aria-label="Fermer le formulaire"
          title="Fermer">❌</button>
      </div>

      <form [formGroup]="taskForm" (ngSubmit)="onSubmit()" class="task-form">
        <!-- Titre -->
        <div class="form-group">
          <label for="title">Titre de la tâche *</label>
          <input 
            id="title"
            type="text" 
            formControlName="title"
            placeholder="ex: Plantation de tomates"
            [class.error]="taskForm.get('title')?.invalid && taskForm.get('title')?.touched">
          <div class="error-message" *ngIf="taskForm.get('title')?.invalid && taskForm.get('title')?.touched">
            Le titre est obligatoire
          </div>
        </div>

        <!-- Description -->
        <div class="form-group">
          <label for="description">Description</label>
          <textarea 
            id="description"
            formControlName="description"
            placeholder="Décrivez la tâche en détail..."
            rows="3"></textarea>
        </div>

        <!-- Statut et Priorité -->
        <div class="form-row">
          <div class="form-group">
            <label for="status">Statut *</label>
            <select id="status" formControlName="status">
              <option value="pending">⏳ En attente</option>
              <option value="in_progress">🔄 En cours</option>
              <option value="completed">✅ Terminée</option>
              <option value="cancelled">❌ Annulée</option>
            </select>
          </div>

          <div class="form-group">
            <label for="priority">Priorité *</label>
            <select id="priority" formControlName="priority">
              <option value="low">🟢 Faible</option>
              <option value="medium">🟡 Moyenne</option>
              <option value="high">🟠 Élevée</option>
              <option value="urgent">🔴 Urgente</option>
            </select>
          </div>
        </div>

        <!-- Assignation et Date -->
        <div class="form-row">
          <div class="form-group">
            <label for="assigned_to">Assigné à</label>
            <input 
              id="assigned_to"
              type="text" 
              formControlName="assigned_to"
              placeholder="ID de l'utilisateur">
          </div>

          <div class="form-group">
            <label for="due_date">Date d'échéance</label>
            <input 
              id="due_date"
              type="date" 
              formControlName="due_date">
          </div>
        </div>



        <!-- Tags -->
        <div class="form-group">
          <label for="tags">Tags (séparés par des virgules)</label>
          <input 
            id="tags"
            type="text" 
            formControlName="tagsInput"
            placeholder="ex: urgent, serre, irrigation">
        </div>

        <!-- Boutons d'action -->
        <div class="form-actions" role="group" aria-label="Actions du formulaire">
          <button 
            type="button" 
            class="btn-secondary" 
            (click)="handleCancel()"
            aria-label="Annuler et fermer le formulaire">
            Annuler
          </button>
          <button 
            type="submit" 
            class="btn-primary"
            [disabled]="taskForm.invalid || isSubmitting()"
            [attr.aria-label]="isEditing() ? 'Sauvegarder les modifications de la tâche' : 'Créer une nouvelle tâche'">
            <span *ngIf="!isSubmitting()">
              {{ isEditing() ? '💾 Sauvegarder' : '➕ Créer' }}
            </span>
            <span *ngIf="isSubmitting()" aria-live="polite">⏳ Traitement...</span>
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .task-form-container {
      background: white;
      border-radius: 1rem;
      box-shadow: 0 20px 25px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(226, 232, 240, 0.8);
      overflow: hidden;
      max-width: 600px;
      margin: 0 auto;
    }

    .form-header {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
      padding: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .form-header h3 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
    }

    .close-btn {
      background: none;
      border: none;
      color: white;
      font-size: 1.25rem;
      cursor: pointer;
      opacity: 0.8;
      transition: opacity 0.2s;
    }

    .close-btn:hover {
      opacity: 1;
    }

    .task-form {
      padding: 2rem;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 600;
      color: #374151;
    }

    input, textarea, select {
      width: 100%;
      padding: 0.75rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 1rem;
      transition: border-color 0.2s;
      box-sizing: border-box;
    }

    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    input.error {
      border-color: #ef4444;
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
    }

    .error-message {
      color: #ef4444;
      font-size: 0.875rem;
      margin-top: 0.25rem;
    }

    .form-actions {
      display: flex;
      gap: 1rem;
      justify-content: flex-end;
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid #e5e7eb;
    }

    .btn-primary, .btn-secondary {
      padding: 0.75rem 2rem;
      border: none;
      border-radius: 0.5rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      min-width: 120px;
    }

    .btn-primary {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }

    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #d1d5db;
    }

    .btn-secondary:hover {
      background: #e5e7eb;
    }

    @media (max-width: 768px) {
      .task-form-container {
        margin: 1rem;
        max-width: none;
      }

      .task-form {
        padding: 1.5rem;
      }

      .form-row {
        grid-template-columns: 1fr;
      }

      .form-actions {
        flex-direction: column;
      }
    }
  `]
})
export class TaskFormComponent {
  private fb = inject(FormBuilder);
  private taskService = inject(TaskService);

  // Inputs/Outputs
  task = input<Task | null>(null);
  onSave = output<Task>();
  onCancel = output<void>();

  // Signals
  isSubmitting = signal(false);
  isEditing = signal(false);

  // Reactive Form
  taskForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    status: ['pending' as Task['status'], Validators.required],
    priority: ['medium' as Task['priority'], Validators.required],
    assigned_to: [''],
    due_date: [''],
    tagsInput: ['']
  });

  constructor() {
    // Réactiver le formulaire quand la tâche change
    effect(() => {
      const task = this.task();
      if (task) {
        this.isEditing.set(true);
        this.patchFormWithTask(task);
      } else {
        this.isEditing.set(false);
        this.resetForm();
      }
    });
  }

  handleCancel() {
    this.onCancel.emit();
  }

  private patchFormWithTask(task: Task) {
    this.taskForm.patchValue({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      assigned_to: task.assigned_to || '',
      due_date: task.due_date || '',
      tagsInput: task.tags?.join(', ') || ''
    });
  }

  private resetForm() {
    this.taskForm.reset({
      status: 'pending',
      priority: 'medium'
    });
  }

  async onSubmit() {
    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);

    try {
      const formValue = this.taskForm.value;
      const taskData: Omit<Task, 'id' | 'created_at' | 'updated_at'> = {
        title: formValue.title!,
        description: formValue.description || undefined,
        status: formValue.status!,
        priority: formValue.priority!,
        assigned_to: formValue.assigned_to || undefined,
        due_date: formValue.due_date || undefined,
        tags: formValue.tagsInput ? 
          formValue.tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag) : 
          undefined
      };

      let success = false;
      if (this.isEditing() && this.task()) {
        success = await this.taskService.updateTask(this.task()!.id!, taskData);
      } else {
        success = await this.taskService.createTask(taskData);
      }

      if (success) {
        this.onSave.emit(taskData as Task);
      }
    } catch (error) {
      console.error('Erreur lors de la soumission:', error);
    } finally {
      this.isSubmitting.set(false);
    }
  }
} 