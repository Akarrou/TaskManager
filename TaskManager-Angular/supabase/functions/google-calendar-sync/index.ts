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

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

interface SyncConfig {
  id: string
  connection_id: string
  google_calendar_id: string
  google_calendar_name: string
  kodo_database_id: string | null
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

interface DatabaseColumn {
  id: string
  name: string
  type: string
}

interface ResolvedDatabase {
  tableName: string
  databaseId: string   // document_databases.database_id (text, db-<uuid>)
  dbMetaId: string     // document_databases.id (UUID PK)
  columns: DatabaseColumn[]
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

    // Resolve or auto-create the event database
    let resolvedDb: ResolvedDatabase
    if (config.kodo_database_id) {
      resolvedDb = await resolveEventDatabase(config.kodo_database_id, supabaseAdmin)
    } else {
      resolvedDb = await autoCreateEventDatabase(
        config.id,
        user.id,
        config.google_calendar_name,
        supabaseAdmin
      )
    }

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
          await processEvent(event, config, resolvedDb, user.id, supabaseAdmin, result)
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

// =============================================================================
// Database Resolution
// =============================================================================

/**
 * Resolve the event database metadata from kodo_database_id.
 * Queries document_databases by its UUID primary key.
 */
async function resolveEventDatabase(
  kodoDatabaseId: string,
  supabaseAdmin: SupabaseAdmin
): Promise<ResolvedDatabase> {
  const { data, error } = await supabaseAdmin
    .from('document_databases')
    .select('id, database_id, table_name, config')
    .eq('id', kodoDatabaseId)
    .single()

  if (error || !data) {
    throw new Error(`Event database not found for id: ${kodoDatabaseId}`)
  }

  const config = data.config as { columns?: DatabaseColumn[] }

  return {
    tableName: data.table_name as string,
    databaseId: data.database_id as string,
    dbMetaId: data.id as string,
    columns: config.columns ?? [],
  }
}

/**
 * Auto-create an event database when kodo_database_id is null.
 * Creates: document + document_databases metadata + physical table via RPC.
 * Updates sync_config.kodo_database_id with the new database UUID.
 */
async function autoCreateEventDatabase(
  syncConfigId: string,
  userId: string,
  calendarName: string,
  supabaseAdmin: SupabaseAdmin
): Promise<ResolvedDatabase> {
  const rawUuid = crypto.randomUUID()
  const databaseId = `db-${rawUuid}`
  const tableName = `database_${rawUuid.replace(/-/g, '_')}`
  const dbName = calendarName || 'Google Calendar Events'

  // Standard event columns (matches MCP server create_database pattern)
  const startDateId = crypto.randomUUID()
  const columns: Record<string, unknown>[] = [
    { id: crypto.randomUUID(), name: 'Title', type: 'text', visible: true, required: true, readonly: true, isNameColumn: true, order: 0, width: 200, color: 'blue' },
    { id: crypto.randomUUID(), name: 'Description', type: 'text', visible: true, readonly: true, order: 1, width: 300, color: 'green' },
    { id: startDateId, name: 'Start Date', type: 'datetime', visible: true, readonly: true, order: 2, width: 200, color: 'orange', options: { dateFormat: 'DD/MM/YYYY HH:mm' } },
    { id: crypto.randomUUID(), name: 'End Date', type: 'datetime', visible: true, readonly: true, order: 3, width: 200, color: 'orange', options: { dateFormat: 'DD/MM/YYYY HH:mm' } },
    { id: crypto.randomUUID(), name: 'All Day', type: 'checkbox', visible: true, readonly: true, order: 4, width: 80, color: 'yellow' },
    { id: crypto.randomUUID(), name: 'Category', type: 'select', visible: true, readonly: true, order: 5, width: 180, color: 'purple', options: {
      choices: [
        { id: 'meeting', label: 'Réunion', color: 'bg-blue-200' },
        { id: 'deadline', label: 'Échéance', color: 'bg-red-200' },
        { id: 'milestone', label: 'Jalon', color: 'bg-purple-200' },
        { id: 'reminder', label: 'Rappel', color: 'bg-yellow-200' },
        { id: 'personal', label: 'Personnel', color: 'bg-green-200' },
        { id: 'other', label: 'Autre', color: 'bg-gray-200' },
      ],
    }},
    { id: crypto.randomUUID(), name: 'Location', type: 'text', visible: true, order: 6, width: 200, color: 'pink' },
    { id: crypto.randomUUID(), name: 'Recurrence', type: 'text', visible: false, order: 7, width: 200, color: 'gray' },
    { id: crypto.randomUUID(), name: 'Linked Items', type: 'linked-items', visible: true, order: 8, width: 300, color: 'blue' },
    { id: crypto.randomUUID(), name: 'Project ID', type: 'text', visible: false, order: 9, width: 200, color: 'pink' },
    { id: crypto.randomUUID(), name: 'Event Number', type: 'text', visible: true, readonly: true, required: false, order: 10, width: 120, color: 'gray' },
  ]

  const config = {
    name: dbName,
    type: 'event',
    columns,
    defaultView: 'calendar',
    views: [
      { id: 'view-calendar', name: 'Vue calendrier', type: 'calendar', config: { calendarDateColumnId: startDateId } },
      { id: 'view-table', name: 'Vue tableau', type: 'table', config: {} },
    ],
  }

  // Create a document to host the database
  const { data: docData, error: docError } = await supabaseAdmin
    .from('documents')
    .insert({
      title: dbName,
      content: { type: 'doc', content: [] },
      user_id: userId,
    })
    .select('id')
    .single()

  if (docError || !docData) {
    throw new Error(`Failed to create document: ${docError?.message}`)
  }

  // Create database metadata
  const { data: dbData, error: dbError } = await supabaseAdmin
    .from('document_databases')
    .insert({
      database_id: databaseId,
      document_id: docData.id,
      table_name: tableName,
      name: dbName,
      config,
    })
    .select('id')
    .single()

  if (dbError || !dbData) {
    throw new Error(`Failed to create database metadata: ${dbError?.message}`)
  }

  // Create the physical PostgreSQL table via RPC
  const { error: tableError } = await supabaseAdmin.rpc('ensure_table_exists', {
    p_database_id: databaseId,
  })

  if (tableError) {
    // Rollback on failure
    await supabaseAdmin.from('document_databases').delete().eq('id', dbData.id)
    await supabaseAdmin.from('documents').delete().eq('id', docData.id)
    throw new Error(`Failed to create physical table: ${tableError.message}`)
  }

  // Update sync config with the new database reference
  const { error: updateError } = await supabaseAdmin
    .from('google_calendar_sync_config')
    .update({ kodo_database_id: dbData.id })
    .eq('id', syncConfigId)

  if (updateError) {
    throw new Error(`Failed to update sync config: ${updateError.message}`)
  }

  console.log(`Auto-created event database "${dbName}" (${databaseId}) for sync config ${syncConfigId}`)

  return {
    tableName,
    databaseId,
    dbMetaId: dbData.id as string,
    columns: columns as DatabaseColumn[],
  }
}

// =============================================================================
// Event Processing
// =============================================================================

async function processEvent(
  event: Record<string, unknown>,
  config: SyncConfig,
  resolvedDb: ResolvedDatabase,
  userId: string,
  supabaseAdmin: SupabaseAdmin,
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
      // Delete row from dynamic table
      const { error: rowDeleteError } = await supabaseAdmin
        .from(resolvedDb.tableName)
        .delete()
        .eq('id', existingMapping.kodo_row_id)

      if (rowDeleteError) {
        console.error('Failed to delete row:', rowDeleteError)
      }

      // Delete linked document
      await supabaseAdmin
        .from('documents')
        .delete()
        .eq('database_id', resolvedDb.databaseId)
        .eq('database_row_id', existingMapping.kodo_row_id)

      // Delete mapping
      const { error: mappingDeleteError } = await supabaseAdmin
        .from('google_calendar_event_mapping')
        .delete()
        .eq('id', existingMapping.id)

      if (mappingDeleteError) {
        console.error('Failed to delete mapping:', mappingDeleteError)
      }

      result.events_deleted++
    }
    return
  }

