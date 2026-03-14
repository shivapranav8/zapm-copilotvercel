import { Router, Request, Response, NextFunction } from 'express';
import {
    getMyAgentInfo,
    getOpenTicketsAssignedToMe,
    getTicketById,
    getTicketThreads,
    getTicketComments,
    buildTicketContext,
    saveTicketDraft,
    ZohoAuthError,
    ZohoDeskTicket,
} from '../utils/zohoDeskClient';
import { generateSupportTicketResponse } from '../agents/supportTicket';

export const zohoDeskRouter = Router();

/**
 * Require an active per-user Zoho session on every /zoho-desk route.
 * Returns 401 with a loginUrl so the frontend can redirect to sign-in.
 */
function requireZohoAuth(req: Request, res: Response, next: NextFunction) {
    if (!req.session.zoho?.accessToken) {
        return res.status(401).json({
            error: 'auth_required',
            message: 'Please sign in with your Zoho account to access tickets.',
            loginUrl: '/api/auth/login',
        });
    }
    next();
}

zohoDeskRouter.use(requireZohoAuth);

/**
 * GET /api/zoho-desk/me
 * Returns the authenticated agent's ID and name.
 * Use this to find your ZOHO_DESK_AGENT_ID when you lack access to the Agents UI page.
 */
// Debug: raw response from Zoho agent endpoints
zohoDeskRouter.get('/me/raw', async (req, res) => {
    const token = req.session.zoho?.accessToken;
    const headers = {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'orgId': process.env.ZOHO_DESK_ORG_ID || '60041003425',
        'Content-Type': 'application/json',
    };
    const results: Record<string, any> = {};
    for (const path of ['/agents/me', '/myinfo', '/agents/personalInfo']) {
        try {
            const r = await fetch(`https://desk.zoho.in/api/v1${path}`, { headers });
            const text = await r.text();
            results[path] = { status: r.status, body: text.slice(0, 500) };
        } catch (e) {
            results[path] = { error: String(e) };
        }
    }
    res.json(results);
});

