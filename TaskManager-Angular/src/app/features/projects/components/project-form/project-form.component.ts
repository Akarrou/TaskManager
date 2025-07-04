import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { AppState } from '../../../../app.state';
import * as ProjectActions from '../../store/project.actions';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Actions, ofType } from '@ngrx/effects';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-project-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatSnackBarModule],
  templateUrl: './project-form.component.html',
  styleUrls: ['./project-form.component.scss']
})
export class ProjectFormComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private store = inject(Store<AppState>);
  private snackBar = inject(MatSnackBar);
  private actions$ = inject(Actions);

  private destroy$ = new Subject<void>();

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    description: ['']
  });

  ngOnInit(): void {
    this.actions$.pipe(
      ofType(ProjectActions.createProjectSuccess),
      takeUntil(this.destroy$)
    ).subscribe(({ project }) => {
      this.snackBar.open(`Projet "${project.name}" créé avec succès!`, 'Fermer', {
        duration: 3000
      });
      this.form.reset();
      this.router.navigate(['/projects']);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSubmit() {
    if (this.form.valid) {
      const projectData = {
        name: this.form.value.name!,
        description: this.form.value.description || null
      };
      this.store.dispatch(ProjectActions.createProject({ projectData }));
    }
  }

  onCancel() {
    this.router.navigate(['/projects']);
  }
}
