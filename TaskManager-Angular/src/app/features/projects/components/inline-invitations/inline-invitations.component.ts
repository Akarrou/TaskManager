import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ProjectInvitationService } from '../../services/project-invitation.service';
import { CreateInvitationDto } from '../../models/project.model';

interface PendingInvite {
  email: string;
  role: 'admin' | 'member' | 'viewer';
  id?: string; // Temporary ID for UI tracking
  token?: string; // Token for invitation link
}

@Component({
  selector: 'app-inline-invitations',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatSnackBarModule
  ],
  template: `
    <div class="inline-invitations">
      <div class="inline-invitations__header">
        <h3 class="inline-invitations__title">
          <span class="material-icons-outlined">group_add</span>
          Inviter des membres {{ isCreationMode ? '(après création)' : '' }}
        </h3>
        <p class="inline-invitations__subtitle">
          {{ isCreationMode
            ? 'Les invitations seront envoyées après la création du projet'
            : 'Invitez des personnes à rejoindre ce projet' }}
        </p>
      </div>

      <!-- Formulaire d'ajout d'invitation -->
      <div class="invite-form">
        <div class="invite-form__inputs">
          <div class="c-form-group">
            <label for="email" class="c-form-label">Email</label>
            <input
              id="email"
              type="email"
              [formControl]="emailControl"
              class="c-form-input"
              [class.c-form-input--error]="emailControl.invalid && emailControl.touched"
              placeholder="utilisateur@example.com">
            @if (emailControl.hasError('required') && emailControl.touched) {
              <div class="c-form-error">L'email est requis</div>
            }
            @if (emailControl.hasError('email') && emailControl.touched) {
              <div class="c-form-error">Email invalide</div>
            }
          </div>

          <div class="c-form-group">
            <label for="role" class="c-form-label">Rôle</label>
            <select
              id="role"
              [formControl]="roleControl"
              class="c-form-input">
              <option value="viewer">👁️ Lecteur</option>
              <option value="member">✏️ Membre</option>
              <option value="admin">⭐ Admin</option>
            </select>
          </div>

          <button
            type="button"
            (click)="addInvite()"
            [disabled]="emailControl.invalid || isProcessing()"
            class="c-button c-button--primary invite-form__add-btn">
            <span class="material-icons-outlined">add</span>
            {{ isCreationMode ? 'Ajouter' : 'Envoyer' }}
          </button>
        </div>
      </div>

      <!-- Liste des invitations en attente -->
      @if (pendingInvites().length > 0) {
        <div class="invites-list">
          <div class="invites-list__header">
            <span>{{ pendingInvites().length }} invitation(s) {{ isCreationMode ? 'à envoyer' : 'en attente' }}</span>
          </div>
          @for (invite of pendingInvites(); track invite.id || invite.email) {
            <div class="invite-item">
              <div class="invite-item__content">
                <div class="invite-item__info">
                  <span class="material-icons-outlined invite-item__icon">email</span>
                  <span class="invite-item__email">{{ invite.email }}</span>
                  <span [class]="'invite-item__role invite-item__role--' + invite.role">
                    {{ getRoleLabel(invite.role) }}
                  </span>
                </div>

                @if (invite.token) {
                  <div class="invite-item__link">
                    <span class="material-icons-outlined link-icon">link</span>
                    <input
                      type="text"
                      readonly
                      [value]="getInvitationLink(invite.token)"
                      class="link-input"
                      (click)="selectLinkText($event)">
                    <button
                      type="button"
                      (click)="copyLink(invite.token)"
                      class="copy-button">
                      <span class="material-icons-outlined">content_copy</span>
                      Copier
                    </button>
                  </div>
                }
              </div>

              <button
                type="button"
                (click)="removeInvite(invite)"
                [disabled]="isProcessing()"
                class="invite-item__remove">
                <span class="material-icons-outlined">close</span>
              </button>
            </div>
          }
        </div>
      }

      @if (isProcessing()) {
        <div class="processing-indicator">
          <span class="processing-indicator__spinner"></span>
          <span>Envoi en cours...</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .inline-invitations {
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 1.5rem;
      margin-top: 1.5rem;
    }

    .inline-invitations__header {
      margin-bottom: 1.5rem;
    }

    .inline-invitations__title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0 0 0.5rem 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: #1a1a1a;
    }

    .inline-invitations__title .material-icons-outlined {
      color: #667eea;
    }

    .inline-invitations__subtitle {
      margin: 0;
      font-size: 0.9rem;
      color: #666;
    }

    .invite-form__inputs {
      display: grid;
      grid-template-columns: 2fr 1fr auto;
      gap: 1rem;
      align-items: end;
    }

    .invite-form__add-btn {
      height: 44px;
      white-space: nowrap;
    }

    .invites-list {
      margin-top: 1.5rem;
      background: white;
      border-radius: 6px;
      overflow: hidden;
    }

    .invites-list__header {
      padding: 0.75rem 1rem;
      background: #667eea;
      color: white;
      font-size: 0.9rem;
      font-weight: 500;
    }

    .invite-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #e0e0e0;
      transition: background 0.2s;
    }

    .invite-item:last-child {
      border-bottom: none;
    }

    .invite-item:hover {
      background: #f8f9fa;
    }

    .invite-item__content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .invite-item__info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .invite-item__link {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      background: #f8f9fa;
      border-radius: 4px;
      margin-top: 0.5rem;
    }

    .link-icon {
      color: #667eea;
      font-size: 18px;
    }

    .link-input {
      flex: 1;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 0.5rem;
      font-size: 0.85rem;
      color: #666;
      font-family: monospace;
      cursor: text;
    }

    .link-input:focus {
      outline: none;
      border-color: #667eea;
    }

    .copy-button {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 0.5rem 0.75rem;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
      white-space: nowrap;
    }

    .copy-button:hover {
      background: #5568d3;
    }

    .copy-button .material-icons-outlined {
      font-size: 16px;
    }

    .invite-item__icon {
      color: #666;
      font-size: 20px;
    }

    .invite-item__email {
      font-weight: 500;
      color: #1a1a1a;
    }

    .invite-item__role {
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 600;
    }

    .invite-item__role--viewer {
      background: #e0e0e0;
      color: #666;
    }

    .invite-item__role--member {
      background: #fff3e0;
      color: #f57c00;
    }

    .invite-item__role--admin {
      background: #e3f2fd;
      color: #1976d2;
    }

    .invite-item__remove {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.25rem;
      color: #999;
      transition: color 0.2s;
      display: flex;
      align-items: center;
    }

    .invite-item__remove:hover {
      color: #f44336;
    }

    .invite-item__remove:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .processing-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 1rem;
      color: #667eea;
      font-size: 0.9rem;
    }

    .processing-indicator__spinner {
      width: 16px;
      height: 16px;
      border: 2px solid #e0e0e0;
      border-top-color: #667eea;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 768px) {
      .invite-form__inputs {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class InlineInvitationsComponent implements OnInit {
  @Input() projectId: string | null = null;
  @Input() isCreationMode = true; // true = mode création, false = mode édition

  private invitationService = inject(ProjectInvitationService);
  private snackBar = inject(MatSnackBar);

  emailControl = new FormControl('', [Validators.required, Validators.email]);
  roleControl = new FormControl<'admin' | 'member' | 'viewer'>('member', { nonNullable: true });

  pendingInvites = signal<PendingInvite[]>([]);
  isProcessing = signal(false);

  ngOnInit(): void {
    // Si on est en mode édition avec un projectId, on peut charger les invitations existantes
    if (!this.isCreationMode && this.projectId) {
      this.loadExistingInvitations();
    }
  }

  private loadExistingInvitations(): void {
    if (!this.projectId) return;

    this.invitationService.getPendingInvitations(this.projectId).subscribe({
      next: (invitations) => {
        const invites: PendingInvite[] = invitations.map(inv => ({
          id: inv.id,
          email: inv.email,
          role: inv.role
        }));
        this.pendingInvites.set(invites);
      },
      error: (error) => {
        console.error('Error loading invitations:', error);
      }
    });
  }

  addInvite(): void {
    if (this.emailControl.invalid) {
      this.emailControl.markAsTouched();
      return;
    }

    const email = this.emailControl.value!;
    const role = this.roleControl.value;

    // Vérifier si l'email est déjà dans la liste
    const exists = this.pendingInvites().some(inv => inv.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      this.snackBar.open('Cet email est déjà dans la liste', 'Fermer', { duration: 3000 });
      return;
    }

    // Si on a un projectId (mode édition), envoyer directement
    if (this.projectId && !this.isCreationMode) {
      this.sendInvitationNow(email, role);
    } else {
      // Sinon, ajouter à la liste pour envoi ultérieur
      const newInvite: PendingInvite = {
        email,
        role,
        id: `temp-${Date.now()}`
      };
      this.pendingInvites.update(invites => [...invites, newInvite]);
      this.emailControl.reset();
      this.roleControl.setValue('member');
    }
  }

  private sendInvitationNow(email: string, role: 'admin' | 'member' | 'viewer'): void {
    if (!this.projectId) return;

    this.isProcessing.set(true);

    const invitationData: CreateInvitationDto = {
      project_id: this.projectId,
      email,
      role
    };

    this.invitationService.createInvitation(invitationData).subscribe({
      next: (invitation) => {
        this.isProcessing.set(false);
        this.emailControl.reset();
        this.roleControl.setValue('member');

        // Ajouter à la liste locale
        const newInvite: PendingInvite = {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role
        };
        this.pendingInvites.update(invites => [...invites, newInvite]);

        this.snackBar.open(`Invitation envoyée à ${email}`, 'Fermer', { duration: 3000 });
      },
      error: (error) => {
        this.isProcessing.set(false);
        console.error('Error sending invitation:', error);
        this.snackBar.open('Erreur lors de l\'envoi de l\'invitation', 'Fermer', { duration: 3000 });
      }
    });
  }

  removeInvite(invite: PendingInvite): void {
    // Si l'invitation a un vrai ID (déjà envoyée), on doit l'annuler
    if (invite.id && !invite.id.startsWith('temp-') && this.projectId) {
      this.isProcessing.set(true);

      this.invitationService.cancelInvitation(invite.id).subscribe({
        next: () => {
          this.isProcessing.set(false);
          this.pendingInvites.update(invites =>
            invites.filter(i => i.id !== invite.id)
          );
          this.snackBar.open('Invitation annulée', 'Fermer', { duration: 2000 });
        },
        error: (error) => {
          this.isProcessing.set(false);
          console.error('Error canceling invitation:', error);
          this.snackBar.open('Erreur lors de l\'annulation', 'Fermer', { duration: 3000 });
        }
      });
    } else {
      // Sinon, simple suppression de la liste locale
      this.pendingInvites.update(invites =>
        invites.filter(i => i.id !== invite.id && i.email !== invite.email)
      );
    }
  }

  /**
   * Méthode publique pour envoyer toutes les invitations en attente
   * À appeler après la création du projet
   */
  public sendAllInvitations(projectId: string): void {
    const invites = this.pendingInvites();
    if (invites.length === 0) return;

    this.isProcessing.set(true);

    const invitationPromises = invites.map(invite =>
      this.invitationService.createInvitation({
        project_id: projectId,
        email: invite.email,
        role: invite.role
      }).toPromise()
    );

    Promise.all(invitationPromises)
      .then(() => {
        this.isProcessing.set(false);
        this.pendingInvites.set([]);
        this.snackBar.open(
          `${invites.length} invitation(s) envoyée(s) avec succès`,
          'Fermer',
          { duration: 3000 }
        );
      })
      .catch((error) => {
        this.isProcessing.set(false);
        console.error('Error sending invitations:', error);
        this.snackBar.open('Erreur lors de l\'envoi des invitations', 'Fermer', { duration: 3000 });
      });
  }

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      admin: 'Admin',
      member: 'Membre',
      viewer: 'Lecteur'
    };
    return labels[role] || role;
  }

  getInvitationLink(token: string): string {
    const baseUrl = window.location.origin;
    return `${baseUrl}/invitation/${token}`;
  }

  copyLink(token: string): void {
    const link = this.getInvitationLink(token);
    navigator.clipboard.writeText(link).then(() => {
      this.snackBar.open('Lien copié dans le presse-papiers !', 'Fermer', { duration: 2000 });
    }).catch(() => {
      this.snackBar.open('Impossible de copier le lien', 'Fermer', { duration: 3000 });
    });
  }

  selectLinkText(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.select();
  }
}
