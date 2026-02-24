import { Component, inject, OnInit, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { ProjectStore } from '../../store/project.store';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { InlineInvitationsComponent } from '../inline-invitations/inline-invitations.component';

@Component({
  selector: 'app-project-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatSnackBarModule, InlineInvitationsComponent],
  templateUrl: './project-form.component.html',
  styleUrls: ['./project-form.component.scss']
})
export class ProjectFormComponent implements OnInit {
  @ViewChild(InlineInvitationsComponent) invitationsComponent?: InlineInvitationsComponent;
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private projectStore = inject(ProjectStore);
  private snackBar = inject(MatSnackBar);

  isEditMode = signal(false);
  projectId = signal<string | null>(null);
  pageTitle = computed(() => this.isEditMode() ? 'Modifier le projet' : 'Créer un nouveau projet');

  // Track known entity IDs to detect newly created projects
  private previousEntityIds = new Set<string>();
  private waitingForCreate = signal(false);

  // Derived signal for the project being edited
  private editingProject = computed(() => {
    const id = this.projectId();
    if (!id) return null;
    return this.projectStore.entityMap()[id] ?? null;
  });

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    description: ['']
  });

  constructor() {
    // Reactively load project data when editing
    toObservable(this.editingProject).pipe(
      filter(Boolean),
      takeUntilDestroyed(),
    ).subscribe(project => {
      this.form.patchValue({
        name: project.name,
        description: project.description || ''
      });
    });

    // Detect newly created project and send invitations
    toObservable(this.projectStore.entityMap).pipe(
      filter(() => this.waitingForCreate()),
      map(entityMap => {
        const currentIds = new Set(Object.keys(entityMap));
        return [...currentIds].filter(id => !this.previousEntityIds.has(id));
      }),
      filter(newIds => newIds.length > 0),
      takeUntilDestroyed(),
    ).subscribe(newIds => {
      const newProjectId = newIds[0];
      const newProject = this.projectStore.entityMap()[newProjectId];

      if (this.invitationsComponent && !this.isEditMode()) {
        this.invitationsComponent.sendAllInvitations(newProjectId);
      }

      this.snackBar.open(`Projet "${newProject.name}" créé avec succès!`, 'Fermer', {
        duration: 3000
      });
      this.form.reset();
      this.waitingForCreate.set(false);
      this.router.navigate(['/projects']);
    });
  }

  ngOnInit(): void {
    // Check for edit mode from route params
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.isEditMode.set(true);
        this.projectId.set(id);
      }
    });
  }

  onSubmit() {
    if (this.form.valid) {
      const rawName = this.form.value.name!.trim();
      const capitalizedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

      const projectData = {
        name: capitalizedName,
        description: this.form.value.description || null
      };

      if (this.isEditMode() && this.projectId()) {
        this.projectStore.updateProject({
          projectId: this.projectId()!,
          projectData
        });
      } else {
        // Capture current entity IDs before creating
        this.previousEntityIds = new Set(Object.keys(this.projectStore.entityMap()));
        this.waitingForCreate.set(true);
        this.projectStore.createProject({ projectData, skipNavigation: true });
      }
    }
  }

  onCancel() {
    this.router.navigate(['/projects']);
  }
}
