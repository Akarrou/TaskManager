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
import { Store } from '@ngrx/store';
import { AppState } from '../../../app.state';
import { selectSelectedProjectId } from '../../projects/store/project.selectors';
import { firstValueFrom } from 'rxjs';
import { NavigationFabComponent, NavigationContext, NavigationAction } from '../../../shared/components/navigation-fab/navigation-fab.component';

// Nouveaux composants Notion-like
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';
import { FileUploadComponent, FileAttachment } from '../../../shared/components/file-upload/file-upload.component';
import { TaskRelationsComponent, TaskRelation } from '../../../shared/components/task-relations/task-relations.component';
import { CustomPropertiesComponent, CustomProperty } from '../../../shared/components/custom-properties/custom-properties.component';

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
    MatStepperModule,
    NavigationFabComponent,
    // Nouveaux composants Notion-like
    RichTextEditorComponent,
    FileUploadComponent,
    TaskRelationsComponent,
    CustomPropertiesComponent
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
  private store = inject(Store<AppState>);

  isSubmitting = signal(false);
  pageTitle = signal('Nouvelle tâche');
  currentTaskId = signal<string | null>(null);
  currentTask = signal<Task | null>(null);
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

  contextType: 'epic' | 'feature' | 'task' | null = null;
  contextParentId: string | null = null;
  isTypeLocked = false;

  // Signaux pour les fonctionnalités Notion-like
  taskAttachments = signal<FileAttachment[]>([]);
  taskRelations = signal<TaskRelation[]>([]);
  customProperties = signal<CustomProperty[]>([]);

  // FormControl pour les propriétés personnalisées
  customPropertiesControl = new FormControl<CustomProperty[]>([]);

  constructor() {
    this.loadUsers();
  }

  ngOnInit(): void {
    // Lire les query params pour la création contextuelle
    this.route.queryParams.subscribe(params => {
      console.log('queryParams', params); // debug
      const type = params['type'] as 'epic' | 'feature' | 'task' | undefined;
      const parentId = params['parent_task_id'] as string | undefined;
      if (type) {
        this.contextType = type;
        console.log('contextType', this.contextType);
        this.isTypeLocked = true;
      }
      if (parentId) {
        this.contextParentId = parentId;
      }
    });

    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      console.log('paramMap id', id); // debug
      if (id) {
        this.currentTaskId.set(id);
        this.pageTitle.set('Modifier la tâche');
        this.loadTaskForEditing(id);
      } else {
        this.currentTaskId.set(null);
        this.pageTitle.set('Nouvelle tâche');
        this.resetForm();
        // Pré-remplir type et parent si création contextuelle
        if (this.contextType) {
          this.mainInfoForm?.get('type')?.setValue(this.contextType);
        }
        if (this.contextParentId) {
          this.mainInfoForm?.get('parent_task_id')?.setValue(this.contextParentId);
        }
        this.generateSlug();
      }
    });

    // Groupes pour chaque étape
    this.mainInfoForm = this.fb.group({
      title: ['', Validators.required],
      description: [''],
      environment: this.fb.control([], [Validators.required, atLeastOneSelectedValidator]),
      status: ['pending', Validators.required],
      priority: ['medium', Validators.required],
      type: ['task', Validators.required]
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

    // Ajout des écouteurs dynamiques pour la génération du slug et PRD slug
    this.mainInfoForm?.get('title')?.valueChanges.subscribe(() => {
      this.generateSlug();
    });
    this.mainInfoForm?.get('type')?.valueChanges.subscribe(() => {
      this.generateSlug();
    });
    this.mainInfoForm?.get('parent_task_id')?.valueChanges.subscribe(() => {
      this.generateSlug();
    });
    // Synchroniser le PRD slug à chaque changement du slug
    this.advancedForm?.get('slug')?.valueChanges.subscribe((slug: string) => {
      this.advancedForm?.get('prd_slug')?.setValue(`prd-${slug}`);
    });

    // Après initialisation des formulaires et patch éventuel des valeurs :
    if (this.contextType) {
      this.mainInfoForm?.get('type')?.setValue(this.contextType);
      this.mainInfoForm?.get('type')?.disable({ onlySelf: true });
    } else {
      this.mainInfoForm?.get('type')?.enable({ onlySelf: true });
    }
  }

  async loadUsers(): Promise<void> {
    try {
      const userList = await this.userService.getUsers();
      this.users.set(userList);
    } catch (error) {
      console.error("Erreur lors du chargement de la liste des utilisateurs", error);
      this.snackBar.open("Impossible de charger la liste des utilisateurs.", 'Fermer', { duration: 3000, panelClass: 'red-snackbar' });
    }
  }

  async loadTaskForEditing(id: string): Promise<void> {
    this.isSubmitting.set(true);
    try {
      const task = await this.taskService.fetchTaskById(id);
      if (task) {
        this.currentTask.set(task);
        // Mettre à jour le titre avec le numéro de tâche
        const taskNumber = task.task_number ? `#${task.task_number}` : '';
        this.pageTitle.set(`Modifier la tâche ${taskNumber}`);

        this.patchFormWithTask(task);
        this.loadTaskDetailsAndComments(id);
        // Verrouillage du type pour epic ou feature avec enfants
        const allTasks = (!this.tasks() || this.tasks().length === 0) ? (await this.loadAllTasks(), this.tasks()) : this.tasks();
        const typeControl = this.mainInfoForm.get('type');
        if (task.type === 'epic') {
          const hasFeatureChild = allTasks.some(t => t.parent_task_id === task.id && t.type === 'feature');
          if (hasFeatureChild) {
            typeControl?.disable({ onlySelf: true });
          } else {
            typeControl?.enable({ onlySelf: true });
          }
        } else if (task.type === 'feature') {
          const hasTaskChild = allTasks.some(t => t.parent_task_id === task.id && t.type === 'task');
          if (hasTaskChild) {
            typeControl?.disable({ onlySelf: true });
          } else {
            typeControl?.enable({ onlySelf: true });
          }
        } else {
          typeControl?.enable({ onlySelf: true });
        }
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
        title: task.title || '',
        description: task.description || '',
        status: task.status || 'pending',
        priority: task.priority || 'medium',
        environment: Array.isArray(task.environment) ? task.environment : [],
        type: task.type || 'task'
      },
      assign: {
        assigned_to: task.assigned_to ?? null,
        due_date: task.due_date ?? null,
        tagsInput: task.tags ? task.tags.join(', ') : ''
      },
      advanced: {
        slug: task.slug || '',
        prd_slug: task.prd_slug || '',
        estimated_hours: task.estimated_hours ?? null,
        actual_hours: task.actual_hours ?? null,
        guideline_refsInput: task.guideline_refs ? task.guideline_refs.join(', ') : '',
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
    if (this.stepperForm) {
      this.stepperForm.reset({
        mainInfo: {
          title: '',
          description: '',
          status: 'pending',
          priority: 'medium',
          environment: [],
          type: 'task'
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
          parent_task_id: null
        }
      });
    }
    if (this.subtaskForm && this.subtaskForm.get('subtasks')) {
      (this.subtaskForm.get('subtasks') as FormArray).clear();
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.stepperForm.valid) {
      this.snackBar.open('Veuillez corriger les erreurs avant de soumettre.', 'Fermer', { duration: 3000 });
      return;
    }

    this.isSubmitting.set(true);

    const currentUserId = this.authService.getCurrentUserId();
    if (!currentUserId) {
      this.snackBar.open('Vous devez être connecté pour créer ou modifier une tâche.', 'Fermer', { duration: 3000, panelClass: 'red-snackbar' });
      this.isSubmitting.set(false);
      return;
    }

    const formValues = this.stepperForm.value;

    const taskData = {
      ...formValues.mainInfo,
      ...formValues.assign,
      ...formValues.advanced,
      tags: formValues.assign.tagsInput.split(',').map((t: string) => t.trim()).filter((t: string) => t),
      guideline_refs: formValues.advanced.guideline_refsInput.split(',').map((g: string) => g.trim()).filter((g: string) => g),
      subtasks: formValues.subtasks.subtasks.map((sub: ISubtask) => {
        // Exclure l'ID si c'est une nouvelle sous-tâche
        const { id, ...rest } = sub;
        return id && id.startsWith('temp_') ? rest : sub;
      })
    };

    try {
      if (this.isEditMode() && this.currentTaskId()) {
        const taskId = this.currentTaskId()!;
        // Logique de mise à jour...
        await this.taskService.updateTask(taskId, taskData);
        // Gestion des sous-tâches supprimées...
        for (const subId of this.deletedSubtaskIds) {
          await this.taskService.deleteSubtask(subId);
        }
        this.deletedSubtaskIds = [];

        this.snackBar.open('Tâche mise à jour avec succès!', 'Fermer', { duration: 3000, panelClass: 'green-snackbar' });
        this.router.navigate(['/dashboard']);
      } else {
        // Logique de création
        const projectId = await firstValueFrom(this.store.select(selectSelectedProjectId));
        if (!projectId) {
          throw new Error('Aucun projet sélectionné. Impossible de créer la tâche.');
        }

        const taskToCreate: Omit<Task, 'id' | 'created_at' | 'updated_at'> = {
          ...taskData,
          created_by: currentUserId,
          project_id: projectId
        };
        const newTaskId = await this.taskService.createTask(taskToCreate);
        this.snackBar.open('Tâche créée avec succès!', 'Fermer', { duration: 3000, panelClass: 'green-snackbar' });
        this.router.navigate(['/dashboard']);
      }
    } catch (error) {
      console.error("Erreur lors de la soumission de la tâche", error);
      this.snackBar.open(`Erreur: ${error instanceof Error ? error.message : 'Une erreur inconnue est survenue.'}`, 'Fermer', {
        duration: 5000,
        panelClass: 'red-snackbar'
      });
    } finally {
      this.isSubmitting.set(false);
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
      this.snackBar.open('Tâche non trouvée.', 'Fermer', { duration: 3000, panelClass: 'red-snackbar' });
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
      this.snackBar.open('Le commentaire ne peut pas être vide.', 'Fermer', { duration: 2000, panelClass: 'red-snackbar' });
      return;
    }
    if (!currentTaskId) {
      this.snackBar.open('ID de tâche manquant, impossible d\'ajouter un commentaire.', 'Fermer', { duration: 3000, panelClass: 'red-snackbar' });
      return;
    }
    if (!currentUserId) {
      this.snackBar.open('Utilisateur non connecté. Veuillez vous connecter pour commenter.', 'Fermer', { duration: 3000, panelClass: 'red-snackbar' });
      return;
    }

    const commentData: Omit<TaskComment, 'id' | 'created_at' | 'updated_at'> = {
      task_id: currentTaskId,
      user_id: currentUserId,
      comment: commentText
    };

    const newComment = await this.taskService.addCommentToTask(commentData);

    if (newComment) {
      this.snackBar.open('Commentaire ajouté avec succès!', 'Fermer', { duration: 2000, panelClass: 'green-snackbar' });
      this.taskComments.update(comments => [...comments, newComment]);
      this.newCommentText.set(''); // Réinitialiser le champ de commentaire
    } else {
      this.snackBar.open('Échec de l\'ajout du commentaire.', 'Fermer', { duration: 3000, panelClass: 'red-snackbar' });
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
    if (this.stepperForm.dirty && !this.stepperForm.invalid) {
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

  // Génération automatique du slug/PRD slug selon la convention
  generateSlug() {
    const type = this.mainInfoForm?.get('type')?.value;
    const title = this.mainInfoForm?.get('title')?.value;
    const parentId = this.mainInfoForm?.get('parent_task_id')?.value;
    if (!title) return;
    let slug = this.slugify(title);
    if (type === 'feature' && parentId) {
      slug = `${parentId}:${slug}`;
    } else if (type === 'task' && parentId) {
      slug = `${parentId}:${slug}`;
    }
    this.mainInfoForm?.get('slug')?.setValue(slug);
    this.advancedForm?.get('slug')?.setValue(slug);
    this.advancedForm?.get('prd_slug')?.setValue(`prd-${slug}`);
  }

  slugify(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // Adapter dynamiquement les champs selon le type
  isParentFieldVisible(): boolean {
    const type = this.mainInfoForm?.get('type')?.value;
    return type === 'feature' || type === 'task';
  }

  isTypeFieldLocked(): boolean {
    return this.isTypeLocked;
  }

  // === NAVIGATION FAB METHODS ===

  // Contexte de navigation pour le FAB
  navigationContext = computed((): NavigationContext => {
    return {
      isDirty: this.isFormOrSubtasksDirty(),
      hasUnsavedChanges: this.isFormOrSubtasksDirty(),
      canNavigateAway: true,
      currentPage: this.isEditMode() ? 'task-edit' : 'task-create',
      showSaveAction: this.isFormOrSubtasksDirty()
    };
  });

  // Actions personnalisées pour le FAB
  customNavActions = computed((): NavigationAction[] => {
    const actions: NavigationAction[] = [];

    // Action pour voir la liste des tâches
    actions.push({
      id: 'task-list',
      icon: 'list',
      label: 'Liste des tâches',
      tooltip: 'Voir toutes les tâches',
      action: () => this.router.navigate(['/tasks']),
      color: 'accent'
    });

    // Action pour créer une nouvelle tâche
    if (this.isEditMode()) {
      actions.push({
        id: 'new-task',
        icon: 'add',
        label: 'Nouvelle tâche',
        tooltip: 'Créer une nouvelle tâche',
        action: () => this.router.navigate(['/tasks/new']),
        color: 'primary'
      });
    }

    // Action pour voir le kanban si c'est une feature
    const taskType = this.mainInfoForm?.get('type')?.value;
    if (taskType === 'feature' && this.isEditMode()) {
      actions.push({
        id: 'feature-kanban',
        icon: 'view_kanban',
        label: 'Kanban Feature',
        tooltip: 'Voir le kanban de cette feature',
        action: () => {
          const taskId = this.currentTaskId();
          if (taskId) {
            this.router.navigate(['/features', taskId, 'tasks-kanban']);
          }
        },
        color: 'accent'
      });
    }

    return actions;
  });

  // Gestionnaire des actions du FAB
  onNavigationAction(actionId: string) {
    console.log('Navigation action clicked:', actionId);
    
    switch (actionId) {
      case 'dashboard':
        // Gestion spéciale pour le dashboard
        if (this.isFormOrSubtasksDirty()) {
          // Si des changements existent, ouvrir le FAB pour les options
          return;
        }
        this.router.navigate(['/dashboard']);
        break;
      
      case 'save':
        this.onSaveAndBack();
        break;
        
      case 'navigate-without-save':
        this.onBackWithoutSave();
        break;
        
      default:
        // Les autres actions sont gérées par leurs propres méthodes
        break;
    }
  }

  // Gestionnaire des demandes de navigation
  onNavigateRequested(route: string) {
    if (route === 'navigate-without-save') {
      // Montrer une confirmation si nécessaire
      if (this.isFormOrSubtasksDirty()) {
        const confirmLeave = confirm('Vous avez des modifications non sauvegardées. Voulez-vous vraiment quitter sans sauvegarder ?');
        if (confirmLeave) {
          this.router.navigate(['/dashboard']);
        }
      } else {
        this.router.navigate(['/dashboard']);
      }
    } else {
      // Navigation normale
      if (this.isFormOrSubtasksDirty()) {
        const confirmLeave = confirm('Vous avez des modifications non sauvegardées. Voulez-vous vraiment naviguer vers une autre page ?');
        if (confirmLeave) {
          this.router.navigate([route]);
        }
      } else {
        this.router.navigate([route]);
      }
    }
  }

  // Méthodes pour les fonctionnalités Notion-like
  onDescriptionChange(content: string) {
    this.mainInfoForm.patchValue({ description: content });
    this.mainInfoForm.markAsDirty();
  }

  onFilesUploaded(files: FileAttachment[]) {
    this.taskAttachments.set(files);
    this.stepperForm.markAsDirty();
  }

  onFileDeleted(fileId: string) {
    console.log('Fichier supprimé:', fileId);
  }

  onFileRemoved(file: FileAttachment) {
    this.taskAttachments.update(files => files.filter(f => f.file_url !== file.file_url));
    this.stepperForm.markAsDirty();
  }

  onRelationsChange(relations: TaskRelation[]) {
    this.taskRelations.set(relations);
    this.stepperForm.markAsDirty();
  }

  onCustomPropertiesChange(properties: CustomProperty[]) {
    this.customProperties.set(properties);
    this.stepperForm.markAsDirty();
  }
}

// Validateur personnalisé : au moins une case cochée
function atLeastOneSelectedValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  return Array.isArray(value) && value.length > 0 ? null : { atLeastOne: true };
}
