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
import { ProjectMemberService } from '../../services/project-member.service';
import { ProjectMember } from '../../models/project.model';
import { Observable, switchMap, tap } from 'rxjs';

@Component({
    selector: 'app-project-members',
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
        MatChipsModule
    ],
    template: `
        <mat-card class="members-card">
            <mat-card-header>
                <mat-card-title>Membres du projet</mat-card-title>
            </mat-card-header>

            <mat-card-content>
                <!-- Liste des membres -->
                <div class="members-list">
                    @if (members$ | async; as members) {
                        @for (member of members; track member.id) {
                            <div class="member-item">
                                <div class="member-info">
                                    <span class="member-id">{{ member.user_id }}</span>
                                    <mat-chip [class]="'role-chip role-' + member.role">
                                        {{ member.role }}
                                    </mat-chip>
                                </div>
                                @if (isOwner && member.role !== 'owner') {
                                    <div class="member-actions">
                                        <button
                                            mat-icon-button
                                            color="warn"
                                            (click)="removeMember(member.id)"
                                            [disabled]="isLoading">
                                            <mat-icon>delete</mat-icon>
                                        </button>
                                    </div>
                                }
                            </div>
                        } @empty {
                            <p class="no-members">Aucun membre pour le moment</p>
                        }
                    }
                </div>

                <!-- Formulaire d'invitation (visible uniquement pour le owner) -->
                @if (isOwner) {
                    <div class="invite-section">
                        <h3>Inviter un membre</h3>
                        <form class="invite-form" (ngSubmit)="inviteMember()">
                            <mat-form-field appearance="outline" class="full-width">
                                <mat-label>ID Utilisateur</mat-label>
                                <input
                                    matInput
                                    [formControl]="userIdControl"
                                    placeholder="UUID de l'utilisateur">
                                @if (userIdControl.hasError('required')) {
                                    <mat-error>L'ID utilisateur est requis</mat-error>
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
                                [disabled]="isLoading || !userIdControl.valid">
                                <mat-icon>person_add</mat-icon>
                                Inviter
                            </button>
                        </form>
                    </div>
                }
            </mat-card-content>
        </mat-card>
    `,
    styles: [`
        .members-card {
            margin: 1rem;
        }

        .members-list {
            margin-bottom: 2rem;
        }

        .member-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem;
            border-bottom: 1px solid #e0e0e0;
        }

        .member-info {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .member-id {
            font-family: monospace;
            font-size: 0.9rem;
            color: #666;
        }

        .role-chip {
            font-size: 0.75rem;
        }

        .role-chip.role-owner {
            background-color: #4CAF50 !important;
            color: white;
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

        .no-members {
            text-align: center;
            color: #999;
            padding: 2rem;
        }

        .invite-section {
            border-top: 2px solid #e0e0e0;
            padding-top: 1rem;
        }

        .invite-section h3 {
            margin-bottom: 1rem;
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
    `]
})
export class ProjectMembersComponent implements OnInit {
    @Input({ required: true }) projectId!: string;

    private memberService = inject(ProjectMemberService);

    members$!: Observable<ProjectMember[]>;
    isOwner = false;
    isLoading = false;

    userIdControl = new FormControl('', [Validators.required]);
    roleControl = new FormControl<'admin' | 'member' | 'viewer'>('member', { nonNullable: true });

    ngOnInit(): void {
        this.loadMembers();
        this.checkOwnership();
    }

    private loadMembers(): void {
        this.members$ = this.memberService.getProjectMembers(this.projectId);
    }

    private checkOwnership(): void {
        this.memberService.isProjectOwner(this.projectId)
            .pipe(switchMap(obs => obs))
            .subscribe({
                next: (isOwner) => {
                    this.isOwner = isOwner;
                },
                error: (error) => {
                    console.error('Error checking ownership:', error);
                }
            });
    }

    inviteMember(): void {
        if (!this.userIdControl.valid || this.isLoading) {
            return;
        }

        const userId = this.userIdControl.value!;
        const role = this.roleControl.value;

        this.isLoading = true;

        this.memberService.addProjectMember({
            project_id: this.projectId,
            user_id: userId,
            role
        })
            .pipe(
                switchMap(obs => obs),
                tap(() => {
                    this.userIdControl.reset();
                    this.isLoading = false;
                    this.loadMembers();
                })
            )
            .subscribe({
                next: () => {
                    console.log('Member invited successfully');
                },
                error: (error) => {
                    console.error('Error inviting member:', error);
                    this.isLoading = false;
                }
            });
    }

    removeMember(memberId: string): void {
        if (!confirm('Êtes-vous sûr de vouloir retirer ce membre ?')) {
            return;
        }

        this.isLoading = true;

        this.memberService.removeMember(memberId)
            .subscribe({
                next: () => {
                    console.log('Member removed successfully');
                    this.isLoading = false;
                    this.loadMembers();
                },
                error: (error) => {
                    console.error('Error removing member:', error);
                    this.isLoading = false;
                }
            });
    }
}
