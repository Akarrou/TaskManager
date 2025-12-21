import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';

// Task status and priority enums
const TaskStatusEnum = z.enum(['backlog', 'pending', 'in_progress', 'completed', 'cancelled', 'blocked', 'awaiting_info']);
const TaskPriorityEnum = z.enum(['low', 'medium', 'high', 'critical']);
const TaskTypeEnum = z.enum(['epic', 'feature', 'task']);

/**
 * Register all task-related tools
 */
export function registerTaskTools(server: McpServer): void {
  // =========================================================================
  // list_tasks - List tasks from all task databases
  // =========================================================================
  server.tool(
    'list_tasks',
    `List tasks aggregated from all task-type databases in the workspace. Tasks are stored as rows in "task" type databases with standardized columns: Title, Description, Status, Priority, Type, Assigned To, Due Date. This tool scans all task databases and returns a unified view. Results are normalized and sorted by last updated. Status values: backlog, pending, in_progress, completed, cancelled, blocked, awaiting_info. Priority values: low, medium, high, critical. Related tools: create_task, update_task, get_task_stats.`,
    {
      status: TaskStatusEnum.optional().describe('Filter to only tasks with this status. Valid: backlog, pending, in_progress, completed, cancelled, blocked, awaiting_info.'),
      priority: TaskPriorityEnum.optional().describe('Filter to only tasks with this priority. Valid: low, medium, high, critical.'),
      project_id: z.string().uuid().optional().describe('Filter to tasks associated with this project.'),
      limit: z.number().min(1).max(100).optional().default(50).describe('Maximum tasks to return. Default 50, max 100.'),
    },
    async ({ status, priority, project_id, limit }) => {
      try {
        const supabase = getSupabaseClient();

        // First, get all task-type databases
        const { data: databases, error: dbError } = await supabase
          .from('document_databases')
          .select('*');

        if (dbError) {
          return {
            content: [{ type: 'text', text: `Error fetching databases: ${dbError.message}` }],
            isError: true,
          };
        }

        // Filter for task-type databases
        const taskDatabases = (databases || []).filter((db: Record<string, unknown>) => {
          const config = db.config as { type?: string } | undefined;
          return config?.type === 'task';
        });

        if (taskDatabases.length === 0) {
          return {
            content: [{ type: 'text', text: 'No task databases found. Create a task database first.' }],
          };
        }

        // Aggregate tasks from all databases
        const allTasks: Record<string, unknown>[] = [];

        for (const db of taskDatabases) {
          const tableName = `database_${db.database_id.replace('db-', '')}`;

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
            if (status && task.status !== status) continue;
            if (priority && task.priority !== priority) continue;
            if (project_id && task.project_id !== project_id) continue;

            allTasks.push(task);
          }
        }

        // Sort by updated_at descending
        allTasks.sort((a, b) => {
          const dateA = new Date(a.updated_at as string).getTime();
          const dateB = new Date(b.updated_at as string).getTime();
          return dateB - dateA;
        });

        return {
          content: [{ type: 'text', text: `Found ${allTasks.length} tasks:\n${JSON.stringify(allTasks.slice(0, limit), null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // get_task_stats - Get aggregated task statistics
  // =========================================================================
  server.tool(
    'get_task_stats',
    `Get aggregated statistics for all tasks across all task databases. Returns: total count, count per status (backlog, pending, in_progress, completed, cancelled, blocked, awaiting_info), and completion rate percentage. Useful for dashboards, progress reports, and understanding workload distribution. Can be filtered to a specific project. Related tools: list_tasks (see individual tasks), get_documents_stats (document metrics).`,
    {
      project_id: z.string().uuid().optional().describe('Filter statistics to tasks in this project only. Omit for workspace-wide stats.'),
    },
    async ({ project_id }) => {
      try {
        const supabase = getSupabaseClient();

        // Try to use RPC function if available
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_task_stats_aggregated', {
          p_project_id: project_id || null,
        });

        if (!rpcError && rpcData) {
          return {
            content: [{ type: 'text', text: JSON.stringify(rpcData, null, 2) }],
          };
        }

        // Fallback: calculate manually
        const { data: databases } = await supabase
          .from('document_databases')
          .select('*');

        const taskDatabases = (databases || []).filter((db: Record<string, unknown>) => {
          const config = db.config as { type?: string } | undefined;
          return config?.type === 'task';
        });

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
          const tableName = `database_${db.database_id.replace('db-', '')}`;
          const { data: rows } = await supabase.from(tableName).select('*');

          for (const row of rows || []) {
            const task = normalizeRowToTask(row, db);
            if (project_id && task.project_id !== project_id) continue;

            stats.total++;
            const status = task.status as keyof typeof stats;
            if (status in stats && typeof stats[status] === 'number') {
              (stats[status] as number)++;
            }
          }
        }

        stats.completionRate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;

        return {
          content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // update_task_status - Update a task's status
  // =========================================================================
  server.tool(
    'update_task_status',
    `Quickly update just the status of a task. This is a convenience tool for the common operation of changing task status (e.g., moving from "pending" to "in_progress"). For updating multiple fields at once, use update_task instead. The database must have a "Status" column. Valid statuses: backlog, pending, in_progress, completed, cancelled, blocked, awaiting_info.`,
    {
      database_id: z.string().describe('The database ID where the task lives. Format: db-uuid. Get this from list_tasks result.'),
      row_id: z.string().uuid().describe('The row/task ID to update. Get this from list_tasks or get_task.'),
      status: TaskStatusEnum.describe('New status: backlog, pending, in_progress, completed, cancelled, blocked, or awaiting_info.'),
    },
    async ({ database_id, row_id, status }) => {
      try {
        const supabase = getSupabaseClient();

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

        const config = dbMeta.config as { columns?: Array<{ id: string; name: string }> };
        const statusColumn = config.columns?.find(c => c.name === 'Status');

        if (!statusColumn) {
          return {
            content: [{ type: 'text', text: 'Status column not found in database' }],
            isError: true,
          };
        }

        const tableName = `database_${database_id.replace('db-', '')}`;

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

        // Update cells with new status
        const updatedCells = {
          ...currentRow.cells,
          [statusColumn.id]: status,
        };

        const { data, error } = await supabase
          .from(tableName)
          .update({
            cells: updatedCells,
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
          content: [{ type: 'text', text: `Task status updated to "${status}":\n${JSON.stringify(data, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // update_task_priority - Update a task's priority
  // =========================================================================
  server.tool(
    'update_task_priority',
    `Quickly update just the priority of a task. This is a convenience tool for changing task urgency. For updating multiple fields at once, use update_task instead. The database must have a "Priority" column. Priority affects task ordering in Kanban views. Valid priorities: low, medium, high, critical.`,
    {
      database_id: z.string().describe('The database ID where the task lives. Format: db-uuid. Get this from list_tasks result.'),
      row_id: z.string().uuid().describe('The row/task ID to update. Get this from list_tasks or get_task.'),
      priority: TaskPriorityEnum.describe('New priority: low, medium, high, or critical.'),
    },
    async ({ database_id, row_id, priority }) => {
      try {
        const supabase = getSupabaseClient();

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

        const config = dbMeta.config as { columns?: Array<{ id: string; name: string }> };
        const priorityColumn = config.columns?.find(c => c.name === 'Priority');

        if (!priorityColumn) {
          return {
            content: [{ type: 'text', text: 'Priority column not found in database' }],
            isError: true,
          };
        }

        const tableName = `database_${database_id.replace('db-', '')}`;

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

        const updatedCells = {
          ...currentRow.cells,
          [priorityColumn.id]: priority,
        };

        const { data, error } = await supabase
          .from(tableName)
          .update({
            cells: updatedCells,
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
          content: [{ type: 'text', text: `Task priority updated to "${priority}":\n${JSON.stringify(data, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // create_task - Create a new task in a database
  // =========================================================================
  server.tool(
    'create_task',
    `Create a new task in a task-type database. Tasks are rows with standardized columns mapped to task fields. The database must be of type "task" (created via create_database with type "task"). Returns the created task with its generated row ID. The task is added at the end of the row order. Type can be "epic" (large feature), "feature" (deliverable), or "task" (work item). Related tools: list_tasks (see all tasks), update_task (modify), get_task (details).`,
    {
      database_id: z.string().describe('The task database to add to. Format: db-uuid. Get this from list_databases or the database where you want the task.'),
      title: z.string().min(1).describe('Task title - the main identifier shown in lists and Kanban cards.'),
      description: z.string().optional().describe('Detailed description of the task. Supports plain text.'),
      status: TaskStatusEnum.optional().default('pending').describe('Initial status. Default "pending". Options: backlog, pending, in_progress, completed, cancelled, blocked, awaiting_info.'),
      priority: TaskPriorityEnum.optional().default('medium').describe('Task priority. Default "medium". Options: low, medium, high, critical.'),
      type: TaskTypeEnum.optional().default('task').describe('Task type for categorization. Default "task". Options: epic (large feature), feature (deliverable), task (work item).'),
      assigned_to: z.string().optional().describe('Name or identifier of the person assigned. Free text field.'),
      due_date: z.string().optional().describe('Due date in ISO format (e.g., "2024-12-31" or "2024-12-31T09:00:00Z").'),
    },
    async ({ database_id, title, description, status, priority, type, assigned_to, due_date }) => {
      try {
        const supabase = getSupabaseClient();

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

        const config = dbMeta.config as { columns?: Array<{ id: string; name: string }> };
        const columns = config.columns || [];

        // Build cells object mapping column names to values
        const cells: Record<string, unknown> = {};

        const findColumnId = (name: string) => columns.find(c => c.name === name)?.id;

        const titleColId = findColumnId('Title');
        if (titleColId) cells[titleColId] = title;

        const descColId = findColumnId('Description');
        if (descColId && description) cells[descColId] = description;

        const statusColId = findColumnId('Status');
        if (statusColId) cells[statusColId] = status;

        const priorityColId = findColumnId('Priority');
        if (priorityColId) cells[priorityColId] = priority;

        const typeColId = findColumnId('Type');
        if (typeColId) cells[typeColId] = type;

        const assignedColId = findColumnId('Assigned To');
        if (assignedColId && assigned_to) cells[assignedColId] = assigned_to;

        const dueDateColId = findColumnId('Due Date');
        if (dueDateColId && due_date) cells[dueDateColId] = due_date;

        const tableName = `database_${database_id.replace('db-', '')}`;

        // Get max row_order
        const { data: maxOrderRow } = await supabase
          .from(tableName)
          .select('row_order')
          .order('row_order', { ascending: false })
          .limit(1)
          .single();

        const newRowOrder = (maxOrderRow?.row_order || 0) + 1;

        const { data, error } = await supabase
          .from(tableName)
          .insert({
            cells,
            row_order: newRowOrder,
          })
          .select()
          .single();

        if (error) {
          return {
            content: [{ type: 'text', text: `Error creating task: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Task created successfully:\n${JSON.stringify(data, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // get_task - Get a specific task by ID
  // =========================================================================
  server.tool(
    'get_task',
    `Get full details of a specific task including all fields. Returns normalized task object with: id, database_id, title, description, status, priority, type, assigned_to, due_date, and timestamps. Use this when you need complete task information after getting an ID from list_tasks. The response includes the database_id and database_name for context. Related tools: update_task (modify), delete_task (remove), link_task_to_document (associate with docs).`,
    {
      database_id: z.string().describe('The database ID containing the task. Format: db-uuid.'),
      row_id: z.string().uuid().describe('The specific task/row ID to retrieve.'),
    },
    async ({ database_id, row_id }) => {
      try {
        const supabase = getSupabaseClient();

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

        const tableName = `database_${database_id.replace('db-', '')}`;

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
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // update_task - Update all fields of a task
  // =========================================================================
  server.tool(
    'update_task',
    `Update one or more fields of an existing task. Only provide the fields you want to change - unspecified fields remain unchanged. This is the comprehensive update tool; use update_task_status or update_task_priority for single-field updates. Returns the complete updated task. At least one field must be provided. All field values use the same format as create_task.`,
    {
      database_id: z.string().describe('The database ID containing the task. Format: db-uuid.'),
      row_id: z.string().uuid().describe('The task/row ID to update.'),
      title: z.string().min(1).optional().describe('New title. Leave undefined to keep current.'),
      description: z.string().optional().describe('New description. Leave undefined to keep current.'),
      status: TaskStatusEnum.optional().describe('New status: backlog, pending, in_progress, completed, cancelled, blocked, awaiting_info.'),
      priority: TaskPriorityEnum.optional().describe('New priority: low, medium, high, critical.'),
      type: TaskTypeEnum.optional().describe('New type: epic, feature, task.'),
      assigned_to: z.string().optional().describe('New assignee name/identifier.'),
      due_date: z.string().optional().describe('New due date in ISO format.'),
    },
    async ({ database_id, row_id, title, description, status, priority, type, assigned_to, due_date }) => {
      try {
        const supabase = getSupabaseClient();

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

        const config = dbMeta.config as { columns?: Array<{ id: string; name: string }> };
        const columns = config.columns || [];
        const findColumnId = (name: string) => columns.find(c => c.name === name)?.id;

        const tableName = `database_${database_id.replace('db-', '')}`;

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

        // Build updated cells
        const updatedCells = { ...currentRow.cells };

        const updates: Array<{ name: string; value: unknown }> = [];
        if (title !== undefined) updates.push({ name: 'Title', value: title });
        if (description !== undefined) updates.push({ name: 'Description', value: description });
        if (status !== undefined) updates.push({ name: 'Status', value: status });
        if (priority !== undefined) updates.push({ name: 'Priority', value: priority });
        if (type !== undefined) updates.push({ name: 'Type', value: type });
        if (assigned_to !== undefined) updates.push({ name: 'Assigned To', value: assigned_to });
        if (due_date !== undefined) updates.push({ name: 'Due Date', value: due_date });

        if (updates.length === 0) {
          return {
            content: [{ type: 'text', text: 'No updates provided. Please specify at least one field to update.' }],
            isError: true,
          };
        }

        for (const update of updates) {
          const colId = findColumnId(update.name);
          if (colId) {
            updatedCells[colId] = update.value;
          }
        }

        const { data, error } = await supabase
          .from(tableName)
          .update({
            cells: updatedCells,
            updated_at: new Date().toISOString(),
          })
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
          content: [{ type: 'text', text: `Task updated successfully:\n${JSON.stringify(task, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // =========================================================================
  // delete_task - Delete a task
  // =========================================================================
  server.tool(
    'delete_task',
    `Permanently delete a task from a database. This removes the row from the task database. The deletion is immediate and cannot be undone. Returns confirmation with the deleted task's information. Any links to documents (via link_task_to_document) are also removed. Consider using update_task_status to set status to "cancelled" instead if you want to preserve history.`,
    {
      database_id: z.string().describe('The database ID containing the task to delete. Format: db-uuid.'),
      row_id: z.string().uuid().describe('The task/row ID to permanently delete.'),
    },
    async ({ database_id, row_id }) => {
      try {
        const supabase = getSupabaseClient();

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

        const tableName = `database_${database_id.replace('db-', '')}`;

        // Get task info before deleting
        const { data: taskRow } = await supabase
          .from(tableName)
          .select('*')
          .eq('id', row_id)
          .single();

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
          content: [{ type: 'text', text: `Task deleted successfully:\n${JSON.stringify(task, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );
}

/**
 * Helper: Normalize a database row to a task-like object
 */
function normalizeRowToTask(row: Record<string, unknown>, dbMeta: Record<string, unknown>): Record<string, unknown> {
  const config = dbMeta.config as { columns?: Array<{ id: string; name: string }> };
  const columns = config.columns || [];
  const cells = row.cells as Record<string, unknown>;

  const getCell = (name: string) => {
    const col = columns.find(c => c.name === name);
    return col ? cells[col.id] : null;
  };

  return {
    id: row.id,
    database_id: dbMeta.database_id,
    database_name: dbMeta.name,
    title: getCell('Title') || 'Untitled',
    description: getCell('Description'),
    status: normalizeStatus(getCell('Status') as string),
    priority: normalizePriority(getCell('Priority') as string),
    type: getCell('Type') || 'task',
    assigned_to: getCell('Assigned To'),
    due_date: getCell('Due Date'),
    project_id: getCell('Project ID'),
    created_at: row.created_at,
    updated_at: row.updated_at,
    row_order: row.row_order,
  };
}

function normalizeStatus(value: string | null | undefined): string {
  if (!value) return 'pending';
  const normalized = value.toLowerCase().replace(/\s+/g, '_');
  const validStatuses = ['backlog', 'pending', 'in_progress', 'completed', 'cancelled', 'blocked', 'awaiting_info'];
  return validStatuses.includes(normalized) ? normalized : 'pending';
}

function normalizePriority(value: string | null | undefined): string {
  if (!value) return 'medium';
  const normalized = value.toLowerCase();
  const validPriorities = ['low', 'medium', 'high', 'critical'];
  return validPriorities.includes(normalized) ? normalized : 'medium';
}
