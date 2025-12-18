# Guide - Invitations Intégrées au Formulaire de Projet

## 📋 Vue d'ensemble

Le composant `InlineInvitationsComponent` permet d'inviter des membres directement depuis le formulaire de création ou modification d'un projet. C'est une interface fluide et intuitive qui s'intègre parfaitement dans le workflow de gestion de projet.

## ✨ Fonctionnalités

### Mode Création de Projet
- ✅ Ajouter des invitations à envoyer après la création
- ✅ Liste temporaire des invitations en attente
- ✅ Les invitations sont automatiquement envoyées après la création du projet
- ✅ Aucun email envoyé avant que le projet existe

### Mode Édition de Projet
- ✅ Inviter des membres immédiatement
- ✅ Voir les invitations en attente du projet
- ✅ Annuler des invitations existantes
- ✅ Feedback instantané avec snackbar

## 🎯 Utilisation

### Intégration Déjà Faite

Le composant est déjà intégré dans le formulaire de projet (`ProjectFormComponent`). Vous n'avez rien à faire !

### Workflow Utilisateur

#### 1. Lors de la Création d'un Projet

```
User remplit le formulaire
  ↓
User ajoute des invitations (optionnel)
  - Entre l'email
  - Choisit le rôle
  - Clique "Ajouter"
  ↓
Les invitations sont ajoutées à une liste temporaire
  ↓
User clique "Créer le projet"
  ↓
Projet créé avec succès
  ↓
Toutes les invitations sont automatiquement envoyées
  ↓
Snackbar : "X invitation(s) envoyée(s) avec succès"
```

#### 2. Lors de la Modification d'un Projet

```
User ouvre la page d'édition
  ↓
Les invitations en attente s'affichent
  ↓
User peut :
  - Ajouter une nouvelle invitation → Envoyée immédiatement
  - Annuler une invitation existante
  ↓
Feedback immédiat avec snackbar
```

## 🎨 Interface

### Formulaire d'Invitation

```
┌─────────────────────────────────────────────────┐
│ 👥 Inviter des membres (après création)        │
│ Les invitations seront envoyées après la        │
│ création du projet                              │
├─────────────────────────────────────────────────┤
│                                                 │
│ Email: [user@example.com          ]            │
│ Rôle:  [👁️ Lecteur ▼]                          │
│ [+ Ajouter]                                     │
│                                                 │
│ ┌───────────────────────────────────────────┐ │
│ │ 2 invitation(s) à envoyer                 │ │
│ ├───────────────────────────────────────────┤ │
│ │ 📧 alice@example.com     Membre      [✕] │ │
│ │ 📧 bob@example.com       Admin       [✕] │ │
│ └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Rôles Disponibles

| Icône | Rôle | Description | Couleur |
|-------|------|-------------|---------|
| 👁️ | Lecteur | Lecture seule | Gris |
| ✏️ | Membre | Peut éditer | Orange |
| ⭐ | Admin | Gestion avancée | Bleu |

## 🔧 Composant Technique

### Props (Inputs)

```typescript
@Input() projectId: string | null = null;
@Input() isCreationMode = true;
```

- **`projectId`** : ID du projet (null en création, valeur en édition)
- **`isCreationMode`** : `true` = création, `false` = édition

### Méthodes Publiques

```typescript
// Envoyer toutes les invitations en attente
public sendAllInvitations(projectId: string): void
```

Cette méthode est appelée automatiquement après la création du projet.

### Gestion d'État

```typescript
pendingInvites = signal<PendingInvite[]>([]);
isProcessing = signal(false);
```

- `pendingInvites` : Liste des invitations à envoyer ou en attente
- `isProcessing` : Indicateur de traitement en cours

## 📊 Comportement Détaillé

### Mode Création

1. **Ajout d'invitation** :
   - Validation de l'email
   - Vérification des doublons
   - Ajout à la liste locale (signal)
   - Pas d'appel API

2. **Création du projet** :
   - Formulaire soumis
   - Projet créé (via NgRx store)
   - Action success reçue
   - `sendAllInvitations(projectId)` appelée
   - Toutes les invitations envoyées en parallèle
   - Promise.all pour synchroniser
   - Snackbar de confirmation

### Mode Édition

1. **Chargement** :
   - `ngOnInit()` appelle `loadExistingInvitations()`
   - Récupère les invitations pending via API
   - Affiche dans la liste

2. **Ajout d'invitation** :
   - Validation
   - Appel API immédiat
   - Ajout à la liste locale si succès
   - Snackbar de confirmation

3. **Annulation** :
   - Appel API `cancelInvitation()`
   - Retrait de la liste locale
   - Snackbar de confirmation

## 🎨 Styles et Design

### Thème

- **Couleur principale** : `#667eea` (violet)
- **Background** : `#f8f9fa` (gris clair)
- **Cards** : Blanc avec border radius 6-8px
- **Transitions** : 0.2s sur hover

### Responsive

```scss
@media (max-width: 768px) {
  // Passage en colonne unique
  grid-template-columns: 1fr;
}
```

