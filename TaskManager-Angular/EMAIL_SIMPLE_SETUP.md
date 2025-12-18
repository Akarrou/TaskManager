# Configuration Simplifiée - Emails d'Invitation

## 🎯 Vue d'ensemble

Guide simplifié pour mettre en place l'envoi d'emails **sans Edge Functions** en utilisant directement un service SMTP.

Cette méthode est **plus simple** mais **moins scalable** que la solution avec Edge Functions.

## ⚡ Solution Rapide : Resend Direct (depuis l'application)

### Avantages
- ✅ Pas besoin d'Edge Functions
- ✅ Configuration en 5 minutes
- ✅ Parfait pour débuter
- ✅ Fonctionne en local et en production

### Inconvénients
- ❌ Clé API exposée côté client (utiliser avec proxy)
- ❌ Moins scalable
- ❌ Pas de retry automatique

## 📋 Configuration

### Étape 1 : Créer un compte Resend

1. [resend.com](https://resend.com) → Sign Up
2. Créez une clé API
3. Copiez la clé : `re_xxxxxxxxxxxxx`

### Étape 2 : Créer un Service Backend Proxy

Pour éviter d'exposer la clé API, créez une Edge Function simple :

```typescript
// supabase/functions/send-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!

serve(async (req) => {
  const { to, subject, html } = await req.json()

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: 'TaskManager <onboarding@resend.dev>',
      to: [to],
      subject,
      html
    })
  })

  const result = await response.json()
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

### Étape 3 : Déployer la fonction

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx
supabase functions deploy send-email
```

### Étape 4 : Créer un Service Angular

```typescript
// src/app/core/services/email.service.ts
import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { from, map } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  private supabase = inject(SupabaseService);

  sendInvitationEmail(params: {
    to: string;
    projectName: string;
    invitedByEmail: string;
    role: string;
    invitationLink: string;
  }) {
    const html = this.generateInvitationHtml(params);

    return from(
      this.supabase.client.functions.invoke('send-email', {
        body: {
          to: params.to,
          subject: `Invitation au projet "${params.projectName}"`,
          html
        }
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      })
    );
  }

  private generateInvitationHtml(params: {
    projectName: string;
    invitedByEmail: string;
    role: string;
    invitationLink: string;
  }): string {
    const roleLabels: Record<string, string> = {
      'admin': 'Administrateur',
      'member': 'Membre',
      'viewer': 'Lecteur'
    };

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #667eea; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f8f9fa; }
            .button {
              display: inline-block;
              padding: 12px 24px;
              background: #667eea;
              color: white;
              text-decoration: none;
              border-radius: 4px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📋 Invitation à un projet</h1>
            </div>
            <div class="content">
              <p><strong>${params.invitedByEmail}</strong> vous invite à rejoindre :</p>
              <h2>${params.projectName}</h2>
              <p>Rôle : <strong>${roleLabels[params.role]}</strong></p>
              <a href="${params.invitationLink}" class="button">Accepter l'invitation</a>
              <p style="font-size: 12px; color: #666;">
                Ou copiez ce lien : ${params.invitationLink}
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}
```

### Étape 5 : Utiliser dans le Service d'Invitations

```typescript
// Modifier project-invitation.service.ts
import { EmailService } from '../../../core/services/email.service';

@Injectable({ providedIn: 'root' })
export class ProjectInvitationService {
  private emailService = inject(EmailService);

  createInvitation(invitationData: CreateInvitationDto) {
    return from(
      this.supabase.client
        .from('project_invitations')
        .insert(invitationData)
        .select()
        .single()
    ).pipe(
      switchMap(response => {
        if (response.error) {
          throw response.error;
        }

        const invitation = response.data as ProjectInvitation;

        // Envoyer l'email
        return this.emailService.sendInvitationEmail({
          to: invitation.email,
          projectName: 'Nom du projet', // À récupérer
          invitedByEmail: 'email@inviteur.com', // À récupérer
          role: invitation.role,
          invitationLink: this.generateInvitationLink(invitation.token)
        }).pipe(
          map(() => invitation), // Retourner l'invitation
          catchError(emailError => {
            console.error('Email sending failed:', emailError);
            // L'invitation est créée même si l'email échoue
            return of(invitation);
          })
        );
      })
    );
  }
}
```

## 🚀 Méthode Ultra-Simple : Mailto (Temporaire)

Pour **tester rapidement** sans configuration :

```typescript
// Dans inline-invitations.component.ts
sendInvitationViaMailto(email: string, token: string) {
  const link = this.generateInvitationLink(token);
  const subject = encodeURIComponent('Invitation au projet');
  const body = encodeURIComponent(`
Bonjour,

Vous êtes invité à rejoindre un projet sur TaskManager.

Cliquez sur ce lien pour accepter :
${link}

Ce lien expire dans 7 jours.
  `);

  const mailtoLink = `mailto:${email}?subject=${subject}&body=${body}`;
  window.location.href = mailtoLink;
}
```

**Usage** :
```html
<button (click)="sendInvitationViaMailto(invite.email, invite.token)">
  Envoyer par email
</button>
```

⚠️ **Limitations** :
- Ouvre le client email de l'utilisateur
- Nécessite une action manuelle
- Pas automatique

## 📧 Alternative : SMTP Direct (NodeMailer)

Si vous préférez utiliser un serveur SMTP :

```typescript
// supabase/functions/send-email-smtp/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { SMTPClient } from "https://deno.land/x/denomailer/mod.ts"

serve(async (req) => {
  const { to, subject, html } = await req.json()

  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: {
        username: Deno.env.get('SMTP_USER')!,
        password: Deno.env.get('SMTP_PASS')!
      }
    }
  })

  await client.send({
    from: "TaskManager <noreply@yourdomain.com>",
    to: to,
    subject: subject,
    html: html
  })

  await client.close()

  return new Response(JSON.stringify({ success: true }))
})
```

**Configuration Gmail** :
1. Activez l'authentification à 2 facteurs
2. Créez un mot de passe d'application
3. Utilisez ce mot de passe dans `SMTP_PASS`

## ⚡ Comparaison des Solutions

| Solution | Complexité | Coût | Scalabilité | Automatique |
|----------|-----------|------|-------------|-------------|
| **Resend + Edge Function** | ⭐⭐⭐ | Gratuit → $20 | ✅✅✅ | ✅ |
| **Resend Direct** | ⭐⭐ | Gratuit → $20 | ✅✅ | ✅ |
| **SMTP (Gmail)** | ⭐⭐⭐ | Gratuit | ✅ | ✅ |
| **Mailto** | ⭐ | Gratuit | ❌ | ❌ |

## 🎯 Recommandation

### Pour Débuter (Développement)
1. **Mailto** pour tester rapidement
2. **Resend Direct** pour un prototype fonctionnel

### Pour la Production
1. **Resend + Edge Function** (solution complète)
2. **SendGrid** si vous avez déjà un compte

## ✅ Checklist Simple

- [ ] Compte Resend créé
- [ ] Clé API récupérée
- [ ] Edge Function `send-email` créée
- [ ] Service `EmailService` créé
- [ ] Intégré dans `ProjectInvitationService`
- [ ] Test envoi réussi

## 🐛 Debug Rapide

```typescript
// Test direct dans la console
emailService.sendInvitationEmail({
  to: 'test@example.com',
  projectName: 'Test Project',
  invitedByEmail: 'owner@example.com',
  role: 'member',
  invitationLink: 'http://localhost:4010/invitation/test-token'
}).subscribe({
  next: (result) => console.log('Email sent!', result),
  error: (error) => console.error('Error:', error)
});
```

---

**Version** : 1.0.0
**Difficulté** : ⭐⭐ Facile
**Temps de setup** : 15-30 minutes
