export interface Project {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    archived: boolean;
    owner_id: string;
}

export interface ProjectWithMembers extends Project {
    members?: ProjectMember[];
}

export interface ProjectMember {
    id: string;
    project_id: string;
    user_id: string;
    role: 'owner' | 'admin' | 'member' | 'viewer';
    invited_at: string;
    invited_by: string | null;
}

export interface CreateProjectMemberDto {
    project_id: string;
    user_id: string;
    role: 'admin' | 'member' | 'viewer';
}

export interface ProjectInvitation {
    id: string;
    project_id: string;
    email: string;
    role: 'admin' | 'member' | 'viewer';
    status: 'pending' | 'accepted' | 'rejected' | 'expired';
    invited_by: string;
    invited_at: string;
    expires_at: string;
    accepted_at: string | null;
    rejected_at: string | null;
    token: string;
}

export interface CreateInvitationDto {
    project_id: string;
    email: string;
    role: 'admin' | 'member' | 'viewer';
}

export interface InvitationDetails {
    id: string;
    project_id: string;
    project_name: string;
    role: string;
    invited_by_email: string;
    expires_at: string;
    status: string;
}

export interface PendingInvitation {
    id: string;
    project_id: string;
    project_name: string;
    role: string;
    invited_by_email: string;
    invited_at: string;
    expires_at: string;
    token: string;
}
