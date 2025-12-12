# Système d'Invitations de Projets

## 📋 Vue d'ensemble

Ce document décrit le système complet d'invitation pour les projets TaskManager, permettant aux propriétaires de projets d'inviter des utilisateurs par email avec un système de tokens sécurisés.

## 🎯 Fonctionnalités

### 1. Envoi d'Invitations
- Invitation par email
- Choix du rôle (admin/member/viewer)
- Génération automatique d'un token unique
- Expiration après 7 jours
- Copie du lien d'invitation dans le presse-papiers

### 2. Gestion des Invitations
- Visualisation des invitations envoyées
- Statuts : pending, accepted, rejected, expired
- Annulation d'invitations en attente
- Historique des invitations

### 3. Acceptation/Refus
- Page dédiée avec token d'invitation
- Affichage des détails du projet
- Acceptation ou refus simple
- Redirection automatique après action

## 🗄️ Structure de Base de Données

### Table `project_invitations`

```sql
CREATE TABLE project_invitations (
    id uuid PRIMARY KEY,
    project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
    email text NOT NULL,
    role text CHECK (role IN ('admin', 'member', 'viewer')),
    status text CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    invited_by uuid REFERENCES auth.users(id),
    invited_at timestamp DEFAULT now(),
    expires_at timestamp DEFAULT (now() + interval '7 days'),
    accepted_at timestamp,
    rejected_at timestamp,
    token text UNIQUE NOT NULL
);
```

### Contraintes
- `unique_pending_invitation` : Un email ne peut avoir qu'une seule invitation pending par projet
- `token` : Token unique pour sécuriser l'acceptation

## 🔧 Fonctions PostgreSQL

### `accept_project_invitation(invitation_token)`
Accepte une invitation et ajoute l'utilisateur comme membre du projet.

**Retour** :
```json
{
  "success": true,
  "member": { /* données du membre */ }
}
```

### `reject_project_invitation(invitation_token)`
Refuse une invitation.

**Retour** :
```json
{
  "success": true,
  "message": "Invitation rejected"
}
```

### `get_invitation_details(invitation_token)`
Récupère les détails d'une invitation (public, sans authentification).

**Retour** :
```typescript
{
  id: string;
  project_id: string;
  project_name: string;
  role: string;
  invited_by_email: string;
  expires_at: string;
  status: string;
}
```

### `get_my_pending_invitations()`
Récupère toutes les invitations en attente pour l'utilisateur connecté.

### `expire_old_invitations()`
Marque les invitations expirées (à appeler via cron job).

## 📝 Modèles TypeScript

### ProjectInvitation
```typescript
interface ProjectInvitation {
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
```

### CreateInvitationDto
```typescript
interface CreateInvitationDto {
    project_id: string;
    email: string;
    role: 'admin' | 'member' | 'viewer';
}
```

## 🚀 Services Angular

### ProjectInvitationService

```typescript
// Obtenir les invitations d'un projet
getProjectInvitations(projectId: string): Observable<ProjectInvitation[]>

// Obtenir uniquement les invitations pending
getPendingInvitations(projectId: string): Observable<ProjectInvitation[]>

// Créer une invitation (owner only)
createInvitation(data: CreateInvitationDto): Observable<ProjectInvitation>

// Annuler une invitation
cancelInvitation(invitationId: string): Observable<boolean>

// Obtenir les détails d'une invitation par token
getInvitationDetails(token: string): Observable<InvitationDetails | null>

// Accepter une invitation
acceptInvitation(token: string): Observable<{ success: boolean }>

// Refuser une invitation
rejectInvitation(token: string): Observable<{ success: boolean }>

// Obtenir mes invitations en attente
getMyPendingInvitations(): Observable<PendingInvitation[]>

// Générer le lien d'invitation
generateInvitationLink(token: string, baseUrl?: string): string

// Copier le lien dans le presse-papiers
copyInvitationLink(token: string): Promise<boolean>
```

## 🎨 Composants

### ProjectInvitationsComponent
**Emplacement** : `src/app/features/projects/components/project-invitations/`

**Usage** :
```typescript
<app-project-invitations [projectId]="projectId" />
```

**Fonctionnalités** :
- Formulaire d'envoi d'invitation
- Liste des invitations avec statuts
- Copie du lien d'invitation
- Annulation d'invitations

### InvitationAcceptComponent
**Emplacement** : `src/app/features/projects/pages/invitation-accept/`

**Route** : `/invitation/:token`

**Fonctionnalités** :
- Affichage des détails de l'invitation
- Boutons Accepter/Refuser
- Gestion des erreurs (expiré, invalide)
- Redirection après action

## 🔒 Sécurité RLS

### Policies pour `project_invitations`

**SELECT** :
- Membres du projet peuvent voir les invitations
- Utilisateur invité peut voir ses propres invitations

**INSERT** :
- Uniquement les owners du projet

