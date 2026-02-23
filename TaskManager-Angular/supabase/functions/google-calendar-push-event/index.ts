// Supabase Edge Function: Push Kodo event to Google Calendar
// Deploy with: supabase functions deploy google-calendar-push-event

import {
  corsHeaders,
  createSupabaseAdmin,
  authenticateUser,
  getValidAccessToken,
  fetchWithRetry,
  GoogleCalendarConnection,
  validateMethod,
  errorResponse,
} from "../_shared/google-auth-helpers.ts"

interface EventAttendee {
  email: string
  displayName?: string
  rsvpStatus?: string
  isOrganizer?: boolean
  isOptional?: boolean
}

interface EventGuestPermissions {
  guestsCanModify?: boolean
  guestsCanInviteOthers?: boolean
  guestsCanSeeOtherGuests?: boolean
}

interface EventData {
  title: string
  description?: string
  start_date: string
  end_date: string
  all_day?: boolean
  timezone?: string
  location?: string
  recurrence?: string
  category?: string
  linked_items?: unknown[]
  event_number?: number
  reminders?: Array<{ method: string; minutes: number }>
  add_google_meet?: boolean
  attendees?: EventAttendee[]
  guest_permissions?: EventGuestPermissions
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

    // Check that the event row is not soft-deleted before pushing to Google Calendar
    const { data: dbMeta } = await supabaseAdmin
      .from('document_databases')
      .select('table_name')
      .eq('id', kodo_database_id)
      .single()

    if (dbMeta) {
      try {
        const { data: eventRow } = await supabaseAdmin
          .from(dbMeta.table_name as string)
          .select('id, deleted_at')
          .eq('id', kodo_row_id)
          .single()

        if (eventRow?.deleted_at !== null && eventRow?.deleted_at !== undefined) {
          return errorResponse(404, 'Event has been deleted and cannot be pushed to Google Calendar')
        }
      } catch {
        // Column deleted_at might not exist yet — proceed safely
        console.warn('[push-event] Could not check deleted_at column, proceeding')
      }
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
      const timeZone = eventData.timezone || 'Europe/Paris'
      googleEvent.start = { dateTime: eventData.start_date, timeZone }
      googleEvent.end = { dateTime: eventData.end_date, timeZone }
    }

    if (eventData.location) {
      googleEvent.location = eventData.location
    }

    if (eventData.recurrence) {
      try {
        googleEvent.recurrence = JSON.parse(eventData.recurrence)
      } catch {
        googleEvent.recurrence = [eventData.recurrence]
      }
    }

    if (eventData.reminders && eventData.reminders.length > 0) {
      googleEvent.reminders = {
        useDefault: false,
        overrides: eventData.reminders,
      }
    }

    // Map attendees to Google Calendar format
    if (eventData.attendees && eventData.attendees.length > 0) {
      googleEvent.attendees = eventData.attendees.map(a => ({
        email: a.email,
        displayName: a.displayName ?? undefined,
        responseStatus: a.rsvpStatus ?? 'needsAction',
        optional: a.isOptional ?? false,
        // organizer is read-only in Google Calendar API — omitted
      }))
    }

    // Map guest permissions
    if (eventData.guest_permissions) {
      const perms = eventData.guest_permissions
      if (perms.guestsCanModify !== undefined) googleEvent.guestsCanModify = perms.guestsCanModify
      if (perms.guestsCanInviteOthers !== undefined) googleEvent.guestsCanInviteOthers = perms.guestsCanInviteOthers
      if (perms.guestsCanSeeOtherGuests !== undefined) googleEvent.guestsCanSeeOtherGuests = perms.guestsCanSeeOtherGuests
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

    // Determine if we need to create a new Meet conference
    if (eventData.add_google_meet) {
      let needsCreateRequest = true

      if (existingMapping) {
        // Check if the Google event already has a conference
        try {
          const eventId = encodeURIComponent(existingMapping.google_event_id)
          const checkResp = await fetchWithRetry(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}?fields=conferenceData`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          if (checkResp.ok) {
            const existing = await checkResp.json()
            if (existing.conferenceData?.entryPoints?.length > 0) {
              needsCreateRequest = false // Already has a conference, don't recreate
            }
          }
        } catch {
          // If check fails, default to creating
        }
      }

      if (needsCreateRequest) {
        googleEvent.conferenceData = {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        }
      }
    }

    const hasAttendees = eventData.attendees && eventData.attendees.length > 0

    // Build query params — always include conferenceDataVersion=1 to preserve existing Meet data
    const queryParams = new URLSearchParams()
    queryParams.set('conferenceDataVersion', '1')
    if (hasAttendees) queryParams.set('sendUpdates', 'all')
    const queryString = `?${queryParams.toString()}`

    let googleEventId: string
    let meetLink: string | null = null

    if (existingMapping) {
      // PATCH (not PUT) to preserve fields we don't send (e.g. conferenceData)
      const eventId = encodeURIComponent(existingMapping.google_event_id)
      const response = await fetchWithRetry(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}${queryString}`,
        {
          method: 'PATCH',
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
      const response = await fetchWithRetry(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events${queryString}`,
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

    // If Meet was requested but link not yet available (async creation), refetch once immediately
    if (eventData.add_google_meet && !meetLink) {
      console.log('[push-event] Meet link not in initial response, refetching...')
      try {
        const refetchUrl = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(googleEventId)}`
        const refetchResp = await fetchWithRetry(refetchUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (refetchResp.ok) {
          const refetched = await refetchResp.json()
          meetLink = extractMeetLink(refetched)
          console.log('[push-event] Refetched meet link:', meetLink ?? 'still pending')
        }
      } catch (refetchErr) {
        console.error('[push-event] Failed to refetch Meet link:', refetchErr)
      }
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
