import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

// Input schema for meeting MoM generator
const MeetingMoMInputSchema = z.object({
    meetingLink: z.string().optional().describe('Link to meeting recording'),
    transcript: z.string().optional().describe('Meeting transcript or notes'),
    meetingTitle: z.string().optional().describe('Title of the meeting'),
    visualContext: z.string().optional().describe('Visual context from screen sharing/slides analysis'),
    detailed: z.boolean().optional().describe('Generate detailed report with term validation'),
});

// Output schema matching frontend MeetingMoMData interface
const MeetingMoMOutputSchema = z.object({
    meetingTitle: z.string(),
    date: z.string(),
    duration: z.string(),
    attendees: z.array(z.string()),
    summary: z.string(),
    keyDiscussions: z.array(z.string()),
    decisions: z.array(z.string()),
    actionItems: z.array(z.object({
        id: z.string(),
        task: z.string(),
        assignee: z.string(),
        dueDate: z.string(),
        priority: z.enum(['High', 'Medium', 'Low']),
        status: z.enum(['Pending', 'In Progress', 'Completed']),
    })),
    termDefinitions: z.array(z.object({
        term: z.string(),
        definition: z.string(),
        status: z.enum(['Verified', 'Needs Review']),
    })).optional(),
    nextMeeting: z.string().optional(),
});

export type MeetingMoMInput = z.infer<typeof MeetingMoMInputSchema>;
export type MeetingMoMOutput = z.infer<typeof MeetingMoMOutputSchema>;

// Initialize the model
const model = new ChatOpenAI({
    modelName: 'gpt-4o',
    temperature: 0.3,
});

