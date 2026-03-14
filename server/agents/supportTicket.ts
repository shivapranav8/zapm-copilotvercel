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

    // Generate response using LLM
    const prompt = `You are Shiva Pranav S from the Zoho Analytics Support team writing a professional reply to a support ticket.

**TICKET REFERENCE**: ${input.communityLink}

---
**FULL TICKET CONVERSATION** (read this carefully — this is the complete history):
${input.problemStatement || 'No conversation history available.'}

---
${hasDeveloperNotes ? `**TECHNICAL CONTEXT (DEV NOTES & PRIVATE THREADS)**:
${input.developerNotes}

` : ''}**YOUR TASK**: Generate a support reply for **${input.userName}**.

**PRIORITY FLOW**:
1. Use the **TECHNICAL CONTEXT** (Dev Notes or Private Threads) as your PRIMARY source.
2. If the context is missing, use your internal Zoho Analytics knowledge.
3. If the context explicitly says the request is "vague" or asks for "clarification", focus on asking for those details. Otherwise, be PROACTIVE and provide solutions.
4. Address the customer as: **${input.userName}**. Ignore any internal names (e.g., Yogith, Prasanth) in the notes.

**DELAY STATUS**: ${hasDelay ? 'DELAYED (>7 days). Start with "Sorry for the delay in getting back to you."' : 'NOT DELAYED. Start with "Thank you for reaching out to us regarding your Zoho Analytics workspace."'}

---

**MANDATORY 14-POINT ZOHO ANALYTICS SUPPORT STYLE GUIDE**:

1. START WITH EMPATHY AND CONTEXT — Acknowledge that the customer is blocked. Tailor the acknowledgment to their specific issue.

2. IDENTIFY THE EXACT ZOHO ANALYTICS AREA — Mention the part (e.g., pivot reports, data sync, formula columns, etc.) before suggesting a fix.

3. VALIDATE THE CUSTOMER’S USE CASE — Restate your understanding of what the customer is trying to achieve to avoid incorrect suggestions.

4. ASK FOR REQUIRED DETAILS WHEN NEEDED — If info is missing (workspace name, screenshots, etc.), ask clearly. ONLY do this if the context implies it's necessary or vague.

5. PROVIDE CLEAR, STEP-BY-STEP SOLUTIONS — Be proactive and structured. Use numbered lists. Keep it simple and avoid long paragraphs.

6. HANDLING FEATURE LIMITATIONS — Acknowledge the limit, explain it, and always offer a workaround. Never just say "no".

7. HANDLING FEATURE REQUESTS — Appreciate the suggestion, confirm it's shared with the product team, and do NOT promise timelines.

8. USE SAMPLES, EXAMPLES, AND SCREENSHOTS — Use sample formulas or example query tables whenever possible to help the customer understand.

9. HANDLE PERFORMANCE OR SYNC ISSUES CAREFULLY — Acknowledge urgency, suggest optimizations, and ask for logs if needed.

10. ROUTING TO THE RIGHT TEAM — Escalate if a backend bug is suspected or sync failures persist. Mention sharing with the technical team.

11. MAINTAIN ZOHO TONE — Polite, calm, professional. Avoid internal jargon like "shard" or "backend job".

12. END WITH A CLEAR NEXT STEP — Guide them on what to do next (e.g., "Please try these steps and let us know").

13. SAFE PHRASES — Use: "Thank you for using Zoho Analytics", "We understand your reporting requirement", "Please let us know if we misunderstood", "We'll be happy to assist further".

14. FINAL CHECKLIST — Confirm feature name accuracy, clear steps, professional tone, and clear follow-up.

---

**HTML FORMAT RULES**:
- The template auto-adds: greeting "Hello [userName]," · closing "Hope this helps!" · signature. Do NOT include these.
- Use <br><br> between paragraphs.
- Bold ONLY feature names and dates with <strong>. Do NOT bold structural phrases like "Please be informed" or "From your message".
- Acknowledgment + area identification + solution/question in 1–3 short paragraphs. Then one closing next-step sentence.

Return ONLY this JSON (no markdown, no extra text):
{"mainContent": "[your HTML body content]", "userName": "[customer name from context, or 'there']"}
`;

    const response = await model.invoke(prompt);
    let mainContent = '';
    let userName = 'there';

    try {
        const content = response.content as string;
        // Find the JSON block if the model included markdown formatting
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : content;
        const parsed = JSON.parse(jsonStr);
        mainContent = parsed.mainContent || content;
        userName = parsed.userName || input.userName || 'there';
    } catch (e) {
        console.error('Failed to parse AI response as JSON, using raw content');
        mainContent = response.content as string;
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
        responderName: 'Shiva Pranav S',
    });

    return {
        response: finalHtml,
        userName,
    };
}
