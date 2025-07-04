import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { Project } from '../../models/project.model';
import { AppState } from '../../../../app.state';
import { selectAllProjects, selectProjectsLoading } from '../../store/project.selectors';
import { RouterModule } from '@angular/router';

@Component({
    selector: 'app-project-list',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './project-list.component.html',
    styleUrls: ['./project-list.component.scss']
})
export class ProjectListComponent implements OnInit {
    private store = inject(Store<AppState>);

    projects$!: Observable<Project[]>;
    isLoading$!: Observable<boolean>;

    ngOnInit() {
        this.projects$ = this.store.select(selectAllProjects);
        this.isLoading$ = this.store.select(selectProjectsLoading);
    }
}
