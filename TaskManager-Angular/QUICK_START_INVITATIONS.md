# Guide de Démarrage Rapide - Système d'Invitations

## ⚡ Mise en route rapide

### 1. Appliquer les migrations

Les migrations sont automatiquement appliquées au démarrage de Docker :

```bash
cd OBS
./start-local.sh
```

### 2. Intégrer le composant d'invitations

Dans votre page de détail de projet :

```typescript
import { Component } from '@angular/core';
import { ProjectInvitationsComponent } from '../components/project-invitations/project-invitations.component';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [ProjectInvitationsComponent],
  template: `
    <div class="project-detail">
      <h1>Mon Projet</h1>

      <!-- Onglets du projet -->
      <mat-tab-group>
        <mat-tab label="Aperçu">
          <!-- Contenu du projet -->
        </mat-tab>

        <mat-tab label="Invitations">
          <app-project-invitations [projectId]="projectId" />
        </mat-tab>
      </mat-tab-group>
    </div>
  `
})
export class ProjectDetailComponent {
  projectId = 'votre-project-id';
}
```

### 3. Ajouter la route d'acceptation

Dans votre `app.routes.ts` :

```typescript
import { Routes } from '@angular/router';
import { InvitationAcceptComponent } from './features/projects/pages/invitation-accept/invitation-accept.component';

export const routes: Routes = [
  // ... autres routes
  {
    path: 'invitation/:token',
    component: InvitationAcceptComponent
  }
];
```

### 4. Tester le système

#### Scénario complet :

1. **En tant que propriétaire de projet** :
   ```
   - Aller sur votre projet
   - Cliquer sur l'onglet "Invitations"
   - Entrer l'email : user@example.com
   - Choisir le rôle : Membre
   - Cliquer sur "Envoyer l'invitation"
   - Copier le lien d'invitation (bouton 🔗)
   ```

2. **En tant qu'utilisateur invité** :
   ```
   - Ouvrir le lien d'invitation
   - Voir les détails du projet
   - Cliquer sur "Accepter"
   - Être redirigé vers le dashboard
   - Le projet apparaît maintenant dans votre liste
   ```

## 📱 Afficher les invitations en attente

Créer un composant pour afficher les invitations de l'utilisateur :

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { ProjectInvitationService } from './services/project-invitation.service';

@Component({
  selector: 'app-my-invitations',
  template: `
    <h2>Mes invitations</h2>
    @if (invitations().length > 0) {
      @for (inv of invitations(); track inv.id) {
        <div class="invitation-card">
          <h3>{{ inv.project_name }}</h3>
          <p>Invité par {{ inv.invited_by_email }}</p>
          <p>Rôle: {{ inv.role }}</p>
          <a [href]="'/invitation/' + inv.token">Voir l'invitation</a>
        </div>
      }
    } @else {
      <p>Aucune invitation en attente</p>
    }
  `
})
export class MyInvitationsComponent implements OnInit {
  private invitationService = inject(ProjectInvitationService);
  invitations = signal<PendingInvitation[]>([]);

  ngOnInit() {
    this.invitationService.getMyPendingInvitations().subscribe({
      next: (invs) => this.invitations.set(invs)
    });
  }
}
```

## 🔧 Personnalisation

### Changer la durée d'expiration

Par défaut, les invitations expirent après 7 jours. Pour modifier :

```sql
-- Modifier la durée par défaut (ex: 30 jours)
ALTER TABLE project_invitations
ALTER COLUMN expires_at SET DEFAULT (timezone('utc', now()) + interval '30 days');
```

### Personnaliser l'apparence

Les composants utilisent Angular Material et sont stylisés via des classes CSS. Vous pouvez les surcharger :

```scss
// Dans votre fichier styles.scss global
.invitation-card {
  border: 2px solid #667eea;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.role-badge {
  font-weight: bold;
  text-transform: uppercase;
}
```

## 🎨 Exemple complet d'intégration

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ProjectService } from './services/project.service';
import { ProjectInvitationsComponent } from './components/project-invitations/project-invitations.component';
import { ProjectMembersComponent } from './components/project-members/project-members.component';

@Component({
  selector: 'app-project-settings',
  standalone: true,
  imports: [
    ProjectInvitationsComponent,
    ProjectMembersComponent,
    MatTabsModule
  ],
  template: `
    <div class="project-settings">
      @if (project()) {
        <h1>Paramètres - {{ project()!.name }}</h1>

        <mat-tab-group>
          <!-- Onglet Membres -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>people</mat-icon>
              Membres
            </ng-template>
            <app-project-members [projectId]="project()!.id" />
          </mat-tab>

          <!-- Onglet Invitations -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>mail</mat-icon>
              Invitations
              @if (pendingInvitationsCount() > 0) {
                <span class="badge">{{ pendingInvitationsCount() }}</span>
              }
            </ng-template>
            <app-project-invitations [projectId]="project()!.id" />
          </mat-tab>

          <!-- Onglet Paramètres -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>settings</mat-icon>
              Paramètres
            </ng-template>
            <!-- Autres paramètres -->
          </mat-tab>
        </mat-tab-group>
      }
    </div>
  `,
  styles: [`
    .badge {
      background: #f44336;
      color: white;
      border-radius: 10px;
      padding: 2px 8px;
      font-size: 0.75rem;
      margin-left: 8px;
    }
  `]
})
export class ProjectSettingsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private projectService = inject(ProjectService);

  project = signal<Project | null>(null);
  pendingInvitationsCount = signal(0);

  ngOnInit() {
    const projectId = this.route.snapshot.paramMap.get('id')!;

    // Charger le projet
    this.projectService.getProject(projectId).subscribe({
      next: (p) => this.project.set(p)
    });
  }
}
```

## ✅ Checklist de déploiement

- [ ] Migrations appliquées
- [ ] Route `/invitation/:token` ajoutée
- [ ] Composant d'invitations intégré dans l'interface
- [ ] Tests fonctionnels effectués
- [ ] (Optionnel) Email automatique configuré
- [ ] (Optionnel) Cron job pour nettoyer les invitations expirées

## 🐛 Résolution de problèmes

### L'invitation n'apparaît pas
- Vérifier que l'utilisateur est bien le owner du projet
- Vérifier les policies RLS dans Supabase Studio

### Erreur lors de l'acceptation
- Vérifier que l'invitation n'est pas expirée
- Vérifier que l'email correspond à l'utilisateur connecté
- Vérifier les logs de la fonction `accept_project_invitation`

### Le lien ne se copie pas
- Vérifier que le navigateur supporte l'API Clipboard
- Utiliser HTTPS (requis pour clipboard API)
- Tester avec un autre navigateur

## 📞 Support

Pour toute question, consulter :
- [Documentation complète](./INVITATION_SYSTEM.md)
- [Documentation de sécurité](./SECURITY_IMPLEMENTATION.md)
- [Supabase Documentation](https://supabase.com/docs)

---

**Version** : 1.0.0
**Dernière mise à jour** : 2025-12-12
