import { z } from 'zod';
/**
 * Register task-related prompts
 */
export function registerTaskPrompts(server) {
    // =========================================================================
    // daily_standup - Generate daily standup summary
    // =========================================================================
    server.registerPrompt('daily_standup', {
        title: 'Daily Standup',
        description: 'Generate a daily standup summary with what was done, what is planned, and blockers.',
        argsSchema: {
            project_id: z.string().uuid().optional().describe('Optional project ID to filter tasks'),
        },
    }, async ({ project_id }) => {
        const projectFilter = project_id ? ` for project ${project_id}` : '';
        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Generate a daily standup summary${projectFilter}.

Steps:
1. Use \`list_tasks\` to get tasks ${project_id ? `with project_id="${project_id}"` : ''}
2. Identify:
   - Tasks marked as "completed" recently (last 24h based on updated_at)
   - Tasks currently "in_progress"
   - Tasks that are "blocked" or "awaiting_info"
3. Use \`list_events\`${project_id ? ` with project_id="${project_id}"` : ''} to get today's and tomorrow's calendar events (meetings, deadlines)
4. Use \`get_task_stats\`${project_id ? ` with project_id="${project_id}"` : ''} for a quick metrics overview

Format the standup as:

## Daily Standup - [Today's Date]

### Yesterday (Completed)
- [List completed tasks with brief description]

### Today (In Progress)
- [List tasks currently being worked on]
- [Estimated completion or next steps]

### Today's Calendar
- [Meetings, deadlines, and events scheduled for today]
- [Tomorrow's important events as a heads-up]

### Blockers
- [List any blocked tasks with reason if known]
- [Tasks awaiting information]

### Quick Metrics
- Total tasks: X | Completed: X | In Progress: X | Blocked: X

### Notes
- [Any relevant observations about workload, priorities, etc.]

Keep it concise - this is for a quick team sync.`,
                    },
                },
            ],
        };
    });
    // =========================================================================
    // task_breakdown - Help break down a task into subtasks
    // =========================================================================
    server.registerPrompt('task_breakdown', {
        title: 'Task Breakdown',
        description: 'Help decompose a task or feature into smaller, actionable subtasks.',
        argsSchema: {
            task_description: z.string().describe('Description of the task or feature to break down'),
            task_type: z.enum(['epic', 'feature', 'task']).optional().default('feature').describe('Type of work item'),
            project_id: z.string().uuid().optional().describe('Optional project ID for context on available databases and columns'),
        },
    }, async ({ task_description, task_type, project_id }) => {
        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Help me break down this ${task_type} into smaller, actionable tasks:

"${task_description}"

${project_id ? `Steps to prepare:\n1. Use \`list_databases\` with document filtering to find task databases in project ${project_id}\n2. Use \`get_database_schema\` to understand available columns (status options, priority levels, custom fields)\n3. Adapt the subtask suggestions to match the database schema\n` : ''}
Please provide:

## Task Breakdown

### Overview
[Brief summary of what needs to be accomplished]

### Suggested Subtasks

For each subtask, provide:
1. **Title**: Clear, action-oriented title
2. **Description**: Brief description of what needs to be done
3. **Priority**: critical | high | medium | low
4. **Estimated effort**: XS (2h), S (4h), M (8h), L (16h), XL (32h)
5. **Dependencies**: Any tasks that must be completed first

### Recommended Order
[Suggest an implementation order based on dependencies]

### Considerations
- Technical risks or unknowns
- External dependencies
- Testing requirements
- Documentation needs

After I approve the breakdown, use \`create_task\` to add each subtask to the task database.${project_id ? ` The database_id can be found from step 1 above.` : ' You will need a database_id — use \\`list_databases\\` to find the appropriate task database.'}`,
                    },
                },
            ],
        };
    });
    // =========================================================================
    // sprint_planning - Help plan a sprint
    // =========================================================================
    server.registerPrompt('sprint_planning', {
        title: 'Sprint Planning',
        description: 'Help plan a sprint by selecting and prioritizing tasks.',
        argsSchema: {
            project_id: z.string().uuid().describe('The project ID for sprint planning'),
            sprint_duration: z.number().min(1).max(4).optional().default(2).describe('Sprint duration in weeks'),
            team_capacity: z.number().optional().describe('Team capacity in hours (optional)'),
        },
    }, async ({ project_id, sprint_duration, team_capacity }) => {
        const capacityNote = team_capacity
            ? `Team capacity: ${team_capacity} hours`
            : 'Team capacity: Not specified (estimate based on task count)';
        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Help me plan a ${sprint_duration}-week sprint for project ${project_id}.

${capacityNote}

Steps:
1. Use \`list_tasks\` with project_id="${project_id}" to get all tasks
2. Focus on tasks in "backlog" or "pending" status
3. Consider task priorities and dependencies
4. Use \`get_task_stats\` with project_id="${project_id}" for current metrics
5. Use \`list_project_members\` with project_id="${project_id}" to understand team size
6. Use \`list_events\` with project_id="${project_id}" to identify:
   - Deadlines falling within the sprint window
   - Milestones to target
   - Meetings that reduce capacity

Please provide:

## Sprint Planning - ${sprint_duration} Week Sprint

### Sprint Goal
[Suggest a clear sprint goal based on available high-priority tasks]

### Calendar Constraints
[Deadlines, milestones, and meetings during the sprint period]

### Team Capacity
[Based on team size and calendar commitments]

### Recommended Tasks
Prioritize tasks for this sprint based on:
- Priority (critical > high > medium > low)
- Dependencies (blocked tasks should wait)
- Calendar deadlines within the sprint
- Estimated effort vs capacity

| Task | Priority | Estimated Hours | Rationale |
|------|----------|-----------------|-----------|
| ... | ... | ... | ... |

### Total Estimated Hours: X hours

### Risks & Dependencies
- [List any risks or external dependencies]

### Tasks Deferred
[Tasks that should wait for a future sprint and why]

### Recommendations
[Any suggestions for sprint success]

After review, I can help update task statuses using \`update_task_status\` and \`update_task\` to set assignees and dates.`,
                    },
                },
            ],
        };
    });
    // =========================================================================
    // blocked_tasks_review - Analyze blocked tasks
    // =========================================================================
    server.registerPrompt('blocked_tasks_review', {
        title: 'Blocked Tasks Review',
        description: 'Review and analyze blocked tasks to identify resolution paths.',
        argsSchema: {
            project_id: z.string().uuid().optional().describe('Optional project ID to filter'),
        },
    }, async ({ project_id }) => {
        const filter = project_id ? ` for project ${project_id}` : '';
        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Analyze blocked and awaiting-info tasks${filter}.

Steps:
1. Use \`list_tasks\` with status="blocked"${project_id ? ` and project_id="${project_id}"` : ''}
2. Use \`list_tasks\` with status="awaiting_info"${project_id ? ` and project_id="${project_id}"` : ''}
3. For each blocked task, use \`get_task\` to get full details (description, assignee, dates)
4. Use \`get_task_document\` for tasks that have linked documents — check for context on the blocker
5. ${project_id ? `Use \`list_project_members\` with project_id="${project_id}" to identify who can help` : 'Use \\`list_users\\` to identify potential helpers'}

For each blocked/awaiting task, analyze:

## Blocked Tasks Review

### Summary
- Total blocked: X
- Total awaiting info: X
- Average time blocked: [if determinable from dates]

### Task Analysis

For each task:

#### [Task Title]
- **Status**: blocked / awaiting_info
- **Assignee**: [from task details]
- **Blocked Since**: [date if available]
- **Likely Cause**: [infer from title/description/document]
- **Suggested Resolution**:
  - Option A: [specific action]
  - Option B: [alternative approach]
- **Who Can Help**: [from project members]
- **Priority Impact**: [how this affects other work]

### Recommended Actions
1. [Highest priority action]
2. [Second priority action]
...

### Escalation Needed
[Tasks that may need management attention]

This analysis helps identify systemic issues and prioritize unblocking efforts.`,
                    },
                },
            ],
        };
    });
}
//# sourceMappingURL=task-prompts.js.map