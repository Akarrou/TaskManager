import { Component, Input, OnInit, inject, signal } from '@angular/core';
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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ProjectInvitationService } from '../../services/project-invitation.service';
import { ProjectInvitation } from '../../models/project.model';

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
        MatSnackBarModule
    ],
    template: `
        <mat-card class="invitations-card">
            <mat-card-header>
                <mat-card-title>Invitations en attente</mat-card-title>
            </mat-card-header>

            <mat-card-content>
                <!-- Formulaire d'invitation -->
                <div class="invite-section">
                    <h3>Inviter un nouveau membre</h3>
                    <form class="invite-form" (ngSubmit)="sendInvitation()">
                        <mat-form-field appearance="outline" class="full-width">
                            <mat-label>Email</mat-label>
                            <input
                                matInput
                                type="email"
                                [formControl]="emailControl"
                                placeholder="utilisateur@example.com">
                            @if (emailControl.hasError('required')) {
                                <mat-error>L'email est requis</mat-error>
                            }
                            @if (emailControl.hasError('email')) {
                                <mat-error>Email invalide</mat-error>
                            }
                        </mat-form-field>

                        <mat-form-field appearance="outline" class="full-width">
                            <mat-label>Rôle</mat-label>
                            <mat-select [formControl]="roleControl">
                                <mat-option value="admin">Admin</mat-option>
                                <mat-option value="member">Membre</mat-option>
                                <mat-option value="viewer">Lecteur</mat-option>
                            </mat-select>
                        </mat-form-field>

                        <button
                            mat-raised-button
                            color="primary"
                            type="submit"
                            [disabled]="isLoading() || !emailControl.valid">
                            <mat-icon>send</mat-icon>
                            Envoyer l'invitation
                        </button>
                    </form>
                </div>

                <!-- Liste des invitations -->
                <div class="invitations-list">
                    <h3>Invitations envoyées</h3>
                    @if (invitations().length > 0) {
                        @for (invitation of invitations(); track invitation.id) {
                            <div class="invitation-item">
                                <div class="invitation-info">
                                    <div class="invitation-email">
                                        <mat-icon>email</mat-icon>
                                        <span>{{ invitation.email }}</span>
                                    </div>
                                    <mat-chip [class]="'role-chip role-' + invitation.role">
                                        {{ invitation.role }}
                                    </mat-chip>
                                    <mat-chip [class]="'status-chip status-' + invitation.status">
                                        {{ getStatusLabel(invitation.status) }}
                                    </mat-chip>
                                    <span class="invitation-date">
                                        Envoyée {{ getRelativeTime(invitation.invited_at) }}
                                    </span>
                                </div>

                                @if (invitation.status === 'pending') {
                                    <div class="invitation-actions">
                                        <button
                                            mat-icon-button
                                            matTooltip="Copier le lien d'invitation"
                                            (click)="copyInvitationLink(invitation.token)"
                                            [disabled]="isLoading()">
                                            <mat-icon>link</mat-icon>
                                        </button>
                                        <button
                                            mat-icon-button
                                            color="warn"
                                            matTooltip="Annuler l'invitation"
                                            (click)="cancelInvitation(invitation.id)"
                                            [disabled]="isLoading()">
                                            <mat-icon>cancel</mat-icon>
                                        </button>
                                    </div>
                                }
                            </div>
                        }
                    } @else {
                        <p class="no-invitations">Aucune invitation envoyée</p>
                    }
                </div>
            </mat-card-content>
        </mat-card>
    `,
    styles: [`
        .invitations-card {
            margin: 1rem;
        }

        .invite-section {
            padding-bottom: 1.5rem;
            border-bottom: 2px solid #e0e0e0;
            margin-bottom: 1.5rem;
        }

        .invite-section h3 {
            margin-bottom: 1rem;
            color: #333;
        }

        .invite-form {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .full-width {
            width: 100%;
        }

        button[type="submit"] {
            align-self: flex-start;
        }

        .invitations-list h3 {
            margin-bottom: 1rem;
            color: #333;
        }

        .invitation-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem;
            border-bottom: 1px solid #e0e0e0;
            background: #fafafa;
            border-radius: 4px;
            margin-bottom: 0.5rem;
        }

        .invitation-info {
            display: flex;
            align-items: center;
            gap: 1rem;
            flex-wrap: wrap;
        }

        .invitation-email {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-weight: 500;
        }

        .invitation-email mat-icon {
            color: #666;
            font-size: 20px;
            width: 20px;
            height: 20px;
        }

        .invitation-date {
            font-size: 0.85rem;
            color: #666;
        }

        .role-chip {
            font-size: 0.75rem;
        }

        .role-chip.role-admin {
            background-color: #2196F3 !important;
            color: white;
        }

        .role-chip.role-member {
            background-color: #FF9800 !important;
            color: white;
        }

        .role-chip.role-viewer {
            background-color: #9E9E9E !important;
            color: white;
        }

        .status-chip {
            font-size: 0.75rem;
        }

        .status-chip.status-pending {
            background-color: #FFC107 !important;
            color: #000;
        }

        .status-chip.status-accepted {
            background-color: #4CAF50 !important;
            color: white;
        }

        .status-chip.status-rejected {
            background-color: #F44336 !important;
            color: white;
        }

        .status-chip.status-expired {
            background-color: #9E9E9E !important;
            color: white;
        }

        .invitation-actions {
            display: flex;
            gap: 0.5rem;
        }

        .no-invitations {
            text-align: center;
            color: #999;
            padding: 2rem;
        }
    `]
})
export class ProjectInvitationsComponent implements OnInit {
    @Input({ required: true }) projectId!: string;

