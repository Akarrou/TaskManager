import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
import { getCurrentUserId } from '../services/user-auth.js';
import { saveSnapshot } from '../services/snapshot.js';
import { userHasDatabaseAccess, getUserDatabasesByType } from '../utils/database-access.js';
// Event category — accepts any string to support custom categories
const EventCategoryEnum = z.string().describe('Event category. Default values: meeting, deadline, milestone, reminder, personal, other. Custom category keys are also accepted.');
// Attendee schema matching Angular EventAttendee interface
const EventAttendeeSchema = z.object({
    email: z.string().email().describe('Attendee email address.'),
    displayName: z.string().optional().describe('Display name of the attendee.'),
    userId: z.string().optional().describe('Kodo user ID if the attendee is a Kodo user.'),
    rsvpStatus: z.enum(['accepted', 'declined', 'tentative', 'needsAction']).optional().default('needsAction').describe('RSVP status.'),
    isOrganizer: z.boolean().optional().default(false).describe('Whether this attendee is the organizer.'),
    isOptional: z.boolean().optional().default(false).describe('Whether attendance is optional.'),
});
// Guest permissions schema matching Angular EventGuestPermissions interface
const GuestPermissionsSchema = z.object({
    guestsCanModify: z.boolean().optional().default(false).describe('Whether guests can modify the event.'),
    guestsCanInviteOthers: z.boolean().optional().default(true).describe('Whether guests can invite others.'),
    guestsCanSeeOtherGuests: z.boolean().optional().default(true).describe('Whether guests can see other guests.'),
});
// Reminder schema matching Angular GoogleCalendarReminder interface
const ReminderSchema = z.object({
    method: z.enum(['popup', 'email']).describe('Reminder method: popup or email.'),
    minutes: z.number().min(0).describe('Minutes before the event to trigger the reminder.'),
});
/**
 * Register all event-related tools
 */
