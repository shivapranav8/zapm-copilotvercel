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
1. **[UI DEVELOPER NOTES]**: If this exists in the TECHNICAL CONTEXT, it is your **ABSOLUTE TOP PRIORITY**. It contains recent manual instructions.
2. **[LATEST PRIVATE NOTE]**: If this exists within the Desk Threads, it is the most recent technical update from an agent. Use this over any older internal notes or workarounds.
3. **[OLDER PRIVATE NOTE]**: Use for background context only. If a "LATEST" note or "UI" note contradicts an older note, follow the newer one.
4. **INTERNAL KNOWLEDGE**: Only use for minor details or if all above are missing/incomplete.

**CLARIFICATION VS SOLUTION (CRITICAL)**:
- If ANY of the technical notes (UI Notes or the LATEST private note) indicate the query is **"vague"** or explicitly say to **"ask for clarification"**, you **MUST NOT** provide a technical solution or SQL.
- Otherwise, be proactive and provide a solution based on the latest technical context.

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
- **BOLD EVERY FEATURE**: You **MUST** wrap every mention of **Zoho Analytics**, **Zoho CRM**, **Query Table**, **Pivot View**, **Formula Column**, **Data Sources**, **Dashboard**, and **Reports** in **<strong>** tags.
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