## 🐛 Gestion d'Erreurs

### Erreurs Gérées

1. **Email invalide** : Validation en temps réel
2. **Doublon** : Message "Cet email est déjà dans la liste"
3. **Erreur API** : Snackbar "Erreur lors de l'envoi"
4. **Pas de projectId** : Return early, pas d'action

### Messages Utilisateur

```typescript
// Succès
"Invitation envoyée à user@example.com"
"2 invitation(s) envoyée(s) avec succès"
"Invitation annulée"

// Erreurs
"Cet email est déjà dans la liste"
"Erreur lors de l'envoi de l'invitation"
"Erreur lors de l'annulation"
```

## 🔒 Sécurité

### Validations

- ✅ Format email vérifié (Validators.email)
- ✅ Email requis (Validators.required)
- ✅ Vérification des doublons côté client
- ✅ RLS policies côté serveur (owner only)

### Permissions

- Seul le **owner** du projet peut inviter
- Les RLS policies de Supabase appliquent cette règle
- Erreur 403 si tentative par non-owner

## 📈 Améliorations Futures

### Court Terme
1. **Validation avancée** : Vérifier si l'utilisateur existe déjà
2. **Autocomplétion** : Recherche d'utilisateurs par email
3. **Import CSV** : Inviter plusieurs personnes d'un coup

### Moyen Terme
1. **Prévisualisation email** : Montrer le message qui sera envoyé
2. **Message personnalisé** : Ajouter un mot d'accompagnement
3. **Expiration custom** : Choisir la durée de validité

### Long Terme
1. **Invitations récurrentes** : Modèles d'invitation réutilisables
2. **Groupes** : Inviter des groupes prédéfinis
3. **Analytics** : Taux d'acceptation, temps de réponse

## 📝 Exemple d'Utilisation Avancée

### Dans un autre composant

```typescript
import { InlineInvitationsComponent } from './components/inline-invitations/inline-invitations.component';

@Component({
  selector: 'app-custom-project-wizard',
  imports: [InlineInvitationsComponent],
  template: `
    <div class="wizard-step-3">
      <h2>Étape 3 : Inviter des collaborateurs</h2>

      <app-inline-invitations
        [projectId]="createdProjectId"
        [isCreationMode]="false">
      </app-inline-invitations>

      <button (click)="skipInvitations()">Passer cette étape</button>
    </div>
  `
})
export class CustomProjectWizard {
  createdProjectId: string | null = null;

  onProjectCreated(projectId: string) {
    this.createdProjectId = projectId;
  }
}
```

### Personnalisation des Styles

```scss
// Dans votre fichier SCSS global
.inline-invitations {
  // Changer la couleur du thème
  --invitation-primary: #your-color;

  // Modifier l'espacement
  padding: 2rem;

  // Personnaliser les chips de rôle
  .invite-item__role--member {
    background: #your-member-color;
  }
}
```

## 🧪 Tests

### Test Unitaire

```typescript
describe('InlineInvitationsComponent', () => {
  it('should add invitation to local list in creation mode', () => {
    component.isCreationMode = true;
    component.projectId = null;

    component.emailControl.setValue('test@example.com');
    component.roleControl.setValue('member');
    component.addInvite();

    expect(component.pendingInvites().length).toBe(1);
    expect(component.pendingInvites()[0].email).toBe('test@example.com');
  });

  it('should send invitation immediately in edit mode', (done) => {
    component.isCreationMode = false;
    component.projectId = 'project-123';

    spyOn(invitationService, 'createInvitation').and.returnValue(of({
      id: 'inv-1',
      email: 'test@example.com',
      role: 'member'
    }));

    component.emailControl.setValue('test@example.com');
    component.addInvite();

    expect(invitationService.createInvitation).toHaveBeenCalled();
    done();
  });
});
```

### Test E2E

```typescript
describe('Project Creation with Invitations', () => {
  it('should send invitations after project creation', () => {
    cy.visit('/projects/new');

    // Remplir le formulaire
    cy.get('#name').type('Mon Nouveau Projet');
    cy.get('#description').type('Description du projet');

    // Ajouter des invitations
    cy.get('#email').type('alice@example.com');
    cy.get('#role').select('member');
    cy.contains('Ajouter').click();

    cy.get('#email').type('bob@example.com');
    cy.get('#role').select('admin');
    cy.contains('Ajouter').click();

    // Vérifier la liste
    cy.get('.invite-item').should('have.length', 2);

    // Créer le projet
    cy.contains('Créer le projet').click();

    // Vérifier le snackbar
    cy.contains('2 invitation(s) envoyée(s) avec succès');
  });
});
```

## 📚 Références

- [Documentation Invitations](./INVITATION_SYSTEM.md)
- [Guide de Démarrage Rapide](./QUICK_START_INVITATIONS.md)
- [Changelog Sécurité](./CHANGELOG_SECURITY.md)

---

**Version** : 1.0.0
**Date** : 2025-12-12
**Statut** : ✅ Intégré et Fonctionnel
