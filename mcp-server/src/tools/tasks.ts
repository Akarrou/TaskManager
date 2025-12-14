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
    'List tasks from all task-type databases. Can filter by status, priority, or project.',
    {
      status: TaskStatusEnum.optional().describe('Filter by task status'),
      priority: TaskPriorityEnum.optional().describe('Filter by task priority'),
      project_id: z.string().uuid().optional().describe('Filter by project ID'),
      limit: z.number().min(1).max(100).optional().default(50).describe('Maximum number of tasks'),
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
    'Get aggregated statistics for all tasks (counts by status, completion rate, etc.).',
    {
      project_id: z.string().uuid().optional().describe('Filter statistics by project ID'),
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
    'Update the status of a task in a database.',
    {
      database_id: z.string().describe('The database ID (format: db-uuid)'),
      row_id: z.string().uuid().describe('The row/task ID'),
      status: TaskStatusEnum.describe('New status for the task'),
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
    'Update the priority of a task in a database.',
    {
      database_id: z.string().describe('The database ID (format: db-uuid)'),
      row_id: z.string().uuid().describe('The row/task ID'),
      priority: TaskPriorityEnum.describe('New priority for the task'),
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
    'Create a new task in a task database.',
    {
      database_id: z.string().describe('The database ID (format: db-uuid)'),
      title: z.string().min(1).describe('Task title'),
      description: z.string().optional().describe('Task description'),
      status: TaskStatusEnum.optional().default('pending').describe('Initial status'),
      priority: TaskPriorityEnum.optional().default('medium').describe('Task priority'),
      type: TaskTypeEnum.optional().default('task').describe('Task type'),
      assigned_to: z.string().optional().describe('Assignee'),
      due_date: z.string().optional().describe('Due date (ISO format)'),
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
