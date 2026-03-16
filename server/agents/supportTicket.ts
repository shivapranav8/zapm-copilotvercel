import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { generateZohoNativeResponse } from '../templates/zohoNativeTemplate';
import { CommunityResponseData } from '../templates/communityResponseTemplate';

// Input schema for support ticket agent
const SupportTicketInputSchema = z.object({
    communityLink: z.string().describe('URL to the community thread'),
    developerNotes: z.string().optional().describe('Technical context and developer notes about the issue'),
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
    console.log('📝 Developer Notes:', input.developerNotes ? input.developerNotes.substring(0, 100) + '...' : 'NONE');

    const hasDelay = input.includeDelayApology === true;
    const devNotes = input.developerNotes || "";
    const hasDeveloperNotes = devNotes.length > 0 &&
        devNotes !== "Answer the customer's question directly based on your Zoho Analytics knowledge.";
    const hasUIDevNotes = devNotes.includes("[UI DEVELOPER NOTES]");

    const responderName = input.responderName || "Shiva Pranav S";

    const contextSection = hasDeveloperNotes
        ? "**TECHNICAL CONTEXT**:\n" + devNotes
        : "**NO TECHNICAL CONTEXT PROVIDED. USE YOUR INTERNAL ZOHO ANALYTICS KNOWLEDGE.**";

    const delayLine = hasDelay
        ? 'DELAYED (>7 days). Include "Sorry for the delay in getting back to you." near the start.'
        : 'NOT DELAYED. Start with "Thank you for reaching out to us regarding your Zoho Analytics workspace."';

    const uiOverrideGuide = [
        "*** UI DEVELOPER NOTES OVERRIDE MODE - THE STYLE GUIDE BELOW DOES NOT APPLY ***",
        "",
        "The [UI DEVELOPER NOTES] above are your ONLY source of truth.",
        "Write a SHORT, polite message (2-4 sentences) that relays EXACTLY what those notes say.",
        "",
        "STRICT RULES:",
        "- Do NOT add SQL queries or code examples",
        "- Do NOT suggest workarounds or alternatives",
        "- Do NOT add step-by-step solutions",
        "- Do NOT expand beyond what the notes say",
        '- If the notes say "we are working on X" -- say exactly that',
        "- If the notes say no ETA -- do NOT invent one",
    ].join("\n");

    const fullStyleGuide = [
        "**MANDATORY 14-POINT ZOHO ANALYTICS SUPPORT STYLE GUIDE**:",
        "1. START WITH EMPATHY AND CONTEXT -- Acknowledge that the customer is blocked.",
        "2. IDENTIFY THE EXACT ZOHO ANALYTICS AREA -- Mention the part (e.g., <strong>Query Table</strong>, <strong>Pivot View</strong>, etc.).",
        "3. VALIDATE THE CUSTOMER'S USE CASE -- Restate their specific goal.",
        "4. ASK FOR REQUIRED DETAILS WHEN NEEDED -- If info is missing, ask.",
        "5. PROVIDE CLEAR, STEP-BY-STEP SOLUTIONS -- Be proactive.",
        "6. HANDLING FEATURE LIMITATIONS -- Offer workarounds.",
        "7. HANDLING FEATURE REQUESTS -- Share with the product team.",
        "8. USE SAMPLES, EXAMPLES, AND SCREENSHOTS -- Format SQL with <br>.",
        "9. HANDLE PERFORMANCE OR SYNC ISSUES CAREFULLY.",
        "10. ROUTING TO THE RIGHT TEAM.",
        "11. MAINTAIN ZOHO TONE -- Polite, calm, professional.",
        "12. END WITH A CLEAR NEXT STEP.",
        '13. SAFE PHRASES -- e.g., "Thank you for using <strong>Zoho Analytics</strong>".',
        "14. FINAL CHECKLIST -- Ensure <strong> tags for EVERY feature mention.",
        "",
        "If [ZOHO DESK PRIVATE THREADS/COMMENTS] exist, use them as your technical source. Do NOT add solutions not mentioned there.",
    ].join("\n");

    const instructionSection = hasUIDevNotes ? uiOverrideGuide : fullStyleGuide;

    // Generate response using LLM
    const prompt = `You are ${responderName} from the Zoho Analytics Support team.

---
**FULL TICKET CONVERSATION**:
${input.problemStatement || 'No conversation history available.'}

---
${contextSection}

**DELAY STATUS**: ${delayLine}

---
${instructionSection}

---

**HTML FORMAT**:
- DO NOT USE MARKDOWN. No ** or * anywhere. Only HTML.
- Wrap feature names in <strong> tags (Zoho Analytics, Query Table, etc.)
- Separate paragraphs with <br><br>.
- The template auto-adds greeting and signature — do not include them.

Return ONLY a valid JSON object:
{"mainContent": "[your HTML body content]", "userName": "[customer name from context, or there]"}
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

    // POST-PROCESSING: Strip any leading greeting the AI included
    // The Zoho template already adds "Hello {name}," before mainContent — strip it to avoid duplication
    mainContent = mainContent.replace(/^\s*(<[^>]+>)?\s*Hello\s+\w[\w\s]*,\s*(<\/[^>]+>)?\s*(<br\s*\/?>)?\s*/i, '');

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
    // NOTE: No greeting wrapper here — the AI already includes "Hello {name}," in mainContent
    const draftContent = `<div style="font-family: Arial, sans-serif; font-size: 13px;">
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
