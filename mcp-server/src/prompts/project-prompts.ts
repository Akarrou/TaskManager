import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Register project-related prompts
 */
export function registerProjectPrompts(server: McpServer): void {
  // =========================================================================
  // project_summary - Generate a project summary
  // =========================================================================
  server.registerPrompt(
    'project_summary',
    {
      title: 'Project Summary',
      description: 'Generate a comprehensive summary of a project including task statistics, recent activity, and team members.',
      argsSchema: {
        project_id: z.string().uuid().describe('The UUID of the project to summarize'),
      },
    },
    async ({ project_id }) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please provide a comprehensive summary of project ${project_id}.

To do this:
1. Use \`get_project\` to get the project details
2. Use \`list_project_members\` to get team information
3. Use \`list_tasks\` with project_id filter to get all tasks
4. Use \`get_task_stats\` to get task statistics
5. Use \`get_documents_stats\` with project_id to get document metrics
6. Use \`list_events\` with project_id to get upcoming calendar events and deadlines
7. Use \`list_databases\` to see Notion-like databases in the project
8. Use \`list_tabs\` to understand the project sidebar structure

Then synthesize this information into a clear summary including:
- Project name and description
- Team composition and roles
- Task breakdown by status (backlog, pending, in_progress, completed, blocked, awaiting_info)
- Completion rate and progress assessment
- Document statistics (total, recent activity)
- Upcoming events, deadlines, and milestones
- Number of databases and spreadsheets
- Project organization (tabs, sections)
- Key highlights or concerns

Format the summary in a clear, professional manner suitable for a status report.`,
            },
          },
        ],
      };
    }
  );

  // =========================================================================
  // project_status_report - Generate a formal status report
  // =========================================================================
  server.registerPrompt(
    'project_status_report',
    {
      title: 'Project Status Report',
      description: 'Generate a formal project status report for stakeholders.',
      argsSchema: {
        project_id: z.string().uuid().describe('The UUID of the project'),
        report_period: z.enum(['daily', 'weekly', 'monthly']).optional().default('weekly').describe('Reporting period'),
      },
    },
    async ({ project_id, report_period }) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Generate a ${report_period} status report for project ${project_id}.

Steps:
1. Use \`get_project\` to get project details
2. Use \`list_project_members\` to get team composition
3. Use \`get_task_stats\` with project_id to get task metrics
4. Use \`list_tasks\` to identify:
   - Recently completed tasks
   - Tasks currently in progress
   - Blocked tasks requiring attention
   - Tasks awaiting information
5. Use \`list_events\` with project_id to get:
   - Upcoming deadlines and milestones
   - Scheduled meetings
   - Events in the reporting period
6. Use \`get_documents_stats\` with project_id for documentation activity

Structure the report as follows:

## Project Status Report
**Project:** [Name]
**Period:** ${report_period}
**Date:** [Today's date]
**Team:** [Member count and roles]

### Executive Summary
[2-3 sentence overview]

### Progress Metrics
- Total tasks: X
- Completed: X (X%)
- In Progress: X
- Blocked: X
- Awaiting Info: X

### Accomplishments This Period
[List of completed items]

### Current Focus
[Items in progress]

### Upcoming Deadlines & Milestones
[From calendar events - deadlines, milestones in the next period]

### Blockers & Risks
[Any blocked items or concerns]

### Documentation Activity
[Documents created/updated in the period]

### Next Steps
[Upcoming priorities]

Keep the report concise but informative for stakeholder review.`,
            },
          },
        ],
      };
    }
  );

  // =========================================================================
  // project_setup - Bootstrap a complete project structure
  // =========================================================================
  server.registerPrompt(
    'project_setup',
    {
      title: 'Project Setup',
      description: 'Bootstrap a complete project with tabs, sections, databases, and initial documents.',
      argsSchema: {
        project_name: z.string().describe('Name of the project to create'),
        project_description: z.string().optional().describe('Description of the project'),
        template: z.enum(['basic', 'agile', 'wiki', 'custom']).optional().default('basic').describe('Project template type'),
      },
    },
    async ({ project_name, project_description, template }) => {
      const templateGuides: Record<string, string> = {
        basic: `Basic template:
- 1 tab "Main" (default) with sections: "Documents", "Notes"
- 1 task database with standard columns (title, status, priority, assignee, due_date)
- 1 welcome document`,
        agile: `Agile template:
- Tab group "Development" with tabs: "Backlog", "Sprint", "Done"
- Tab group "Documentation" with tabs: "Specs", "Meeting Notes"
- 1 task database with columns: title, status (backlog/pending/in_progress/review/completed), priority, assignee, sprint, story_points, due_date
- 1 sprint planning document
- 1 retrospective template document`,
        wiki: `Wiki template:
- Tab "Home" (default) with sections: "Getting Started", "Guides", "Reference"
- Tab "Architecture" with sections: "Overview", "Components"
- Tab "Processes" with sections: "Development", "Deployment"
- 1 home document with project overview`,
        custom: `Custom template:
- Ask the user what tabs, sections, databases, and documents they want
- Create the structure based on their requirements`,
      };

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Bootstrap a complete project structure for "${project_name}".

${project_description ? `Project description: ${project_description}` : ''}

Template: ${template}
${templateGuides[template]}

Steps:
1. Use \`create_project\` to create the project with name "${project_name}"${project_description ? ` and description "${project_description}"` : ''}
2. Use \`create_tab_group\` to create tab groups (if template requires them)
3. Use \`create_tab\` to create tabs in the project (assign to groups if applicable)
4. Use \`set_default_tab\` to mark the main tab as default
5. Use \`create_section\` to create sections within each tab
6. Use \`create_database\` to create task/data databases as specified by the template
7. Use \`add_column\` to add columns to each database with appropriate types and options
8. Use \`create_document\` to create initial documents

After each step, confirm what was created and provide the IDs for reference.
Return a final summary of the complete project structure with all created IDs.`,
            },
          },
        ],
      };
    }
  );
}
