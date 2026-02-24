import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Project } from '../../models/project.model';
import { ProjectStore } from '../../store/project.store';
import { RouterModule } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

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
export class ProjectListComponent {
    protected readonly projectStore = inject(ProjectStore);
    private dialog = inject(MatDialog);

    projects = this.projectStore.activeProjects;
    isLoading = this.projectStore.loading;
    showArchived = this.projectStore.showArchived;
    archivedCount = this.projectStore.archivedCount;

    stats = computed<IStat[]>(() => {
        const allProjects = this.projectStore.allProjects();
        const archivedCount = this.projectStore.archivedCount();
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

    toggleShowArchived(): void {
        this.projectStore.toggleShowArchived();
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
                this.projectStore.deleteProject({ projectId: project.id, projectName: project.name });
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
                this.projectStore.archiveProject({ projectId: project.id });
            }
        });
    }

    onRestoreProject(project: Project): void {
        this.projectStore.restoreProject({ projectId: project.id });
    }
}