**UPDATE** :
- Owner du projet
- OU utilisateur invité (pour accepter/refuser)

**DELETE** :
- Uniquement les owners du projet

## 🌐 Routes à Ajouter

Dans votre fichier de routes Angular :

```typescript
{
  path: 'invitation/:token',
  component: InvitationAcceptComponent
}
```

## 📧 Intégration Email (Future)

Pour envoyer des emails d'invitation automatiques :

### Supabase Edge Function

```typescript
// supabase/functions/send-invitation-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { email, projectName, invitationLink, role } = await req.json()

  // Utiliser un service email (SendGrid, Resend, etc.)
  const emailHtml = `
    <h2>Invitation au projet ${projectName}</h2>
    <p>Vous avez été invité à rejoindre le projet avec le rôle de ${role}.</p>
    <a href="${invitationLink}">Accepter l'invitation</a>
  `

  // Envoyer l'email...

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  })
})
```

### Trigger Automatique

```sql
CREATE OR REPLACE FUNCTION notify_invitation()
RETURNS trigger AS $$
BEGIN
  -- Appeler l'Edge Function pour envoyer l'email
  PERFORM net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/send-invitation-email',
    body := jsonb_build_object(
      'email', NEW.email,
      'projectName', (SELECT name FROM projects WHERE id = NEW.project_id),
      'invitationLink', 'https://yourapp.com/invitation/' || NEW.token,
      'role', NEW.role
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_invitation
AFTER INSERT ON project_invitations
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION notify_invitation();
```

## 🧪 Tests

### Test du Service

```typescript
describe('ProjectInvitationService', () => {
  it('should create invitation', (done) => {
    service.createInvitation({
      project_id: 'project-123',
      email: 'user@example.com',
      role: 'member'
    }).subscribe({
      next: (invitation) => {
        expect(invitation.email).toBe('user@example.com');
        expect(invitation.role).toBe('member');
        expect(invitation.status).toBe('pending');
        done();
      }
    });
  });

  it('should accept invitation', (done) => {
    service.acceptInvitation('valid-token').subscribe({
      next: (result) => {
        expect(result.success).toBe(true);
        done();
      }
    });
  });
});
```

### Test SQL

```sql
-- Test création d'invitation
INSERT INTO project_invitations (project_id, email, role, invited_by)
VALUES ('project-id', 'test@example.com', 'member', 'user-id');

-- Test acceptation
SELECT accept_project_invitation('generated-token');

-- Vérifier membre ajouté
SELECT * FROM project_members WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'test@example.com'
);
```

## 📊 Flux d'Utilisation

### 1. Owner envoie une invitation

```typescript
// Composant de gestion de projet
<app-project-invitations [projectId]="currentProject.id" />
```

### 2. Email envoyé (futur)
```
Sujet : Invitation au projet "Mon Projet"

Vous avez été invité à rejoindre le projet "Mon Projet" avec le rôle de Membre.

[Accepter l'invitation] → https://app.com/invitation/abc123...
```

### 3. Utilisateur clique sur le lien
```
https://app.com/invitation/abc123xyz456
↓
InvitationAcceptComponent affiche les détails
↓
Utilisateur clique "Accepter"
↓
Fonction accept_project_invitation() appelée
↓
Membre ajouté au projet
↓
Redirection vers /dashboard
```

## ⚡ Performances

### Indexes Créés
- `idx_project_invitations_project_id` : Recherche par projet
- `idx_project_invitations_email` : Recherche par email
- `idx_project_invitations_token` : Vérification de token (critique)
- `idx_project_invitations_status` : Filtrage par statut

### Optimisations
- Utiliser `single()` pour récupération par token
- Limiter les invitations pending par projet
- Nettoyer périodiquement les invitations expirées

## 🔄 Maintenance

### Nettoyage des Invitations Expirées

Créer un cron job (via pg_cron ou service externe) :

```sql
-- À exécuter quotidiennement
SELECT expire_old_invitations();
```

Ou via Edge Function schedulée :

```typescript
// supabase/functions/cleanup-invitations/index.ts
import { createClient } from '@supabase/supabase-js'

Deno.cron("Cleanup expired invitations", "0 0 * * *", async () => {
  const supabase = createClient(/* ... */)
  await supabase.rpc('expire_old_invitations')
})
```

## 🎯 Prochaines Améliorations

1. **Notifications** : Afficher un badge avec le nombre d'invitations en attente
2. **Email automatique** : Implémenter l'envoi d'emails via Edge Function
3. **Rappels** : Relancer les invitations non répondues après X jours
4. **Bulk invitations** : Inviter plusieurs utilisateurs à la fois
5. **Rôles personnalisés** : Créer des rôles custom avec permissions spécifiques
6. **Historique** : Afficher l'historique complet des invitations par projet

---

**Date de création** : 2025-12-12
**Version** : 1.0.0
**Auteur** : TaskManager Security Team
