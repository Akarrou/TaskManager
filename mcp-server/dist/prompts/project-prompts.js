import { z } from 'zod';
/**
 * Register project-related prompts
 */
export function registerProjectPrompts(server) {
    // =========================================================================
    // project_summary - Generate a project summary
    // =========================================================================
    server.prompt('project_summary', 'Generate a comprehensive summary of a project including task statistics, recent activity, and team members.', {
        project_id: z.string().uuid().describe('The UUID of the project to summarize'),
    }, async ({ project_id }) => {
        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Please provide a comprehensive summary of project ${project_id}.

To do this:
1. First, use the \`get_project\` tool to get the project details
2. Use the \`list_project_members\` tool to get team information
3. Use the \`list_tasks\` tool with project_id filter to get all tasks
4. Use the \`get_task_stats\` tool to get statistics
5. Use the \`list_documents\` tool with project_id filter to see documentation

Then synthesize this information into a clear summary including:
- Project name and description
- Team composition and roles
- Task breakdown by status (backlog, pending, in progress, completed, blocked)
- Completion rate and progress assessment
- Number of documents/notes
- Key highlights or concerns

Format the summary in a clear, professional manner suitable for a status report.`,
                    },
                },
            ],
        };
    });
    // =========================================================================
    // project_status_report - Generate a formal status report
    // =========================================================================
    server.prompt('project_status_report', 'Generate a formal project status report for stakeholders.', {
        project_id: z.string().uuid().describe('The UUID of the project'),
        report_period: z.enum(['daily', 'weekly', 'monthly']).optional().default('weekly').describe('Reporting period'),
    }, async ({ project_id, report_period }) => {
        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Generate a ${report_period} status report for project ${project_id}.

Steps:
1. Use \`get_project\` to get project details
2. Use \`get_task_stats\` with project_id to get metrics
3. Use \`list_tasks\` to identify:
   - Recently completed tasks
   - Tasks currently in progress
   - Blocked tasks requiring attention
   - Upcoming due dates

Structure the report as follows:

## Project Status Report
**Project:** [Name]
**Period:** ${report_period}
**Date:** [Today's date]

### Executive Summary
[2-3 sentence overview]

### Progress Metrics
- Total tasks: X
- Completed: X (X%)
- In Progress: X
- Blocked: X

### Accomplishments This Period
[List of completed items]

### Current Focus
[Items in progress]

### Blockers & Risks
[Any blocked items or concerns]

### Next Steps
[Upcoming priorities]

Keep the report concise but informative for stakeholder review.`,
                    },
                },
            ],
        };
    });
}
//# sourceMappingURL=project-prompts.js.map