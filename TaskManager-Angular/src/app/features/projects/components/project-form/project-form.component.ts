import { Component, inject, OnInit, OnDestroy, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { AppState } from '../../../../app.state';
import * as ProjectActions from '../../store/project.actions';
import { selectProjectEntities } from '../../store/project.selectors';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Actions, ofType } from '@ngrx/effects';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { InlineInvitationsComponent } from '../inline-invitations/inline-invitations.component';

@Component({
  selector: 'app-project-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatSnackBarModule, InlineInvitationsComponent],
  templateUrl: './project-form.component.html',
  styleUrls: ['./project-form.component.scss']
})
export class ProjectFormComponent implements OnInit, OnDestroy {
  @ViewChild(InlineInvitationsComponent) invitationsComponent?: InlineInvitationsComponent;
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private store = inject(Store<AppState>);
  private snackBar = inject(MatSnackBar);
  private actions$ = inject(Actions);

  private destroy$ = new Subject<void>();

  isEditMode = signal(false);
  projectId = signal<string | null>(null);
  pageTitle = computed(() => this.isEditMode() ? 'Modifier le projet' : 'Créer un nouveau projet');

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    description: ['']
  });

  ngOnInit(): void {
    // Check for edit mode from route params
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.isEditMode.set(true);
        this.projectId.set(id);
        this.loadProjectForEditing(id);
      }
    });

    // Listen for create success
    this.actions$.pipe(
      ofType(ProjectActions.createProjectSuccess),
      takeUntil(this.destroy$)
    ).subscribe(({ project }) => {
      // Envoyer les invitations si présentes
      if (this.invitationsComponent && !this.isEditMode()) {
        this.invitationsComponent.sendAllInvitations(project.id);
      }

      this.snackBar.open(`Projet "${project.name}" créé avec succès!`, 'Fermer', {
        duration: 3000
      });
      this.form.reset();
      this.router.navigate(['/projects']);
    });

    // Listen for update success
    this.actions$.pipe(
      ofType(ProjectActions.updateProjectSuccess),
      takeUntil(this.destroy$)
    ).subscribe(({ project }) => {
      this.snackBar.open(`Projet "${project.name}" modifié avec succès!`, 'Fermer', {
        duration: 3000
      });
      this.router.navigate(['/projects']);
    });
  }

  loadProjectForEditing(projectId: string): void {
    this.store.select(selectProjectEntities).pipe(
      takeUntil(this.destroy$)
    ).subscribe(entities => {
      const project = entities[projectId];
      if (project) {
        this.form.patchValue({
          name: project.name,
          description: project.description || ''
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
        this.store.dispatch(ProjectActions.updateProject({
          projectId: this.projectId()!,
          projectData
        }));
      } else {
        this.store.dispatch(ProjectActions.createProject({ projectData }));
      }
    }
  }

  onCancel() {
    this.router.navigate(['/projects']);
  }
}
