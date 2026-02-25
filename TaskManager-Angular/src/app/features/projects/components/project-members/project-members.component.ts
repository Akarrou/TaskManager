import { Component, Input, OnInit, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { ProjectMemberStore } from '../../store/project-member.store';

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
    templateUrl: './project-members.component.html',
    styleUrls: ['./project-members.component.scss']
})
export class ProjectMembersComponent implements OnInit, OnChanges {
    @Input({ required: true }) projectId!: string;

    readonly memberStore = inject(ProjectMemberStore);

    userIdControl = new FormControl('', [Validators.required]);
    roleControl = new FormControl<'admin' | 'member' | 'viewer'>('member', { nonNullable: true });

    ngOnInit(): void {
        this.loadData();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['projectId'] && !changes['projectId'].firstChange) {
            this.loadData();
        }
    }

    private loadData(): void {
        this.memberStore.loadMembers({ projectId: this.projectId });
        this.memberStore.checkOwnership({ projectId: this.projectId });
    }

    inviteMember(): void {
        if (!this.userIdControl.valid || this.memberStore.loading()) {
            return;
        }

        const userId = this.userIdControl.value!;
        const role = this.roleControl.value;

        this.memberStore.addMember({
            project_id: this.projectId,
            user_id: userId,
            role
        });

        this.userIdControl.reset();
    }

    removeMember(memberId: string): void {
        if (!confirm('Êtes-vous sûr de vouloir retirer ce membre ?')) {
            return;
        }

        this.memberStore.removeMember({ memberId });
    }
}
