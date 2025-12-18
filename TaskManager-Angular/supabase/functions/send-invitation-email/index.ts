// Supabase Edge Function pour envoyer des emails d'invitation
// Déployez avec: supabase functions deploy send-invitation-email

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL') || 'http://localhost:4010'

interface InvitationEmailData {
  email: string
  project_name: string
  invited_by_email: string
  role: string
  token: string
}

serve(async (req) => {
  try {
    const { email, project_name, invited_by_email, role, token }: InvitationEmailData = await req.json()

    // Générer le lien d'invitation
    const invitationLink = `${APP_URL}/invitation/${token}`

    // Traduction du rôle
    const roleLabels: Record<string, string> = {
      'admin': 'Administrateur',
      'member': 'Membre',
      'viewer': 'Lecteur'
    }
    const roleLabel = roleLabels[role] || role

    // Template HTML de l'email
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background: #ffffff;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              padding: 30px;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 32px;
              font-weight: bold;
              color: #667eea;
              margin-bottom: 10px;
            }
            .title {
              font-size: 24px;
              font-weight: 600;
              color: #1a1a1a;
              margin-bottom: 10px;
            }
            .message {
              font-size: 16px;
              color: #666;
              margin-bottom: 20px;
            }
            .project-info {
              background: #f8f9fa;
              border-left: 4px solid #667eea;
              padding: 15px;
              margin: 20px 0;
            }
            .project-name {
              font-size: 18px;
              font-weight: 600;
              color: #1a1a1a;
              margin-bottom: 5px;
            }
            .role {
              display: inline-block;
              padding: 4px 12px;
              border-radius: 12px;
              font-size: 14px;
              font-weight: 600;
            }
            .role-admin { background: #e3f2fd; color: #1976d2; }
            .role-member { background: #fff3e0; color: #f57c00; }
            .role-viewer { background: #e0e0e0; color: #666; }
            .button {
              display: inline-block;
              padding: 14px 28px;
              background: #667eea;
              color: white;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 600;
              margin: 20px 0;
            }
            .button:hover {
              background: #5568d3;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e0e0e0;
              text-align: center;
              font-size: 14px;
              color: #999;
            }
            .link {
              color: #667eea;
              word-break: break-all;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">📋 TaskManager</div>
              <h1 class="title">Invitation à rejoindre un projet</h1>
            </div>

            <p class="message">
              <strong>${invited_by_email}</strong> vous invite à rejoindre un projet sur TaskManager.
            </p>

            <div class="project-info">
              <div class="project-name">📁 ${project_name}</div>
              <p style="margin: 10px 0;">
                Vous serez ajouté avec le rôle :
                <span class="role role-${role}">${roleLabel}</span>
              </p>
            </div>

            <div style="text-align: center;">
              <a href="${invitationLink}" class="button">
                ✨ Accepter l'invitation
              </a>
            </div>

            <p style="font-size: 14px; color: #666; margin-top: 20px;">
              Ou copiez ce lien dans votre navigateur :<br>
              <a href="${invitationLink}" class="link">${invitationLink}</a>
            </p>

            <div class="footer">
              <p>Cette invitation expire dans 7 jours.</p>
              <p>Si vous n'avez pas demandé cette invitation, vous pouvez ignorer cet email.</p>
            </div>
          </div>
        </body>
      </html>
    `

    // Envoyer l'email avec Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'TaskManager <noreply@yourdomain.com>',
        to: [email],
        subject: `Invitation au projet "${project_name}"`,
        html: htmlContent
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Resend API error: ${error}`)
    }

    const result = await response.json()

    return new Response(
      JSON.stringify({ success: true, messageId: result.id }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Error sending invitation email:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
