import { Component, inject, signal, effect, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TaskService, Task, TaskComment } from '../../../core/services/task';
import { AuthService } from '../../../core/services/auth';
import { UserService } from '../../../core/services/user.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-task-form',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatSnackBarModule,
    DatePipe
  ],
  templateUrl: './task-form.component.html',
  styleUrls: ['./task-form.component.scss']
})
export class TaskFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private taskService = inject(TaskService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private userService = inject(UserService);
  private snackBar = inject(MatSnackBar);

  isSubmitting = signal(false);
  pageTitle = signal('Nouvelle tâche');
  currentTaskId = signal<string | null>(null);
  taskForm!: FormGroup;

  isEditMode = computed(() => !!this.currentTaskId());

  // Signal pour la liste des utilisateurs
  users = signal<any[]>([]);

  // Signaux pour les commentaires
  taskComments = signal<TaskComment[]>([]);
  newCommentText = signal<string>('');

  // Signal pour gérer l'état du bouton de soumission de commentaire
  canSubmitComment = computed(() => {
    return this.newCommentText().trim() !== '' && !!this.authService.getCurrentUserId();
  });

  constructor() {
    this.loadUsers();
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.currentTaskId.set(id);
        this.pageTitle.set('Modifier la tâche');
        this.loadTaskForEditing(id);
      } else {
        this.currentTaskId.set(null);
        this.pageTitle.set('Nouvelle tâche');
        this.resetForm();
      }
    });

    this.taskForm = this.fb.group({
      id: [null as string | null],
      task_number: [{ value: null as number | null, disabled: true }],
      title: ['', Validators.required],
      description: [''],
      status: ['pending' as Task['status'], Validators.required],
      priority: ['medium' as Task['priority'], Validators.required],
      assigned_to: [null as string | null],
      due_date: [null as string | null],
      tagsInput: ['' as string | null]
    });
  }

  async loadUsers(): Promise<void> {
    try {
      const userList = await this.userService.getUsers();
      this.users.set(userList);
    } catch (error) {
      console.error("Erreur lors du chargement de la liste des utilisateurs", error);
      this.snackBar.open("Impossible de charger la liste des utilisateurs.", 'Fermer', { duration: 3000 });
    }
  }

  async loadTaskForEditing(id: string): Promise<void> {
    this.isSubmitting.set(true);
    try {
      const task = await this.taskService.fetchTaskById(id);
      if (task) {
        this.patchFormWithTask(task);
        this.loadTaskDetailsAndComments(id);
      } else {
        console.error('Tâche non trouvée pour modification:', id);
        this.router.navigate(['/dashboard']);
      }
    } catch (error) {
      console.error('Erreur lors du chargement de la tâche:', error);
      this.router.navigate(['/dashboard']);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  handleCancel() {
    this.router.navigate(['/dashboard']);
  }

  private patchFormWithTask(task: Task) {
    this.taskForm.patchValue({
      id: task.id,
      task_number: task.task_number,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assigned_to: task.assigned_to,
      due_date: task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : null,
      tagsInput: task.tags ? task.tags.join(', ') : ''
    });
  }

  private resetForm() {
    this.taskForm.reset({
      id: null,
      task_number: null,
      title: '',
      description: '',
      status: 'pending',
      priority: 'medium',
      assigned_to: null,
      due_date: null,
      tagsInput: ''
    });
  }

  async onSubmit(): Promise<void> {
    if (this.taskForm.invalid) {
      this.snackBar.open('Veuillez corriger les erreurs du formulaire.', 'Fermer', { duration: 3000 });
      Object.values(this.taskForm.controls).forEach(control => {
        control.markAsTouched();
      });
      return;
    }

    const formValue = this.taskForm.value as {
      title: string;
      description?: string;
      status: Task['status'];
      priority: Task['priority'];
      assigned_to?: string | null;
      due_date?: string | null;
      tagsInput?: string | null; // Doit correspondre à la définition du formulaire
    };

    let tagsArray: string[] = [];
    const rawTagsInput: string | null | undefined = formValue.tagsInput;

    if (rawTagsInput && typeof rawTagsInput === 'string' && rawTagsInput.trim() !== '') {
      // Assigner à une variable explicitement typée après la vérification
      const tagsString: string = rawTagsInput;
      tagsArray = tagsString.split(',')
        .map((tag: string) => tag.trim())
        .filter((tag: string) => tag !== '');
    }

    const taskData: Partial<Task> = {
      title: formValue.title,
      description: formValue.description ?? undefined,
      status: formValue.status,
      priority: formValue.priority,
      assigned_to: formValue.assigned_to ?? undefined,
      due_date: formValue.due_date ?? undefined,
      tags: tagsArray
    };

    let success = false;
    const currentUserId = this.authService.getCurrentUserId();

    if (this.currentTaskId() && this.currentTaskId()) {
      success = await this.taskService.updateTask(this.currentTaskId()!, taskData);
    } else {
      if (!currentUserId) {
        this.snackBar.open('Utilisateur non connecté. Impossible de créer la tâche.', 'Fermer', { duration: 3000 });
        return;
      }
      const taskToCreate: Omit<Task, 'id' | 'created_at' | 'updated_at'> = {
        title: taskData.title!,
        description: taskData.description,
        status: taskData.status!,
        priority: taskData.priority!,
        assigned_to: taskData.assigned_to,
        due_date: taskData.due_date,
        tags: taskData.tags,
        created_by: currentUserId
      };
      success = await this.taskService.createTask(taskToCreate);
    }

    if (success) {
      this.snackBar.open(`Tâche ${this.currentTaskId() ? 'mise à jour' : 'créée'} avec succès!`, 'Fermer', { duration: 2000 });
      this.router.navigate(['/dashboard']);
    } else {
      this.snackBar.open(`Échec de la ${this.currentTaskId() ? 'mise à jour' : 'création'} de la tâche.`, 'Fermer', { duration: 3000 });
    }
  }

  async loadTaskDetailsAndComments(taskId: string): Promise<void> {
    if (!taskId) return;
    
    // Charger les détails de la tâche
    const task = await this.taskService.fetchTaskById(taskId);
    if (task) {
      this.taskForm.patchValue({
        ...task,
        tags: task.tags || [] // S'assurer que c'est un tableau
      });
    } else {
      this.snackBar.open('Tâche non trouvée.', 'Fermer', { duration: 3000 });
      this.router.navigate(['/dashboard']); // Rediriger si la tâche n'est pas trouvée
      return; // Sortir tôt si la tâche n'est pas trouvée
    }

    // Charger les commentaires
    const comments = await this.taskService.getCommentsForTask(taskId);
    if (comments) {
      this.taskComments.set(comments);
    } else {
      // Gérer l'erreur de chargement des commentaires si nécessaire (par ex. snackbar)
      console.error("Erreur lors du chargement des commentaires pour la tâche: ", taskId);
      this.taskComments.set([]); // S'assurer que c'est un tableau vide en cas d'erreur
    }
  }

  // Méthode pour soumettre un commentaire
  async submitComment(): Promise<void> {
    const commentText = this.newCommentText().trim();
    const currentTaskId = this.currentTaskId();
    const currentUserId = this.authService.getCurrentUserId();

    if (!commentText) {
      this.snackBar.open('Le commentaire ne peut pas être vide.', 'Fermer', { duration: 2000 });
      return;
    }
    if (!currentTaskId) {
      this.snackBar.open('ID de tâche manquant, impossible d\'ajouter un commentaire.', 'Fermer', { duration: 3000 });
      return;
    }
    if (!currentUserId) {
      this.snackBar.open('Utilisateur non connecté. Veuillez vous connecter pour commenter.', 'Fermer', { duration: 3000 });
      return;
    }

    const commentData: Omit<TaskComment, 'id' | 'created_at' | 'updated_at'> = {
      task_id: currentTaskId,
      user_id: currentUserId,
      comment: commentText
    };

    const newComment = await this.taskService.addCommentToTask(commentData);

    if (newComment) {
      this.snackBar.open('Commentaire ajouté avec succès!', 'Fermer', { duration: 2000 });
      this.taskComments.update(comments => [...comments, newComment]);
      this.newCommentText.set(''); // Réinitialiser le champ de commentaire
    } else {
      this.snackBar.open('Échec de l\'ajout du commentaire.', 'Fermer', { duration: 3000 });
    }
  }

  // Pour *ngFor trackBy
  commentTrackByFn(index: number, item: TaskComment) {
    return item.id || index; // Utiliser l'id s'il existe, sinon l'index
  }
} 