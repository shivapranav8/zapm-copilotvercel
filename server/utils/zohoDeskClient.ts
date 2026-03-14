import dotenv from 'dotenv';
dotenv.config();

/**
 * Thrown when a per-user session token is rejected by Zoho (401).
 * Route handlers catch this and return HTTP 401 so the frontend knows
 * to prompt the user to re-authenticate — not show a generic 500.
 */
export class ZohoAuthError extends Error {
    constructor(message = 'Your Zoho session has expired. Please sign in again.') {
        super(message);
        this.name = 'ZohoAuthError';
    }
}

const ZOHO_DESK_BASE_URL = 'https://desk.zoho.in/api/v1';
const ORG_ID = process.env.ZOHO_DESK_ORG_ID || '60041003425';

function getHeaders(token: string) {
    return {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'orgId': ORG_ID,
        'Content-Type': 'application/json',
    };
}

// Safety allowlist — these are the ONLY Zoho Desk API paths this server will ever call.
// sendReply is intentionally excluded to prevent accidentally posting to customers.
const ALLOWED_ZOHO_DESK_PATHS = [
    '/agents',          // GET list + search by email
    '/tickets',         // GET list
    '/threads',
    '/comments',
    '/draftReply',      // POST draft — stays in Zoho Desk as draft, never sent to customer
];

function assertSafeZohoDeskUrl(url: string): void {
    const path = url.replace(ZOHO_DESK_BASE_URL, '');
    const allowed = ALLOWED_ZOHO_DESK_PATHS.some(p => path.includes(p));
    if (!allowed) {
        throw new Error(`[SAFETY BLOCK] Refused to call Zoho Desk endpoint: ${path}. Only draft and read operations are permitted.`);
    }
    if (path.includes('sendReply')) {
        throw new Error('[SAFETY BLOCK] sendReply is explicitly blocked — use draftReply only.');
    }
}

/**
 * Wraps a fetch call — throws ZohoAuthError on 401 so route handlers
 * can return HTTP 401 to the frontend and prompt re-authentication.
 */
async function fetchDesk(url: string, options: RequestInit): Promise<Response> {
    assertSafeZohoDeskUrl(url);
    const res = await fetch(url, options);
    if (res.status === 401) throw new ZohoAuthError();
    return res;
}

export interface ZohoDeskTicket {
    id: string;
    ticketNumber: string;
    subject: string;
    description: string | null;
    status: string;
    priority: string;
    category: string | null;
    contactId: string | null;
    customerName: string | null;
    customerEmail: string | null;
    createdTime: string;
    dueDate: string | null;
    ageInDays?: number;
    assigneeId: string | null;
    departmentId: string | null;
    webUrl: string | null;
}

export interface ZohoDeskThread {
    id: string;
    content: string;
    author: {
        name: string;
        type: string; // 'CONTACT' | 'AGENT'
    };
    createdTime: string;
    type: string;
    isPrivate: boolean; // true for internal agent notes, false for customer-visible replies
}

/**
 * Parse a raw agent object from any of the self-info endpoints.
 */
function parseAgentData(data: any): { id: string; name: string; email: string } | null {
    // Zoho sometimes wraps in { data: [...] } or { data: {...} } or just returns the object
    const agentObj = (Array.isArray(data?.data) ? data.data[0] : null)
        || (data?.data && typeof data.data === 'object' ? data.data : null)
        || (Array.isArray(data) ? data[0] : null)
        || data;

    const id = agentObj?.id || agentObj?.agentId;
    if (!id) return null;
    return {
        id: String(id),
        name: `${agentObj.firstName || agentObj.name || ''}${agentObj.lastName ? ' ' + agentObj.lastName : ''}`.trim() || 'Me',
        email: agentObj.emailId || agentObj.email || '',
    };
}

// In-memory cache so we only resolve the agent ID once per server process per email
const agentIdCache = new Map<string, { id: string; name: string; email: string }>();

/**
 * Resolve the agent ID for the currently logged-in user.
 * Tries searchStr first; falls back to fetching all agents and matching by email.
 * email: the user's email from req.session.zoho.user.email
 */
