import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import { Project } from '../models/project.model';
import { from, map, throwError } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class ProjectService {
    private supabase = inject(SupabaseService);

    getProjects() {
        return from(
            this.supabase.client.from('projects').select('*').returns<Project[]>()
        ).pipe(
            map(response => {
                if (response.error) {
                    throw response.error;
                }
                return response.data;
            })
        );
    }

    createProject(projectData: Partial<Project>) {
        return from(
            this.supabase.client.from('projects').insert(projectData).select().single()
        ).pipe(
            map(response => {
                if (response.error) {
                    throw response.error;
                }
                return response.data as Project;
            })
        );
    }
}
