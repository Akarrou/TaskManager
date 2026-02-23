// Supabase Edge Function: Generate Google OAuth 2.0 authorization URL
// Deploy with: supabase functions deploy google-calendar-auth-url

import {
  corsHeaders,
  createSupabaseAdmin,
  authenticateUser,
  createStateJwt,
} from "../_shared/google-auth-helpers.ts"

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI')!
const SUPABASE_JWT_SECRET = Deno.env.get('SUPABASE_JWT_SECRET') ?? Deno.env.get('JWT_SECRET')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createSupabaseAdmin()
    const user = await authenticateUser(req, supabaseAdmin)

    // Create a signed state parameter containing user_id
    const stateSecret = `gcal-state-${SUPABASE_JWT_SECRET}`
    const state = await createStateJwt(user.id, stateSecret)

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
      access_type: 'offline',
      prompt: 'consent',
      state,
    })

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

    return new Response(
      JSON.stringify({ url: authUrl }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error generating auth URL:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      }
    )
  }
})
