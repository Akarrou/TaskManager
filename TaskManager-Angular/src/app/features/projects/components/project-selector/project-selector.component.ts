import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { ProjectStore } from '../../store/project.store';

@Component({
  selector: 'app-project-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './project-selector.component.html',
  styleUrls: ['./project-selector.component.scss']
})
export class ProjectSelectorComponent {
  protected readonly projectStore = inject(ProjectStore);

  projects = this.projectStore.allProjects;
  selectedProject = this.projectStore.selectedProject;
  isOpen = signal(false);

  constructor() {
    // Auto-select the first project if none is selected
    toObservable(this.projects).pipe(
      filter(projects => projects.length > 0),
      takeUntilDestroyed(),
    ).subscribe(projects => {
      if (!this.selectedProject()) {
        this.projectStore.selectProject(projects[0].id);
      }
    });
  }

  toggleDropdown(): void {
    this.isOpen.set(!this.isOpen());
  }

  closeDropdown(): void {
    this.isOpen.set(false);
  }

  selectProject(projectId: string): void {
    if (projectId) {
      this.projectStore.selectProject(projectId);
      this.closeDropdown();
    }
  }
}
