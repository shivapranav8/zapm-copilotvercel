import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { generateZohoNativeResponse } from '../templates/zohoNativeTemplate';
import { CommunityResponseData } from '../templates/communityResponseTemplate';

// Input schema for support ticket agent
const SupportTicketInputSchema = z.object({
    communityLink: z.string().describe('URL to the community thread'),
    developerNotes: z.string().describe('Technical context and developer notes about the issue'),
    problemStatement: z.string().optional().describe('Problem statement from the support ticket'),
    prdContent: z.string().optional().describe('Relevant PRD content or context'),
    includeDelayApology: z.boolean().optional().describe('Whether to include "Sorry for the delay" (true if ticket is >7 days old)'),
    userName: z.string().optional().describe('Customer name to use in greeting (defaults to "there" if not provided)'),
    responderName: z.string().optional().describe('Full name of the support agent (responder) from Zoho Accounts'),
});

// Output schema
const SupportTicketOutputSchema = z.object({
    response: z.string().describe('Generated support response in HTML format'),
    userName: z.string().optional().describe('Extracted user name from context'),
});

export type SupportTicketInput = z.infer<typeof SupportTicketInputSchema>;
export type SupportTicketOutput = z.infer<typeof SupportTicketOutputSchema>;

// Initialize the model
const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0.7,
});

export async function generateSupportTicketResponse(
    input: SupportTicketInput
): Promise<SupportTicketOutput> {
    console.log('\n🎫 Generating support ticket response...');
    console.log('📝 Community Link:', input.communityLink);
    console.log('📝 Developer Notes:', input.developerNotes.substring(0, 100) + '...');

    const hasDelay = input.includeDelayApology === true;
    const hasDeveloperNotes = input.developerNotes &&
        input.developerNotes !== 'Answer the customer\'s question directly based on your Zoho Analytics knowledge.';

    const responderName = input.responderName || 'Shiva Pranav S';

    // Generate response using LLM
    const prompt = `You are ${responderName} from the Zoho Analytics Support team writing a professional reply to a support ticket.

**TICKET REFERENCE**: ${input.communityLink}

---
**FULL TICKET CONVERSATION** (read this carefully — this is the complete history):
${input.problemStatement || 'No conversation history available.'}

---
${hasDeveloperNotes ? `**TECHNICAL CONTEXT (DEV NOTES & PRIVATE THREADS)**:
${input.developerNotes}

` : ''}**YOUR TASK**: Generate a support reply for **${input.userName}**.

**SOURCE PRIORITY (FOLLOW STRICTLY)**:
1. **IN-APP / DEV NOTES**: If these exist, this is your **ONLY** technical source.
2. **PRIVATE THREADS / COMMENTS**: Use these only if In-app notes are missing.
3. **INTERNAL KNOWLEDGE**: Use this ONLY as a fallback if the above sources are missing or insufficient.
- **CRITICAL**: If Technical Context is provided, do NOT add, infer, or hallucinate outside details (like generic table names "A1").

**DELAY STATUS**: ${hasDelay ? 'DELAYED (>7 days). Start with "Sorry for the delay in getting back to you."' : 'NOT DELAYED. Start with "Thank you for reaching out to us regarding your Zoho Analytics workspace."'}

---

**MANDATORY 14-POINT ZOHO ANALYTICS SUPPORT STYLE GUIDE**:

1. START WITH EMPATHY AND CONTEXT — Acknowledge that the customer is blocked. Tailor the acknowledgment to their specific issue.

2. IDENTIFY THE EXACT ZOHO ANALYTICS AREA — Mention the part (e.g., pivot reports, data sync, formula columns, etc.) before suggesting a fix.

3. VALIDATE THE CUSTOMER’S USE CASE — Restate your understanding of the goal to confirm you are on the same page.

4. ASK FOR REQUIRED DETAILS WHEN NEEDED — If info is missing, ask clearly. ONLY do this if the context explicitly says the request is vague.

5. PROVIDE CLEAR, STEP-BY-STEP SOLUTIONS — Be proactive. Use numbered lists.

6. HANDLING FEATURE LIMITATIONS — Acknowledge the limit and offer a workaround. Never just say "no".

7. HANDLING FEATURE REQUESTS — Appreciate the suggestion and share with the product team. No timelines.

8. USE SAMPLES, EXAMPLES, AND SCREENSHOTS — Use sample formulas or example query tables. **Format SQL queries with clear line breaks using <br>.**

9. HANDLE PERFORMANCE OR SYNC ISSUES CAREFULLY — Suggest optimizations and ask for logs if needed.

10. ROUTING TO THE RIGHT TEAM — Escalate if a backend bug is suspected.

11. MAINTAIN ZOHO TONE — Polite, calm, professional. Avoid jargon.

12. END WITH A CLEAR NEXT STEP — Guide them on what to do next.

13. SAFE PHRASES — Use: "Thank you for using Zoho Analytics", "We'll be happy to assist further", etc.

14. FINAL CHECKLIST — Confirm feature name accuracy and professional tone.

---

**HTML FORMAT & BOLDING RULES**:
- **BOLDING**: You **MUST** wrap all **Zoho Analytics** feature names (e.g., **<strong>Query Table</strong>**, **<strong>Pivot View</strong>**, **<strong>Formula Column</strong>**), product names, table names, and specific dates in **<strong>** tags. This is non-negotiable for readability.
- **SQL/CODE**: Format SQL queries with clear line breaks using <br> and indenting. Bold SQL keywords for clarity.
- Example SQL: <strong>SELECT</strong> * <br><strong>FROM</strong> [Table]<br><strong>WHERE</strong> [Condition]
- Separate paragraphs with <br><br>.
- The template auto-adds greeting and signature.

Return **ONLY** a valid JSON object. Do **NOT** include any preamble, markdown formatting (like \`\`\`json), or signature.
{"mainContent": "[your HTML body content]", "userName": "[customer name from context, or 'there']"}
`;

    const response = await model.invoke(prompt);
    let mainContent = '';
    let userName = 'there';

    try {
        const content = (response.content as string).trim();
        // Extract JSON using a more aggressive regex or just the whole content
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1) {
            const jsonStr = content.substring(firstBrace, lastBrace + 1);
            const parsed = JSON.parse(jsonStr);
            mainContent = parsed.mainContent || content;
            userName = parsed.userName || input.userName || 'there';
        } else {
            throw new Error('No JSON braces found');
        }
    } catch (e) {
        console.error('Failed to parse AI response as JSON, falling back to raw content clean-up');
        mainContent = (response.content as string).replace(/```json|```/g, '').trim();
    }

    // POST-PROCESSING: Inject delay apology if flag is set
    // This ensures the apology is ALWAYS included when requested, regardless of AI behavior
    if (input.includeDelayApology) {
        const delayApology = '<div style="margin-bottom: 15px;">Sorry for the delay in getting back to you.</div>\n\n';

        // Check if apology is already present (case-insensitive)
        if (!mainContent.toLowerCase().includes('sorry for the delay')) {
            mainContent = delayApology + mainContent;
        }
    }

    // Generate final native HTML response
    const finalHtml = generateZohoNativeResponse({
        mainContent,
        userName,
        closingStatement: 'Hope this helps!',
        responderName,
    });

    return {
        response: finalHtml,
        userName,
    };
}
