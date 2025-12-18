import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import { ProjectMember, CreateProjectMemberDto } from '../models/project.model';
import { from, map } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class ProjectMemberService {
    private supabase = inject(SupabaseService);

    /**
     * Get all members of a project
     */
    getProjectMembers(projectId: string) {
        return from(
            this.supabase.client
                .from('project_members')
                .select('*')
                .eq('project_id', projectId)
                .returns<ProjectMember[]>()
        ).pipe(
            map(response => {
                if (response.error) {
                    throw response.error;
                }
                return response.data;
            })
        );
    }

    /**
     * Add a member to a project (owner only)
     */
    addProjectMember(memberData: CreateProjectMemberDto) {
        return from(this.supabase.auth.getUser()).pipe(
            map(({ data: { user }, error: userError }) => {
                if (userError || !user) {
                    throw new Error('User must be authenticated to add members');
                }

                const memberWithInviter = {
                    ...memberData,
                    invited_by: user.id
                };

                return from(
                    this.supabase.client
                        .from('project_members')
                        .insert(memberWithInviter)
                        .select()
                        .single()
                ).pipe(
                    map(response => {
                        if (response.error) {
                            throw response.error;
                        }
                        return response.data as ProjectMember;
                    })
                );
            }),
            // Flatten the nested observable
            map(obs => obs)
        );
    }

    /**
     * Update a member's role (owner only)
     */
    updateMemberRole(memberId: string, role: 'admin' | 'member' | 'viewer') {
        return from(
            this.supabase.client
                .from('project_members')
                .update({ role })
                .eq('id', memberId)
                .select()
                .single()
        ).pipe(
            map(response => {
                if (response.error) {
                    throw response.error;
                }
                return response.data as ProjectMember;
            })
        );
    }

    /**
     * Remove a member from a project (owner only)
     */
    removeMember(memberId: string) {
        return from(
            this.supabase.client
                .from('project_members')
                .delete()
                .eq('id', memberId)
        ).pipe(
            map(response => {
                if (response.error) {
                    throw response.error;
                }
                return true;
            })
        );
    }

    /**
     * Check if current user is project owner
     */
    isProjectOwner(projectId: string) {
        return from(this.supabase.auth.getUser()).pipe(
            map(({ data: { user }, error: userError }) => {
                if (userError || !user) {
                    throw new Error('User must be authenticated');
                }

                return from(
                    this.supabase.client.rpc('user_is_project_owner', {
                        project_uuid: projectId,
                        user_uuid: user.id
                    })
                ).pipe(
                    map(response => {
                        if (response.error) {
                            throw response.error;
                        }
                        return response.data as boolean;
                    })
                );
            }),
            // Flatten the nested observable
            map(obs => obs)
        );
    }

    /**
     * Get current user's role in a project
     */
    getUserProjectRole(projectId: string) {
        return from(this.supabase.auth.getUser()).pipe(
            map(({ data: { user }, error: userError }) => {
                if (userError || !user) {
                    throw new Error('User must be authenticated');
                }

                return from(
                    this.supabase.client.rpc('get_user_project_role', {
                        project_uuid: projectId,
                        user_uuid: user.id
                    })
                ).pipe(
                    map(response => {
                        if (response.error) {
                            throw response.error;
                        }
                        return response.data as 'owner' | 'admin' | 'member' | 'viewer' | null;
                    })
                );
            }),
            // Flatten the nested observable
            map(obs => obs)
        );
    }
}
