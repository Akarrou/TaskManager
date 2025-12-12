# Guide de Configuration - Envoi d'Emails d'Invitation

## 📧 Vue d'ensemble

Ce guide explique comment configurer l'envoi automatique d'emails lors de l'invitation de membres à un projet.

## 🎯 Architecture

```
Invitation créée
     ↓
Trigger SQL (AFTER INSERT)
     ↓
Edge Function Supabase
     ↓
Service Email (Resend)
     ↓
Email envoyé ✉️
```

## 🚀 Solutions Disponibles

### **Option 1 : Resend (Recommandé) ⭐**

Service moderne et simple pour l'envoi d'emails.

**Avantages** :
- ✅ Gratuit jusqu'à 3000 emails/mois
- ✅ API simple et fiable
- ✅ Templates HTML supportés
- ✅ Métriques et analytics
- ✅ Excellent pour le développement

**Prix** : Gratuit → $20/mois (50k emails)

### **Option 2 : SendGrid**

Service populaire avec plan gratuit généreux.

**Avantages** :
- ✅ 100 emails/jour gratuits
- ✅ Interface complète
- ✅ Templates visuels

**Prix** : Gratuit → $19.95/mois

### **Option 3 : Mailgun**

Service robuste pour les volumes élevés.

**Avantages** :
- ✅ API puissante
- ✅ Bon pour la production

**Prix** : Pay as you go

## 📋 Configuration Pas à Pas

### Étape 1 : Créer un compte Resend