export async function getMyAgentInfo(token: string, email: string): Promise<{ id: string; name: string; email: string }> {
    if (!email) throw new Error('Email is required to look up agent ID');

    // Return cached result if available
    const cached = agentIdCache.get(email.toLowerCase());
    if (cached) {
        console.log(`✅ [Zoho Desk] Agent (cached): ${cached.id} <${cached.email}>`);
        return cached;
    }

    console.log(`🔍 Looking up Zoho Desk agent for: ${email}`);

    // Attempt 1: search by email string
    try {
        const url = `${ZOHO_DESK_BASE_URL}/agents?searchStr=${encodeURIComponent(email)}&limit=5`;
        const res = await fetch(url, { headers: getHeaders(token) });
        const text = await res.text();
        console.log(`[agents/searchStr] status=${res.status} body=${text.slice(0, 300)}`);

        if (res.ok) {
            const data = JSON.parse(text) as any;
            const agents: any[] = data.data || (Array.isArray(data) ? data : []);
            const match = agents.find((a: any) =>
                (a.emailId || a.email || '').toLowerCase() === email.toLowerCase()
            ) || agents[0];

            if (match?.id) {
                const result = {
                    id: String(match.id),
                    name: `${match.firstName || match.name || ''} ${match.lastName || ''}`.trim(),
                    email: match.emailId || match.email || email,
                };
                agentIdCache.set(email.toLowerCase(), result);
                console.log(`✅ Agent found via search: ${result.id} <${result.email}>`);
                return result;
            }
        }
    } catch (e) {
        console.warn(`[agents/searchStr] error: ${e}`);
    }

    // Attempt 2: fetch all agents and match by email
    console.log(`🔍 Falling back to full agent list scan for: ${email}`);
    try {
        const url = `${ZOHO_DESK_BASE_URL}/agents?limit=100`;
        const res = await fetch(url, { headers: getHeaders(token) });
        const text = await res.text();
        console.log(`[agents/list] status=${res.status} body=${text.slice(0, 400)}`);

        if (res.ok) {
            const data = JSON.parse(text) as any;
            const agents: any[] = data.data || (Array.isArray(data) ? data : []);
            console.log(`[agents/list] Total agents returned: ${agents.length}`);

            // Log all agent emails for diagnosis
            agents.forEach((a: any) => {
                console.log(`  agent id=${a.id} email=${a.emailId || a.email || '?'} name=${a.firstName || ''} ${a.lastName || ''}`);
            });

            const match = agents.find((a: any) =>
                (a.emailId || a.email || '').toLowerCase() === email.toLowerCase()
            );

            if (match?.id) {
                const result = {
                    id: String(match.id),
                    name: `${match.firstName || match.name || ''} ${match.lastName || ''}`.trim(),
                    email: match.emailId || match.email || email,
                };
                agentIdCache.set(email.toLowerCase(), result);
                console.log(`✅ Agent found via list: ${result.id} <${result.email}>`);
                return result;
            }
        }
    } catch (e) {
        console.warn(`[agents/list] error: ${e}`);
    }

    throw new Error(`No Zoho Desk agent found for ${email}. Check server logs for available agents.`);
}

/**
 * Fetch open tickets assigned to the authenticated agent.
 * First tries to resolve the agent ID for efficient server-side filtering.
 * Falls back to client-side email matching if agent ID resolution fails.
 */
