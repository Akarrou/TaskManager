import { Component, inject, signal, effect, OnInit, computed, ChangeDetectorRef, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup, FormArray, FormControl, ValidatorFn, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TaskService, Task, TaskComment } from '../../../core/services/task';
import { AuthService } from '../../../core/services/auth';
import { UserService } from '../../../core/services/user.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DatePipe } from '@angular/common';
import { ISubtask } from '../subtask.model';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { EditSubtaskDialogComponent } from '../edit-subtask-dialog.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { SaveChangesDialogComponent } from '../../../shared/components/save-changes-dialog/save-changes-dialog.component';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatStepperModule } from '@angular/material/stepper';

@Component({
  selector: 'app-task-form',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatSnackBarModule,
    DatePipe,
    MatIconModule,
    MatSelectModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatStepperModule
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
  private dialog = inject(MatDialog);
  private cdr = inject(ChangeDetectorRef);

  isSubmitting = signal(false);
  pageTitle = signal('Nouvelle tâche');
  currentTaskId = signal<string | null>(null);
  mainInfoForm!: FormGroup;
  assignForm!: FormGroup;
  advancedForm!: FormGroup;
  subtaskForm!: FormGroup;
  stepperForm!: FormGroup;

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

  deletedSubtaskIds: string[] = [];
  speedDialOpen = signal(false);
  @ViewChild('fabGroup', { static: false }) fabGroupRef?: ElementRef;

  tasks = signal<Task[]>([]);

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

    // Groupes pour chaque étape
    this.mainInfoForm = this.fb.group({
      title: ['', Validators.required],
      description: [''],
      environment: this.fb.control([], [Validators.required, atLeastOneSelectedValidator]),
      status: ['pending', Validators.required],
      priority: ['medium', Validators.required]
    });
    this.assignForm = this.fb.group({
      assigned_to: [null],
      due_date: [null],
      tagsInput: ['']
    });
    this.advancedForm = this.fb.group({
      slug: ['', Validators.required],
      prd_slug: ['', Validators.required],
      estimated_hours: [null],
      actual_hours: [null],
      guideline_refsInput: [''],
      type: ['task', Validators.required],
      parent_task_id: [null]
    });
    this.subtaskForm = this.fb.group({
      subtasks: this.fb.array([])
    });
    // FormGroup parent pour le stepper
    this.stepperForm = this.fb.group({
      mainInfo: this.mainInfoForm,
      assign: this.assignForm,
      advanced: this.advancedForm,
      subtasks: this.subtaskForm
    });

    // Charger la liste des tâches pour le select parent_task_id
    this.loadAllTasks();

    // Ajout de la logique d'exclusivité
    const envGroup = this.mainInfoForm.get('environment') as FormGroup;
    if (envGroup) {
      envGroup.valueChanges.subscribe((value) => {
        // Si OPS est coché, décocher les deux autres
        if (value.ops) {
          if (value.frontend || value.backend) {
            envGroup.patchValue({ frontend: false, backend: false }, { emitEvent: false });
          }
        } else {
          // Si l'un des deux autres est coché alors que OPS l'est, décocher OPS
          if ((value.frontend || value.backend) && value.ops) {
            envGroup.patchValue({ ops: false }, { emitEvent: false });
          }
        }
        // Impossible d'avoir les trois cochés
        if (value.frontend && value.backend && value.ops) {
          envGroup.patchValue({ ops: false }, { emitEvent: false });
        }
      });
    }
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

  get subtasksFormArray(): FormArray {
    return this.stepperForm.get('subtasks.subtasks') as FormArray;
  }

  private patchFormWithTask(task: Task) {
    this.stepperForm.patchValue({
      mainInfo: {
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        environment: Array.isArray(task.environment) ? task.environment : []
      },
      assign: {
        assigned_to: task.assigned_to,
        due_date: task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : null,
        tagsInput: task.tags ? task.tags.join(', ') : ''
      },
      advanced: {
        slug: task.slug || '',
        prd_slug: task.prd_slug || '',
        estimated_hours: task.estimated_hours ?? null,
        actual_hours: task.actual_hours ?? null,
        guideline_refsInput: task.guideline_refs ? task.guideline_refs.join(', ') : '',
        type: task.type || 'task',
        parent_task_id: task.parent_task_id ?? null
      }
    });
    this.subtasksFormArray.clear();
    if (task.subtasks && task.subtasks.length > 0) {
      for (const subtask of task.subtasks) {
        this.subtasksFormArray.push(this.fb.group({
          id: [subtask.id ?? null],
          title: [subtask.title ?? '', Validators.required],
          description: [subtask.description ?? ''],
          status: [subtask.status ?? 'pending', Validators.required],
          environment: [subtask.environment ?? null, Validators.required]
        }));
      }
    }
  }

  private resetForm() {
    this.stepperForm.reset({
      mainInfo: {
        title: '',
        description: '',
        status: 'pending',
        priority: 'medium',
        environment: []
      },
      assign: {
        assigned_to: null,
        due_date: null,
        tagsInput: ''
      },
      advanced: {
        slug: '',
        prd_slug: '',
        estimated_hours: null,
        actual_hours: null,
        guideline_refsInput: '',
        type: 'task',
        parent_task_id: null
      }
    });
    this.subtasksFormArray.clear();
  }

  async onSubmit(): Promise<void> {
    if (this.stepperForm.invalid) {
      this.snackBar.open('Veuillez corriger les erreurs du formulaire.', 'Fermer', { duration: 3000 });
      Object.values(this.stepperForm.controls).forEach(control => {
        control.markAsTouched();
      });
      this.subtasksFormArray.controls.forEach(control => control.markAsTouched());
      return;
    }

    const formValue = this.stepperForm.value as any;

    let tagsArray: string[] = [];
    const rawTagsInput: string | null | undefined = formValue.assign.tagsInput;
    if (rawTagsInput && typeof rawTagsInput === 'string' && rawTagsInput.trim() !== '') {
      const tagsString: string = rawTagsInput;
      tagsArray = tagsString.split(',')
        .map((tag: string) => tag.trim())
        .filter((tag: string) => tag !== '');
    }

    // Conversion des cases cochées en tableau de string
    const environment: string[] = formValue.mainInfo.environment || [];
    const guidelineRefsArray = formValue.advanced.guideline_refsInput ? formValue.advanced.guideline_refsInput.split(',').map((t: string) => t.trim()).filter((t: string) => t) : [];
    const taskData: Partial<Task> = {
      title: formValue.mainInfo.title,
      description: formValue.mainInfo.description ?? undefined,
      status: formValue.mainInfo.status,
      priority: formValue.mainInfo.priority,
      assigned_to: formValue.assign.assigned_to ?? undefined,
      due_date: formValue.assign.due_date ?? undefined,
      tags: tagsArray,
      slug: formValue.advanced.slug as string,
      prd_slug: formValue.advanced.prd_slug as string,
      estimated_hours: formValue.advanced.estimated_hours ?? undefined,
      actual_hours: formValue.advanced.actual_hours ?? undefined,
      guideline_refs: guidelineRefsArray,
      type: formValue.advanced.type as 'task' | 'epic' | 'feature',
      parent_task_id: formValue.advanced.parent_task_id ?? null,
      environment
    };

    let success = false;
    const currentUserId = this.authService.getCurrentUserId();

    if (this.currentTaskId() && this.currentTaskId()) {
      success = await this.taskService.updateTask(this.currentTaskId()!, taskData);
      const subtasks = this.subtasksFormArray.value as Partial<ISubtask>[];
      for (const subtask of subtasks) {
        if (subtask.id) {
          await this.taskService.updateSubtask(subtask.id, subtask);
        } else {
          await this.taskService.createSubtask({ ...subtask, task_id: this.currentTaskId()! } as any);
        }
      }
      // Suppression des sous-tâches supprimées
      for (const id of this.deletedSubtaskIds) {
        await this.taskService.deleteSubtask(id);
      }
      this.deletedSubtaskIds = [];
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
        slug: taskData.slug as string,
        prd_slug: taskData.prd_slug as string,
        estimated_hours: taskData.estimated_hours ?? undefined,
        actual_hours: taskData.actual_hours ?? undefined,
        guideline_refs: taskData.guideline_refs ?? [],
        type: taskData.type as 'task' | 'epic' | 'feature',
        parent_task_id: taskData.parent_task_id ?? null,
        environment: taskData.environment ?? [],
        created_by: currentUserId
      };
      success = await this.taskService.createTask(taskToCreate);
      if (success) {
        const subtasks = this.subtasksFormArray.value as Partial<ISubtask>[];
        for (const subtask of subtasks) {
          await this.taskService.createSubtask({ ...subtask, task_id: success } as any);
        }
      }
    }

    if (success) {
      this.snackBar.open(`Tâche ${this.currentTaskId() ? 'mise à jour' : 'créée'} avec succès!`, 'Fermer', { duration: 2000 });
    } else {
      this.snackBar.open(`Échec de la ${this.currentTaskId() ? 'mise à jour' : 'création'} de la tâche.`, 'Fermer', { duration: 3000 });
    }
  }

  async loadTaskDetailsAndComments(taskId: string): Promise<void> {
    if (!taskId) return;
    
    // Charger les détails de la tâche
    const task = await this.taskService.fetchTaskById(taskId);
    if (task) {
      this.stepperForm.patchValue({
        mainInfo: {
          ...task,
          tags: task.tags || [] // S'assurer que c'est un tableau
        }
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

  removeSubtask(index: number) {
    const subtask = this.subtasksFormArray.at(index).value;
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Confirmer la suppression',
        message: 'Voulez-vous vraiment supprimer cette sous-tâche ? Cette action est irréversible.'
      }
    });
    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        if (subtask.id) {
          this.deletedSubtaskIds.push(subtask.id);
        }
        this.subtasksFormArray.removeAt(index);
        this.subtasksFormArray.markAsDirty();
        this.stepperForm.markAsDirty();
        this.cdr.detectChanges();
      }
    });
  }

  openEditSubtaskDialog(index: number) {
    const subtask = this.subtasksFormArray.at(index).value;
    const dialogRef = this.dialog.open(EditSubtaskDialogComponent, {
      width: '600px',
      data: { ...subtask },
      autoFocus: true,
      disableClose: false
    });
    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.subtasksFormArray.at(index).patchValue({
          title: result.title,
          description: result.description,
          status: result.status,
          environment: result.environment
        });
        this.subtasksFormArray.at(index).markAsDirty();
        this.cdr.detectChanges();
      }
    });
  }

  addSubtask() {
    const dialogRef = this.dialog.open(EditSubtaskDialogComponent, {
      width: '600px',
      data: { title: '', description: '', status: 'pending', environment: null },
      autoFocus: true,
      disableClose: false
    });
    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.subtasksFormArray.push(this.fb.group({
          title: [result.title, Validators.required],
          description: [result.description],
          status: [result.status, Validators.required],
          environment: [result.environment, Validators.required]
        }));
        this.subtasksFormArray.at(this.subtasksFormArray.length - 1).markAsDirty();
        this.stepperForm.markAsDirty();
      }
    });
  }

  // Gestion du clic en dehors du speed dial
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.speedDialOpen() && this.fabGroupRef && !this.fabGroupRef.nativeElement.contains(event.target)) {
      this.speedDialOpen.set(false);
    }
  }

  isFormOrSubtasksDirty(): boolean {
    if (this.stepperForm.dirty) {
      return true;
    }
    for (const control of this.subtasksFormArray.controls) {
      if (control.dirty) {
        return true;
      }
    }
    return false;
  }

  toggleSpeedDial() {
    if (!this.isFormOrSubtasksDirty()) {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.speedDialOpen.update(open => !open);
  }

  onSaveAndBack() {
    this.onSubmit().then(() => {
      this.router.navigate(['/dashboard']);
      this.speedDialOpen.set(false);
    });
  }

  onBackWithoutSave() {
    this.router.navigate(['/dashboard']);
    this.speedDialOpen.set(false);
  }

  get environmentGroup(): FormGroup {
    return this.mainInfoForm.get('environment') as FormGroup;
  }

  isSlugReadonly(): boolean {
    return this.isEditMode() && !!this.stepperForm?.get('advanced')?.get('slug')?.value;
  }
  isPrdSlugReadonly(): boolean {
    return this.isEditMode() && !!this.stepperForm?.get('advanced')?.get('prd_slug')?.value;
  }

  async loadAllTasks() {
    await this.taskService.loadTasks();
    this.tasks.set(this.taskService.tasks());
  }
}

// Validateur personnalisé : au moins une case cochée
function atLeastOneSelectedValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  return Array.isArray(value) && value.length > 0 ? null : { atLeastOne: true };
} 