1. Allez sur [resend.com](https://resend.com)
2. Créez un compte gratuit
3. Vérifiez votre email
4. Créez une clé API :
   - Dashboard → API Keys
   - Créez une clé avec permissions "Sending access"
   - **Copiez la clé** (vous ne pourrez plus la voir)

### Étape 2 : Configurer le domaine (Production)

**Pour le développement** : Utilisez `onboarding@resend.dev` (pas de config nécessaire)

**Pour la production** :
1. Dashboard → Domains
2. Add Domain → Entrez votre domaine (ex: `yourdomain.com`)
3. Ajoutez les enregistrements DNS :
   ```
   Type: TXT
   Name: _resend
   Value: [fourni par Resend]

   Type: MX
   Priority: 10
   Value: [fourni par Resend]
   ```
4. Attendez la vérification (quelques minutes à quelques heures)

### Étape 3 : Installer Supabase CLI (si pas déjà fait)

```bash
# macOS
brew install supabase/tap/supabase

# Linux/WSL
curl -o- https://raw.githubusercontent.com/supabase/cli/main/install.sh | bash

# Vérifier l'installation
supabase --version
```

### Étape 4 : Lier votre projet Supabase

```bash
cd TaskManager-Angular

# Lier au projet (choisir votre projet dans la liste)
supabase link

# Ou avec l'ID du projet directement
supabase link --project-ref your-project-id
```

### Étape 5 : Configurer les secrets

```bash
# Ajouter la clé Resend
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx

# Ajouter l'URL de l'application
supabase secrets set APP_URL=http://localhost:4010  # Dev
# ou
supabase secrets set APP_URL=https://yourapp.com  # Production

# Vérifier les secrets
supabase secrets list
```

### Étape 6 : Déployer l'Edge Function

```bash
# Déployer la fonction
supabase functions deploy send-invitation-email

# Vérifier le déploiement
supabase functions list
```

### Étape 7 : Activer pg_net (Extension Supabase)

1. Allez dans Supabase Dashboard
2. Database → Extensions
3. Cherchez `pg_net`
4. Activez l'extension
5. Ou via SQL :
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_net;
   ```

### Étape 8 : Configurer les paramètres SQL

```sql
-- URL de l'Edge Function (à adapter selon votre environnement)
ALTER DATABASE postgres SET app.settings.edge_function_url =
  'https://your-project.supabase.co/functions/v1/send-invitation-email';

-- Service role key (pour l'authentification)
ALTER DATABASE postgres SET app.settings.service_role_key =
  'your-service-role-key';
```

**Pour obtenir votre service role key** :
1. Supabase Dashboard → Project Settings → API
2. Copiez la clé "service_role"

### Étape 9 : Appliquer la migration

```bash
# Si en local avec Docker
cd OBS
docker compose restart migrations

# Ou avec Supabase CLI
supabase db push
```

### Étape 10 : Tester

```typescript
// Dans votre application, créez une invitation
invitationService.createInvitation({
  project_id: 'project-123',
  email: 'test@example.com',
  role: 'member'
}).subscribe({
  next: () => {
    console.log('Invitation created - email should be sent automatically');
  }
});
```

Vérifiez :
1. **Logs Supabase** : Dashboard → Logs → Edge Functions
2. **Email reçu** : Vérifiez votre boîte mail
3. **Resend Dashboard** : Logs → Voir les emails envoyés

## 🧪 Test en Local

### Avec Supabase Local Dev

```bash
# Démarrer Supabase en local
supabase start

# Servir la fonction localement
supabase functions serve send-invitation-email --env-file .env.local

# Dans un autre terminal, tester la fonction
curl -i --location --request POST \
  'http://localhost:54321/functions/v1/send-invitation-email' \
  --header 'Authorization: Bearer your-anon-key' \
  --header 'Content-Type: application/json' \
  --data '{
    "email": "test@example.com",
    "project_name": "Mon Projet",
    "invited_by_email": "owner@example.com",
    "role": "member",
    "token": "abc123xyz456"
  }'
```

## 🎨 Personnaliser le Template Email

Le template HTML est dans [`supabase/functions/send-invitation-email/index.ts`](supabase/functions/send-invitation-email/index.ts).

### Modifier le contenu

```typescript
const htmlContent = `
  <!DOCTYPE html>
  <html>
    <head>
      <!-- Votre style CSS -->
    </head>
    <body>
      <!-- Votre contenu HTML personnalisé -->
      <h1>Invitation à ${project_name}</h1>
      <p>Invité par ${invited_by_email}</p>
      <a href="${invitationLink}">Accepter</a>
    </body>
  </html>
`
```

### Utiliser un template Resend

```typescript
// Au lieu de htmlContent personnalisé
const response = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${RESEND_API_KEY}`
  },
  body: JSON.stringify({
    from: 'TaskManager <noreply@yourdomain.com>',
    to: [email],
    subject: `Invitation au projet "${project_name}"`,
    // Utiliser un template Resend
    template_id: 'your-template-id',
    template_data: {
      project_name,
      invited_by_email,
      role,
      invitation_link: invitationLink
    }
  })
})
```

## 🔧 Configuration Docker (Production)

Si vous utilisez Docker en production, ajoutez les variables d'environnement :

```yaml
# docker-compose.yml
services:
  app:
    environment:
      RESEND_API_KEY: ${RESEND_API_KEY}
      APP_URL: ${APP_URL}
```

## 📊 Monitoring

### Vérifier les emails envoyés

**Resend Dashboard** :
1. Logs → Emails
2. Voir le statut : Sent, Delivered, Bounced, etc.

**Supabase Logs** :
```bash
# Via CLI
supabase functions logs send-invitation-email

# Ou Dashboard → Functions → Logs
```

### Métriques importantes

- **Taux de délivrance** : % d'emails reçus
- **Taux d'ouverture** : % d'emails ouverts
- **Taux de clic** : % de clics sur le bouton
- **Bounces** : Emails non délivrés

## 🐛 Résolution de Problèmes

### Email non reçu

1. **Vérifier les logs Edge Function** :
   ```bash
   supabase functions logs send-invitation-email --tail
   ```

2. **Vérifier Resend Dashboard** : Logs → Rechercher l'email

3. **Vérifier le dossier spam** du destinataire

4. **Vérifier la clé API** :
   ```bash
   supabase secrets list
   ```

### Erreur "pg_net not found"

```sql
-- Installer l'extension
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Vérifier
SELECT * FROM pg_extension WHERE extname = 'pg_net';
```

### Erreur "Permission denied"

Vérifiez que la fonction SQL a `SECURITY DEFINER` :

```sql
ALTER FUNCTION public.notify_invitation_email() SECURITY DEFINER;
```

### Emails en spam

1. **Configurer SPF/DKIM** sur votre domaine
2. **Utiliser un domaine vérifié** (pas @gmail.com)
3. **Éviter les mots spam** dans le sujet/contenu
4. **Ajouter un lien de désinscription**

## 💰 Coûts Estimés

### Développement (Gratuit)
- Resend : 3000 emails/mois gratuits ✅
- Supabase : Plan gratuit ✅

### Production (Exemple : 1000 utilisateurs)

**Scénario** : 10 invitations/jour = 300/mois

- **Resend** : Plan gratuit ✅ (< 3000)
- **Supabase** : Plan gratuit ou Pro ($25/mois)

**Scénario** : 100 invitations/jour = 3000/mois

- **Resend** : $20/mois (jusqu'à 50k emails)
- **Supabase** : Plan Pro ($25/mois)

**Total** : ~$45/mois pour 3000 invitations

## 🔐 Sécurité

### Best Practices

1. **Ne jamais exposer** les clés API dans le code frontend
2. **Utiliser les secrets** Supabase pour les clés
3. **Valider les données** avant envoi
4. **Rate limiting** pour éviter les abus
5. **Logs** pour tracer les envois

### Protection Anti-Spam

```typescript
// Dans la Edge Function, ajouter :
const MAX_EMAILS_PER_HOUR = 10;

// Vérifier le nombre d'invitations récentes
const recentInvitations = await supabase
  .from('project_invitations')
  .select('count')
  .eq('invited_by', userId)
  .gte('invited_at', new Date(Date.now() - 3600000).toISOString());

if (recentInvitations.count > MAX_EMAILS_PER_HOUR) {
  throw new Error('Too many invitations sent');
}
```

## 📚 Ressources

- [Resend Documentation](https://resend.com/docs)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [pg_net Extension](https://github.com/supabase/pg_net)
- [Email Best Practices](https://sendgrid.com/blog/email-best-practices/)

## ✅ Checklist de Déploiement

- [ ] Compte Resend créé
- [ ] Clé API Resend générée
- [ ] Domaine vérifié (production)
- [ ] Supabase CLI installé
- [ ] Projet Supabase lié
- [ ] Secrets configurés (RESEND_API_KEY, APP_URL)
- [ ] Edge Function déployée
- [ ] Extension pg_net activée
- [ ] Migration appliquée
- [ ] Test d'envoi réussi
- [ ] Monitoring configuré

---

**Version** : 1.0.0
**Date** : 2025-12-12
**Auteur** : TaskManager Team
