// Supabase Edge Function: Sync Google Calendar events to Kodo
// Deploy with: supabase functions deploy google-calendar-sync

import {
  corsHeaders,
  createSupabaseAdmin,
  authenticateUser,
  getValidAccessToken,
  GoogleCalendarConnection,
  validateMethod,
  errorResponse,
} from "../_shared/google-auth-helpers.ts"

interface SyncConfig {
  id: string
  connection_id: string
  google_calendar_id: string
  kodo_database_id: string
  sync_direction: string
  sync_token: string | null
  last_sync_at: string | null
}

interface SyncResult {
  events_created: number
  events_updated: number
  events_deleted: number
  events_skipped: number
  errors: Array<{ event_id: string; message: string; timestamp: string }>
  status: 'success' | 'partial' | 'error'
  sync_token: string | null
}

Deno.serve(async (req) => {
  const methodError = validateMethod(req, 'POST')
  if (methodError) return methodError

  try {
    const supabaseAdmin = createSupabaseAdmin()
    const user = await authenticateUser(req, supabaseAdmin)

    const { sync_config_id } = await req.json()
    if (!sync_config_id) {
      return errorResponse(400, 'Missing sync_config_id')
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

    const config = syncConfig as unknown as SyncConfig

    // Get connection
    const { data: connection, error: connError } = await supabaseAdmin
      .from('google_calendar_connections')
      .select('*')
      .eq('id', config.connection_id)
      .eq('user_id', user.id)
      .single()

    if (connError || !connection) {
      return errorResponse(404, 'Google Calendar connection not found')
    }

    const accessToken = await getValidAccessToken(
      connection as GoogleCalendarConnection,
      supabaseAdmin
    )

    // Build request parameters
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
    })

    if (config.sync_token) {
      // Incremental sync
      params.set('syncToken', config.sync_token)
    } else {
      // Full sync: 3 months ago to 1 year future
      const timeMin = new Date()
      timeMin.setMonth(timeMin.getMonth() - 3)
      const timeMax = new Date()
      timeMax.setFullYear(timeMax.getFullYear() + 1)

      params.set('timeMin', timeMin.toISOString())
      params.set('timeMax', timeMax.toISOString())
    }

    const calendarId = encodeURIComponent(config.google_calendar_id)
    let nextPageToken: string | undefined
    let nextSyncToken: string | null = null

    const result: SyncResult = {
      events_created: 0,
      events_updated: 0,
      events_deleted: 0,
      events_skipped: 0,
      errors: [],
      status: 'success',
      sync_token: null,
    }

    // Paginate through all events
    do {
      if (nextPageToken) {
        params.set('pageToken', nextPageToken)
      }

      const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params.toString()}`
      const eventsResponse = await fetch(eventsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!eventsResponse.ok) {
        const errorText = await eventsResponse.text()

        // If sync token is invalid, clear it and request a full sync
        if (eventsResponse.status === 410) {
          await supabaseAdmin
            .from('google_calendar_sync_config')
            .update({ sync_token: null })
            .eq('id', config.id)

          throw new Error('Sync token expired. Please trigger a full sync.')
        }

        throw new Error(`Google Calendar API error: ${errorText}`)
      }

      const eventsData = await eventsResponse.json()
      const events: Record<string, unknown>[] = eventsData.items ?? []
      nextPageToken = eventsData.nextPageToken
      nextSyncToken = eventsData.nextSyncToken ?? null

      // Process each event
      for (const event of events) {
        try {
          await processEvent(event, config, supabaseAdmin, result)
        } catch (eventError) {
          result.errors.push({
            event_id: String(event.id ?? ''),
            message: (eventError as Error).message,
            timestamp: new Date().toISOString(),
          })
        }
      }
    } while (nextPageToken)

    // Save sync token and update last sync timestamp
    await supabaseAdmin
      .from('google_calendar_sync_config')
      .update({
        sync_token: nextSyncToken,
        last_sync_at: new Date().toISOString(),
      })
      .eq('id', config.id)

    result.sync_token = nextSyncToken

    // Set final status
    if (result.errors.length > 0) {
      result.status = 'partial'
    }

    // M7: Log sync result with completed_at
    await supabaseAdmin.from('google_calendar_sync_log').insert({
      sync_config_id: config.id,
      sync_type: config.sync_token ? 'incremental' : 'full',
      direction: 'from_google',
      events_created: result.events_created,
      events_updated: result.events_updated,
      events_deleted: result.events_deleted,
      errors: result.errors.length > 0 ? JSON.stringify(result.errors) : '[]',
      status: result.status,
      completed_at: new Date().toISOString(),
    })

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return errorResponse(500, 'Failed to sync calendar', error)
  }
})

async function processEvent(
  event: Record<string, unknown>,
  config: SyncConfig,
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  result: SyncResult
): Promise<void> {
  const googleEventId = event.id as string

  // Check existing mapping
  const { data: existingMapping } = await supabaseAdmin
    .from('google_calendar_event_mapping')
    .select('*')
    .eq('sync_config_id', config.id)
    .eq('google_event_id', googleEventId)
    .maybeSingle()

  // Handle cancelled events
  if (event.status === 'cancelled') {
    if (existingMapping) {
      // I12: Capture errors from delete operations
      const { error: rowDeleteError } = await supabaseAdmin
        .from('database_rows')
        .delete()
        .eq('id', existingMapping.kodo_row_id)

      if (rowDeleteError) {
        console.error('Failed to delete database row:', rowDeleteError)
      }

      const { error: mappingDeleteError } = await supabaseAdmin
        .from('google_calendar_event_mapping')
        .delete()
        .eq('id', existingMapping.id)

      if (mappingDeleteError) {
        console.error('Failed to delete event mapping:', mappingDeleteError)
      }

      result.events_deleted++
    }
    return
  }

  // Build Kodo row data from Google event
  const rowData = mapGoogleEventToKodo(event)

  if (existingMapping) {
    // I12: Update existing Kodo row with error capture
    const { error: rowUpdateError } = await supabaseAdmin
      .from('database_rows')
      .update({ data: rowData, updated_at: new Date().toISOString() })
      .eq('id', existingMapping.kodo_row_id)

    if (rowUpdateError) {
      console.error('Failed to update database row:', rowUpdateError)
    }

    // I12: Update mapping timestamps with error capture
    const { error: mappingUpdateError } = await supabaseAdmin
      .from('google_calendar_event_mapping')
      .update({
        google_updated_at: new Date().toISOString(),
        sync_status: 'synced',
      })
      .eq('id', existingMapping.id)

    if (mappingUpdateError) {
      console.error('Failed to update event mapping:', mappingUpdateError)
    }

    result.events_updated++
  } else {
    // Create new Kodo row
    const { data: newRow, error: insertError } = await supabaseAdmin
      .from('database_rows')
      .insert({
        database_id: config.kodo_database_id,
        data: rowData,
      })
      .select('id')
      .single()

    if (insertError || !newRow) {
      throw new Error(`Failed to create Kodo row: ${insertError?.message}`)
    }

    // C9: Create mapping with upsert to handle race conditions
    const { error: mappingError } = await supabaseAdmin
      .from('google_calendar_event_mapping')
      .upsert({
        sync_config_id: config.id,
        google_event_id: googleEventId,
        google_calendar_id: config.google_calendar_id,
        kodo_database_id: config.kodo_database_id,
        kodo_row_id: newRow.id,
        google_updated_at: new Date().toISOString(),
        sync_status: 'synced',
      }, { onConflict: 'google_event_id,google_calendar_id' })

    if (mappingError) {
      console.error('Failed to upsert event mapping:', mappingError)
    }

    result.events_created++
  }
}

function mapGoogleEventToKodo(event: Record<string, unknown>): Record<string, unknown> {
  const start = event.start as Record<string, string> | undefined
  const end = event.end as Record<string, string> | undefined
  const reminders = event.reminders as Record<string, unknown> | undefined
  const isAllDay = !!(start?.date && !start?.dateTime)

  return {
    title: event.summary ?? '',
    description: event.description ?? '',
    start_date: start?.dateTime ?? start?.date ?? null,
    end_date: end?.dateTime ?? end?.date ?? null,
    all_day: isAllDay,
    location: event.location ?? null,
    recurrence: Array.isArray(event.recurrence)
      ? (event.recurrence as string[]).join('\n')
      : null,
    reminders: reminders?.overrides ?? null,
  }
}
