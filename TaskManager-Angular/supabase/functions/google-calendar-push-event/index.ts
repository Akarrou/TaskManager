// Supabase Edge Function: Push Kodo event to Google Calendar
// Deploy with: supabase functions deploy google-calendar-push-event

import {
  corsHeaders,
  createSupabaseAdmin,
  authenticateUser,
  getValidAccessToken,
  GoogleCalendarConnection,
} from "../_shared/google-auth-helpers.ts"

interface EventData {
  title: string
  description?: string
  start_date: string
  end_date: string
  all_day?: boolean
  location?: string
  recurrence?: string
  category?: string
  linked_items?: unknown[]
  event_number?: number
  reminders?: Array<{ method: string; minutes: number }>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createSupabaseAdmin()
    const user = await authenticateUser(req, supabaseAdmin)

    const { sync_config_id, kodo_database_id, kodo_row_id, event_data } = await req.json()

    if (!sync_config_id || !kodo_database_id || !kodo_row_id || !event_data) {
      throw new Error('Missing required parameters')
    }

    const eventData = event_data as EventData

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

    const accessToken = await getValidAccessToken(
      connection as GoogleCalendarConnection,
      supabaseAdmin
    )

    // Build Google Calendar event object
    const googleEvent: Record<string, unknown> = {
      summary: eventData.title,
      description: eventData.description ?? '',
    }

    // Date handling
    if (eventData.all_day) {
      googleEvent.start = { date: eventData.start_date.split('T')[0] }
      googleEvent.end = { date: eventData.end_date.split('T')[0] }
    } else {
      googleEvent.start = { dateTime: eventData.start_date }
      googleEvent.end = { dateTime: eventData.end_date }
    }

    if (eventData.location) {
      googleEvent.location = eventData.location
    }

    if (eventData.recurrence) {
      googleEvent.recurrence = [eventData.recurrence]
    }

    if (eventData.reminders && eventData.reminders.length > 0) {
      googleEvent.reminders = {
        useDefault: false,
        overrides: eventData.reminders,
      }
    }

    // Store Kodo metadata in extended properties
    googleEvent.extendedProperties = {
      private: {
        kodoCategory: eventData.category ?? '',
        kodoLinkedItems: JSON.stringify(eventData.linked_items ?? []),
        kodoEventNumber: String(eventData.event_number ?? ''),
      },
    }

    // Check existing mapping
    const { data: existingMapping } = await supabaseAdmin
      .from('google_calendar_event_mapping')
      .select('*')
      .eq('sync_config_id', sync_config_id)
      .eq('kodo_row_id', kodo_row_id)
      .maybeSingle()

    const calendarId = encodeURIComponent(syncConfig.google_calendar_id)
    let googleEventId: string

    if (existingMapping) {
      // Update existing Google event
      const eventId = encodeURIComponent(existingMapping.google_event_id)
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(googleEvent),
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to update Google event: ${errorText}`)
      }

      const updatedEvent = await response.json()
      googleEventId = updatedEvent.id

      // Update mapping
      await supabaseAdmin
        .from('google_calendar_event_mapping')
        .update({
          kodo_updated_at: new Date().toISOString(),
          google_updated_at: new Date().toISOString(),
          sync_status: 'synced',
        })
        .eq('id', existingMapping.id)
    } else {
      // Create new Google event
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(googleEvent),
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to create Google event: ${errorText}`)
      }

      const createdEvent = await response.json()
      googleEventId = createdEvent.id

      // Create mapping
      await supabaseAdmin
        .from('google_calendar_event_mapping')
        .insert({
          sync_config_id,
          google_event_id: googleEventId,
          google_calendar_id: syncConfig.google_calendar_id,
          kodo_database_id,
          kodo_row_id,
          kodo_updated_at: new Date().toISOString(),
          google_updated_at: new Date().toISOString(),
          sync_status: 'synced',
        })
    }

    return new Response(
      JSON.stringify({ success: true, google_event_id: googleEventId }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error pushing event:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
