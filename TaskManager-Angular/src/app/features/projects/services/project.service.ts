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

    updateProject(projectId: string, projectData: Partial<Project>) {
        return from(
            this.supabase.client
                .from('projects')
                .update(projectData)
                .eq('id', projectId)
                .select()
                .single()
        ).pipe(
            map(response => {
                if (response.error) {
                    throw response.error;
                }
                return response.data as Project;
            })
        );
    }

    deleteProject(projectId: string) {
        return from(
            this.supabase.client
                .from('projects')
                .delete()
                .eq('id', projectId)
        ).pipe(
            map(response => {
                if (response.error) {
                    throw response.error;
                }
                return true;
            })
        );
    }

    archiveProject(projectId: string) {
        return from(
            this.supabase.client
                .from('projects')
                .update({ archived: true })
                .eq('id', projectId)
                .select()
                .single()
        ).pipe(
            map(response => {
                if (response.error) {
                    throw response.error;
                }
                return response.data as Project;
            })
        );
    }

    restoreProject(projectId: string) {
        return from(
            this.supabase.client
                .from('projects')
                .update({ archived: false })
                .eq('id', projectId)
                .select()
                .single()
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
