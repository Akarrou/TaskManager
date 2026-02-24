import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Register calendar/event-related prompts
 */
export function registerCalendarPrompts(server: McpServer): void {
  // =========================================================================
  // weekly_calendar_review - Review upcoming week's events
  // =========================================================================
  server.registerPrompt(
    'weekly_calendar_review',
    {
      title: 'Weekly Calendar Review',
      description: 'Review the upcoming week\'s events, deadlines, and meetings with conflict detection.',
      argsSchema: {
        project_id: z.string().uuid().optional().describe('Optional project ID to filter events'),
      },
    },
    async ({ project_id }) => {
      const projectFilter = project_id ? ` for project ${project_id}` : '';

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Perform a weekly calendar review${projectFilter}.

Steps:
1. Use \`list_events\`${project_id ? ` with project_id="${project_id}"` : ''} to get events for the current week and next week
2. Use \`list_event_categories\` to understand the category color coding
3. For events with linked items, use \`get_event\` to get full details (attendees, recurrence, reminders)
4. Use \`get_calendar_doc\` with topic="categories" if you need category documentation

Produce the following analysis:

## Weekly Calendar Review - [Date Range]

### This Week Overview
| Day | Events | Type |
|-----|--------|------|
| Mon | [events] | [category] |
| Tue | [events] | [category] |
| ... | ... | ... |

### Upcoming Deadlines
- [List deadline events sorted by date, with urgency indicator]

### Milestones
- [List milestone events]

### Meetings & Appointments
- [List meetings with attendees count and duration]

### Schedule Conflicts
- [Identify overlapping events on the same day/time]
- [Days with too many events]

### Gaps & Free Time
- [Days with no events — potential focus time]

### Action Items
- [ ] [Events needing preparation]
- [ ] [Deadlines needing attention]
- [ ] [Follow-ups from past events]

### Next Week Preview
[Brief overview of next week's key events]

Keep the review actionable and highlight items that need immediate attention.`,
            },
          },
        ],
      };
    }
  );

  // =========================================================================
  // event_planning - Plan and create a complex event
  // =========================================================================
  server.registerPrompt(
    'event_planning',
    {
      title: 'Event Planning',
      description: 'Guide through creating a complex calendar event with recurrence, attendees, and linked items.',
      argsSchema: {
        event_type: z.enum(['meeting', 'deadline', 'milestone', 'reminder', 'recurring_meeting', 'multi_day']).describe('Type of event to plan'),
        title: z.string().describe('Event title or subject'),
        project_id: z.string().uuid().optional().describe('Optional project ID to link the event to'),
      },
    },
    async ({ event_type, title, project_id }) => {
      const bt = '`';
      const step3 = event_type === 'recurring_meeting'
        ? 'Use ' + bt + 'get_calendar_doc' + bt + ' with topic="recurrence" to review RRULE format and patterns'
        : 'Use ' + bt + 'get_calendar_doc' + bt + ' with topic="linked-items" to understand how to link tasks/documents';
      const step4 = project_id
        ? 'Use ' + bt + 'list_project_members' + bt + ' with project_id="' + project_id + '" to get potential attendees'
        : 'Use ' + bt + 'list_users' + bt + ' to find available attendees';
      const projectIdLine = project_id ? '- project_id: "' + project_id + '"' : '';

      const typeGuides: Record<string, string> = {
        meeting: `Single meeting:
- Set start_time and end_time
- Add attendees with RSVP status
- Consider adding a linked document for meeting notes
- Set a reminder (15 min before recommended)`,
        deadline: `Deadline:
- Set as all-day event or with specific time
- Category: "deadline"
- High visibility — consider adding a reminder 1 day before AND 1 hour before
- Link to relevant tasks or documents`,
        milestone: `Milestone:
- Set as all-day event
- Category: "milestone"
- Link to the project deliverable (document or task)
- No attendees typically needed`,
        reminder: `Reminder:
- Set specific time
- Category: "reminder"
- Add reminder notifications
- Brief description of what to remember`,
        recurring_meeting: `Recurring meeting:
- Set recurrence rule (RRULE format: FREQ=WEEKLY;BYDAY=MO,WE,FR etc.)
- Common patterns: daily (FREQ=DAILY), weekly (FREQ=WEEKLY;BYDAY=TU), biweekly (FREQ=WEEKLY;INTERVAL=2;BYDAY=TH), monthly (FREQ=MONTHLY;BYMONTHDAY=1)
- Add all regular attendees
- Create a linked document template for recurring notes`,
        multi_day: `Multi-day event:
- Set start_date and end_date spanning multiple days
- Mark as all-day if applicable
- Consider creating sub-events for specific sessions`,
      };

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Help me plan and create a "${title}" event (type: ${event_type}).

Preparation steps:
1. Use \`get_calendar_doc\` with topic="categories" to review available categories
2. Use \`list_event_categories\` to see all categories (default + custom)
3. ${step3}
4. ${step4}

Event type guide:
${typeGuides[event_type]}

Please:
1. Gather all necessary information based on the event type guide above
2. Use \`create_event\` with all appropriate fields:
   - title, description
   - start_time/end_time or all_day dates
   - category (from available categories)
   - attendees (if applicable)
   - recurrence (RRULE string, if recurring)
   - reminders
   - linked_items (tasks or documents)
   ${projectIdLine}
3. If the event needs a linked document (meeting notes, agenda), use \`create_document\` to create it
4. Confirm the created event with all details

Return the event ID and a summary of what was created.`,
            },
          },
        ],
      };
    }
  );
}
