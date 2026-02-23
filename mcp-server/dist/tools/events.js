import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
import { getCurrentUserId } from '../services/user-auth.js';
import { saveSnapshot } from '../services/snapshot.js';
// Event category — accepts any string to support custom categories
const EventCategoryEnum = z.string().describe('Event category. Default values: meeting, deadline, milestone, reminder, personal, other. Custom category keys are also accepted.');
/**
 * Register all event-related tools
 */
export function registerEventTools(server) {
    // =========================================================================
    // list_events - List events from all event databases
    // =========================================================================
    server.tool('list_events', `List events aggregated from all event-type databases in the workspace. Events are stored as rows in "event" type databases with standardized columns: Title, Description, Start Date, End Date, All Day, Category, Location, Recurrence, Linked Items, Project ID, Event Number, Color, Google Meet. This tool scans all event databases and returns a unified view. Results are normalized and sorted by start date. Default category values: meeting, deadline, milestone, reminder, personal, other (custom categories also accepted). Related tools: create_event, update_event, get_event, list_calendar_docs, get_calendar_doc.`, {
        category: EventCategoryEnum.optional().describe('Filter to only events with this category. Valid: meeting, deadline, milestone, reminder, personal, other.'),
        project_id: z.string().uuid().optional().describe('Filter to events associated with this project.'),
        start_date: z.string().optional().describe('Filter events starting on or after this date (ISO format, e.g., "2024-12-01" or "2024-12-01T09:00:00Z").'),
        end_date: z.string().optional().describe('Filter events ending on or before this date (ISO format, e.g., "2024-12-31" or "2024-12-31T23:59:59Z").'),
        limit: z.number().min(1).max(100).optional().default(50).describe('Maximum events to return. Default 50, max 100.'),
    }, async ({ category, project_id, start_date, end_date, limit }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Get event databases accessible to this user
            const eventDatabases = await getUserEventDatabases(supabase, userId);
            if (eventDatabases.length === 0) {
                return {
                    content: [{ type: 'text', text: 'No event databases found. Create an event database first.' }],
                };
            }
            // Aggregate events from all databases
            const allEvents = [];
            for (const db of eventDatabases) {
                const tableName = `database_${db.database_id.replace('db-', '').replace(/-/g, '_')}`;
                const query = supabase
                    .from(tableName)
                    .select('*')
                    .limit(limit);
                const { data: rows, error: rowError } = await query;
                if (rowError) {
                    console.error(`Error fetching from ${tableName}:`, rowError);
                    continue;
                }
                // Normalize rows to event entries
                for (const row of rows || []) {
                    const event = normalizeRowToEvent(row, db);
                    // Apply filters
                    if (category && event.category !== category)
                        continue;
                    if (project_id && event.project_id !== project_id)
                        continue;
                    if (start_date && event.start_date) {
                        const eventStart = new Date(event.start_date).getTime();
                        const filterStart = new Date(start_date).getTime();
                        if (eventStart < filterStart)
                            continue;
                    }
                    if (end_date && event.end_date) {
                        const eventEnd = new Date(event.end_date).getTime();
                        const filterEnd = new Date(end_date).getTime();
                        if (eventEnd > filterEnd)
                            continue;
                    }
                    allEvents.push(event);
                }
            }
            // Sort by start_date ascending
            allEvents.sort((a, b) => {
                const dateA = a.start_date ? new Date(a.start_date).getTime() : 0;
                const dateB = b.start_date ? new Date(b.start_date).getTime() : 0;
                return dateA - dateB;
            });
            return {
                content: [{ type: 'text', text: `Found ${allEvents.length} events:\n${JSON.stringify(allEvents.slice(0, limit), null, 2)}` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // create_event - Create a new event in a database
    // =========================================================================
    server.tool('create_event', `Create a new event in an event-type database. A linked document is automatically created (Notion-style).

MANDATORY WORKFLOW - DO NOT SKIP ANY STEP:

STEP 1: List event databases
-> Call list_databases with type="event"
-> Wait for response before proceeding

STEP 2: Handle database selection
-> If 0 databases: ASK user "Aucune base d'evenements trouvee. Voulez-vous en creer une?" then use create_database
-> If 1 database: INFORM user "J'utilise la base [name]" and proceed
-> If 2+ databases: ASK user "Quelle base de donnees voulez-vous utiliser?" with numbered list

STEP 3: Collect event title and dates (REQUIRED)
-> ASK user: "Quel est le titre de l'evenement et ses dates?"
-> Wait for response - DO NOT proceed without a title and start_date

STEP 4: Collect optional fields
-> ASK user about optional fields in ONE question:
  - Description (texte libre)
  - End date (ISO format with time)
  - All day (true/false) - default: false
  - Category (meeting/deadline/milestone/reminder/personal/other or custom key) - default: other
  - Location (texte libre)
  - Recurrence (RRULE string, e.g. "FREQ=WEEKLY;BYDAY=MO,WE,FR")
  - Linked items (array of {type, id, databaseId?, label})

STEP 5: Create the event
-> Only NOW call create_event with all collected information

For detailed documentation on categories, linked items, recurrence rules, etc., use list_calendar_docs and get_calendar_doc.

Returns: { event, document }. Related tools: list_databases, create_database, list_calendar_docs.`, {
        database_id: z.string().describe('The event database to add to. Format: db-uuid. Get this from list_databases or the database where you want the event.'),
        title: z.string().min(1).describe('Event title - the main identifier shown in calendar views.'),
        description: z.string().optional().describe('Detailed description of the event. Supports plain text.'),
        start_date: z.string().describe('Start date and time in ISO format (e.g., "2024-12-31T09:00:00Z"). Required.'),
        end_date: z.string().describe('End date and time in ISO format (e.g., "2024-12-31T10:00:00Z"). Required.'),
        all_day: z.boolean().optional().default(false).describe('Whether this is an all-day event. Default false.'),
        category: EventCategoryEnum.optional().default('other').describe('Event category. Default "other". Options: meeting, deadline, milestone, reminder, personal, other.'),
        location: z.string().optional().describe('Event location. Free text field.'),
        recurrence: z.string().optional().describe('Recurrence rule in RRULE format (e.g., "FREQ=WEEKLY;BYDAY=MO,WE,FR").'),
        linked_items: z.array(z.object({
            type: z.string().describe('Type of linked item: "task", "document", or "database".'),
            id: z.string().describe('ID of the linked item.'),
            databaseId: z.string().optional().describe('Database ID of the linked item, if applicable.'),
            label: z.string().optional().describe('Display label for the linked item.'),
        })).optional().describe('Array of items linked to this event.'),
        user_id: z.string().uuid().optional().describe('User ID to assign ownership of the linked document. Required for RLS access. Get this from list_users or get_profile.'),
    }, async ({ database_id, title, description, start_date, end_date, all_day, category, location, recurrence, linked_items, user_id }) => {
        try {
            const currentUserId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Verify user has access to this database
            const hasAccess = await userHasDatabaseAccess(supabase, database_id, currentUserId);
            if (!hasAccess) {
                return {
                    content: [{ type: 'text', text: `Access denied: You do not have permission to modify this database.` }],
                    isError: true,
                };
            }
            const { data: dbMeta, error: metaError } = await supabase
                .from('document_databases')
                .select('*')
                .eq('database_id', database_id)
                .single();
            if (metaError || !dbMeta) {
                return {
                    content: [{ type: 'text', text: `Database not found: ${database_id}` }],
                    isError: true,
                };
            }
            const config = dbMeta.config;
            const columns = config.columns || [];
            const isEventDatabase = config.type === 'event';
            // Build cells object mapping column names to values
            const cells = {};
            const findColumnId = (name) => columns.find(c => c.name === name)?.id;
            const titleColId = findColumnId('Title');
            if (titleColId)
                cells[titleColId] = title;
            const descColId = findColumnId('Description');
            if (descColId && description)
                cells[descColId] = description;
            const startDateColId = findColumnId('Start Date');
            if (startDateColId)
                cells[startDateColId] = start_date;
            const endDateColId = findColumnId('End Date');
            if (endDateColId)
                cells[endDateColId] = end_date;
            const allDayColId = findColumnId('All Day');
            if (allDayColId)
                cells[allDayColId] = all_day;
            const categoryColId = findColumnId('Category');
            if (categoryColId)
                cells[categoryColId] = category;
            const locationColId = findColumnId('Location');
            if (locationColId && location)
                cells[locationColId] = location;
            const recurrenceColId = findColumnId('Recurrence');
            if (recurrenceColId && recurrence)
                cells[recurrenceColId] = recurrence;
            const linkedItemsColId = findColumnId('Linked Items');
            if (linkedItemsColId && linked_items)
                cells[linkedItemsColId] = linked_items;
            // Auto-generate event number for event databases
            const eventNumberColId = findColumnId('Event Number');
            if (isEventDatabase && eventNumberColId) {
                const { data: eventNumber, error: rpcError } = await supabase.rpc('get_next_event_number');
                if (rpcError) {
                    console.error('Failed to get next event number:', rpcError.message);
                }
                else if (eventNumber) {
                    cells[eventNumberColId] = eventNumber;
                }
            }
            const tableName = `database_${database_id.replace('db-', '').replace(/-/g, '_')}`;
            // Get max row_order
            const { data: maxOrderRow } = await supabase
                .from(tableName)
                .select('row_order')
                .order('row_order', { ascending: false })
                .limit(1)
                .single();
            const newRowOrder = (maxOrderRow?.row_order || 0) + 1;
            // Map cells to individual columns (matches Angular pattern)
            const rowData = mapCellsToColumns(cells);
            rowData['row_order'] = newRowOrder;
            const { data, error } = await supabase
                .from(tableName)
                .insert(rowData)
                .select()
                .single();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error creating event: ${error.message}` }],
                    isError: true,
                };
            }
            // Create the linked document (Notion-style) - always use current user
            const { data: docData, error: docError } = await supabase
                .from('documents')
                .insert({
                title: title,
                database_id: database_id,
                database_row_id: data.id,
                project_id: dbMeta.project_id || null,
                content: { type: 'doc', content: [] },
                user_id: user_id || currentUserId,
            })
                .select()
                .single();
            if (docError) {
                // Return event with document error info
                return {
                    content: [{ type: 'text', text: `Event created but linked document failed:\n${JSON.stringify({ event: data, document: null, document_error: docError.message }, null, 2)}` }],
                };
            }
            return {
                content: [{ type: 'text', text: `Event created successfully:\n${JSON.stringify({ event: data, document: docData }, null, 2)}` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // get_event - Get a specific event by ID
    // =========================================================================
    server.tool('get_event', `Get full details of a specific event including all fields. Returns normalized event object with: id, database_id, title, description, start_date, end_date, all_day, category, location, recurrence, linked_items, and timestamps. Use this when you need complete event information after getting an ID from list_events. The response includes the database_id and database_name for context. Related tools: update_event (modify), delete_event (remove).`, {
        database_id: z.string().describe('The database ID containing the event. Format: db-uuid.'),
        row_id: z.string().uuid().describe('The specific event/row ID to retrieve.'),
    }, async ({ database_id, row_id }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Verify user has access to this database
            const hasAccess = await userHasDatabaseAccess(supabase, database_id, userId);
            if (!hasAccess) {
                return {
                    content: [{ type: 'text', text: `Access denied: You do not have permission to access this database.` }],
                    isError: true,
                };
            }
            const { data: dbMeta, error: metaError } = await supabase
                .from('document_databases')
                .select('*')
                .eq('database_id', database_id)
                .single();
            if (metaError || !dbMeta) {
                return {
                    content: [{ type: 'text', text: `Database not found: ${database_id}` }],
                    isError: true,
                };
            }
            const tableName = `database_${database_id.replace('db-', '').replace(/-/g, '_')}`;
            const { data: row, error } = await supabase
                .from(tableName)
                .select('*')
                .eq('id', row_id)
                .single();
            if (error || !row) {
                return {
                    content: [{ type: 'text', text: `Event not found: ${row_id}` }],
                    isError: true,
                };
            }
            const event = normalizeRowToEvent(row, dbMeta);
            return {
                content: [{ type: 'text', text: JSON.stringify(event, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // get_event_by_number - Search event by number (e.g., "EVT-0001")
    // =========================================================================
    server.tool('get_event_by_number', `Search for an event by its event number (e.g., "EVT-0001") and return the event with its linked document. Event numbers are auto-generated when events are created in event-type databases. This tool searches across all accessible event databases. Returns both the event details and the associated Notion-style document.`, {
        event_number: z.string().describe('The event number to search for (e.g., "EVT-0001", "EVT-0042")'),
        include_document: z.boolean().optional().default(true).describe('Include the linked document in the response (default: true)'),
    }, async ({ event_number, include_document }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Get event databases accessible to this user
            const eventDatabases = await getUserEventDatabases(supabase, userId);
            if (eventDatabases.length === 0) {
                return {
                    content: [{ type: 'text', text: 'No event databases found.' }],
                    isError: true,
                };
            }
            // Search in each database
            for (const db of eventDatabases) {
                const config = db.config;
                const columns = config.columns || [];
                // Find "Event Number" column
                const eventNumberCol = columns.find(c => c.name === 'Event Number');
                if (!eventNumberCol)
                    continue;
                const tableName = `database_${db.database_id.replace('db-', '').replace(/-/g, '_')}`;
                const colName = `col_${eventNumberCol.id.replace(/-/g, '_')}`;
                const { data: row, error } = await supabase
                    .from(tableName)
                    .select('*')
                    .eq(colName, event_number)
                    .maybeSingle();
                if (error || !row)
                    continue;
                // Found the event!
                const event = normalizeRowToEvent(row, db);
                // Get linked document if requested
                let document = null;
                if (include_document) {
                    const { data: doc } = await supabase
                        .from('documents')
                        .select('*')
                        .eq('database_id', db.database_id)
                        .eq('database_row_id', row.id)
                        .eq('user_id', userId)
                        .maybeSingle();
                    document = doc;
                }
                return {
                    content: [{ type: 'text', text: JSON.stringify({ event, document }, null, 2) }],
                };
            }
            // Not found
            return {
                content: [{ type: 'text', text: `Event not found: ${event_number}` }],
                isError: true,
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // get_event_document - Get the document linked to an event
    // =========================================================================
    server.tool('get_event_document', `Get the document linked to an event. Each event in an event database has an associated document (Notion-style) that can contain rich content, notes, and details. The document is automatically created when the event is created. Use this to retrieve the document for viewing or editing its content. Returns the full document object including id, title, content, and metadata.`, {
        database_id: z.string().describe('The database ID where the event lives. Format: db-uuid.'),
        row_id: z.string().uuid().describe('The event/row ID to get the document for.'),
    }, async ({ database_id, row_id }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Verify user has access to this database
            const hasAccess = await userHasDatabaseAccess(supabase, database_id, userId);
            if (!hasAccess) {
                return {
                    content: [{ type: 'text', text: `Access denied: You do not have permission to access this database.` }],
                    isError: true,
                };
            }
            // Get the document and verify ownership
            const { data, error } = await supabase
                .from('documents')
                .select('*')
                .eq('database_id', database_id)
                .eq('database_row_id', row_id)
                .eq('user_id', userId)
                .maybeSingle();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error getting event document: ${error.message}` }],
                    isError: true,
                };
            }
            if (!data) {
                return {
                    content: [{ type: 'text', text: 'No document found for this event. The document may not have been created or may have been deleted.' }],
                };
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // update_event - Update all fields of an event
    // =========================================================================
    server.tool('update_event', `Update one or more fields of an existing event. Only provide the fields you want to change - unspecified fields remain unchanged. Returns the complete updated event. At least one field must be provided. All field values use the same format as create_event. Note: linked_items replaces the entire array (not append). Related tools: get_event, list_calendar_docs, get_calendar_doc.`, {
        database_id: z.string().describe('The database ID containing the event. Format: db-uuid.'),
        row_id: z.string().uuid().describe('The event/row ID to update.'),
        title: z.string().min(1).optional().describe('New title. Leave undefined to keep current.'),
        description: z.string().optional().describe('New description. Leave undefined to keep current.'),
        start_date: z.string().optional().describe('New start date in ISO format with time. Leave undefined to keep current.'),
        end_date: z.string().optional().describe('New end date in ISO format with time. Leave undefined to keep current.'),
        all_day: z.boolean().optional().describe('Whether this is an all-day event. Leave undefined to keep current.'),
        category: EventCategoryEnum.optional().describe('New category: meeting, deadline, milestone, reminder, personal, other.'),
        location: z.string().optional().describe('New location. Leave undefined to keep current.'),
        recurrence: z.string().optional().describe('New recurrence rule in RRULE format. Leave undefined to keep current.'),
        linked_items: z.array(z.object({
            type: z.string().describe('Type of linked item: "task", "document", or "database".'),
            id: z.string().describe('ID of the linked item.'),
            databaseId: z.string().optional().describe('Database ID of the linked item.'),
            label: z.string().optional().describe('Display label for the linked item.'),
        })).optional().describe('New linked items array. Leave undefined to keep current.'),
    }, async ({ database_id, row_id, title, description, start_date, end_date, all_day, category, location, recurrence, linked_items }) => {
        try {
            // Check for updates early to avoid unnecessary DB calls and snapshots
            const updates = [];
            if (title !== undefined)
                updates.push({ name: 'Title', value: title });
            if (description !== undefined)
                updates.push({ name: 'Description', value: description });
            if (start_date !== undefined)
                updates.push({ name: 'Start Date', value: start_date });
            if (end_date !== undefined)
                updates.push({ name: 'End Date', value: end_date });
            if (all_day !== undefined)
                updates.push({ name: 'All Day', value: all_day });
            if (category !== undefined)
                updates.push({ name: 'Category', value: category });
            if (location !== undefined)
                updates.push({ name: 'Location', value: location });
            if (recurrence !== undefined)
                updates.push({ name: 'Recurrence', value: recurrence });
            if (linked_items !== undefined)
                updates.push({ name: 'Linked Items', value: linked_items });
            if (updates.length === 0) {
                return {
                    content: [{ type: 'text', text: 'No updates provided. Please specify at least one field to update.' }],
                    isError: true,
                };
            }
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Verify user has access to this database
            const hasAccess = await userHasDatabaseAccess(supabase, database_id, userId);
            if (!hasAccess) {
                return {
                    content: [{ type: 'text', text: `Access denied: You do not have permission to modify this database.` }],
                    isError: true,
                };
            }
            const { data: dbMeta, error: metaError } = await supabase
                .from('document_databases')
                .select('*')
                .eq('database_id', database_id)
                .single();
            if (metaError || !dbMeta) {
                return {
                    content: [{ type: 'text', text: `Database not found: ${database_id}` }],
                    isError: true,
                };
            }
            const config = dbMeta.config;
            const columns = config.columns || [];
            const findColumnId = (name) => columns.find(c => c.name === name)?.id;
            const tableName = `database_${database_id.replace('db-', '').replace(/-/g, '_')}`;
            // Get current row
            const { data: currentRow, error: getError } = await supabase
                .from(tableName)
                .select('*')
                .eq('id', row_id)
                .single();
            if (getError || !currentRow) {
                return {
                    content: [{ type: 'text', text: `Event not found: ${row_id}` }],
                    isError: true,
                };
            }
            // Snapshot before modification
            const snapshot = await saveSnapshot({
                entityType: 'event_row',
                entityId: row_id,
                tableName,
                toolName: 'update_event',
                operation: 'update',
                data: currentRow,
                userId,
            });
            const snapshotToken = snapshot.token;
            // Map updates to individual column names
            const updateData = {
                updated_at: new Date().toISOString(),
            };
            for (const update of updates) {
                const colId = findColumnId(update.name);
                if (colId) {
                    const colName = `col_${colId.replace(/-/g, '_')}`;
                    updateData[colName] = update.value;
                }
            }
            const { data, error } = await supabase
                .from(tableName)
                .update(updateData)
                .eq('id', row_id)
                .select()
                .single();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error updating event: ${error.message}` }],
                    isError: true,
                };
            }
            const event = normalizeRowToEvent(data, dbMeta);
            return {
                content: [{ type: 'text', text: `Event updated (snapshot: ${snapshotToken}):\n${JSON.stringify(event, null, 2)}` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // delete_event - Delete an event
    // =========================================================================
    server.tool('delete_event', `Permanently delete an event from a database. This removes the row from the event database. The deletion is immediate and cannot be undone. Returns confirmation with the deleted event's information. A snapshot is taken before deletion for recovery purposes. Note: if Google Calendar sync is active for the event's database, the corresponding Google event will also be deleted when the event is removed via the Angular app (but not via MCP).`, {
        database_id: z.string().describe('The database ID containing the event to delete. Format: db-uuid.'),
        row_id: z.string().uuid().describe('The event/row ID to permanently delete.'),
    }, async ({ database_id, row_id }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Verify user has access to this database
            const hasAccess = await userHasDatabaseAccess(supabase, database_id, userId);
            if (!hasAccess) {
                return {
                    content: [{ type: 'text', text: `Access denied: You do not have permission to modify this database.` }],
                    isError: true,
                };
            }
            const { data: dbMeta, error: metaError } = await supabase
                .from('document_databases')
                .select('*')
                .eq('database_id', database_id)
                .single();
            if (metaError || !dbMeta) {
                return {
                    content: [{ type: 'text', text: `Database not found: ${database_id}` }],
                    isError: true,
                };
            }
            const tableName = `database_${database_id.replace('db-', '').replace(/-/g, '_')}`;
            // Get event info before deleting
            const { data: eventRow } = await supabase
                .from(tableName)
                .select('*')
                .eq('id', row_id)
                .single();
            let snapshotToken = '';
            if (eventRow) {
                const snapshot = await saveSnapshot({
                    entityType: 'event_row',
                    entityId: row_id,
                    tableName,
                    toolName: 'delete_event',
                    operation: 'delete',
                    data: eventRow,
                    userId,
                });
                snapshotToken = snapshot.token;
            }
            const { error } = await supabase
                .from(tableName)
                .delete()
                .eq('id', row_id);
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error deleting event: ${error.message}` }],
                    isError: true,
                };
            }
            const event = eventRow ? normalizeRowToEvent(eventRow, dbMeta) : { id: row_id };
            return {
                content: [{ type: 'text', text: `Event deleted (snapshot: ${snapshotToken}):\n${JSON.stringify(event, null, 2)}` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
}
// =============================================================================
// Helper functions
// =============================================================================
/**
 * Get event databases accessible to the current user
 * Databases are accessible if they belong to a document owned by the user
 */
async function getUserEventDatabases(supabase, userId) {
    // Get databases linked to documents the user owns
    const { data: databases, error } = await supabase
        .from('document_databases')
        .select('*, documents!inner(user_id)')
        .eq('documents.user_id', userId);
    if (error) {
        // Fallback: get standalone databases (no document_id) - these might be user's own
        const { data: standaloneDbs } = await supabase
            .from('document_databases')
            .select('*')
            .is('document_id', null);
        return (standaloneDbs || []).filter((db) => {
            const config = db.config;
            return config?.type === 'event';
        });
    }
    return (databases || []).filter((db) => {
        const config = db.config;
        return config?.type === 'event';
    });
}
/**
 * Check if user has access to a specific database
 */
async function userHasDatabaseAccess(supabase, databaseId, userId) {
    // Check if database belongs to a document owned by the user
    const { data } = await supabase
        .from('document_databases')
        .select('document_id, documents(user_id)')
        .eq('database_id', databaseId)
        .single();
    if (!data)
        return false;
    // If no document linked, allow access (standalone database)
    if (!data.document_id)
        return true;
    const doc = data.documents;
    return doc?.user_id === userId;
}
/**
 * Helper: Normalize a database row to an event-like object
 * Reads individual columns (col_xxx) matching Angular's pattern
 */
function normalizeRowToEvent(row, dbMeta) {
    const config = dbMeta.config;
    const columns = config.columns || [];
    // Get cell value from individual column (matches Angular pattern)
    const getCell = (name) => {
        const col = columns.find(c => c.name === name);
        if (!col)
            return null;
        return getCellFromRow(row, col.id);
    };
    return {
        id: row.id,
        database_id: dbMeta.database_id,
        database_name: dbMeta.name,
        event_number: getCell('Event Number'),
        title: getCell('Title') || 'Untitled',
        description: getCell('Description'),
        start_date: getCell('Start Date'),
        end_date: getCell('End Date'),
        all_day: getCell('All Day') || false,
        category: getCell('Category') || 'other',
        location: getCell('Location'),
        recurrence: getCell('Recurrence'),
        linked_items: getCell('Linked Items'),
        project_id: getCell('Project ID'),
        reminders: getCell('Reminders'),
        meet_link: getCell('Google Meet'),
        color: getCell('Color'),
        created_at: row.created_at,
        updated_at: row.updated_at,
        row_order: row.row_order,
    };
}
/**
 * Map cells object to individual column names for database insert/update
 * Matches Angular's mapCellsToColumns pattern (database.service.ts:900-904)
 */
function mapCellsToColumns(cells) {
    const result = {};
    Object.entries(cells).forEach(([columnId, value]) => {
        result[`col_${columnId.replace(/-/g, '_')}`] = value;
    });
    return result;
}
/**
 * Get cell value from database row using column name
 * Matches Angular's mapRowFromDb pattern
 */
function getCellFromRow(row, columnId) {
    const colName = `col_${columnId.replace(/-/g, '_')}`;
    return row[colName];
}
//# sourceMappingURL=events.js.map