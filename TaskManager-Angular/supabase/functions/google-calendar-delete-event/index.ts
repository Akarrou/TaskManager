// Supabase Edge Function: Delete event from Google Calendar
// Deploy with: supabase functions deploy google-calendar-delete-event

import {
  corsHeaders,
  createSupabaseAdmin,
  authenticateUser,
  getValidAccessToken,
  GoogleCalendarConnection,
  validateMethod,
  errorResponse,
} from "../_shared/google-auth-helpers.ts"

Deno.serve(async (req) => {
  const methodError = validateMethod(req, 'POST')
  if (methodError) return methodError

  try {
    const supabaseAdmin = createSupabaseAdmin()
    const user = await authenticateUser(req, supabaseAdmin)

    const { sync_config_id, kodo_database_id, kodo_row_id } = await req.json()

    if (!sync_config_id || !kodo_database_id || !kodo_row_id) {
      return errorResponse(400, 'Missing required parameters')
    }

    // C10: Get sync config with user_id check via join
    const { data: syncConfig, error: configError } = await supabaseAdmin
      .from('google_calendar_sync_config')
      .select('*, google_calendar_connections!inner(user_id)')
      .eq('id', sync_config_id)
      .eq('google_calendar_connections.user_id', user.id)
      .single()

    if (configError || !syncConfig) {
      return errorResponse(404, 'Sync configuration not found')
    }

    // Get connection
    const { data: connection, error: connError } = await supabaseAdmin
      .from('google_calendar_connections')
      .select('*')
      .eq('id', syncConfig.connection_id)
      .eq('user_id', user.id)
      .single()

    if (connError || !connection) {
      return errorResponse(404, 'Google Calendar connection not found')
    }

    // Look up mapping
    const { data: mapping } = await supabaseAdmin
      .from('google_calendar_event_mapping')
      .select('*')
      .eq('sync_config_id', sync_config_id)
      .eq('kodo_row_id', kodo_row_id)
      .maybeSingle()

    if (mapping) {
      const accessToken = await getValidAccessToken(
        connection as GoogleCalendarConnection,
        supabaseAdmin
      )

      const calendarId = encodeURIComponent(syncConfig.google_calendar_id)
      const eventId = encodeURIComponent(mapping.google_event_id)

      // Delete from Google Calendar
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )

      // 404/410 means event already deleted on Google side - that's fine
      if (!response.ok && response.status !== 404 && response.status !== 410) {
        const errorText = await response.text()
        throw new Error(`Failed to delete Google event: ${errorText}`)
      }

      // I12: Delete mapping record with error capture
      const { error: mappingDeleteError } = await supabaseAdmin
        .from('google_calendar_event_mapping')
        .delete()
        .eq('id', mapping.id)

      if (mappingDeleteError) {
        console.error('Failed to delete event mapping:', mappingDeleteError)
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return errorResponse(500, 'Failed to delete event', error)
  }
})
