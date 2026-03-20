import { z } from 'zod';
import { generateZohoNativeResponse } from '../templates/zohoNativeTemplate';
import { callPlatformAI } from '../utils/platformAI';

// Input schema
const SupportTicketInputSchema = z.object({
    communityLink: z.string(),
    developerNotes: z.string().optional(),
    problemStatement: z.string().optional(),
    prdContent: z.string().optional(),
    includeDelayApology: z.boolean().optional(),
    userName: z.string().optional(),
    responderName: z.string().optional(),
    zohoToken: z.string().optional(),
});

export type SupportTicketInput = z.infer<typeof SupportTicketInputSchema>;
export type SupportTicketOutput = {
    response: string;
    draftContent: string;
    userName?: string;
};

// ── Priority detection ────────────────────────────────────────────────────────
// The route combines notes with labeled headers. Parse them out.
function parsePriority(raw: string | undefined): {
    uiNotes: string;
    privateThreads: string;
} {
    if (!raw?.trim()) return { uiNotes: '', privateThreads: '' };

    const uiMatch = raw.match(/\[UI DEVELOPER NOTES\]:\n([\s\S]*?)(?=\n\n---\n\n|$)/);
    const threadMatch = raw.match(/\[ZOHO DESK PRIVATE THREADS\/COMMENTS\]:\n([\s\S]*?)(?=\n\n---\n\n|$)/);

    const uiNotes = uiMatch ? uiMatch[1].trim() : '';
    const privateThreads = threadMatch ? threadMatch[1].trim() : '';

    // If no labels found, treat the whole thing as UI notes (typed directly)
    if (!uiNotes && !privateThreads) {
        return { uiNotes: raw.trim(), privateThreads: '' };
    }

    return { uiNotes, privateThreads };
}

// ── Shared style guide (applied when relevant) ────────────────────────────────
const STYLE_GUIDE = `ZOHO ANALYTICS SUPPORT STYLE GUIDE
Apply each rule only when relevant to this specific ticket:

1. EMPATHY & CONTEXT — Always start with empathy. If delayed (>7 days): "Sorry for the delay in getting back to you." If not delayed: "Thank you for reaching out to us regarding your Zoho Analytics workspace." Always acknowledge what the customer is experiencing.

2. IDENTIFY THE EXACT AREA — Name the specific Zoho Analytics area (e.g. <strong>Query Table</strong>, <strong>Formula Column</strong>, <strong>Pivot Report</strong>, <strong>Data Sync</strong>). Bold it with <strong>.

3. VALIDATE THE USE CASE — Restate what the customer is trying to achieve in 1 sentence. Example: "From your message, I understand you want to calculate monthly revenue growth in a pivot report."

4. ASK FOR MISSING DETAILS — Only if the solution cannot be given without more info. Ask for: workspace name, table name, report type, formula used, screenshot of error/config, data source type.

5. STEP-BY-STEP SOLUTIONS — Number every solution step. Keep steps short. No long paragraphs.
   Example: "1. Open the report. 2. Click Add → Formula Column. 3. Use the formula below. 4. Save and regenerate."

6. FEATURE LIMITATIONS — If the feature doesn't exist, acknowledge it, explain briefly, and offer a workaround. Never end with only "this is not possible."

7. FEATURE REQUESTS — Appreciate the suggestion, state current availability, and assure the customer it's been shared with the product team. Never promise timelines.

8. SAMPLES & EXAMPLES — Include sample formulas, SQL snippets, or example steps when applicable. Format SQL/code with <br> line breaks.

9. PERFORMANCE & SYNC ISSUES — Acknowledge urgency. Suggest optimizations (reduce grouped columns, limit aggregate formulas). Ask for logs if needed.

10. ESCALATION — If a bug is suspected or sync failures persist, say: "We've shared this with our technical team and will update you once we have more details."

11. ZOHO TONE — Polite, calm, neutral. No internal jargon (no "backend job", "database shard"). No overly casual language.

12. CLEAR NEXT STEP — Always end with what the customer should do next. Example: "Please try the above steps and let us know if the issue persists."

13. SAFE PHRASES — "Thank you for using Zoho Analytics." / "We understand your reporting requirement." / "Please let us know if we misunderstood your use case." / "We'll be happy to assist further."

14. FINAL CHECK — Correct feature mentioned. Steps are clear. Samples included if needed. Professional tone. Follow-up question or next step at the end.`;

