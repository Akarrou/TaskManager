# Composant ProjectMembers

## Description

Composant Angular standalone pour gérer les membres d'un projet. Permet d'afficher la liste des membres, d'inviter de nouveaux utilisateurs et de retirer des membres (owner seulement).

## Utilisation

### Import dans un composant parent

```typescript
import { ProjectMembersComponent } from './components/project-members/project-members.component';

@Component({
    selector: 'app-project-detail',
    standalone: true,
    imports: [ProjectMembersComponent],
    template: `
        <app-project-members [projectId]="projectId" />
    `
})
export class ProjectDetailComponent {
    projectId = 'uuid-du-projet';
}
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `projectId` | `string` | ✅ | UUID du projet |

## Fonctionnalités

### Pour tous les membres
- ✅ Voir la liste des membres du projet
- ✅ Voir les rôles de chaque membre

### Pour le owner uniquement
- ✅ Inviter des nouveaux membres
- ✅ Retirer des membres (sauf lui-même)
- ⚠️ Modifier les rôles (à implémenter)

## Rôles disponibles

| Rôle | Badge | Description |
|------|-------|-------------|
| `owner` | 🟢 Vert | Créateur du projet, tous les droits |
| `admin` | 🔵 Bleu | Peut gérer les membres (futur) |
| `member` | 🟠 Orange | Peut éditer le contenu du projet |
| `viewer` | ⚪ Gris | Lecture seule |

## Améliorations futures

### 1. Recherche d'utilisateurs
Au lieu de saisir manuellement l'UUID, implémenter une recherche par email :

```typescript
// Service à créer
getUserByEmail(email: string): Observable<User> {
    return from(
        this.supabase.client
            .rpc('get_user_by_email', { email_param: email })
    );
}
```

### 2. Modification des rôles
Ajouter un dropdown pour changer le rôle d'un membre existant :

```typescript
changeRole(memberId: string, newRole: string): void {
    this.memberService.updateMemberRole(memberId, newRole)
        .subscribe(() => this.loadMembers());
}
```

Template :
```html
<mat-select
    [value]="member.role"
    (selectionChange)="changeRole(member.id, $event.value)">
    <mat-option value="admin">Admin</mat-option>
    <mat-option value="member">Membre</mat-option>
    <mat-option value="viewer">Lecteur</mat-option>
</mat-select>
```

### 3. Affichage enrichi
Afficher plus d'informations sur les membres :

```typescript
interface MemberWithProfile extends ProjectMember {
    email?: string;
    full_name?: string;
    avatar_url?: string;
}
```

### 4. Notifications
Envoyer des emails d'invitation via Supabase Edge Functions.

### 5. Gestion des invitations en attente
Système d'invitation avec acceptation/refus :

```sql
CREATE TABLE project_invitations (
    id uuid PRIMARY KEY,
    project_id uuid REFERENCES projects(id),
    email text NOT NULL,
    role text NOT NULL,
    invited_by uuid REFERENCES auth.users(id),
    status text CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at timestamp,
    expires_at timestamp
);
```

## Exemple complet

### Page de détail de projet

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ProjectMembersComponent } from '../components/project-members/project-members.component';
import { ProjectService } from '../services/project.service';
import { Project } from '../models/project.model';

@Component({
    selector: 'app-project-detail',
    standalone: true,
    imports: [ProjectMembersComponent],
    template: `
        <div class="project-detail">
            @if (project) {
                <h1>{{ project.name }}</h1>
                <p>{{ project.description }}</p>

                <!-- Onglet membres -->
                <mat-tab-group>
                    <mat-tab label="Aperçu">
                        <!-- Contenu du projet -->
                    </mat-tab>
                    <mat-tab label="Membres">
                        <app-project-members [projectId]="project.id" />
                    </mat-tab>
                    <mat-tab label="Paramètres">
                        <!-- Paramètres -->
                    </mat-tab>
                </mat-tab-group>
            }
        </div>
    `
})
export class ProjectDetailComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private projectService = inject(ProjectService);

    project?: Project;

    ngOnInit(): void {
        const projectId = this.route.snapshot.paramMap.get('id');
        if (projectId) {
            this.projectService.getProjectById(projectId).subscribe({
                next: (project) => this.project = project,
                error: (error) => console.error('Error loading project:', error)
            });
        }
    }
}
```

## Styles personnalisables

Le composant utilise des classes CSS que vous pouvez surcharger :

```scss
// Dans votre fichier styles global ou parent
.members-card {
    // Personnaliser la carte
}

.role-chip {
    // Personnaliser les badges de rôles

    &.role-owner { /* ... */ }
    &.role-admin { /* ... */ }
    &.role-member { /* ... */ }
    &.role-viewer { /* ... */ }
}
```

## Gestion des erreurs

Le composant gère les erreurs courantes :

- ❌ Utilisateur non authentifié
- ❌ Tentative d'inviter un utilisateur déjà membre
- ❌ Tentative de retirer le owner
- ❌ Permissions insuffisantes

Les erreurs sont loggées dans la console. Pour une UX améliorée, ajoutez un système de notifications.

## Tests

### Test unitaire exemple

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProjectMembersComponent } from './project-members.component';
import { ProjectMemberService } from '../../services/project-member.service';
import { of } from 'rxjs';

describe('ProjectMembersComponent', () => {
    let component: ProjectMembersComponent;
    let fixture: ComponentFixture<ProjectMembersComponent>;
    let memberService: jasmine.SpyObj<ProjectMemberService>;

    beforeEach(async () => {
        const spy = jasmine.createSpyObj('ProjectMemberService', [
            'getProjectMembers',
            'isProjectOwner',
            'addProjectMember',
            'removeMember'
        ]);

        await TestBed.configureTestingModule({
            imports: [ProjectMembersComponent],
            providers: [
                { provide: ProjectMemberService, useValue: spy }
            ]
        }).compileComponents();

        memberService = TestBed.inject(ProjectMemberService) as jasmine.SpyObj<ProjectMemberService>;
        fixture = TestBed.createComponent(ProjectMembersComponent);
        component = fixture.componentInstance;
        component.projectId = 'test-project-id';
    });

    it('should load members on init', () => {
        const mockMembers = [
            { id: '1', project_id: 'test', user_id: 'user1', role: 'owner', invited_at: new Date().toISOString(), invited_by: null }
        ];
        memberService.getProjectMembers.and.returnValue(of(mockMembers));
        memberService.isProjectOwner.and.returnValue(of(of(true)));

        fixture.detectChanges();

        expect(memberService.getProjectMembers).toHaveBeenCalledWith('test-project-id');
    });
});
```

---

**Créé le** : 2025-12-12
**Version** : 1.0.0
