import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ProjectInvitationStore } from '../../store/project-invitation.store';

@Component({
    selector: 'app-project-invitations',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatButtonModule,
        MatCardModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatIconModule,
        MatChipsModule,
        MatTooltipModule,
    ],
    templateUrl: './project-invitations.component.html',
    styleUrls: ['./project-invitations.component.scss']
})
export class ProjectInvitationsComponent implements OnInit {
    @Input({ required: true }) projectId!: string;

    readonly invitationStore = inject(ProjectInvitationStore);

    emailControl = new FormControl('', [Validators.required, Validators.email]);
    roleControl = new FormControl<'admin' | 'member' | 'viewer'>('member', { nonNullable: true });

    ngOnInit(): void {
        this.invitationStore.loadInvitations({ projectId: this.projectId });
    }

    sendInvitation(): void {
        if (!this.emailControl.valid || this.invitationStore.processing()) {
            return;
        }

        const email = this.emailControl.value!;
        const role = this.roleControl.value;

        this.invitationStore.createInvitation({
            project_id: this.projectId,
            email,
            role,
        });

        this.emailControl.reset();
    }

    async copyInvitationLink(token: string): Promise<void> {
        await this.invitationStore.copyInvitationLink(token);
    }

    cancelInvitation(invitationId: string): void {
        if (!confirm('Êtes-vous sûr de vouloir annuler cette invitation ?')) {
            return;
        }

        this.invitationStore.cancelInvitation({ invitationId });
    }

    getStatusLabel(status: string): string {
        const labels: Record<string, string> = {
            pending: 'En attente',
            accepted: 'Acceptée',
            rejected: 'Refusée',
            expired: 'Expirée',
        };
        return labels[status] || status;
    }

    getRelativeTime(dateString: string): string {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'à l\'instant';
        if (diffMins < 60) return `il y a ${diffMins} min`;
        if (diffHours < 24) return `il y a ${diffHours}h`;
        return `il y a ${diffDays}j`;
    }
}
