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
    response: z.string().describe('Generated support response in HTML format (full template for preview)'),
    draftContent: z.string().describe('Simplified HTML for saving to Zoho Desk draft (no template wrapper)'),
    userName: z.string().optional().describe('Extracted user name from context'),
});

export type SupportTicketInput = z.infer<typeof SupportTicketInputSchema>;
export type SupportTicketOutput = z.infer<typeof SupportTicketOutputSchema>;

// Initialize the model
const model = new ChatOpenAI({
    modelName: 'gpt-4o',
    temperature: 0,
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
    const prompt = `You are ${responderName} from the Zoho Analytics Support team.

---
**FULL TICKET CONVERSATION**:
${input.problemStatement || 'No conversation history available.'}

---
${hasDeveloperNotes ? `**TECHNICAL CONTEXT (PRIVATE THREADS / DEV NOTES)**:
${input.developerNotes}
GIVEN CONTEXT IS YOUR ONLY SOURCE. DO NOT ADD OR SUGGEST SOLUTIONS NOT MENTIONED HERE.
` : '**NO TECHNICAL CONTEXT PROVIDED. USE YOUR INTERNAL ZOHO ANALYTICS KNOWLEDGE.**'}

**SOURCE PRIORITY**:
1. **[UI DEVELOPER NOTES]**: ABSOLUTE TOP PRIORITY. If this exists, follow it word-for-word. Do NOT add workarounds, SQL, or solutions not mentioned in it. If the notes say the issue is being worked on — say exactly that. If they say no ETA — do NOT give one. The style guide below is OVERRIDDEN by UI Developer Notes.
2. **[LATEST PRIVATE NOTE]**: Most recent technical update from an agent. Use this over older notes or workarounds.
3. **[OLDER PRIVATE NOTE]**: Background context only.
4. **INTERNAL KNOWLEDGE**: Only if ALL above are missing.

**CLARIFICATION VS SOLUTION (CRITICAL)**:
- If ANY note says **"vague"** or **"ask for clarification"** — do NOT provide a solution or SQL. Ask the customer for more details.
- If UI Developer Notes say the issue is being worked on / no ETA / escalated — tell the customer exactly that. Do NOT suggest a workaround.
- Only be proactive with solutions if no notes exist at all.

**DELAY STATUS**: ${hasDelay ? 'DELAYED (>7 days). Start with "Sorry for the delay in getting back to you."' : 'NOT DELAYED. Start with "Thank you for reaching out to us regarding your Zoho Analytics workspace."'}

---

**MANDATORY 14-POINT ZOHO ANALYTICS SUPPORT STYLE GUIDE**:
1. START WITH EMPATHY AND CONTEXT — Acknowledge that the customer is blocked.
2. IDENTIFY THE EXACT ZOHO ANALYTICS AREA — Mention the part (e.g., **<strong>Query Table</strong>**, **<strong>Pivot View</strong>**, **<strong>Formula Column</strong>**, etc.).
3. VALIDATE THE CUSTOMER’S USE CASE — Restate their specific goal.
4. ASK FOR REQUIRED DETAILS WHEN NEEDED — If info is missing, ask.
5. PROVIDE CLEAR, STEP-BY-STEP SOLUTIONS — Be proactive.
6. HANDLING FEATURE LIMITATIONS — Offer workarounds.
7. HANDLING FEATURE REQUESTS — Share with the product team.
8. USE SAMPLES, EXAMPLES, AND SCREENSHOTS — Format SQL with <br>.
9. HANDLE PERFORMANCE OR SYNC ISSUES CAREFULLY.
10. ROUTING TO THE RIGHT TEAM.
11. MAINTAIN ZOHO TONE — Polite, calm, professional.
12. END WITH A CLEAR NEXT STEP.
13. SAFE PHRASES — e.g., "Thank you for using **<strong>Zoho Analytics</strong>**".
14. FINAL CHECKLIST — Ensure **<strong>** tags for EVERY feature mention.

---

**HTML FORMAT & BOLDING RULES (ULTRA-STRICT)**:
- DO NOT USE MARKDOWN. No ** or * anywhere in the output. Only HTML.
- **BOLD EVERY FEATURE**: Wrap every mention of Zoho Analytics, Zoho CRM, Query Table, Pivot View, Formula Column, Data Sources, Dashboard, and Reports in <strong> tags.
- **SQL/CODE**: Bold keywords. <strong>SELECT</strong> * <br><strong>FROM</strong> Table
- Separate paragraphs with <br><br>.
- The template auto-adds greeting and signature.

Return **ONLY** a valid JSON object. No markdown preamble, no closing signature.
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

    // POST-PROCESSING: Convert any leftover markdown bold (**text**) to HTML <strong>
    mainContent = mainContent.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // POST-PROCESSING: Inject delay apology if flag is set
    // This ensures the apology is ALWAYS included when requested, regardless of AI behavior
    if (input.includeDelayApology) {
        const delayApology = '<div style="margin-bottom: 15px;">Sorry for the delay in getting back to you.</div>\n\n';

        // Check if apology is already present (case-insensitive)
        if (!mainContent.toLowerCase().includes('sorry for the delay')) {
            mainContent = delayApology + mainContent;
        }
    }

    // Generate final native HTML response (full template — for app preview only)
    const finalHtml = generateZohoNativeResponse({
        mainContent,
        userName,
        closingStatement: 'Hope this helps!',
        responderName,
    });

    // Simple draft content — what actually gets saved to Zoho Desk
    const draftContent = `<div style="font-family: Arial, sans-serif; font-size: 13px;">
<p>Hello ${userName},</p>
${mainContent}
<p>Hope this helps!</p>
<p>Regards,<br>${responderName}<br>Zoho Analytics Support</p>
</div>`;

    return {
        response: finalHtml,
        draftContent,
        userName,
    };
}
