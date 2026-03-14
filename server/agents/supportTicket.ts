import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { findSimilarResponses, extractCleanReply, loadCombinedEmbeddings } from '../utils/supportTicketVectorDB';
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
    similarResponses: z.array(z.object({
        url: z.string(),
        excerpt: z.string(),
        similarity: z.number(),
    })).describe('Similar past responses used as reference'),
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

    // Fetch similar responses for UI display only — NOT used in AI generation
    // Gracefully skip if embeddings unavailable (e.g. Vercel environment)
    const queryParts = [
        input.developerNotes,
        input.problemStatement || '',
        input.prdContent ? `Context: ${input.prdContent.substring(0, 500)}` : '',
    ].filter(Boolean);
    let similarResponses: Awaited<ReturnType<typeof findSimilarResponses>> = [];
    try {
        await loadCombinedEmbeddings();
        similarResponses = await findSimilarResponses(queryParts.join(' '), 5);
    } catch (e) {
        console.warn('⚠️ Embeddings unavailable, skipping similar responses');
    }

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
${hasDeveloperNotes ? `**DEVELOPER / TECHNICAL NOTES** — Use this as your primary technical source. Do not add, infer, or hallucinate beyond what is written here:
${input.developerNotes}

` : ''}**YOUR TASK**: Write a reply that responds SPECIFICALLY to the customer's LATEST message in the conversation above.
- Do NOT repeat information or workarounds already given in earlier agent replies.
- If the customer's latest message is a feature request or feedback, acknowledge it, empathise, and log it as a feature request.
- If the customer asked a new question, answer it.
- If no developer notes are provided, base your reply solely on the conversation history.

**DELAY**: ${hasDelay ? 'YES — ticket is over 7 days old. You MUST start with "Sorry for the delay in getting back to you."' : 'NO — ticket is recent. Start with "Thank you for reaching out to us regarding your Zoho Analytics workspace."'}

---

**MANDATORY ZOHO ANALYTICS SUPPORT STYLE GUIDE** (apply to every response):

1. EMPATHY FIRST — Open with the line above based on delay status. Always acknowledge the customer's situation. Example: "We understand how important accurate reporting is for your analysis."

2. IDENTIFY THE ZOHO ANALYTICS AREA — Explicitly name the affected area: data import/sync, report creation (tables/pivots/charts), dashboards, formula columns, query tables, sharing/permissions, performance, or integrations (Zoho CRM, Books, Desk). Example: "This seems to be related to aggregate formula behavior in pivot reports."

3. VALIDATE THE USE CASE — Restate what the customer is trying to achieve. Example: "From your message, I understand that you want to calculate monthly revenue growth in a pivot report. Please let us know if this understanding is correct."

4. ASK FOR DETAILS WHEN NEEDED — If Developer Notes indicate more info is needed, ask clearly. Common asks: workspace name, table name, report type, formula used, screenshot of error/config, data source (CSV/Zoho CRM/API). Example: "To assist you better, could you please share a screenshot of the report configuration and the formula you are using?"

5. STEP-BY-STEP SOLUTIONS — If Developer Notes contain a concrete answer, present it with numbered steps. Keep steps short and simple.

6. FEATURE LIMITATIONS — If something is not supported, acknowledge it and always offer a workaround. Never end a response by only saying something is not possible.

7. FEATURE REQUESTS — Say: "This has been logged as a feature request with our Zoho Analytics product team for future consideration." Do NOT promise timelines or say "coming soon."

8. PERFORMANCE/SYNC ISSUES — Acknowledge urgency, suggest optimizations (e.g., reduce grouped columns), and ask for logs if needed.

9. ESCALATION — If needed: "We've shared this with our technical team for further analysis. We'll update you once we have more details."

10. TONE — Polite, calm, neutral, professional. Avoid internal jargon (no "backend job", "database shard"). Safe phrases: "Thank you for using Zoho Analytics." / "We understand your reporting requirement." / "We'll be happy to assist further."

11. END WITH A CLEAR NEXT STEP — Always close with: "Please try the above steps and let us know if the issue persists." or "Feel free to reach out if you need any clarification."

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
        similarResponses: similarResponses.map(sr => ({
            url: sr.response.topic_url,
            excerpt: extractCleanReply(sr.response.reply_text).substring(0, 200),
            similarity: sr.similarity,
        })),
        userName,
    };
}