export async function getOpenTicketsAssignedToMe(limit = 50, token: string, email?: string): Promise<ZohoDeskTicket[]> {
    try {
        // Try to resolve agent ID for reliable server-side filtering
        let resolvedAgentId: string | null = null;
        if (email) {
            try {
                const agentInfo = await getMyAgentInfo(token, email);
                resolvedAgentId = agentInfo.id;
                console.log(`🎯 [Zoho Desk] Will filter by resolvedAgentId=${resolvedAgentId}`);
            } catch (e) {
                console.warn(`⚠️  [Zoho Desk] Could not resolve agent ID, will use email filter: ${e}`);
            }
        }

        // Use `assignee={agentId}` for server-side filtering (confirmed from Zoho OAS spec).
        // Fall back to fetching all + client-side filter if agent ID couldn't be resolved.
        const assigneeParam = resolvedAgentId ? `&assignee=${resolvedAgentId}` : '';
        const url = `${ZOHO_DESK_BASE_URL}/tickets?status=Open&limit=100&sortBy=createdTime${assigneeParam}&include=contacts`;
        console.log(`📡 Fetching tickets (assignee=${resolvedAgentId || 'all'})...`);

        const res = await fetchDesk(url, { headers: getHeaders(token) });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Failed to fetch tickets: ${res.status} ${errorText}`);
        }

        const data = await res.json() as any;

        // Log the FULL structure of the first ticket to understand Zoho's response shape
        const sample = data.data?.[0];
        if (sample) {
            console.log(`[Zoho Desk] First ticket ID=${sample.id} subject="${sample.subject}"`);
            console.log(`[Zoho Desk] assignee field: ${JSON.stringify(sample.assignee ?? null).slice(0, 400)}`);
            console.log(`[Zoho Desk] assigneeId field: ${sample.assigneeId}`);
            console.log(`[Zoho Desk] Session user email for comparison: "${email}"`);
        } else {
            console.log(`[Zoho Desk] No tickets returned from API (data.data is empty or missing)`);
        }

        /**
         * Extract the assignee's email from a ticket.
         * Zoho Desk returns the assignee differently across API versions and regions.
         * We try every known field path.
         */
        function extractAssigneeEmail(t: any): string | null {
            const a = t.assignee;
            if (!a) return null;
            return (
                a.email ||
                a.emailId ||
                a.loginName ||
                a.userEmail ||
                null
            );
        }

        let tickets: ZohoDeskTicket[] = (data.data || []).map((t: any) => {
            const createdAt = new Date(t.createdTime);
            const now = new Date();
            const ageInDays = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
            const contact = t.contact || t.contacts?.[0] || null;
            return {
                id: t.id,
                ticketNumber: t.ticketNumber || t.id,
                subject: t.subject || 'No Subject',
                description: t.description || null,
                status: t.status || 'Open',
                priority: t.priority || 'Medium',
                category: t.category || null,
                contactId: t.contactId || null,
                customerName: contact?.name || contact?.fullName || null,
                customerEmail: contact?.email || null,
                createdTime: t.createdTime,
                dueDate: t.dueDate || null,
                ageInDays,
                assigneeId: t.assigneeId || null,
                assigneeEmail: extractAssigneeEmail(t),
                departmentId: t.departmentId || null,
                webUrl: t.webUrl || null,
            };
        });

        // If we couldn't resolve the agent ID, fall back to client-side email filter
        if (!resolvedAgentId && email) {
            const before = tickets.length;
            const matched = tickets.filter(t => (t as any).assigneeEmail?.toLowerCase() === email.toLowerCase());
            console.log(`📧 Client-side email filter: ${before} → ${matched.length} tickets for ${email}`);
            if (matched.length > 0) tickets = matched;
        }

        return tickets;
    } catch (error) {
        console.error('Error in getOpenTicketsAssignedToMe:', error);
        throw error;
    }
}

/**
 * Strip Zoho mention markers (zsu[@user:...]zsu) and HTML tags from comment content.
 */
function cleanCommentContent(raw: string): string {
    return raw
        .replace(/zsu\[@user:[^\]]*\]zsu/g, '')   // remove @mention tokens
        .replace(/<[^>]*>/g, '')                    // strip HTML tags
        .replace(/&nbsp;/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/**
 * Fetch internal agent comments (private notes) for a ticket.
 * These are stored separately from public thread replies in Zoho Desk.
 */
export async function getTicketComments(ticketId: string, token: string): Promise<string> {
    try {
        const url = `${ZOHO_DESK_BASE_URL}/tickets/${ticketId}/comments?limit=25`;
        const res = await fetchDesk(url, { headers: getHeaders(token) });
        if (!res.ok) return '';

        const data = await res.json() as any;
        const lines: string[] = [];
        for (const c of (data.data || [])) {
            const text = cleanCommentContent(c.content || c.body || '');
            if (text) lines.push(text);
        }
        return lines.join('\n');
    } catch {
        return '';
    }
}

/**
 * Fetch all thread messages for a specific ticket to build the full conversation.
 */
export async function getTicketThreads(ticketId: string, token: string): Promise<ZohoDeskThread[]> {
    const url = `${ZOHO_DESK_BASE_URL}/tickets/${ticketId}/threads?limit=25`;

    const res = await fetchDesk(url, { headers: getHeaders(token) });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch threads for ticket ${ticketId}: ${res.status} ${errorText}`);
    }

    const data = await res.json() as any;
    return (data.data || []).map((thread: any) => {
        const threadType: string = thread.type || 'PUBLIC';
        // Zoho Desk marks internal notes as type COMMENT or isPrivate: true
        const isPrivate = thread.isPrivate === true || threadType === 'COMMENT' || threadType === 'PRIVATE';
        return {
            id: thread.id,
            content: thread.content || thread.summary || '',
            author: {
                name: thread.author?.name || 'Unknown',
                type: thread.author?.type || 'CONTACT',
            },
            createdTime: thread.createdTime || '',
            type: threadType,
            isPrivate,
        };
    });
}