  // Build row data mapped to col_* columns
  const rowData = mapGoogleEventToKodo(event, resolvedDb.columns)

  if (existingMapping) {
    // Update existing row in dynamic table
    rowData['updated_at'] = new Date().toISOString()

    const { error: rowUpdateError } = await supabaseAdmin
      .from(resolvedDb.tableName)
      .update(rowData)
      .eq('id', existingMapping.kodo_row_id)

    if (rowUpdateError) {
      console.error('Failed to update row:', rowUpdateError)
    }

    // Update linked document title
    const title = (event.summary as string) ?? ''
    if (title) {
      await supabaseAdmin
        .from('documents')
        .update({ title, updated_at: new Date().toISOString() })
        .eq('database_id', resolvedDb.databaseId)
        .eq('database_row_id', existingMapping.kodo_row_id)
    }

    // Update mapping timestamps
    const { error: mappingUpdateError } = await supabaseAdmin
      .from('google_calendar_event_mapping')
      .update({
        google_updated_at: new Date().toISOString(),
        sync_status: 'synced',
      })
      .eq('id', existingMapping.id)

    if (mappingUpdateError) {
      console.error('Failed to update mapping:', mappingUpdateError)
    }

    result.events_updated++
  } else {
    // Generate event number
    const eventNumberColId = getColumnId(resolvedDb.columns, 'Event Number')
    if (eventNumberColId) {
      const { data: eventNumber } = await supabaseAdmin.rpc('get_next_event_number')
      if (eventNumber) {
        rowData[toColName(eventNumberColId)] = eventNumber
      }
    }

    // Get next row_order
    const { data: maxOrderRow } = await supabaseAdmin
      .from(resolvedDb.tableName)
      .select('row_order')
      .order('row_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    rowData['row_order'] = ((maxOrderRow?.row_order as number) ?? 0) + 1

    // Insert new row into dynamic table
    const { data: newRow, error: insertError } = await supabaseAdmin
      .from(resolvedDb.tableName)
      .insert(rowData)
      .select('id')
      .single()

    if (insertError || !newRow) {
      throw new Error(`Failed to create row: ${insertError?.message}`)
    }

    // Create linked document (Notion-style)
    const title = (event.summary as string) ?? 'Untitled'
    await supabaseAdmin
      .from('documents')
      .insert({
        title,
        database_id: resolvedDb.databaseId,
        database_row_id: newRow.id,
        content: { type: 'doc', content: [] },
        user_id: userId,
      })

    // C9: Create mapping with upsert to handle race conditions
    const { error: mappingError } = await supabaseAdmin
      .from('google_calendar_event_mapping')
      .upsert({
        sync_config_id: config.id,
        google_event_id: googleEventId,
        google_calendar_id: config.google_calendar_id,
        kodo_database_id: resolvedDb.dbMetaId,
        kodo_row_id: newRow.id,
        google_updated_at: new Date().toISOString(),
        sync_status: 'synced',
      }, { onConflict: 'google_event_id,google_calendar_id' })

    if (mappingError) {
      console.error('Failed to upsert mapping:', mappingError)
    }

    result.events_created++
  }
}

// =============================================================================
// Column Mapping Helpers
// =============================================================================

function getColumnId(columns: DatabaseColumn[], name: string): string | undefined {
  return columns.find(c => c.name === name)?.id
}

function toColName(columnId: string): string {
  return `col_${columnId.replace(/-/g, '_')}`
}

/**
 * Map a Google Calendar event to Kodo database row data.
 * Returns an object with col_<uuid> keys ready for INSERT/UPDATE.
 */
function mapGoogleEventToKodo(
  event: Record<string, unknown>,
  columns: DatabaseColumn[]
): Record<string, unknown> {
  const start = event.start as Record<string, string> | undefined
  const end = event.end as Record<string, string> | undefined
  const isAllDay = !!(start?.date && !start?.dateTime)

  const rowData: Record<string, unknown> = {}

  const setField = (colName: string, value: unknown) => {
    const colId = getColumnId(columns, colName)
    if (colId) {
      rowData[toColName(colId)] = value
    }
  }

  setField('Title', event.summary ?? '')
  setField('Description', event.description ?? '')
  setField('Start Date', start?.dateTime ?? start?.date ?? null)
  setField('End Date', end?.dateTime ?? end?.date ?? null)
  setField('All Day', isAllDay)
  setField('Location', event.location ?? null)
  setField('Category', 'other')
  setField('Recurrence', Array.isArray(event.recurrence)
    ? (event.recurrence as string[]).join('\n')
    : null)

  return rowData
}
