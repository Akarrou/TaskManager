import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Register document-related prompts
 */
export function registerDocumentPrompts(server: McpServer): void {
  // =========================================================================
  // document_outline - Generate a document outline
  // =========================================================================
  server.prompt(
    'document_outline',
    'Generate a structured outline for a new document.',
    {
      topic: z.string().describe('The topic or subject of the document'),
      document_type: z.enum(['technical', 'meeting', 'analysis', 'proposal', 'guide']).optional().default('technical').describe('Type of document'),
    },
    async ({ topic, document_type }) => {
      const typeGuidelines: Record<string, string> = {
        technical: 'Focus on technical accuracy, include code examples where relevant, and structure for developer audience.',
        meeting: 'Include attendees, agenda, discussion points, decisions, and action items sections.',
        analysis: 'Structure with problem statement, data/evidence, analysis, conclusions, and recommendations.',
        proposal: 'Include executive summary, problem/opportunity, proposed solution, timeline, resources, and ROI.',
        guide: 'Structure as step-by-step instructions with prerequisites, procedures, and troubleshooting.',
      };

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Generate a detailed outline for a ${document_type} document about:

"${topic}"

Guidelines: ${typeGuidelines[document_type]}

Please provide:

## Document Outline: ${topic}

### Document Metadata
- **Type**: ${document_type}
- **Suggested Title**: [Concise, descriptive title]
- **Target Audience**: [Who will read this]
- **Estimated Length**: [Short/Medium/Long]

### Outline Structure

Provide a hierarchical outline with:
- Main sections (H2)
- Subsections (H3)
- Key points to cover in each section
- Suggested content types (text, code, diagrams, tables)

### Key Topics to Address
[Bullet list of must-cover topics]

### Suggested Resources
[Any references, links, or data sources to include]

### Notes for Author
[Tips for writing this document effectively]

After approval, I can help create the document using \`create_document\`.`,
            },
          },
        ],
      };
    }
  );

  // =========================================================================
  // prd_template - Generate a PRD template
  // =========================================================================
  server.prompt(
    'prd_template',
    'Generate a Product Requirements Document (PRD) template following project conventions.',
    {
      feature_name: z.string().describe('Name of the feature to document'),
      project_id: z.string().uuid().optional().describe('Optional project ID for context'),
    },
    async ({ feature_name, project_id }) => {
      const projectContext = project_id
        ? `First, use \`get_project\` with project_id="${project_id}" to understand the project context.`
        : '';

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Generate a PRD (Product Requirements Document) for:

"${feature_name}"

${projectContext}

Follow the project's PRD conventions:
- Slug format: kebab-case without accents
- Branch naming: prd/<slug>
- Include Gherkin acceptance criteria

## PRD Template

### Metadata
- **Feature Name**: ${feature_name}
- **Slug**: [kebab-case-slug]
- **Author**: [To be filled]
- **Date**: [Today's date]
- **Status**: Draft

### 1. Overview

#### 1.1 Problem Statement
[What problem does this feature solve?]

#### 1.2 Proposed Solution
[High-level description of the solution]

#### 1.3 Goals & Success Metrics
- Goal 1: [Measurable goal]
- Goal 2: [Measurable goal]

### 2. User Stories

\`\`\`gherkin
Feature: ${feature_name}

  Scenario: [Primary use case]
    Given [initial context]
    When [action taken]
    Then [expected outcome]

  Scenario: [Edge case]
    Given [context]
    When [action]
    Then [outcome]
\`\`\`

### 3. Functional Requirements

#### 3.1 Core Features
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | [Requirement] | Must Have | |
| FR-002 | [Requirement] | Should Have | |

#### 3.2 User Interface
[UI/UX requirements and mockup references]

### 4. Technical Requirements

#### 4.1 Architecture
[Technical approach and architecture decisions]

#### 4.2 Data Model
[Database changes or new entities]

#### 4.3 API Changes
[New or modified API endpoints]

### 5. Non-Functional Requirements
- **Performance**: [Response time, load requirements]
- **Security**: [Security considerations]
- **Accessibility**: [A11y requirements]

### 6. Dependencies & Risks

#### 6.1 Dependencies
- [External dependency 1]
- [Internal dependency 1]

#### 6.2 Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| [Risk] | High/Medium/Low | [Mitigation strategy] |

### 7. Timeline & Milestones
| Phase | Description | Duration |
|-------|-------------|----------|
| Design | UI/UX design | X days |
| Development | Implementation | X days |
| Testing | QA & UAT | X days |

### 8. Open Questions
- [ ] [Question 1]
- [ ] [Question 2]

---

After finalizing, save this PRD using \`create_document\` with the project_id${project_id ? `="${project_id}"` : ''}.`,
            },
          },
        ],
      };
    }
  );

  // =========================================================================
  // meeting_notes - Generate meeting notes template
  // =========================================================================
  server.prompt(
    'meeting_notes',
    'Generate a meeting notes template.',
    {
      meeting_type: z.enum(['standup', 'planning', 'retrospective', 'review', 'general']).optional().default('general').describe('Type of meeting'),
      meeting_title: z.string().optional().describe('Optional title for the meeting'),
    },
    async ({ meeting_type, meeting_title }) => {
      const templates: Record<string, string> = {
        standup: `## Daily Standup - [Date]

### Attendees
- [ ] [Name 1]
- [ ] [Name 2]

### Updates

#### [Name 1]
- **Yesterday**:
- **Today**:
- **Blockers**:

#### [Name 2]
- **Yesterday**:
- **Today**:
- **Blockers**:

### Action Items
- [ ] [Action] - @[Owner]

### Notes
[Any additional discussion points]`,

        planning: `## Sprint/Planning Meeting - [Date]

### Attendees
- [ ] [Name 1]

### Sprint Goal
[What we aim to achieve]

### Capacity
| Team Member | Available Hours | Notes |
|-------------|-----------------|-------|
| [Name] | X hours | |

### Selected Items
| Item | Points/Hours | Owner | Notes |
|------|--------------|-------|-------|
| | | | |

### Risks & Dependencies
-

### Decisions Made
1.

### Action Items
- [ ] [Action] - @[Owner]`,

        retrospective: `## Retrospective - [Sprint/Period]

### Attendees
- [ ] [Name 1]

### What Went Well
-

### What Could Be Improved
-

### Action Items for Next Sprint
| Action | Owner | Due Date |
|--------|-------|----------|
| | | |

### Team Health Check
- Morale: [1-5]
- Collaboration: [1-5]
- Technical Health: [1-5]

### Kudos
- [Recognition for team members]`,

        review: `## Sprint Review / Demo - [Date]

### Attendees
- [ ] [Name 1]

### Demo Items
| Feature | Demo'd By | Status | Feedback |
|---------|-----------|--------|----------|
| | | | |

### Stakeholder Feedback
-

### Accepted Items
-

### Items Needing Revision
-

### Next Steps
1. `,

        general: `## Meeting: ${meeting_title || '[Meeting Title]'} - [Date]

### Attendees
- [ ] [Name 1]

### Agenda
1. [Topic 1]
2. [Topic 2]

### Discussion Notes

#### [Topic 1]
-

#### [Topic 2]
-

### Decisions Made
1.

### Action Items
| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| | | | |

### Next Meeting
- Date:
- Topics: `,
      };

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Generate meeting notes using this ${meeting_type} template:

${templates[meeting_type]}

---

This template is ready to be filled in. After the meeting, you can:
1. Fill in the details
2. Use \`create_document\` to save it to the project
3. Link relevant tasks using the task mention feature

Would you like me to customize any section of this template?`,
            },
          },
        ],
      };
    }
  );
}
