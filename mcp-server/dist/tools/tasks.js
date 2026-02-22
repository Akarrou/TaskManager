import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
import { getCurrentUserId } from '../services/user-auth.js';
import { saveSnapshot } from '../services/snapshot.js';
/**
 * Get task databases accessible to the current user
 * Databases are accessible if they belong to a document owned by the user
 */
async function getUserTaskDatabases(supabase, userId) {
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
            return config?.type === 'task';
        });
    }
    return (databases || []).filter((db) => {
        const config = db.config;
        return config?.type === 'task';
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
// Task status and priority enums
const TaskStatusEnum = z.enum(['backlog', 'pending', 'in_progress', 'completed', 'cancelled', 'blocked', 'awaiting_info']);
const TaskPriorityEnum = z.enum(['low', 'medium', 'high', 'critical']);
const TaskTypeEnum = z.enum(['epic', 'feature', 'task']);
/**
 * Register all task-related tools
 */
export function registerTaskTools(server) {
    // =========================================================================
    // list_tasks - List tasks from all task databases
    // =========================================================================
    server.tool('list_tasks', `List tasks aggregated from all task-type databases in the workspace. Tasks are stored as rows in "task" type databases with standardized columns: Title, Description, Status, Priority, Type, Assigned To, Due Date. This tool scans all task databases and returns a unified view. Results are normalized and sorted by last updated. Status values: backlog, pending, in_progress, completed, cancelled, blocked, awaiting_info. Priority values: low, medium, high, critical. Related tools: create_task, update_task, get_task_stats.`, {
        status: TaskStatusEnum.optional().describe('Filter to only tasks with this status. Valid: backlog, pending, in_progress, completed, cancelled, blocked, awaiting_info.'),
        priority: TaskPriorityEnum.optional().describe('Filter to only tasks with this priority. Valid: low, medium, high, critical.'),
        project_id: z.string().uuid().optional().describe('Filter to tasks associated with this project.'),
        limit: z.number().min(1).max(100).optional().default(50).describe('Maximum tasks to return. Default 50, max 100.'),
    }, async ({ status, priority, project_id, limit }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Get task databases accessible to this user
            const taskDatabases = await getUserTaskDatabases(supabase, userId);
            if (taskDatabases.length === 0) {
                return {
                    content: [{ type: 'text', text: 'No task databases found. Create a task database first.' }],
                };
            }
            // Aggregate tasks from all databases
            const allTasks = [];
            for (const db of taskDatabases) {
                const tableName = `database_${db.database_id.replace('db-', '').replace(/-/g, '_')}`;
                let query = supabase
                    .from(tableName)
                    .select('*')
                    .limit(limit);
                const { data: rows, error: rowError } = await query;
                if (rowError) {
                    console.error(`Error fetching from ${tableName}:`, rowError);
                    continue;
                }
                // Normalize rows to task entries
                for (const row of rows || []) {
                    const task = normalizeRowToTask(row, db);
                    // Apply filters
                    if (status && task.status !== status)
                        continue;
                    if (priority && task.priority !== priority)
                        continue;
                    if (project_id && task.project_id !== project_id)
                        continue;
                    allTasks.push(task);
                }
            }
            // Sort by updated_at descending
            allTasks.sort((a, b) => {
                const dateA = new Date(a.updated_at).getTime();
                const dateB = new Date(b.updated_at).getTime();
                return dateB - dateA;
            });
            return {
                content: [{ type: 'text', text: `Found ${allTasks.length} tasks:\n${JSON.stringify(allTasks.slice(0, limit), null, 2)}` }],
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
    // get_task_stats - Get aggregated task statistics
    // =========================================================================
    server.tool('get_task_stats', `Get aggregated statistics for all tasks across all task databases. Returns: total count, count per status (backlog, pending, in_progress, completed, cancelled, blocked, awaiting_info), and completion rate percentage. Useful for dashboards, progress reports, and understanding workload distribution. Can be filtered to a specific project. Related tools: list_tasks (see individual tasks), get_documents_stats (document metrics).`, {
        project_id: z.string().uuid().optional().describe('Filter statistics to tasks in this project only. Omit for workspace-wide stats.'),
    }, async ({ project_id }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Get task databases accessible to this user
            const taskDatabases = await getUserTaskDatabases(supabase, userId);
            const stats = {
                total: 0,
                backlog: 0,
                pending: 0,
                in_progress: 0,
                completed: 0,
                cancelled: 0,
                blocked: 0,
                awaiting_info: 0,
                completionRate: 0,
            };
            for (const db of taskDatabases) {
                const tableName = `database_${db.database_id.replace('db-', '').replace(/-/g, '_')}`;
                const { data: rows } = await supabase.from(tableName).select('*');
                for (const row of rows || []) {
                    const task = normalizeRowToTask(row, db);
                    if (project_id && task.project_id !== project_id)
                        continue;
                    stats.total++;
                    const status = task.status;
                    if (status in stats && typeof stats[status] === 'number') {
                        stats[status]++;
                    }
                }
            }
            stats.completionRate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
            return {
                content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
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
    // update_task_status - Update a task's status
    // =========================================================================
    server.tool('update_task_status', `Quickly update just the status of a task. This is a convenience tool for the common operation of changing task status (e.g., moving from "pending" to "in_progress"). For updating multiple fields at once, use update_task instead. The database must have a "Status" column. Valid statuses: backlog, pending, in_progress, completed, cancelled, blocked, awaiting_info.`, {
        database_id: z.string().describe('The database ID where the task lives. Format: db-uuid. Get this from list_tasks result.'),
        row_id: z.string().uuid().describe('The row/task ID to update. Get this from list_tasks or get_task.'),
        status: TaskStatusEnum.describe('New status: backlog, pending, in_progress, completed, cancelled, blocked, or awaiting_info.'),
    }, async ({ database_id, row_id, status }) => {
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
            // Get database metadata to find status column
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
            const statusColumn = config.columns?.find(c => c.name === 'Status');
            if (!statusColumn) {
                return {
                    content: [{ type: 'text', text: 'Status column not found in database' }],
                    isError: true,
                };
            }
            const tableName = `database_${database_id.replace('db-', '').replace(/-/g, '_')}`;
            // Fetch current row for snapshot
            const { data: currentRow } = await supabase.from(tableName).select('*').eq('id', row_id).single();
            let snapshotToken = '';
            if (currentRow) {
                const snapshot = await saveSnapshot({
                    entityType: 'task_row',
                    entityId: row_id,
                    tableName,
                    toolName: 'update_task_status',
                    operation: 'update',
                    data: currentRow,
                    userId,
                });
                snapshotToken = snapshot.token;
            }
            // Update status column directly (matches Angular pattern)
            const colName = `col_${statusColumn.id.replace(/-/g, '_')}`;
            const { data, error } = await supabase
                .from(tableName)
                .update({
                [colName]: status,
                updated_at: new Date().toISOString(),
            })
                .eq('id', row_id)
                .select()
                .single();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error updating task status: ${error.message}` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Task status updated to "${status}" (snapshot: ${snapshotToken}):\n${JSON.stringify(data, null, 2)}` }],
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
    // update_task_priority - Update a task's priority
    // =========================================================================
    server.tool('update_task_priority', `Quickly update just the priority of a task. This is a convenience tool for changing task urgency. For updating multiple fields at once, use update_task instead. The database must have a "Priority" column. Priority affects task ordering in Kanban views. Valid priorities: low, medium, high, critical.`, {
        database_id: z.string().describe('The database ID where the task lives. Format: db-uuid. Get this from list_tasks result.'),
        row_id: z.string().uuid().describe('The row/task ID to update. Get this from list_tasks or get_task.'),
        priority: TaskPriorityEnum.describe('New priority: low, medium, high, or critical.'),
    }, async ({ database_id, row_id, priority }) => {
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
            const config = dbMeta.config;
            const priorityColumn = config.columns?.find(c => c.name === 'Priority');
            if (!priorityColumn) {
                return {
                    content: [{ type: 'text', text: 'Priority column not found in database' }],
                    isError: true,
                };
            }
            const tableName = `database_${database_id.replace('db-', '').replace(/-/g, '_')}`;
            // Fetch current row for snapshot
            const { data: currentRow } = await supabase.from(tableName).select('*').eq('id', row_id).single();
            let snapshotToken = '';
            if (currentRow) {
                const snapshot = await saveSnapshot({
                    entityType: 'task_row',
                    entityId: row_id,
                    tableName,
                    toolName: 'update_task_priority',
                    operation: 'update',
                    data: currentRow,
                    userId,
                });
                snapshotToken = snapshot.token;
            }
            // Update priority column directly (matches Angular pattern)
            const colName = `col_${priorityColumn.id.replace(/-/g, '_')}`;
            const { data, error } = await supabase
                .from(tableName)
                .update({
                [colName]: priority,
                updated_at: new Date().toISOString(),
            })
                .eq('id', row_id)
                .select()
                .single();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error updating task priority: ${error.message}` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Task priority updated to "${priority}" (snapshot: ${snapshotToken}):\n${JSON.stringify(data, null, 2)}` }],
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
    // create_task - Create a new task in a database
    // =========================================================================
    server.tool('create_task', `Create a new task in a task-type database. A linked document is automatically created (Notion-style).

⚠️ MANDATORY WORKFLOW - DO NOT SKIP ANY STEP ⚠️

The AI agent MUST execute these steps IN ORDER before calling create_task:

STEP 1: List task databases
→ Call list_databases with type="task"
→ Wait for response before proceeding

STEP 2: Handle database selection
→ If 0 databases: ASK user "Aucune base de tâches trouvée. Voulez-vous en créer une?" then use create_database
→ If 1 database: INFORM user "J'utilise la base [name]" and proceed
→ If 2+ databases: ASK user "Quelle base de données voulez-vous utiliser?" with numbered list

STEP 3: Collect task title (REQUIRED)
→ ASK user: "Quel est le titre de la tâche?"
→ Wait for response - DO NOT proceed without a title

STEP 4: Collect optional fields
→ ASK user about optional fields in ONE question:
  - Description (texte libre)
  - Priorité (low/medium/high/critical) - défaut: medium
  - Type (epic/feature/task) - défaut: task
  - Assigné à (nom)
  - Date d'échéance (format: YYYY-MM-DD)

STEP 5: Create the task
→ Only NOW call create_task with all collected information

Returns: { task, document }. Related tools: list_databases, create_database.`, {
        database_id: z.string().describe('The task database to add to. Format: db-uuid. Get this from list_databases or the database where you want the task.'),
        title: z.string().min(1).describe('Task title - the main identifier shown in lists and Kanban cards.'),
        description: z.string().optional().describe('Detailed description of the task. Supports plain text.'),
        status: TaskStatusEnum.optional().default('pending').describe('Initial status. Default "pending". Options: backlog, pending, in_progress, completed, cancelled, blocked, awaiting_info.'),
        priority: TaskPriorityEnum.optional().default('medium').describe('Task priority. Default "medium". Options: low, medium, high, critical.'),
        type: TaskTypeEnum.optional().default('task').describe('Task type for categorization. Default "task". Options: epic (large feature), feature (deliverable), task (work item).'),
        assigned_to: z.string().optional().describe('Name or identifier of the person assigned. Free text field.'),
        due_date: z.string().optional().describe('Due date in ISO format (e.g., "2024-12-31" or "2024-12-31T09:00:00Z").'),
        user_id: z.string().uuid().optional().describe('User ID to assign ownership of the linked document. Required for RLS access. Get this from list_users or get_profile.'),
    }, async ({ database_id, title, description, status, priority, type, assigned_to, due_date, user_id }) => {
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
            const isTaskDatabase = config.type === 'task';
            // Build cells object mapping column names to values
            const cells = {};
            const findColumnId = (name) => columns.find(c => c.name === name)?.id;
            const titleColId = findColumnId('Title');
            if (titleColId)
                cells[titleColId] = title;
            const descColId = findColumnId('Description');
            if (descColId && description)
                cells[descColId] = description;
            const statusColId = findColumnId('Status');
            if (statusColId)
                cells[statusColId] = status;
            const priorityColId = findColumnId('Priority');
            if (priorityColId)
                cells[priorityColId] = priority;
            const typeColId = findColumnId('Type');
            if (typeColId)
                cells[typeColId] = type;
            const assignedColId = findColumnId('Assigned To');
            if (assignedColId && assigned_to)
                cells[assignedColId] = assigned_to;
            const dueDateColId = findColumnId('Due Date');
            if (dueDateColId && due_date)
                cells[dueDateColId] = due_date;
            // Auto-generate task number for task databases
            const taskNumberColId = findColumnId('Task Number');
            if (isTaskDatabase && taskNumberColId) {
                const { data: taskNumber, error: rpcError } = await supabase.rpc('get_next_task_number');
                if (rpcError) {
                    console.error('Failed to get next task number:', rpcError.message);
                }
                else if (taskNumber) {
                    cells[taskNumberColId] = taskNumber;
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
                    content: [{ type: 'text', text: `Error creating task: ${error.message}` }],
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
                user_id: user_id || currentUserId, // Use provided user_id or current user
            })
                .select()
                .single();
            if (docError) {
                // Return task with document error info
                return {
                    content: [{ type: 'text', text: `Task created but linked document failed:\n${JSON.stringify({ task: data, document: null, document_error: docError.message }, null, 2)}` }],
                };
            }
            return {
                content: [{ type: 'text', text: `Task created successfully:\n${JSON.stringify({ task: data, document: docData }, null, 2)}` }],
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
    // get_task - Get a specific task by ID
    // =========================================================================
    server.tool('get_task', `Get full details of a specific task including all fields. Returns normalized task object with: id, database_id, title, description, status, priority, type, assigned_to, due_date, and timestamps. Use this when you need complete task information after getting an ID from list_tasks. The response includes the database_id and database_name for context. Related tools: update_task (modify), delete_task (remove), link_task_to_document (associate with docs).`, {
        database_id: z.string().describe('The database ID containing the task. Format: db-uuid.'),
        row_id: z.string().uuid().describe('The specific task/row ID to retrieve.'),
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
                    content: [{ type: 'text', text: `Task not found: ${row_id}` }],
                    isError: true,
                };
            }
            const task = normalizeRowToTask(row, dbMeta);
            return {
                content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
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
    // get_task_by_number - Search task by number (e.g., "ID-0208")
    // =========================================================================
    server.tool('get_task_by_number', `Search for a task by its task number (e.g., "ID-0208") and return the task with its linked document. Task numbers are auto-generated when tasks are created in task-type databases. This tool searches across all accessible task databases. Returns both the task details and the associated Notion-style document.`, {
        task_number: z.string().describe('The task number to search for (e.g., "ID-0208", "ID-0001")'),
        include_document: z.boolean().optional().default(true).describe('Include the linked document in the response (default: true)'),
    }, async ({ task_number, include_document }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            // Get task databases accessible to this user
            const taskDatabases = await getUserTaskDatabases(supabase, userId);
            if (taskDatabases.length === 0) {
                return {
                    content: [{ type: 'text', text: 'No task databases found.' }],
                    isError: true,
                };
            }
            // Search in each database
            for (const db of taskDatabases) {
                const config = db.config;
                const columns = config.columns || [];
                // Find "Task Number" column
                const taskNumberCol = columns.find(c => c.name === 'Task Number');
                if (!taskNumberCol)
                    continue;
                const tableName = `database_${db.database_id.replace('db-', '').replace(/-/g, '_')}`;
                const colName = `col_${taskNumberCol.id.replace(/-/g, '_')}`;
                const { data: row, error } = await supabase
                    .from(tableName)
                    .select('*')
                    .eq(colName, task_number)
                    .maybeSingle();
                if (error || !row)
                    continue;
                // Found the task!
                const task = normalizeRowToTask(row, db);
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
                    content: [{ type: 'text', text: JSON.stringify({ task, document }, null, 2) }],
                };
            }
            // Not found
            return {
                content: [{ type: 'text', text: `Task not found: ${task_number}` }],
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
    // get_task_document - Get the document linked to a task
    // =========================================================================
    server.tool('get_task_document', `Get the document linked to a task. Each task in a task database has an associated document (Notion-style) that can contain rich content, notes, and details. The document is automatically created when the task is created. Use this to retrieve the document for viewing or editing its content. Returns the full document object including id, title, content, and metadata.`, {
        database_id: z.string().describe('The database ID where the task lives. Format: db-uuid.'),
        row_id: z.string().uuid().describe('The task/row ID to get the document for.'),
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
                    content: [{ type: 'text', text: `Error getting task document: ${error.message}` }],
                    isError: true,
                };
            }
            if (!data) {
                return {
                    content: [{ type: 'text', text: 'No document found for this task. The document may not have been created or may have been deleted.' }],
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
    // update_task - Update all fields of a task
    // =========================================================================
    server.tool('update_task', `Update one or more fields of an existing task. Only provide the fields you want to change - unspecified fields remain unchanged. This is the comprehensive update tool; use update_task_status or update_task_priority for single-field updates. Returns the complete updated task. At least one field must be provided. All field values use the same format as create_task.`, {
        database_id: z.string().describe('The database ID containing the task. Format: db-uuid.'),
        row_id: z.string().uuid().describe('The task/row ID to update.'),
        title: z.string().min(1).optional().describe('New title. Leave undefined to keep current.'),
        description: z.string().optional().describe('New description. Leave undefined to keep current.'),
        status: TaskStatusEnum.optional().describe('New status: backlog, pending, in_progress, completed, cancelled, blocked, awaiting_info.'),
        priority: TaskPriorityEnum.optional().describe('New priority: low, medium, high, critical.'),
        type: TaskTypeEnum.optional().describe('New type: epic, feature, task.'),
        assigned_to: z.string().optional().describe('New assignee name/identifier.'),
        due_date: z.string().optional().describe('New due date in ISO format.'),
    }, async ({ database_id, row_id, title, description, status, priority, type, assigned_to, due_date }) => {
        try {
            // Check for updates early to avoid unnecessary DB calls and snapshots
            const updates = [];
            if (title !== undefined)
                updates.push({ name: 'Title', value: title });
            if (description !== undefined)
                updates.push({ name: 'Description', value: description });
            if (status !== undefined)
                updates.push({ name: 'Status', value: status });
            if (priority !== undefined)
                updates.push({ name: 'Priority', value: priority });
            if (type !== undefined)
                updates.push({ name: 'Type', value: type });
            if (assigned_to !== undefined)
                updates.push({ name: 'Assigned To', value: assigned_to });
            if (due_date !== undefined)
                updates.push({ name: 'Due Date', value: due_date });
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
                    content: [{ type: 'text', text: `Task not found: ${row_id}` }],
                    isError: true,
                };
            }
            // Snapshot before modification
            const snapshot = await saveSnapshot({
                entityType: 'task_row',
                entityId: row_id,
                tableName,
                toolName: 'update_task',
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
                    content: [{ type: 'text', text: `Error updating task: ${error.message}` }],
                    isError: true,
                };
            }
            const task = normalizeRowToTask(data, dbMeta);
            return {
                content: [{ type: 'text', text: `Task updated (snapshot: ${snapshotToken}):\n${JSON.stringify(task, null, 2)}` }],
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
    // delete_task - Delete a task
    // =========================================================================
    server.tool('delete_task', `Permanently delete a task from a database. This removes the row from the task database. The deletion is immediate and cannot be undone. Returns confirmation with the deleted task's information. Any links to documents (via link_task_to_document) are also removed. Consider using update_task_status to set status to "cancelled" instead if you want to preserve history.`, {
        database_id: z.string().describe('The database ID containing the task to delete. Format: db-uuid.'),
        row_id: z.string().uuid().describe('The task/row ID to permanently delete.'),
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
            // Get task info before deleting
            const { data: taskRow } = await supabase
                .from(tableName)
                .select('*')
                .eq('id', row_id)
                .single();
            let snapshotToken = '';
            if (taskRow) {
                const snapshot = await saveSnapshot({
                    entityType: 'task_row',
                    entityId: row_id,
                    tableName,
                    toolName: 'delete_task',
                    operation: 'delete',
                    data: taskRow,
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
                    content: [{ type: 'text', text: `Error deleting task: ${error.message}` }],
                    isError: true,
                };
            }
            const task = taskRow ? normalizeRowToTask(taskRow, dbMeta) : { id: row_id };
            return {
                content: [{ type: 'text', text: `Task deleted (snapshot: ${snapshotToken}):\n${JSON.stringify(task, null, 2)}` }],
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
/**
 * Helper: Normalize a database row to a task-like object
 * Reads individual columns (col_xxx) matching Angular's pattern
 */
function normalizeRowToTask(row, dbMeta) {
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
        task_number: getCell('Task Number'),
        title: getCell('Title') || 'Untitled',
        description: getCell('Description'),
        status: normalizeStatus(getCell('Status')),
        priority: normalizePriority(getCell('Priority')),
        type: getCell('Type') || 'task',
        assigned_to: getCell('Assigned To'),
        due_date: getCell('Due Date'),
        project_id: getCell('Project ID'),
        created_at: row.created_at,
        updated_at: row.updated_at,
        row_order: row.row_order,
    };
}
function normalizeStatus(value) {
    if (!value)
        return 'pending';
    const normalized = value.toLowerCase().replace(/\s+/g, '_');
    const validStatuses = ['backlog', 'pending', 'in_progress', 'completed', 'cancelled', 'blocked', 'awaiting_info'];
    return validStatuses.includes(normalized) ? normalized : 'pending';
}
function normalizePriority(value) {
    if (!value)
        return 'medium';
    const normalized = value.toLowerCase();
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    return validPriorities.includes(normalized) ? normalized : 'medium';
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
//# sourceMappingURL=tasks.js.map