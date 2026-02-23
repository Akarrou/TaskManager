// Supabase Edge Function: Push Kodo event to Google Calendar
// Deploy with: supabase functions deploy google-calendar-push-event

import {
  corsHeaders,
  createSupabaseAdmin,
  authenticateUser,
  getValidAccessToken,
  GoogleCalendarConnection,
  validateMethod,
  errorResponse,
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
  add_google_meet?: boolean
}

Deno.serve(async (req) => {
  const methodError = validateMethod(req, 'POST')
  if (methodError) return methodError

  try {
    const supabaseAdmin = createSupabaseAdmin()
    const user = await authenticateUser(req, supabaseAdmin)

    const { sync_config_id, kodo_database_id, kodo_row_id, event_data } = await req.json()

    if (!sync_config_id || !kodo_database_id || !kodo_row_id || !event_data) {
      return errorResponse(400, 'Missing required parameters')
    }

    const eventData = event_data as EventData

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
      const startDate = eventData.start_date.split('T')[0]
      // M5: Google uses exclusive end date for all-day events, so add 1 day
      const endDateObj = new Date(eventData.end_date.split('T')[0])
      endDateObj.setDate(endDateObj.getDate() + 1)
      const endDate = endDateObj.toISOString().split('T')[0]
      googleEvent.start = { date: startDate }
      googleEvent.end = { date: endDate }
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

    // Add Google Meet conference data if requested
    if (eventData.add_google_meet) {
      googleEvent.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
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
    // Add conferenceDataVersion=1 when Meet is requested or already exists (to preserve it on updates)
    const needsConferenceParam = eventData.add_google_meet || !!existingMapping
    const conferenceParam = needsConferenceParam ? '?conferenceDataVersion=1' : ''
    let googleEventId: string
    let meetLink: string | null = null

    if (existingMapping) {
      // Update existing Google event — don't send createRequest if Meet already exists
      const eventId = encodeURIComponent(existingMapping.google_event_id)
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}${conferenceParam}`,
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
      meetLink = extractMeetLink(updatedEvent)

      // Update mapping - capture error
      const { error: mappingError } = await supabaseAdmin
        .from('google_calendar_event_mapping')
        .update({
          kodo_updated_at: new Date().toISOString(),
          google_updated_at: new Date().toISOString(),
          sync_status: 'synced',
        })
        .eq('id', existingMapping.id)

      if (mappingError) {
        console.error('Failed to update event mapping:', mappingError)
      }
    } else {
      // Create new Google event
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events${conferenceParam}`,
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
      meetLink = extractMeetLink(createdEvent)

      // C9: Create mapping with upsert to handle race conditions
      const { error: mappingError } = await supabaseAdmin
        .from('google_calendar_event_mapping')
        .upsert({
          sync_config_id,
          google_event_id: googleEventId,
          google_calendar_id: syncConfig.google_calendar_id,
          kodo_database_id,
          kodo_row_id,
          kodo_updated_at: new Date().toISOString(),
          google_updated_at: new Date().toISOString(),
          sync_status: 'synced',
        }, { onConflict: 'kodo_database_id,kodo_row_id' })

      if (mappingError) {
        console.error('Failed to create event mapping:', mappingError)
      }
    }

    // Store Meet link in Kodo database if available
    if (meetLink) {
      await storeMeetLinkInKodo(supabaseAdmin, kodo_database_id, kodo_row_id, meetLink)
    }

    return new Response(
      JSON.stringify({ success: true, google_event_id: googleEventId, meet_link: meetLink }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return errorResponse(500, 'Failed to push event', error)
  }
})

// =============================================================================
// Helper Functions
// =============================================================================

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

/**
 * Extract Meet link from a Google Calendar event response.
 * Checks conferenceData.entryPoints first, then hangoutLink as fallback.
 */
function extractMeetLink(event: Record<string, unknown>): string | null {
  const conf = event.conferenceData as {
    entryPoints?: Array<{ entryPointType: string; uri: string }>
  } | undefined
  const videoEntry = conf?.entryPoints?.find(
    (ep) => ep.entryPointType === 'video'
  )
  return videoEntry?.uri ?? (event.hangoutLink as string) ?? null
}

/**
 * Store the Meet link in the Kodo database row's "Google Meet" column.
 * If the column doesn't exist yet (older databases), it is auto-created.
 */
async function storeMeetLinkInKodo(
  supabaseAdmin: SupabaseAdmin,
  kodoDatabaseId: string,
  kodoRowId: string,
  meetLink: string
): Promise<void> {
  try {
    // Get database metadata to find the "Google Meet" column
    const { data: dbMeta, error: metaError } = await supabaseAdmin
      .from('document_databases')
      .select('table_name, config')
      .eq('id', kodoDatabaseId)
      .single()

    if (metaError || !dbMeta) {
      console.warn('Could not find database metadata for Meet link storage')
      return
    }

    const config = dbMeta.config as { columns: Array<{ id: string; name: string; order?: number; [k: string]: unknown }> }
    let meetCol = config.columns?.find((c) => c.name === 'Google Meet')

    // Auto-create the column if it doesn't exist
    if (!meetCol) {
      const newColId = crypto.randomUUID()
      const maxOrder = Math.max(...(config.columns || []).map(c => (c.order as number) ?? 0), 0)

      // 1. Add physical column FIRST
      const physColName = `col_${newColId.replace(/-/g, '_')}`
      const tableName = dbMeta.table_name as string
      const { data: addResult } = await supabaseAdmin.rpc('add_column_to_table', {
        table_name: tableName,
        column_name: physColName,
        column_type: 'TEXT',
      })

      if (addResult && !(addResult as Record<string, unknown>).success) {
        console.error('Failed to add physical Meet column:', addResult)
        return
      }

      // Notify PostgREST to reload its schema cache
      await supabaseAdmin.rpc('reload_schema_cache')
      await new Promise(resolve => setTimeout(resolve, 500))

      // 2. Update config JSON AFTER physical column exists
      const newColumn = {
        id: newColId,
        name: 'Google Meet',
        type: 'url',
        visible: true,
        readonly: true,
        order: maxOrder + 1,
        width: 250,
        color: 'green',
      }

      config.columns.push(newColumn)

      const { error: configError } = await supabaseAdmin
        .from('document_databases')
        .update({ config })
        .eq('id', kodoDatabaseId)

      if (configError) {
        console.error('Failed to update database config for Meet column:', configError)
        return
      }

      console.log(`Auto-created "Google Meet" column in table "${tableName}"`)
      meetCol = { id: newColId, name: 'Google Meet' }
    }

    const colName = `col_${meetCol.id.replace(/-/g, '_')}`
    const { error: updateError } = await supabaseAdmin
      .from(dbMeta.table_name as string)
      .update({ [colName]: meetLink })
      .eq('id', kodoRowId)

    if (updateError) {
      console.error('Failed to store Meet link in Kodo row:', updateError)
    }
  } catch (err) {
    console.error('Error storing Meet link in Kodo:', err)
  }
}
