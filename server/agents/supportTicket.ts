import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
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
${hasDeveloperNotes ? `**DEVELOPER / TECHNICAL NOTES** — Use this as your ONLY technical truth.
- If these notes say a requirement is "vague" or ask for "clarification", your response MUST focus on asking the customer for those details.
- Do NOT provide a solution if these notes indicate that more information is needed.
- Do not add, infer, or hallucinate beyond what is written here.

${input.developerNotes}

` : ''}**YOUR TASK**: Write a reply that responds SPECIFICALLY to the customer's LATEST message in the conversation above, while strictly following the **DEVELOPER / TECHNICAL NOTES** above.
- If the developer notes contain a question for the customer or indicate a need for details, ask those questions directly.
- Do NOT repeat information or workarounds already given in earlier agent replies.
- If no developer notes are provided, base your reply solely on the conversation history.

**DELAY**: ${hasDelay ? 'YES — ticket is over 7 days old. You MUST start with "Sorry for the delay in getting back to you."' : 'NO — ticket is recent. Start with "Thank you for reaching out to us regarding your Zoho Analytics workspace."'}

---

**MANDATORY ZOHO ANALYTICS SUPPORT STYLE GUIDE** (apply to every response):

1. START WITH EMPATHY AND CONTEXT — Acknowledge that the customer is blocked on a specific issue. Tailor your acknowledgment to the customer's specific problem.
   - Example (Delay): "Sorry for the delay in getting back to you. We understand your concern regarding [specific area/problem]."

2. IDENTIFY THE EXACT ZOHO ANALYTICS AREA — Mention the affected part (e.g., pivot reports, data sync).

3. VALIDATE THE CUSTOMER’S USE CASE — Restate your understanding of the customer's goal. If the requirement is vague (as per developer notes), state that you'd like to understand the use case better.

4. ASK FOR REQUIRED DETAILS FIRST — If the **DEVELOPER NOTES** indicate information is missing (vague requirement, missing table name, etc.), your PRIMARY task is to ask for these details. 
   - CRITICAL: If you are asking for clarification, do NOT provide a multi-step solution. Keep the focus on getting the right information first.

5. PROVIDE SOLUTIONS ONLY WHEN CERTAIN — ONLY provide step-by-step solutions if the **DEVELOPER NOTES** contain a concrete answer or if the solution is 100% clear from the context. Otherwise, stick to asking for details.

6. HANDLING FEATURE LIMITATIONS — Acknowledge the limitation and offer a workaround. Never just say it's not possible.

7. HANDLING FEATURE REQUESTS — Appreciate the suggestion and confirm it's shared with the product team. Do NOT promise timelines.

8. MAINTAIN ZOHO TONE — Polite, calm, professional. No internal jargon.

9. END WITH A CLEAR NEXT STEP — Example: "Please try the above steps..." or "Please share the requested details so we can assist you further."

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
