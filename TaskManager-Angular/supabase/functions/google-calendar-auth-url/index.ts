// Supabase Edge Function: Generate Google OAuth 2.0 authorization URL
// Deploy with: supabase functions deploy google-calendar-auth-url

import {
  corsHeaders,
  createSupabaseAdmin,
  authenticateUser,
  createStateJwt,
  requireEnv,
  validateMethod,
  errorResponse,
} from "../_shared/google-auth-helpers.ts"

Deno.serve(async (req) => {
  const methodError = validateMethod(req, 'POST')
  if (methodError) return methodError

  try {
    const GOOGLE_CLIENT_ID = requireEnv('GOOGLE_CLIENT_ID')
    const GOOGLE_REDIRECT_URI = requireEnv('GOOGLE_REDIRECT_URI')
    const SUPABASE_JWT_SECRET = Deno.env.get('SUPABASE_JWT_SECRET') ?? requireEnv('JWT_SECRET')

    const supabaseAdmin = createSupabaseAdmin()
    const user = await authenticateUser(req, supabaseAdmin)

    // Create a signed state parameter containing user_id
    const stateSecret = `gcal-state-${SUPABASE_JWT_SECRET}`
    const state = await createStateJwt(user.id, stateSecret)

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly',
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
    return errorResponse(500, 'Failed to generate authorization URL', error)
  }
})