const HTML_FORMAT = `HTML FORMAT:
- Output HTML only. No markdown (no ** or *).
- Bold EVERY feature name: <strong>Zoho Analytics</strong>, <strong>Query Table</strong>, <strong>Formula Column</strong>, <strong>Pivot View</strong>, <strong>Data Sources</strong>, <strong>Dashboard</strong>, <strong>Reports</strong>, etc.
- Format SQL/code: use <br> between lines, bold keywords with <strong>SELECT</strong>.
- Separate paragraphs with <br><br>.
- DO NOT include greeting or signature — the template adds them.
- Return ONLY valid JSON: {"mainContent": "...", "userName": "..."}`;

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildPriority1Prompt(uiNotes: string, ticket: string, delayLine: string): string {
    return `You are a Zoho Analytics support agent replying to a customer ticket.

PRIORITY INSTRUCTION: The developer has provided specific notes for this ticket. Your response must communicate exactly what the notes say — do not add to it, do not contradict it.

DEVELOPER NOTES (your response must reflect this exactly):
"""
${uiNotes}
"""

TICKET CONVERSATION (the [LATEST CUSTOMER MESSAGE] is what you are replying to — use the rest only for context):
"""
${ticket}
"""

HOW TO WRITE THE RESPONSE:
- You are replying specifically to the [LATEST CUSTOMER MESSAGE]. Do not answer older messages.
- Acknowledge the customer's issue, naming their specific feature (bold with <strong>).
- Communicate the developer notes professionally and empathetically.
- If notes say "working on a fix / agent / solution": say the team is actively working on it. Do NOT add workarounds or say the feature is unsupported. End with: "We will notify you as soon as it is ready."
- If notes say "ask for clarification": ask only that. Nothing else.
- If notes provide a solution or steps: present them using the style guide below (steps numbered, feature names bolded).
- ${delayLine}
- Keep to 2–4 short paragraphs.

${STYLE_GUIDE}

${HTML_FORMAT}`;
}

function buildPriority2Prompt(privateThreads: string, ticket: string, delayLine: string, responderName: string): string {
    return `You are ${responderName} from the Zoho Analytics Support team, replying to a customer ticket.

PRIORITY INSTRUCTION: Internal team notes / private threads are available. Notes are ordered newest-first — the [LATEST PRIVATE NOTE] reflects the team's most current decision and MUST be followed. Older notes are background context only.

INTERNAL NOTES / PRIVATE THREADS (newest first):
"""
${privateThreads}
"""

TICKET CONVERSATION (the [LATEST CUSTOMER MESSAGE] is what you are replying to — use the rest only for context):
"""
${ticket}
"""

HOW TO WRITE THE RESPONSE:
- You are replying specifically to the [LATEST CUSTOMER MESSAGE]. Do not answer older messages.
- The [LATEST PRIVATE NOTE] is the team's current direction. Follow it exactly.
- If the latest note says "ask for clarification / more details / explain further / need more info": ask ONLY that. Do NOT provide a solution, steps, or SQL. Ignore any solutions in older notes.
- If the latest note describes a solution or workaround: present it to the customer professionally.
- If the latest note says the team is investigating or working on it: say so. Do not fabricate a solution from older notes.
- Do NOT copy internal notes verbatim — translate them into customer-friendly language.
- ${delayLine}
- Apply all relevant rules from the style guide below.

${STYLE_GUIDE}

${HTML_FORMAT}`;
}

