# Implémentation de la Sécurité des Projets

## 📋 Vue d'ensemble

Ce document décrit l'implémentation de la sécurité basée sur les propriétaires de projets et les membres invités dans TaskManager.

## 🔐 Fonctionnalités Implémentées

### 1. Propriété des Projets
- Chaque projet a maintenant un `owner_id` qui référence l'utilisateur créateur
- Seul le propriétaire peut :
  - Modifier le projet
  - Supprimer le projet
  - Inviter/retirer des membres
  - Modifier les rôles des membres

### 2. Système de Membres
- Table `project_members` pour gérer les accès
- Rôles disponibles :
  - `owner` : Créateur du projet (automatique)
  - `admin` : Peut gérer les membres (futur)
  - `member` : Peut éditer le contenu
  - `viewer` : Lecture seule

### 3. Sécurité en Cascade
- Les tasks, subtasks et attachments héritent de la sécurité du projet
- Un utilisateur ne peut accéder aux données que s'il a accès au projet parent

## 🗄️ Structure de Base de Données

### Nouvelles Colonnes
```sql
-- Table projects
ALTER TABLE projects ADD COLUMN owner_id uuid NOT NULL REFERENCES auth.users(id);
```

### Nouvelle Table
```sql
-- Table project_members
CREATE TABLE project_members (
    id uuid PRIMARY KEY,
    project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    role text CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    invited_at timestamp,
    invited_by uuid REFERENCES auth.users(id),
    UNIQUE(project_id, user_id)
);
```

## 🛡️ Row Level Security (RLS)

### Projets
- **SELECT** : Utilisateur est owner OU membre du projet
- **INSERT** : Utilisateur devient automatiquement owner
- **UPDATE** : Uniquement le owner
- **DELETE** : Uniquement le owner

### Tasks / Subtasks / Attachments
- **Toutes opérations** : Vérification via `user_has_project_access()`

### Membres
- **SELECT** : Tous les membres du projet
- **INSERT/UPDATE/DELETE** : Uniquement le owner

## 🔧 Fonctions Helper SQL

### `user_has_project_access(project_uuid, user_uuid)`
Vérifie si un utilisateur a accès à un projet (owner ou membre).

### `user_is_project_owner(project_uuid, user_uuid)`
Vérifie si un utilisateur est le propriétaire du projet.

### `get_user_project_role(project_uuid, user_uuid)`
Retourne le rôle de l'utilisateur dans le projet.

## 📝 Modèles TypeScript

### Interface Project
```typescript
export interface Project {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    archived: boolean;
    owner_id: string;  // 👈 Nouveau
}
```

### Interface ProjectMember
```typescript
export interface ProjectMember {
    id: string;
    project_id: string;
    user_id: string;
    role: 'owner' | 'admin' | 'member' | 'viewer';
    invited_at: string;
    invited_by: string | null;
}
```

## 🚀 Services Angular

### ProjectService
- `createProject()` : Injecte automatiquement l'`owner_id` de l'utilisateur connecté
- `getProjects()` : Retourne uniquement les projets accessibles
- Autres méthodes inchangées

### ProjectMemberService (Nouveau)
```typescript
// Obtenir les membres d'un projet
getProjectMembers(projectId: string): Observable<ProjectMember[]>

// Ajouter un membre (owner seulement)
addProjectMember(memberData: CreateProjectMemberDto): Observable<ProjectMember>

// Modifier le rôle d'un membre (owner seulement)
updateMemberRole(memberId: string, role: string): Observable<ProjectMember>

// Retirer un membre (owner seulement)
removeMember(memberId: string): Observable<boolean>

// Vérifier si l'utilisateur est owner
isProjectOwner(projectId: string): Observable<boolean>

// Obtenir le rôle de l'utilisateur
getUserProjectRole(projectId: string): Observable<string>
```

## 📦 Fichiers Créés/Modifiés

### Migrations SQL
1. [20251212120000_add_project_security.sql](supabase/migrations/20251212120000_add_project_security.sql)
   - Ajoute `owner_id` aux projets
   - Crée la table `project_members`
   - Crée les fonctions helper
   - Met à jour les RLS policies des projets

2. [20251212120001_update_tasks_rls_policies.sql](supabase/migrations/20251212120001_update_tasks_rls_policies.sql)
   - Met à jour les RLS policies pour tasks, subtasks, attachments

### Code TypeScript
1. [src/app/features/projects/models/project.model.ts](TaskManager-Angular/src/app/features/projects/models/project.model.ts)
   - Ajout de `owner_id` à l'interface Project
   - Nouvelles interfaces ProjectMember et CreateProjectMemberDto

2. [src/app/features/projects/services/project.service.ts](TaskManager-Angular/src/app/features/projects/services/project.service.ts)
   - Modification de `createProject()` pour injecter `owner_id`

3. [src/app/features/projects/services/project-member.service.ts](TaskManager-Angular/src/app/features/projects/services/project-member.service.ts) ⭐ **NOUVEAU**
   - Service complet pour la gestion des membres

## 🎯 Prochaines Étapes

### Interface Utilisateur (À implémenter)
1. **Formulaire de création de projet**
   - Ajouter une section "Membres" (optionnelle)
   - Permettre d'inviter des utilisateurs dès la création

2. **Page de gestion du projet**
   - Afficher la liste des membres
   - Boutons "Inviter", "Modifier rôle", "Retirer" (owner seulement)

3. **Composant d'invitation**
   - Recherche d'utilisateurs par email
   - Sélection du rôle (admin/member/viewer)
   - Validation et envoi

### Fonctionnalités Avancées (Futur)
- Notifications d'invitation
- Historique des modifications de membres
- Permissions granulaires par rôle
- Transfert de propriété

## 🧪 Test de la Sécurité

### Comment tester
1. Démarrer l'application :
   ```bash
   cd OBS
   ./start-local.sh
   ```

2. Les migrations seront automatiquement appliquées au démarrage

3. Créer deux utilisateurs différents

4. Avec l'utilisateur 1 :
   - Créer un projet → Devient automatiquement owner
   - Vérifier que le projet apparaît dans la liste

5. Avec l'utilisateur 2 :
   - Vérifier que le projet de l'utilisateur 1 n'apparaît PAS
   - Essayer d'accéder directement au projet → Devrait être refusé par RLS

6. Avec l'utilisateur 1 :
   - Inviter l'utilisateur 2 sur le projet
   - L'utilisateur 2 devrait maintenant voir le projet

### Vérification SQL directe
```sql
-- Vérifier les RLS policies
SELECT * FROM pg_policies WHERE tablename = 'projects';

-- Vérifier les accès d'un utilisateur
SELECT * FROM projects WHERE user_has_project_access(id, 'user-uuid');

-- Vérifier le rôle d'un utilisateur
SELECT get_user_project_role('project-uuid', 'user-uuid');
```

## ⚠️ Points d'Attention

1. **Migration des données existantes**
   - Les projets existants sont assignés au premier utilisateur trouvé
   - En production, il faudra gérer cette migration manuellement

2. **Performance**
   - Les fonctions RLS sont indexées pour de bonnes performances
   - Surveiller les performances sur de gros volumes

3. **Suppression en cascade**
   - Supprimer un projet → supprime tous ses membres
   - Supprimer un utilisateur → retire de tous ses projets

## 📚 Références

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Angular RxJS Best Practices](https://angular.io/guide/rx-library)

---

**Date d'implémentation** : 2025-12-12
**Version** : 1.0.0
