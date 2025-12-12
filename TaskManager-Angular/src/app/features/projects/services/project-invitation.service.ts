import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import {
    ProjectInvitation,
    CreateInvitationDto,
    InvitationDetails,
    PendingInvitation
} from '../models/project.model';
import { from, map } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class ProjectInvitationService {
    private supabase = inject(SupabaseService);

    /**
     * Get all invitations for a project (owner only)
     */
    getProjectInvitations(projectId: string) {
        return from(
            this.supabase.client
                .from('project_invitations')
                .select('*')
                .eq('project_id', projectId)
                .order('invited_at', { ascending: false })
                .returns<ProjectInvitation[]>()
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
     * Get pending invitations for a project
     */
    getPendingInvitations(projectId: string) {
        return from(
            this.supabase.client
                .from('project_invitations')
                .select('*')
                .eq('project_id', projectId)
                .eq('status', 'pending')
                .gt('expires_at', new Date().toISOString())
                .order('invited_at', { ascending: false })
                .returns<ProjectInvitation[]>()
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
     * Create a new invitation (owner only)
     */
    createInvitation(invitationData: CreateInvitationDto) {
        return from(
            this.supabase.client
                .from('project_invitations')
                .insert(invitationData)
                .select()
                .single()
        ).pipe(
            map(response => {
                if (response.error) {
                    throw response.error;
                }
                return response.data as ProjectInvitation;
            })
        );
    }

    /**
     * Cancel/delete an invitation (owner only)
     */
    cancelInvitation(invitationId: string) {
        return from(
            this.supabase.client
                .from('project_invitations')
                .delete()
                .eq('id', invitationId)
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
     * Get invitation details by token (no auth required)
     */
    getInvitationDetails(token: string) {
        return from(
            this.supabase.client
                .rpc('get_invitation_details', { invitation_token: token })
        ).pipe(
            map(response => {
                if (response.error) {
                    throw response.error;
                }
                return response.data?.[0] as InvitationDetails | null;
            })
        );
    }

    /**
     * Accept an invitation
     */
    acceptInvitation(token: string) {
        return from(
            this.supabase.client
                .rpc('accept_project_invitation', { invitation_token: token })
        ).pipe(
            map(response => {
                if (response.error) {
                    throw response.error;
                }
                const result = response.data as { success: boolean; error?: string; message?: string };
                if (!result.success) {
                    throw new Error(result.error || 'Failed to accept invitation');
                }
                return result;
            })
        );
    }

    /**
     * Reject an invitation
     */
    rejectInvitation(token: string) {
        return from(
            this.supabase.client
                .rpc('reject_project_invitation', { invitation_token: token })
        ).pipe(
            map(response => {
                if (response.error) {
                    throw response.error;
                }
                const result = response.data as { success: boolean; error?: string; message?: string };
                if (!result.success) {
                    throw new Error(result.error || 'Failed to reject invitation');
                }
                return result;
            })
        );
    }

    /**
     * Get all pending invitations for the current user
     */
    getMyPendingInvitations() {
        return from(
            this.supabase.client
                .rpc('get_my_pending_invitations')
        ).pipe(
            map(response => {
                if (response.error) {
                    throw response.error;
                }
                return response.data as PendingInvitation[];
            })
        );
    }

    /**
     * Generate invitation link
     */
    generateInvitationLink(token: string, baseUrl?: string): string {
        const base = baseUrl || window.location.origin;
        return `${base}/invitation/${token}`;
    }

    /**
     * Copy invitation link to clipboard
     */
    async copyInvitationLink(token: string): Promise<boolean> {
        const link = this.generateInvitationLink(token);
        try {
            await navigator.clipboard.writeText(link);
            return true;
        } catch (error) {
            console.error('Failed to copy invitation link:', error);
            return false;
        }
    }
}
