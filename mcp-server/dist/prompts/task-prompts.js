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

Format the standup as:

## Daily Standup - [Today's Date]

### Yesterday (Completed)
- [List completed tasks with brief description]

### Today (In Progress)
- [List tasks currently being worked on]
- [Estimated completion or next steps]

### Blockers
- [List any blocked tasks with reason if known]
- [Tasks awaiting information]

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
        },
    }, async ({ task_description, task_type }) => {
        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Help me break down this ${task_type} into smaller, actionable tasks:

"${task_description}"

Please provide:

## Task Breakdown

### Overview
[Brief summary of what needs to be accomplished]

### Suggested Subtasks

For each subtask, provide:
1. **Title**: Clear, action-oriented title
2. **Description**: Brief description of what needs to be done
3. **Type**: epic | feature | task
4. **Estimated effort**: XS (2h), S (4h), M (8h), L (16h), XL (32h)
5. **Dependencies**: Any tasks that must be completed first

### Recommended Order
[Suggest an implementation order based on dependencies]

### Considerations
- Technical risks or unknowns
- External dependencies
- Testing requirements
- Documentation needs

After I approve the breakdown, I can use the \`create_task\` tool to add these to a task database.`,
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

Please provide:

## Sprint Planning - ${sprint_duration} Week Sprint

### Sprint Goal
[Suggest a clear sprint goal based on available high-priority tasks]

### Recommended Tasks
Prioritize tasks for this sprint based on:
- Priority (critical > high > medium > low)
- Dependencies (blocked tasks should wait)
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

After review, I can help update task statuses using \`update_task_status\`.`,
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
- **Blocked Since**: [date if available]
- **Likely Cause**: [infer from title/description]
- **Suggested Resolution**:
  - Option A: [specific action]
  - Option B: [alternative approach]
- **Who Can Help**: [if determinable]
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