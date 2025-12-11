import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { AppState } from '../../../../app.state';
import { Observable, filter, take } from 'rxjs';
import { Project } from '../../models/project.model';
import { selectAllProjects, selectSelectedProject } from '../../store/project.selectors';
import * as ProjectActions from '../../store/project.actions';

@Component({
  selector: 'app-project-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './project-selector.component.html',
  styleUrls: ['./project-selector.component.scss']
})
export class ProjectSelectorComponent implements OnInit {
  private store = inject(Store<AppState>);

  projects$!: Observable<Project[]>;
  selectedProject$!: Observable<Project | null>;

  ngOnInit() {
    this.projects$ = this.store.select(selectAllProjects);
    this.selectedProject$ = this.store.select(selectSelectedProject);

    // Auto-select the first project if none is selected
    this.projects$.pipe(
      filter(projects => projects.length > 0),
      take(1)
    ).subscribe(projects => {
      this.selectedProject$.pipe(take(1)).subscribe(selected => {
        if (!selected) {
          this.store.dispatch(ProjectActions.selectProject({ projectId: projects[0].id }));
        }
      });
    });
  }

  onProjectChange(selectedId: string) {
    if (selectedId) {
      localStorage.setItem('selectedProjectId', selectedId);
      this.store.dispatch(ProjectActions.selectProject({ projectId: selectedId }));
    }
  }
}
