import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { AppState } from '../../../../app.state';
import * as ProjectActions from '../../store/project.actions';

@Component({
  selector: 'app-project-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './project-form.component.html',
  styleUrls: ['./project-form.component.scss']
})
export class ProjectFormComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private store = inject(Store<AppState>);

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    description: ['']
  });

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
