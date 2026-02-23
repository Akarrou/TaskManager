// Supabase Edge Function: Delete event from Google Calendar
// Deploy with: supabase functions deploy google-calendar-delete-event

import {
  corsHeaders,
  createSupabaseAdmin,
  authenticateUser,
  getValidAccessToken,
  GoogleCalendarConnection,
} from "../_shared/google-auth-helpers.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createSupabaseAdmin()
    const user = await authenticateUser(req, supabaseAdmin)

    const { sync_config_id, kodo_database_id, kodo_row_id } = await req.json()

    if (!sync_config_id || !kodo_database_id || !kodo_row_id) {
      throw new Error('Missing required parameters')
    }

    // Get sync config
    const { data: syncConfig, error: configError } = await supabaseAdmin
      .from('google_calendar_sync_config')
      .select('*')
      .eq('id', sync_config_id)
      .single()

    if (configError || !syncConfig) {
      throw new Error('Sync configuration not found')
    }

    // Get connection
    const { data: connection, error: connError } = await supabaseAdmin
      .from('google_calendar_connections')
      .select('*')
      .eq('id', syncConfig.connection_id)
      .eq('user_id', user.id)
      .single()

    if (connError || !connection) {
      throw new Error('Google Calendar connection not found')
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

      // Delete mapping record
      await supabaseAdmin
        .from('google_calendar_event_mapping')
        .delete()
        .eq('id', mapping.id)
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error deleting event:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