export function registerEventTools(server) {
    // =========================================================================
    // list_events - List events from all event databases
    // =========================================================================
    server.registerTool('list_events', {
        description: `List events aggregated from all event-type databases in the workspace. Events are stored as rows in "event" type databases with standardized columns: Title, Description, Start Date, End Date, All Day, Category, Location, Recurrence, Linked Items, Project ID, Event Number, Color, Google Meet, Attendees, Reminders. This tool scans all event databases and returns a unified view. Results are normalized and sorted by start date. Each event includes: id, database_id, database_name, event_number, title, description, start_date, end_date, all_day, category, location, recurrence, linked_items, project_id, reminders, meet_link, color, attendees, guest_permissions, timestamps. Default category values: meeting, deadline, milestone, reminder, personal, other (custom categories also accepted). Related tools: create_event, update_event, get_event, list_event_categories, list_calendar_docs, get_calendar_doc.`,
        inputSchema: {
            category: EventCategoryEnum.optional().describe('Filter to only events with this category. Valid: meeting, deadline, milestone, reminder, personal, other.'),
            project_id: z.string().uuid().optional().describe('Filter to events associated with this project.'),
            start_date: z.string().optional().describe('Filter events starting on or after this date (ISO format, e.g., "2024-12-01" or "2024-12-01T09:00:00Z").'),
            end_date: z.string().optional().describe('Filter events ending on or before this date (ISO format, e.g., "2024-12-31" or "2024-12-31T23:59:59Z").'),
            limit: z.number().min(1).max(100).optional().default(50).describe('Maximum events to return. Default 50, max 100.'),
        },
        annotations: { readOnlyHint: true },
    }, async ({ category, project_id, start_date, end_date, limit }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Get event databases accessible to this user (cached)
            const eventDatabases = await getUserDatabasesByType(supabase, userId, 'event');
            if (eventDatabases.length === 0) {
                return {
                    content: [{ type: 'text', text: 'No event databases found. Create an event database first.' }],
                };
            }
            // Aggregate events from all databases in parallel
            const dbResults = await Promise.all(eventDatabases.map(async (db) => {
                const tableName = `database_${db.database_id.replace('db-', '').replace(/-/g, '_')}`;
                const config = db.config;
                const columns = config.columns || [];
                const startDateCol = columns.find(c => c.name === 'Start Date');
                const endDateCol = columns.find(c => c.name === 'End Date');
                let query = supabase
                    .from(tableName)
                    .select('*')
                    .is('deleted_at', null)
                    .limit(250);
                // Push date filters SQL-side
                if (start_date && endDateCol) {
                    const endColName = `col_${endDateCol.id.replace(/-/g, '_')}`;
                    query = query.gte(endColName, start_date);
                }
                if (end_date && startDateCol) {
                    const startColName = `col_${startDateCol.id.replace(/-/g, '_')}`;
                    query = query.lte(startColName, end_date);
                }
                // Push category filter SQL-side
                if (category) {
                    const categoryCol = columns.find(c => c.name === 'Category');
                    if (categoryCol) {
                        query = query.eq(`col_${categoryCol.id.replace(/-/g, '_')}`, category);
                    }
                }
                // Push project_id filter SQL-side
                if (project_id) {
                    const projectCol = columns.find(c => c.name === 'Project ID');
                    if (projectCol) {
                        query = query.eq(`col_${projectCol.id.replace(/-/g, '_')}`, project_id);
                    }
                }
                const { data: rows, error: rowError } = await query;
                if (rowError) {
                    console.error(`Error fetching from ${tableName}:`, rowError);
                    return [];
                }
                const events = (rows || []).map((row) => normalizeRowToEvent(row, db));
                // Apply remaining date filters that couldn't be fully pushed to SQL
                return events.filter(event => {
                    if (start_date && event.start_date) {
                        const eventStart = new Date(event.start_date).getTime();
                        const filterStart = new Date(start_date).getTime();
                        if (eventStart < filterStart)
                            return false;
                    }
                    if (end_date && event.end_date) {
                        const eventEnd = new Date(event.end_date).getTime();
                        const filterEnd = new Date(end_date).getTime();
                        if (eventEnd > filterEnd)
                            return false;
                    }
                    return true;
                });
            }));
            const allEvents = dbResults.flat();
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
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // create_event - Create a new event in a database
    // =========================================================================
    server.registerTool('create_event', {
        description: `Create a new event in an event-type database. A linked document is automatically created (Notion-style).

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
  - Attendees (array of {email, displayName?, rsvpStatus?, isOrganizer?, isOptional?})
  - Guest permissions ({guestsCanModify?, guestsCanInviteOthers?, guestsCanSeeOtherGuests?})
  - Reminders (array of {method: "popup"|"email", minutes: number})
  - Meet link (Google Meet URL, if already known)

STEP 5: Create the event
-> Only NOW call create_event with all collected information

For detailed documentation on categories, linked items, recurrence rules, etc., use list_calendar_docs and get_calendar_doc.

Returns: { event, document }. Related tools: list_databases, create_database, list_calendar_docs.`,
        inputSchema: {
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
            attendees: z.array(EventAttendeeSchema).optional().describe('Array of event attendees with email, displayName, rsvpStatus, isOrganizer, isOptional.'),
            guest_permissions: GuestPermissionsSchema.optional().describe('Guest permissions for the event. Only meaningful when attendees are present.'),
            reminders: z.array(ReminderSchema).optional().describe('Array of reminders. Each has method ("popup" or "email") and minutes before event.'),
            meet_link: z.string().url().optional().describe('Google Meet link URL for the event.'),
            color: z.string().optional().describe('Event color as hex string (e.g., "#3b82f6"). Used for Google Calendar color mapping.'),
            project_id: z.string().uuid().optional().describe('Project ID to associate this event with.'),
            user_id: z.string().uuid().optional().describe('User ID to assign ownership of the linked document. Required for RLS access. Get this from list_users or get_profile.'),
        },
    }, async ({ database_id, title, description, start_date, end_date, all_day, category, location, recurrence, linked_items, attendees, guest_permissions, reminders, meet_link, color, project_id, user_id }) => {
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
            // Attendees — stored as JSON.stringify({attendees: [...], permissions: {...}})
            // MUST match Angular's format: JSON string inside JSONB column
            const attendeesColId = findColumnId('Attendees');
            if (attendeesColId && (attendees || guest_permissions)) {
                const attendeesData = {};
                if (attendees)
                    attendeesData.attendees = attendees;
                if (guest_permissions) {
                    attendeesData.permissions = guest_permissions;
                }
                else if (attendees) {
                    // Default permissions when attendees are provided
                    attendeesData.permissions = {
                        guestsCanModify: false,
                        guestsCanInviteOthers: true,
                        guestsCanSeeOtherGuests: true,
                    };
                }
                cells[attendeesColId] = JSON.stringify(attendeesData);
            }
            // Reminders — stored as JSON.stringify([{method, minutes}])
            // MUST match Angular's format: JSON string inside JSONB column
            const remindersColId = findColumnId('Reminders');
            if (remindersColId && reminders)
                cells[remindersColId] = JSON.stringify(reminders);
            // Google Meet link
            const meetLinkColId = findColumnId('Google Meet');
            if (meetLinkColId && meet_link)
                cells[meetLinkColId] = meet_link;
            // Color
            const colorColId = findColumnId('Color');
            if (colorColId && color)
                cells[colorColId] = color;
            // Project ID
            const projectIdColId = findColumnId('Project ID');
            if (projectIdColId && project_id)
                cells[projectIdColId] = project_id;
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
                    content: [{ type: 'text', text: `Error creating event. Please try again.` }],
                    isError: true,
                };
            }
            // Normalize the raw row to a readable event object
            const normalizedEvent = normalizeRowToEvent(data, dbMeta);
            // Create the linked document (Notion-style) - always use current user
            const { data: docData, error: docError } = await supabase
                .from('documents')
                .insert({
                title: title,
                database_id: database_id,
                database_row_id: data.id,
                project_id: project_id || dbMeta.project_id || null,
                content: { type: 'doc', content: [] },
                user_id: user_id || currentUserId,
            })
                .select()
                .single();
            if (docError) {
                // Return event with document error info
                return {
                    content: [{ type: 'text', text: `Event created but linked document failed:\n${JSON.stringify({ event: normalizedEvent, document: null, document_error: docError.message }, null, 2)}` }],
                };
            }
            return {
                content: [{ type: 'text', text: `Event created successfully:\n${JSON.stringify({ event: normalizedEvent, document: docData }, null, 2)}` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // get_event - Get a specific event by ID
    // =========================================================================
    server.registerTool('get_event', {
        description: `Get full details of a specific event including all fields. Returns normalized event object with: id, database_id, database_name, event_number, title, description, start_date, end_date, all_day, category, location, recurrence, linked_items, project_id, reminders, meet_link, color, attendees, guest_permissions, created_at, updated_at, row_order. Use this when you need complete event information after getting an ID from list_events. Related tools: update_event (modify), delete_event (remove), list_event_categories.`,
        inputSchema: {
            database_id: z.string().describe('The database ID containing the event. Format: db-uuid.'),
            row_id: z.string().uuid().describe('The specific event/row ID to retrieve.'),
        },
        annotations: { readOnlyHint: true },
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
                .is('deleted_at', null)
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
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // get_event_by_number - Search event by number (e.g., "EVT-0001")
    // =========================================================================
    server.registerTool('get_event_by_number', {
        description: `Search for an event by its event number (e.g., "EVT-0001") and return the event with its linked document. Event numbers are auto-generated when events are created in event-type databases. This tool searches across all accessible event databases. Returns both the event details and the associated Notion-style document.`,
        inputSchema: {
            event_number: z.string().describe('The event number to search for (e.g., "EVT-0001", "EVT-0042")'),
            include_document: z.boolean().optional().default(true).describe('Include the linked document in the response (default: true)'),
        },
        annotations: { readOnlyHint: true },
    }, async ({ event_number, include_document }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Get event databases accessible to this user
            const eventDatabases = await getUserDatabasesByType(supabase, userId, 'event');
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
                    .is('deleted_at', null)
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
                        .is('deleted_at', null)
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
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // get_event_document - Get the document linked to an event
    // =========================================================================
    server.registerTool('get_event_document', {
        description: `Get the document linked to an event. Each event in an event database has an associated document (Notion-style) that can contain rich content, notes, and details. The document is automatically created when the event is created. Use this to retrieve the document for viewing or editing its content. Returns the full document object including id, title, content, and metadata.`,
        inputSchema: {
            database_id: z.string().describe('The database ID where the event lives. Format: db-uuid.'),
            row_id: z.string().uuid().describe('The event/row ID to get the document for.'),
        },
        annotations: { readOnlyHint: true },
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
                .is('deleted_at', null)
                .maybeSingle();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error getting event document. Please try again.` }],
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
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // update_event - Update all fields of an event
    // =========================================================================
    server.registerTool('update_event', {
        description: `Update one or more fields of an existing event. Only provide the fields you want to change - unspecified fields remain unchanged. Returns the complete updated event. At least one field must be provided. All field values use the same format as create_event. Note: linked_items and attendees replace the entire array (not append). For attendees, the Attendees column stores {attendees: [...], permissions: {...}} as a JSON-stringified string. Related tools: get_event, list_calendar_docs, get_calendar_doc.`,
        inputSchema: {
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
            attendees: z.array(EventAttendeeSchema).optional().describe('New attendees array. Replaces existing. Leave undefined to keep current.'),
            guest_permissions: GuestPermissionsSchema.optional().describe('New guest permissions. Leave undefined to keep current.'),
            reminders: z.array(ReminderSchema).optional().describe('New reminders array. Replaces existing. Leave undefined to keep current.'),
            meet_link: z.string().url().optional().describe('Google Meet link URL. Leave undefined to keep current.'),
            color: z.string().optional().describe('Event color hex string. Leave undefined to keep current.'),
        },
        annotations: { idempotentHint: true },
    }, async ({ database_id, row_id, title, description, start_date, end_date, all_day, category, location, recurrence, linked_items, attendees, guest_permissions, reminders, meet_link, color }) => {
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
            if (reminders !== undefined)
                updates.push({ name: 'Reminders', value: JSON.stringify(reminders) });
            if (meet_link !== undefined)
                updates.push({ name: 'Google Meet', value: meet_link });
            if (color !== undefined)
                updates.push({ name: 'Color', value: color });
            // Attendees require special handling: merge attendees + permissions into single JSON column
            if (attendees !== undefined || guest_permissions !== undefined) {
                // We need to read the current attendees data to merge properly
                updates.push({ name: '__attendees_update__', value: { attendees, guest_permissions } });
            }
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
                // Special handling for attendees: merge into single JSON column
                if (update.name === '__attendees_update__') {
                    const attendeesColId = findColumnId('Attendees');
                    if (attendeesColId) {
                        const colName = `col_${attendeesColId.replace(/-/g, '_')}`;
                        const updatePayload = update.value;
                        // Read current attendees data from the row
                        const currentAttendeesRaw = currentRow[colName];
                        let currentAttendeesData = {};
                        if (currentAttendeesRaw && typeof currentAttendeesRaw === 'object') {
                            currentAttendeesData = currentAttendeesRaw;
                        }
                        else if (typeof currentAttendeesRaw === 'string') {
                            try {
                                currentAttendeesData = JSON.parse(currentAttendeesRaw);
                            }
                            catch { /* ignore */ }
                        }
                        // Merge: only update provided fields
                        const merged = { ...currentAttendeesData };
                        if (updatePayload.attendees !== undefined)
                            merged.attendees = updatePayload.attendees;
                        if (updatePayload.guest_permissions !== undefined)
                            merged.permissions = updatePayload.guest_permissions;
                        // MUST match Angular's format: JSON string inside JSONB column
                        updateData[colName] = JSON.stringify(merged);
                    }
                    continue;
                }
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
                    content: [{ type: 'text', text: `Error updating event. Please try again.` }],
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
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // delete_event - Soft delete an event (move to trash)
    // =========================================================================
    server.registerTool('delete_event', {
        description: `Move an event to the trash (soft delete). The event is marked as deleted but can be restored within 30 days using restore_from_trash. A snapshot is taken before deletion for additional recovery. Note: if Google Calendar sync is active, the corresponding Google event will also be deleted when the event is removed via the Angular app.`,
        inputSchema: {
            database_id: z.string().describe('The database ID containing the event to delete. Format: db-uuid.'),
            row_id: z.string().uuid().describe('The event/row ID to move to trash.'),
        },
        annotations: { destructiveHint: true },
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
            // Get event info before soft deleting
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
                    operation: 'soft_delete',
                    data: eventRow,
                    userId,
                });
                snapshotToken = snapshot.token;
            }
            const now = new Date().toISOString();
            const event = eventRow ? normalizeRowToEvent(eventRow, dbMeta) : null;
            const displayName = event?.title || 'Event';
            // Soft delete: set deleted_at on the row
            const { error: updateError } = await supabase
                .from(tableName)
                .update({ deleted_at: now })
                .eq('id', row_id);
            if (updateError) {
                return {
                    content: [{ type: 'text', text: `Error soft-deleting event. Please try again.` }],
                    isError: true,
                };
            }
            // Insert into trash_items
            await supabase
                .from('trash_items')
                .insert({
                item_type: 'event',
                item_id: row_id,
                item_table: tableName,
                display_name: displayName,
                parent_info: { databaseId: database_id, databaseName: dbMeta.name },
                user_id: userId,
                deleted_at: now,
            });
            return {
                content: [{ type: 'text', text: `Event moved to trash (snapshot: ${snapshotToken}). Use restore_from_trash to recover it.\n${JSON.stringify(event || { id: row_id }, null, 2)}` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
}
// =============================================================================
// Helper functions
// =============================================================================
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
    // Parse attendees JSON column: { attendees: [...], permissions: {...} }
    const attendeesRaw = getCell('Attendees');
    let attendeesData = {};
    if (attendeesRaw && typeof attendeesRaw === 'object') {
        attendeesData = attendeesRaw;
    }
    else if (typeof attendeesRaw === 'string') {
        try {
            attendeesData = JSON.parse(attendeesRaw);
        }
        catch { /* ignore */ }
    }
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
        reminders: parseReminders(getCell('Reminders')),
        meet_link: getCell('Google Meet'),
        color: getCell('Color'),
        attendees: attendeesData.attendees || null,
        guest_permissions: attendeesData.permissions || null,
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
/**
 * Parse reminders from JSON string stored in database
 */
function parseReminders(value) {
    if (!value)
        return null;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=events.js.map