    private invitationService = inject(ProjectInvitationService);
    private snackBar = inject(MatSnackBar);

    invitations = signal<ProjectInvitation[]>([]);
    isLoading = signal(false);

    emailControl = new FormControl('', [Validators.required, Validators.email]);
    roleControl = new FormControl<'admin' | 'member' | 'viewer'>('member', { nonNullable: true });

    ngOnInit(): void {
        this.loadInvitations();
    }

    private loadInvitations(): void {
        this.invitationService.getProjectInvitations(this.projectId).subscribe({
            next: (invitations) => {
                this.invitations.set(invitations);
            },
            error: (error) => {
                console.error('Error loading invitations:', error);
                this.snackBar.open('Erreur lors du chargement des invitations', 'Fermer', {
                    duration: 3000
                });
            }
        });
    }

    sendInvitation(): void {
        if (!this.emailControl.valid || this.isLoading()) {
            return;
        }

        const email = this.emailControl.value!;
        const role = this.roleControl.value;

        this.isLoading.set(true);

        this.invitationService.createInvitation({
            project_id: this.projectId,
            email,
            role
        }).subscribe({
            next: (invitation) => {
                this.emailControl.reset();
                this.isLoading.set(false);
                this.loadInvitations();
                this.snackBar.open(`Invitation envoyée à ${email}`, 'Fermer', {
                    duration: 3000
                });
            },
            error: (error) => {
                console.error('Error sending invitation:', error);
                this.isLoading.set(false);
                this.snackBar.open('Erreur lors de l\'envoi de l\'invitation', 'Fermer', {
                    duration: 3000
                });
            }
        });
    }

    async copyInvitationLink(token: string): Promise<void> {
        const success = await this.invitationService.copyInvitationLink(token);
        if (success) {
            this.snackBar.open('Lien d\'invitation copié !', 'Fermer', {
                duration: 2000
            });
        } else {
            this.snackBar.open('Impossible de copier le lien', 'Fermer', {
                duration: 3000
            });
        }
    }

    cancelInvitation(invitationId: string): void {
        if (!confirm('Êtes-vous sûr de vouloir annuler cette invitation ?')) {
            return;
        }

        this.isLoading.set(true);

        this.invitationService.cancelInvitation(invitationId).subscribe({
            next: () => {
                this.isLoading.set(false);
                this.loadInvitations();
                this.snackBar.open('Invitation annulée', 'Fermer', {
                    duration: 2000
                });
            },
            error: (error) => {
                console.error('Error canceling invitation:', error);
                this.isLoading.set(false);
                this.snackBar.open('Erreur lors de l\'annulation', 'Fermer', {
                    duration: 3000
                });
            }
        });
    }

    getStatusLabel(status: string): string {
        const labels: Record<string, string> = {
            pending: 'En attente',
            accepted: 'Acceptée',
            rejected: 'Refusée',
            expired: 'Expirée'
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