/**
 * Fetch a single ticket by its Zoho Desk ID.
 * Returns null if the ticket cannot be fetched (logs the error).
 */
export async function getTicketById(ticketId: string, token: string): Promise<ZohoDeskTicket | null> {
    try {
        const url = `${ZOHO_DESK_BASE_URL}/tickets/${ticketId}`;
        const res = await fetchDesk(url, { headers: getHeaders(token) });

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`Failed to fetch ticket ${ticketId}: ${res.status} ${errorText}`);
            return null;
        }

        const t = await res.json() as any;
        const createdAt = new Date(t.createdTime);
        const ageInDays = Math.floor((new Date().getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        return {
            id: t.id,
            ticketNumber: t.ticketNumber || t.id,
            subject: t.subject || 'No Subject',
            description: t.description || null,
            status: t.status || 'Open',
            priority: t.priority || 'Medium',
            contactId: t.contactId || null,
            createdTime: t.createdTime,
            dueDate: t.dueDate || null,
            ageInDays,
            assigneeId: t.assigneeId || null,
            departmentId: t.departmentId || null,
            webUrl: t.webUrl || null,
        };
    } catch (error) {
        console.error(`Error fetching ticket ${ticketId}:`, error);
        return null;
    }
}

export interface TicketContext {
    /** Customer-visible conversation — subject, description, public replies */
    publicContext: string;
    /** Internal agent notes stripped of HTML — empty string if none */
    internalNotes: string;
    /** Combined string for cases where both are needed together */
    fullContext: string;
}

/**
 * Save a draft reply on a Zoho Desk ticket (does NOT send — stays as draft).
 */
export async function saveTicketDraft(ticketId: string, content: string, token: string): Promise<{ draftId: string }> {
    const url = `${ZOHO_DESK_BASE_URL}/tickets/${ticketId}/draftReply`;
    const res = await fetchDesk(url, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({ content }),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to save draft: ${res.status} ${errText}`);
    }

    const data = await res.json() as any;
    return { draftId: data.id || data.draftId || 'saved' };
}

export function buildTicketContext(ticket: ZohoDeskTicket, threads: ZohoDeskThread[]): TicketContext {
    const publicLines: string[] = [];
    const internalLines: string[] = [];

    publicLines.push(`Subject: ${ticket.subject}`);
    if (ticket.description) {
        publicLines.push(`\nInitial Description:\n${ticket.description}`);
    }

    const publicThreads = threads.filter(t => !t.isPrivate);
    // Sort private threads by createdTime descending to find the latest
    const privateThreads = threads
        .filter(t => t.isPrivate)
        .sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());

    if (publicThreads.length > 0) {
        publicLines.push('\nCustomer Conversation:');
        for (const thread of publicThreads) {
            const authorType = thread.author.type === 'CONTACT' ? 'Customer' : 'Agent';
            const strippedContent = thread.content.replace(/<[^>]*>/g, '').trim();
            if (strippedContent) {
                publicLines.push(`\n[${authorType} - ${thread.author.name}]:\n${strippedContent}`);
            }
        }
    }

    if (privateThreads.length > 0) {
        privateThreads.forEach((thread, index) => {
            const strippedContent = thread.content.replace(/<[^>]*>/g, '').trim();
            if (strippedContent) {
                const label = index === 0 ? ' [LATEST PRIVATE NOTE]' : ' [OLDER PRIVATE NOTE]';
                internalLines.push(`[${thread.author.name}]${label}: ${strippedContent}`);
            }
        });
    }

    const publicContext = publicLines.join('\n');
    const internalNotes = internalLines.join('\n');
    const fullContext = internalNotes
        ? `${publicContext}\n\n[INTERNAL AGENT NOTES — for context only]:\n${internalNotes}`
        : publicContext;

    return { publicContext, internalNotes, fullContext };
}