zohoDeskRouter.get('/me', async (req, res) => {
    try {
        const token = req.session.zoho?.accessToken!;
        const email = req.session.zoho?.user?.email || '';
        const agent = await getMyAgentInfo(token, email);
        res.json({ agentId: agent.id, name: agent.name, email: agent.email });
    } catch (error) {
        if (error instanceof ZohoAuthError) {
            return res.status(401).json({ error: 'auth_required', message: error.message, loginUrl: '/api/auth/login' });
        }
        res.status(500).json({
            error: 'Could not resolve agent identity',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * GET /api/zoho-desk/tickets
 * Returns all open tickets assigned to the authenticated agent.
 */
zohoDeskRouter.get('/tickets', async (req, res) => {
    try {
        console.log('📋 [Zoho Desk] Fetching open tickets assigned to me...');
        const limit = parseInt(req.query.limit as string) || 50;
        const token = req.session.zoho!.accessToken;   // requireZohoAuth already verified this exists
        const email = req.session.zoho!.user?.email;
        const tickets = await getOpenTicketsAssignedToMe(limit, token, email);
        console.log(`✅ [Zoho Desk] Found ${tickets.length} open tickets`);
        res.json({ tickets, count: tickets.length });
    } catch (error) {
        if (error instanceof ZohoAuthError) {
            return res.status(401).json({ error: 'auth_required', message: error.message, loginUrl: '/api/auth/login' });
        }
        console.error('❌ [Zoho Desk] Error fetching tickets:', error);
        res.status(500).json({
            error: 'Failed to fetch tickets from Zoho Desk',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /api/zoho-desk/bulk-generate
 * Body: { ticketIds: string[], developerNotes?: string }
 * Generates AI responses for each requested ticket.
 */
zohoDeskRouter.post('/bulk-generate', async (req, res) => {
    const { ticketIds, developerNotes } = req.body as {
        ticketIds: string[];
        developerNotes?: string;
    };

    if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
        return res.status(400).json({ error: 'ticketIds array is required and must not be empty' });
    }

    console.log(`🎫 [Zoho Desk] Bulk generating responses for ${ticketIds.length} ticket(s)...`);

    const token = req.session.zoho!.accessToken;

    // Process each ticket directly by ID — no need to fetch all tickets first
    const results = await Promise.allSettled(
        ticketIds.map(async (ticketId) => {
            const ticket = await getTicketById(ticketId, token);
            if (!ticket) {
                throw new Error(`Ticket ${ticketId} could not be fetched from Zoho Desk`);
            }

            console.log(`  ⚙️  Processing ticket #${ticket.ticketNumber}: ${ticket.subject}`);

            // Fetch threads and internal comments in parallel
            const [threads, comments] = await Promise.all([
                getTicketThreads(ticketId, token).catch((e) => {
                    console.error(`⚠️  [bulk-generate] Failed to fetch threads for ${ticketId}:`, e);
                    return [];
                }),
                getTicketComments(ticketId, token).catch((e) => {
                    console.error(`⚠️  [bulk-generate] Failed to fetch comments for ${ticketId}:`, e);
                    return '';
                }),
            ]);
            console.log(`📋 [bulk-generate] Ticket ${ticketId}: ${threads.length} threads, comments=${!!comments}`);

            const ctx = buildTicketContext(ticket, threads);

            // Determine if delay apology is needed (ticket > 7 days old)
            const includeDelayApology = (ticket.ageInDays ?? 0) > 7;

            // Priority: UI dev notes → (internal sidebar comments + private thread notes) → empty
            const solution = developerNotes?.trim()
                ? developerNotes
                : [comments.trim(), ctx.internalNotes.trim()].filter(Boolean).join('\n---\n');

            const generated = await generateSupportTicketResponse({
                communityLink: ticket.webUrl || `Zoho Desk Ticket #${ticket.ticketNumber}`,
                developerNotes: solution,
                problemStatement: ctx.publicContext,
                includeDelayApology,
            });

            return {
                ticketId: ticket.id,
                ticketNumber: ticket.ticketNumber,
                subject: ticket.subject,
                status: ticket.status,
                priority: ticket.priority,
                ageInDays: ticket.ageInDays,
                webUrl: ticket.webUrl,
                generatedResponse: generated.response,
                userName: generated.userName,
            };
        })
    );

    const output = results.map((result, idx) => {
        if (result.status === 'fulfilled') {
            return { success: true, ...result.value };
        } else {
            return {
                success: false,
                ticketId: ticketIds[idx],
                error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
            };
        }
    });

    // Surface ZohoAuthError if every ticket failed with it
    const authFailures = results.filter(r => r.status === 'rejected' && r.reason instanceof ZohoAuthError);
    if (authFailures.length === ticketIds.length) {
        return res.status(401).json({ error: 'auth_required', message: 'Your Zoho session has expired. Please sign in again.', loginUrl: '/api/auth/login' });
    }

    const successCount = output.filter((r) => r.success).length;
    console.log(`✅ [Zoho Desk] Bulk generation complete: ${successCount}/${ticketIds.length} succeeded`);

    res.json({ results: output, successCount, totalCount: ticketIds.length });
});

/**
 * POST /api/zoho-desk/tickets/:ticketId/draft
 * Body: { content: string }
 * Saves a reply as a draft on the given ticket — does NOT send it to the customer.
 */
zohoDeskRouter.post('/tickets/:ticketId/draft', async (req, res) => {
    const { ticketId } = req.params;
    const { content } = req.body as { content: string };

    if (!content?.trim()) {
        return res.status(400).json({ error: 'content is required' });
    }

    try {
        const token = req.session.zoho!.accessToken;
        console.log(`📝 [Zoho Desk] Saving draft for ticket ${ticketId}...`);
        const result = await saveTicketDraft(ticketId, content, token);
        console.log(`✅ [Zoho Desk] Draft saved: ${result.draftId}`);
        res.json({ success: true, draftId: result.draftId });
    } catch (error) {
        if (error instanceof ZohoAuthError) {
            return res.status(401).json({ error: 'auth_required', message: error.message, loginUrl: '/api/auth/login' });
        }
        console.error(`❌ [Zoho Desk] Failed to save draft for ${ticketId}:`, error);
        res.status(500).json({
            error: 'Failed to save draft to Zoho Desk',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
