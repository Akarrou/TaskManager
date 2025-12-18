import { Component, OnInit, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { Project } from '../../models/project.model';
import { AppState } from '../../../../app.state';
import {
  selectActiveProjects,
  selectProjectsLoading,
  selectShowArchived,
  selectArchivedCount,
  selectAllProjects
} from '../../store/project.selectors';
import * as ProjectActions from '../../store/project.actions';
import { RouterModule } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { toSignal } from '@angular/core/rxjs-interop';

interface IStat {
  title: string;
  value: number;
  icon: string;
  iconClass: string;
}

@Component({
    selector: 'app-project-list',
    standalone: true,
    imports: [
      CommonModule,
      RouterModule,
      MatMenuModule,
      MatButtonModule,
      MatIconModule,
      MatDialogModule
    ],
    templateUrl: './project-list.component.html',
    styleUrls: ['./project-list.component.scss']
})
export class ProjectListComponent implements OnInit {
    private store = inject(Store<AppState>);
    private dialog = inject(MatDialog);

    projects$!: Observable<Project[]>;
    isLoading$!: Observable<boolean>;
    showArchived$!: Observable<boolean>;
    archivedCount$!: Observable<number>;
    allProjects$!: Observable<Project[]>;

    // Convert observables to signals for computed stats
    private allProjectsSignal = toSignal(this.store.select(selectAllProjects), { initialValue: [] });
    private archivedCountSignal = toSignal(this.store.select(selectArchivedCount), { initialValue: 0 });

    // Computed stats
    stats = computed<IStat[]>(() => {
        const allProjects = this.allProjectsSignal();
        const archivedCount = this.archivedCountSignal();
        const activeCount = allProjects.length - archivedCount;

        return [
            {
                title: 'Total Projets',
                value: allProjects.length,
                icon: 'folder',
                iconClass: 'c-stat-card__icon-wrapper--total'
            },
            {
                title: 'Projets Actifs',
                value: activeCount,
                icon: 'folder_open',
                iconClass: 'c-stat-card__icon-wrapper--in-progress'
            },
            {
                title: 'Projets Archivés',
                value: archivedCount,
                icon: 'archive',
                iconClass: 'c-stat-card__icon-wrapper--completed'
            }
        ];
    });

    ngOnInit() {
        this.projects$ = this.store.select(selectActiveProjects);
        this.isLoading$ = this.store.select(selectProjectsLoading);
        this.showArchived$ = this.store.select(selectShowArchived);
        this.archivedCount$ = this.store.select(selectArchivedCount);
        this.allProjects$ = this.store.select(selectAllProjects);
    }

    toggleShowArchived(): void {
        this.store.dispatch(ProjectActions.toggleShowArchived());
    }

    onDeleteProject(project: Project): void {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            width: '400px',
            data: {
                title: 'Supprimer le projet',
                message: `Êtes-vous sûr de vouloir supprimer le projet "${project.name}" ? Cette action supprimera également toutes les tâches et documents associés. Cette action est irréversible.`
            }
        });

        dialogRef.afterClosed().subscribe((confirmed: boolean) => {
            if (confirmed) {
                this.store.dispatch(ProjectActions.deleteProject({ projectId: project.id }));
            }
        });
    }

    onArchiveProject(project: Project): void {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            width: '400px',
            data: {
                title: 'Archiver le projet',
                message: `Voulez-vous archiver le projet "${project.name}" ? Vous pourrez le restaurer plus tard.`
            }
        });

        dialogRef.afterClosed().subscribe((confirmed: boolean) => {
            if (confirmed) {
                this.store.dispatch(ProjectActions.archiveProject({ projectId: project.id }));
            }
        });
    }

    onRestoreProject(project: Project): void {
        this.store.dispatch(ProjectActions.restoreProject({ projectId: project.id }));
    }
}