function buildPriority3Prompt(ticket: string, delayLine: string, responderName: string): string {
    return `You are ${responderName} from the Zoho Analytics Support team, replying to a customer ticket.

PRIORITY INSTRUCTION: No developer notes or internal context available. Use your Zoho Analytics knowledge to provide the best possible solution.

TICKET CONVERSATION (the [LATEST CUSTOMER MESSAGE] is what you are replying to — use the rest only for context):
"""
${ticket}
"""

HOW TO WRITE THE RESPONSE:
- You are replying specifically to the [LATEST CUSTOMER MESSAGE]. Do not answer older messages.
- Diagnose the issue or request from that message and respond to it directly.
- ${delayLine}
- Apply all relevant rules from the style guide below.

${STYLE_GUIDE}

${HTML_FORMAT}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateSupportTicketResponse(
    input: SupportTicketInput
): Promise<SupportTicketOutput> {
    const responderName = input.responderName || "Shiva Pranav S";
    const ticket = input.problemStatement || "No conversation history available.";
    const hasDelay = input.includeDelayApology === true;

    const delayLine = hasDelay
        ? "Start with: Sorry for the delay in getting back to you."
        : "Do NOT add a delay apology.";

    const { uiNotes, privateThreads } = parsePriority(input.developerNotes);

    // Determine priority and log it
    let priority: 1 | 2 | 3;
    let prompt: string;

    if (uiNotes) {
        priority = 1;
        console.log("🎫 [Support] Priority 1 — UI Developer Notes");
        prompt = buildPriority1Prompt(uiNotes, ticket, delayLine);
    } else if (privateThreads) {
        priority = 2;
        console.log("🎫 [Support] Priority 2 — Private Threads/Comments");
        prompt = buildPriority2Prompt(privateThreads, ticket, delayLine, responderName);
    } else {
        priority = 3;
        console.log("🎫 [Support] Priority 3 — Auto-generate from AI knowledge");
        prompt = buildPriority3Prompt(ticket, delayLine, responderName);
    }

    const rawResponse = await callPlatformAI(prompt, {
        temperature: 0,
        model: 'gpt-4o',
        ai_vendor: 'openai',
        zohoToken: input.zohoToken,
    });

    let mainContent = '';
    let userName = input.userName || 'there';

    try {
        const content = rawResponse.trim();
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            const parsed = JSON.parse(content.substring(firstBrace, lastBrace + 1));
            mainContent = parsed.mainContent || content;
            userName = parsed.userName || userName;
        } else {
            throw new Error('No JSON braces found');
        }
    } catch {
        mainContent = rawResponse.replace(/```json|```/g, '').trim();
    }

    // Post-process: convert leftover markdown bold to HTML
    mainContent = mainContent.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Post-process: strip AI-generated greeting (template adds its own)
    mainContent = mainContent.replace(/^\s*(<[^>]+>)?\s*Hello\s+\w[\w\s]*,\s*(<\/[^>]+>)?\s*(<br\s*\/?>)?\s*/i, '');

    // Guarantee delay apology is present when required
    if (hasDelay && !mainContent.toLowerCase().includes('sorry for the delay')) {
        mainContent = '<div style="margin-bottom: 15px;">Sorry for the delay in getting back to you.</div>\n\n' + mainContent;
    }

    console.log(`✅ [Support] Priority ${priority} response generated (${mainContent.length} chars)`);

    const finalHtml = generateZohoNativeResponse({
        mainContent,
        userName,
        closingStatement: 'Hope this helps!',
        responderName,
    });

    const draftContent = `<div style="font-family: Arial, sans-serif; font-size: 13px;">
${mainContent}
<p>Hope this helps!</p>
<p>Regards,<br>${responderName}<br>Zoho Analytics Support</p>
</div>`;

    return { response: finalHtml, draftContent, userName };
}