export async function generateMeetingMoM(
    input: MeetingMoMInput
): Promise<MeetingMoMOutput> {
    console.log('\n📝 Generating Meeting MoM...');

    // For now, we need a transcript. Meeting link fetching is not yet implemented
    if (!input.transcript) {
        if (input.meetingLink) {
            console.warn('⚠️  Meeting link provided but transcript fetching not yet implemented');
            // Return helpful fallback
            return {
                meetingTitle: input.meetingTitle || 'Team Meeting',
                date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                duration: '1h',
                attendees: ['Team Member'],
                summary: 'To generate meeting minutes, please provide the meeting transcript. Meeting link processing is coming soon!',
                keyDiscussions: ['Transcript required for processing'],
                decisions: [],
                actionItems: [],
            };
        }
        throw new Error('Either transcript or meeting link is required');
    }

    const transcript = input.transcript;
    console.log('📄 Transcript length:', transcript.length, 'characters');

    if (input.visualContext) {
        console.log('👁️  Visual context available:', input.visualContext.length, 'characters');
    }


    const biContext = `
**Domain Context**:
These meetings are Business Intelligence / Data Analytics discussions. You will encounter these terms — interpret them correctly:
- KPI (Key Performance Indicator), DAU/MAU (Daily/Monthly Active Users), WAU (Weekly Active Users)
- Churn, Retention, Cohort, Funnel, Conversion Rate, LTV (Lifetime Value), ARR/MRR
- ETL / ELT (Extract Transform Load), Data Pipeline, Data Warehouse, Data Lake, Data Mart
- PII (Personally Identifiable Information), GDPR, Data Masking, Anonymization
- SQL, BigQuery, Snowflake, Redshift, dbt, Tableau, Power BI, Looker, Metabase
- NPS (Net Promoter Score), CSAT, Session, Engagement, Bounce Rate, Stickiness
- Dimension, Fact Table, Star Schema, Slowly Changing Dimension (SCD)
- Sprint, Backlog, Epic, Story Points, Velocity (Agile/Scrum terms may appear)
If an acronym appears that is NOT in this list, mark it as "Needs Review".

**Language Note**:
The transcript may be in Tanglish (Tamil + English code-switching). Tamil words or phrases may appear transliterated in English (e.g., "seri", "enna", "panrom", "pakkalaam"). Treat them as conversational filler and focus on the English technical content. Do not translate Tamil words — just skip them when extracting facts.
`;

    const systemPrompt = input.detailed ?
        `You are an expert BI (Business Intelligence) Technical Writer and Meeting Analyst. Analyze the meeting transcript${input.visualContext ? ' and visual context' : ''} to generate a DEEP DIVE, HIGH-FIDELITY meeting record.
${biContext}
**Meeting Transcript**:
${transcript}
${input.visualContext ? `\n**Visual Context**:\n${input.visualContext}\n` : ''}

**Your Task**:
Generate an extensive JSON report. Focus on capturing technical nuances, specific data points, and verifying BI terminology.

1. **Meeting Title**: Use "${input.meetingTitle || 'Team Meeting'}" unless a clearer title is explicitly stated in the transcript.
2. **Attendees**: List names clearly heard or mentioned in the transcript. Only add a role if explicitly stated (e.g., "I'm the PM here"). Otherwise just the name. If no names audible, return empty array.
3. **Summary**: Comprehensive 5-8 sentence paragraph capturing the core narrative and business value. Only include facts from the transcript.
4. **Key Discussions**: DETAILED list. For each point, include 2-3 sentences of context. Quote directly from transcript where possible.
5. **Decisions Made**: Only decisions explicitly agreed upon in the transcript.
6. **Action Items**: Only tasks explicitly assigned in the transcript.
   - Assignee: only if explicitly named. Use "Unassigned" otherwise.
   - Due date: only if explicitly mentioned. Use "TBD" otherwise. Do NOT invent dates.
   - Priority: infer from urgency words ("urgent", "ASAP", "by EOD", "next sprint") only.
7. **Term Validation** (CRITICAL):
   - Identify ALL acronyms and BI-specific jargon used.
   - Define them using the domain context above.
   - If ambiguous or unknown, mark as "Needs Review". If standard, "Verified".

**Output Format**:
Return ONLY valid JSON:
{
  "meetingTitle": "string",
  "date": "Month DD, YYYY",
  "duration": "string (only if mentioned, otherwise 'Not mentioned')",
  "attendees": ["Name" or "Name (Role if explicitly stated)"],
  "summary": "string",
  "keyDiscussions": ["string"],
  "decisions": ["string"],
  "actionItems": [{ "id": "1", "task": "string", "assignee": "Name or Unassigned", "dueDate": "Date or TBD", "priority": "High|Medium|Low", "status": "Pending" }],
  "nextMeeting": "string or omit if not mentioned",
  "termDefinitions": [
    { "term": "MAU", "definition": "Monthly Active Users", "status": "Verified" },
    { "term": "PAU", "definition": "Unknown acronym used in context of user stats", "status": "Needs Review" }
  ]
}
`
        :
        `You are an expert meeting minutes assistant specializing in Business Intelligence and Data Analytics teams. Analyze the meeting transcript${input.visualContext ? ' and visual context from screen sharing' : ''} and generate accurate, grounded meeting minutes.
${biContext}
**Meeting Transcript**:
${transcript}
${input.visualContext ? `\n**Visual Context from Screen Sharing/Slides**:\n${input.visualContext}\n` : ''}

**Your Task**:
1. **Meeting Title**: Use "${input.meetingTitle || 'Team Meeting'}" unless a clearer title is explicitly stated in the transcript.
2. **Attendees**: List names that are clearly heard or mentioned in the transcript. Only add a role in brackets if it is explicitly stated by the person (e.g. "I'm the PM"). If no names are audible, return an empty array.
3. **Summary**: Write 2-3 sentences summarizing what was actually discussed. Always fill this from transcript content — do not leave it empty.
4. **Key Discussions**: Extract the main topics and talking points from the transcript. Always populate this — even a single topic is fine.
5. **Decisions Made**: List only decisions or agreements that were clearly reached. If none, return an empty array.
6. **Action Items**: List only tasks that were explicitly assigned or agreed upon.
   - Assignee: use the name if mentioned, otherwise "Unassigned".
   - Due date: only if a date was explicitly mentioned in the meeting. Otherwise use "TBD". Do NOT invent dates.
   - Priority: infer from urgency words ("urgent", "ASAP", "by EOD") only. Otherwise "Medium".
7. **Duration**: Only fill if explicitly discussed (e.g. "let's keep this to 30 mins"). Otherwise use "Not mentioned".
8. **Next Meeting**: Only if explicitly scheduled in the transcript. Otherwise omit the field entirely.

**Output Format**:
Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "meetingTitle": "string",
  "date": "Month DD, YYYY",
  "duration": "string or 'Not mentioned'",
  "attendees": ["Name" or "Name (Role if explicitly stated)"],
  "summary": "string",
  "keyDiscussions": ["string", ...],
  "decisions": ["string", ...],
  "actionItems": [
    {
      "id": "1",
      "task": "string",
      "assignee": "Name or Unassigned",
      "dueDate": "Mon DD, YYYY or TBD",
      "priority": "High|Medium|Low",
      "status": "Pending|In Progress|Completed"
    }
  ],
  "nextMeeting": "Day, Month DD, YYYY at HH:MM AM/PM - Topic (omit field if not mentioned)"
}
`;

    const prompt = `${systemPrompt}

**Important**:
- Use today's date for the "date" field: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
- Duration: only fill if explicitly discussed in the meeting, otherwise use "Not mentioned"
- Assign sequential IDs to action items ("1", "2", "3", ...)
- If the transcript is unclear or in Tanglish, focus on the English technical content
${input.visualContext ? '- Incorporate information from slides, diagrams, or screen shares when relevant\n' : ''}- Return ONLY the JSON object, no other text
`;

    const response = await model.invoke(prompt);

    try {
        const content = response.content.toString();

        // Remove markdown code blocks if present
        const cleanContent = content
            .replace(/```json\n ?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        const parsed = JSON.parse(cleanContent);

        console.log('✅ Generated MoM successfully');
        console.log(`📊 Found ${parsed.decisions?.length || 0} decisions`);
        console.log(`📋 Found ${parsed.actionItems?.length || 0} action items`);

        return parsed;
    } catch (e) {
        console.error('Error parsing MoM response:', e);
        console.error('Raw response:', response.content.toString().substring(0, 500));

        // Return fallback structure
        return {
            meetingTitle: input.meetingTitle || 'Team Meeting',
            date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            duration: '1h',
            attendees: ['Team Member'],
            summary: 'Meeting minutes could not be fully generated. Please try again.',
            keyDiscussions: [],
            decisions: [],
            actionItems: [],
            termDefinitions: [],
        };
    }
}
