import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ProjectInvitationService } from '../../services/project-invitation.service';
import { InvitationDetails } from '../../models/project.model';

@Component({
    selector: 'app-invitation-accept',
    standalone: true,
    imports: [
        CommonModule,
        MatButtonModule,
        MatCardModule,
        MatIconModule,
        MatProgressSpinnerModule
    ],
    template: `
        <div class="invitation-page">
            @if (isLoading()) {
                <mat-card class="invitation-card loading">
                    <mat-spinner></mat-spinner>
                    <p>Chargement de l'invitation...</p>
                </mat-card>
            } @else if (error()) {
                <mat-card class="invitation-card error">
                    <mat-icon class="error-icon">error</mat-icon>
                    <h1>Invitation invalide</h1>
                    <p>{{ error() }}</p>
                    <button mat-raised-button color="primary" (click)="goHome()">
                        Retour à l'accueil
                    </button>
                </mat-card>
            } @else if (invitation()) {
                <mat-card class="invitation-card">
                    <mat-card-header>
                        <mat-icon class="invite-icon">mail</mat-icon>
                        <mat-card-title>Invitation au projet</mat-card-title>
                    </mat-card-header>

                    <mat-card-content>
                        <div class="invitation-details">
                            <p class="invitation-message">
                                <strong>{{ invitation()!.invited_by_email }}</strong> vous invite à rejoindre le projet
                            </p>

                            <div class="project-info">
                                <mat-icon>folder</mat-icon>
                                <h2>{{ invitation()!.project_name }}</h2>
                            </div>

                            <div class="role-info">
                                <p>Vous serez ajouté avec le rôle :</p>
                                <div [class]="'role-badge role-' + invitation()!.role">
                                    {{ getRoleLabel(invitation()!.role) }}
                                </div>
                                <p class="role-description">{{ getRoleDescription(invitation()!.role) }}</p>
                            </div>

                            <div class="expiry-info">
                                <mat-icon>schedule</mat-icon>
                                <span>Expire {{ getRelativeTime(invitation()!.expires_at) }}</span>
                            </div>
                        </div>

                        <div class="action-buttons">
                            <button
                                mat-raised-button
                                color="primary"
                                (click)="acceptInvitation()"
                                [disabled]="isProcessing()">
                                <mat-icon>check_circle</mat-icon>
                                Accepter
                            </button>
                            <button
                                mat-stroked-button
                                color="warn"
                                (click)="rejectInvitation()"
                                [disabled]="isProcessing()">
                                <mat-icon>cancel</mat-icon>
                                Refuser
                            </button>
                        </div>

                        @if (isProcessing()) {
                            <div class="processing">
                                <mat-spinner diameter="30"></mat-spinner>
                                <span>Traitement en cours...</span>
                            </div>
                        }
                    </mat-card-content>
                </mat-card>
            }
        </div>
    `,
    styles: [`
        .invitation-page {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 2rem;
        }

        .invitation-card {
            max-width: 600px;
            width: 100%;
        }

        .invitation-card.loading,
        .invitation-card.error {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 3rem;
            text-align: center;
        }

        .error-icon {
            font-size: 64px;
            width: 64px;
            height: 64px;
            color: #f44336;
            margin-bottom: 1rem;
        }

        mat-card-header {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1.5rem 1.5rem 0 1.5rem;
        }

        .invite-icon {
            font-size: 48px;
            width: 48px;
            height: 48px;
            color: #667eea;
        }

        mat-card-title {
            font-size: 1.5rem !important;
            margin: 0 !important;
        }

        .invitation-details {
            padding: 2rem 0;
        }

        .invitation-message {
            font-size: 1.1rem;
            margin-bottom: 2rem;
            text-align: center;
        }

        .project-info {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            margin: 2rem 0;
            padding: 1.5rem;
            background: #f5f5f5;
            border-radius: 8px;
        }

        .project-info mat-icon {
            font-size: 32px;
            width: 32px;
            height: 32px;
            color: #667eea;
        }

        .project-info h2 {
            margin: 0;
            color: #333;
        }

        .role-info {
            text-align: center;
            margin: 2rem 0;
        }

        .role-info p:first-child {
            margin-bottom: 0.5rem;
            color: #666;
        }

        .role-badge {
            display: inline-block;
            padding: 0.5rem 1.5rem;
            border-radius: 20px;
            font-weight: 600;
            font-size: 1rem;
            margin: 0.5rem 0;
        }

        .role-badge.role-admin {
            background-color: #2196F3;
            color: white;
        }

        .role-badge.role-member {
            background-color: #FF9800;
            color: white;
        }

        .role-badge.role-viewer {
            background-color: #9E9E9E;
            color: white;
        }

        .role-description {
            font-size: 0.9rem;
            color: #666;
            margin-top: 0.5rem;
        }

        .expiry-info {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            color: #666;
            margin-top: 2rem;
        }

        .expiry-info mat-icon {
            font-size: 20px;
            width: 20px;
            height: 20px;
        }

        .action-buttons {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin-top: 2rem;
        }

        .action-buttons button {
            min-width: 150px;
        }

        .processing {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            margin-top: 1rem;
            color: #666;
        }
    `]
})
export class InvitationAcceptComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private invitationService = inject(ProjectInvitationService);

    invitation = signal<InvitationDetails | null>(null);
    isLoading = signal(true);
    isProcessing = signal(false);
    error = signal<string | null>(null);

    private token = '';

    ngOnInit(): void {
        this.token = this.route.snapshot.paramMap.get('token') || '';

        if (!this.token) {
            this.error.set('Token d\'invitation manquant');
            this.isLoading.set(false);
            return;
        }

        this.loadInvitation();
    }

    private loadInvitation(): void {
        this.invitationService.getInvitationDetails(this.token).subscribe({
            next: (details) => {
                if (details) {
                    this.invitation.set(details);
                } else {
                    this.error.set('Cette invitation n\'existe pas ou a expiré');
                }
                this.isLoading.set(false);
            },
            error: (error) => {
                console.error('Error loading invitation:', error);
                this.error.set('Impossible de charger l\'invitation');
                this.isLoading.set(false);
            }
        });
    }

    acceptInvitation(): void {
        this.isProcessing.set(true);

        this.invitationService.acceptInvitation(this.token).subscribe({
            next: () => {
                this.isProcessing.set(false);
                // Rediriger vers le projet
                this.router.navigate(['/dashboard']);
            },
            error: (error) => {
                console.error('Error accepting invitation:', error);
                this.error.set(error.message || 'Erreur lors de l\'acceptation de l\'invitation');
                this.isProcessing.set(false);
            }
        });
    }

    rejectInvitation(): void {
        if (!confirm('Êtes-vous sûr de vouloir refuser cette invitation ?')) {
            return;
        }

        this.isProcessing.set(true);

        this.invitationService.rejectInvitation(this.token).subscribe({
            next: () => {
                this.isProcessing.set(false);
                this.router.navigate(['/dashboard']);
            },
            error: (error) => {
                console.error('Error rejecting invitation:', error);
                this.error.set(error.message || 'Erreur lors du refus de l\'invitation');
                this.isProcessing.set(false);
            }
        });
    }

    goHome(): void {
        this.router.navigate(['/']);
    }

    getRoleLabel(role: string): string {
        const labels: Record<string, string> = {
            admin: 'Administrateur',
            member: 'Membre',
            viewer: 'Lecteur'
        };
        return labels[role] || role;
    }

    getRoleDescription(role: string): string {
        const descriptions: Record<string, string> = {
            admin: 'Peut gérer les membres et modifier le projet',
            member: 'Peut modifier le contenu du projet',
            viewer: 'Peut uniquement consulter le projet'
        };
        return descriptions[role] || '';
    }

    getRelativeTime(dateString: string): string {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = date.getTime() - now.getTime();
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMs < 0) return 'expiré';
        if (diffHours < 24) return `dans ${diffHours}h`;
        return `dans ${diffDays}j`;
    }
}
