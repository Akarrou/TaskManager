// Supabase Edge Function: Disconnect Google Calendar
// Deploy with: supabase functions deploy google-calendar-disconnect

import {
  corsHeaders,
  createSupabaseAdmin,
  authenticateUser,
  getConnectionForUser,
  decryptToken,
  validateMethod,
  errorResponse,
} from "../_shared/google-auth-helpers.ts"

Deno.serve(async (req) => {
  const methodError = validateMethod(req, 'POST')
  if (methodError) return methodError

  try {
    const supabaseAdmin = createSupabaseAdmin()
    const user = await authenticateUser(req, supabaseAdmin)
    const connection = await getConnectionForUser(user.id, supabaseAdmin)

    // Decrypt refresh token and attempt to revoke it (revoking the refresh token
    // also invalidates all associated access tokens)
    const refreshToken = await decryptToken(connection.refresh_token_encrypted)
    await fetch(`https://oauth2.googleapis.com/revoke?token=${refreshToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).catch(() => { /* Best effort - token revocation is non-critical */ })

    // Delete connection (cascade deletes configs, mappings, logs)
    const { error: deleteError } = await supabaseAdmin
      .from('google_calendar_connections')
      .delete()
      .eq('id', connection.id)

    if (deleteError) {
      throw new Error(`Failed to delete connection: ${deleteError.message}`)
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return errorResponse(500, 'Failed to disconnect', error)
  }
})
