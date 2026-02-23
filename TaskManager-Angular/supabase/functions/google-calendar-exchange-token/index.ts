// Supabase Edge Function: Exchange OAuth code for Google tokens
// Deploy with: supabase functions deploy google-calendar-exchange-token

import {
  corsHeaders,
  createSupabaseAdmin,
  verifyStateJwt,
  encryptToken,
  requireEnv,
  validateMethod,
  errorResponse,
} from "../_shared/google-auth-helpers.ts"

Deno.serve(async (req) => {
  const methodError = validateMethod(req, 'POST')
  if (methodError) return methodError

  try {
    const GOOGLE_CLIENT_ID = requireEnv('GOOGLE_CLIENT_ID')
    const GOOGLE_CLIENT_SECRET = requireEnv('GOOGLE_CLIENT_SECRET')
    const GOOGLE_REDIRECT_URI = requireEnv('GOOGLE_REDIRECT_URI')
    const SUPABASE_JWT_SECRET = Deno.env.get('SUPABASE_JWT_SECRET') ?? requireEnv('JWT_SECRET')

    const { code, state } = await req.json()

    if (!code || !state) {
      return errorResponse(400, 'Missing code or state parameter')
    }

    // Verify state JWT to get user_id
    const stateSecret = `gcal-state-${SUPABASE_JWT_SECRET}`
    const { user_id } = await verifyStateJwt(state, stateSecret)

    // C8: Validate user_id from state
    if (!user_id) {
      return errorResponse(400, 'Invalid state: missing user identifier')
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      throw new Error(`Token exchange failed: ${errorText}`)
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in } = tokenData

    if (!access_token || !refresh_token) {
      throw new Error('Missing tokens in Google response')
    }

    // Get Google user info
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    if (!userInfoResponse.ok) {
      throw new Error('Failed to get Google user info')
    }

    const userInfo = await userInfoResponse.json()

    if (!userInfo.email || typeof userInfo.email !== 'string') {
      throw new Error('Google user info did not include an email address')
    }

    const googleEmail: string = userInfo.email

    // Encrypt tokens
    const encryptedAccessToken = await encryptToken(access_token)
    const encryptedRefreshToken = await encryptToken(refresh_token)
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000).toISOString()

    // Upsert connection
    const supabaseAdmin = createSupabaseAdmin()

    const { error: upsertError } = await supabaseAdmin
      .from('google_calendar_connections')
      .upsert(
        {
          user_id,
          google_email: googleEmail,
          access_token_encrypted: encryptedAccessToken,
          refresh_token_encrypted: encryptedRefreshToken,
          token_expires_at: tokenExpiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (upsertError) {
      throw new Error(`Failed to save connection: ${upsertError.message}`)
    }

    return new Response(
      JSON.stringify({ success: true, email: googleEmail }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return errorResponse(400, 'Token exchange failed', error)
  }
})
