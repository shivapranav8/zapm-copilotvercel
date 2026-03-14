/**
 * authRoutes.ts — Per-user Zoho OAuth login.
 *
 * Each user authenticates with their own Zoho account.
 * Tokens are stored in their browser session (not shared .env).
 *
 * Setup (one-time):
 *   1. Go to https://api-console.zoho.in/
 *   2. Create a "Web Based Application"
 *   3. Add scopes:
 *        Desk.basic.READ,Desk.settings.READ,Desk.tickets.ALL,Desk.contacts.READ,Desk.agents.READ,
 *        ZohoMeeting.meeting.READ,ZohoMeeting.recording.READ
 *   4. Set Authorized Redirect URI: http://localhost:5001/api/auth/callback
 *   5. Copy Client ID + Secret → ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET in .env
 */
import { Router, Request, Response } from 'express';

export const authRouter = Router();

const ACCOUNTS_BASE = 'https://accounts.zoho.in/oauth/v2';
const ZOHO_SCOPE = [
    'AaaServer.profile.READ',
    'Desk.basic.READ',
    'Desk.tickets.READ',
    'Desk.tickets.CREATE',
    'Desk.tickets.UPDATE',
    'Desk.contacts.READ',
    'Desk.agents.READ',
    'ZohoMeeting.meetinguds.READ',
    'ZohoFiles.files.READ',
    'ZohoMeeting.meeting.READ',
    'ZohoMeeting.recording.READ',
].join(',');

function getRedirectUri(req: Request): string {
    // On Catalyst, the reverse proxy strips /server/node-server before Express sees the URL,
    // so we can't reconstruct the prefix from req.originalUrl.
    // Set ZOHO_REDIRECT_URI explicitly in Catalyst env vars to avoid this.
    if (process.env.ZOHO_REDIRECT_URI) return process.env.ZOHO_REDIRECT_URI;

    const host = req.get('host') || 'localhost:5001';
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';

    return `${protocol}://${host}/api/auth/callback`;
}

function getFrontendUrl(req: Request): string {
    // If FRONTEND_URL is explicitly set (e.g. in Catalyst env vars), always use it.
    if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;

    const host = req.get('host') || 'localhost:5001';
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';

    // Local dev: backend is on :5001, frontend is on :5174 (Vite)
    if (host.includes('localhost:') && protocol === 'http') {
        return 'http://localhost:5174';
    }
    // Production (Catalyst): frontend is served at the root of the same domain.
    // Do NOT include /server/node-server — that's the backend path, not the frontend.
    return `${protocol}://${host}`;
}

// Reuse existing Zoho Desk credentials if unified ones aren't set
function getClientId() {
    return process.env.ZOHO_CLIENT_ID || process.env.ZOHO_DESK_CLIENT_ID || '';
}
function getClientSecret() {
    return process.env.ZOHO_CLIENT_SECRET || process.env.ZOHO_DESK_CLIENT_SECRET || '';
}

// ─── GET /api/auth/env-check ─────────────────────────────────────────────────
// Shows which OAuth env vars are present (never exposes values).
// Use this in production to diagnose missing Catalyst env vars.
authRouter.get('/env-check', (_req: Request, res: Response) => {
    res.json({
        ZOHO_CLIENT_ID: !!process.env.ZOHO_CLIENT_ID,
        ZOHO_CLIENT_SECRET: !!process.env.ZOHO_CLIENT_SECRET,
        ZOHO_DESK_CLIENT_ID: !!process.env.ZOHO_DESK_CLIENT_ID,
        ZOHO_DESK_CLIENT_SECRET: !!process.env.ZOHO_DESK_CLIENT_SECRET,
        ZOHO_REDIRECT_URI: process.env.ZOHO_REDIRECT_URI || '(not set — defaults to localhost:5001)',
        FRONTEND_URL: process.env.FRONTEND_URL || '(not set — defaults to localhost:5173)',
        SESSION_SECRET_SET: !!process.env.SESSION_SECRET,
        NODE_ENV: process.env.NODE_ENV,
    });
});

// ─── GET /api/auth/status ────────────────────────────────────────────────────
authRouter.get('/status', (req: Request, res: Response) => {
    const zoho = req.session.zoho;
    if (zoho?.accessToken) {
        res.json({ loggedIn: true, user: zoho.user });
    } else {
        res.json({ loggedIn: false });
    }
});

// ─── GET /api/auth/login ─────────────────────────────────────────────────────
authRouter.get('/login', (req: Request, res: Response) => {
    const clientId = getClientId();
    if (!clientId) {
        return res.status(500).json({
            error: 'No Zoho OAuth client ID found. Set ZOHO_CLIENT_ID (or reuse ZOHO_DESK_CLIENT_ID) in .env.',
        });
    }

    const redirectUri = getRedirectUri(req);
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: ZOHO_SCOPE,
        redirect_uri: redirectUri,
        access_type: 'offline',
        prompt: 'consent',
    });

    console.log(`🔗 Login redirect_uri: ${redirectUri}`);
    res.redirect(`${ACCOUNTS_BASE}/auth?${params.toString()}`);
});

// ─── GET /api/auth/callback ──────────────────────────────────────────────────
authRouter.get('/callback', async (req: Request, res: Response) => {
    const { code, error, state } = req.query as Record<string, string>;

    const frontendUrl = getFrontendUrl(req);
    const redirectUri = getRedirectUri(req);

    if (error) {
        console.error('❌ Zoho OAuth error:', error);
        return res.redirect(`${frontendUrl}?auth_error=${encodeURIComponent(error)}`);
    }
    if (!code) {
        console.error('❌ OAuth callback: no code received');
        return res.redirect(`${frontendUrl}?auth_error=no_code`);
    }

    const clientId = getClientId();
    const clientSecret = getClientSecret();

    if (!clientId || !clientSecret) {
        // Redirect back to the frontend with a clear error instead of hanging on the callback URL
        console.error('❌ OAuth callback: missing ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET env vars');
        return res.redirect(`${frontendUrl}?auth_error=${encodeURIComponent('missing_credentials')}`);
    }

    console.log(`🔄 Exchanging code for token (client: ${clientId.slice(0, 12)}..., redirect: ${redirectUri})`);

    try {
        // Exchange code for tokens
        const tokenRes = await fetch(`${ACCOUNTS_BASE}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
            }),
        });

        const tokenData = await tokenRes.json() as any;
        if (!tokenData.access_token) {
            // Log the full Zoho error so it appears in Catalyst logs
            console.error('❌ Token exchange failed:', JSON.stringify(tokenData));
            throw new Error(`Token exchange failed: ${tokenData.error || JSON.stringify(tokenData)}`);
        }

        // If state=meeting, this is a Zoho Meeting connect flow — store separately
        if (state === 'meeting') {
            (req.session as any).zohoMeeting = {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token || '',
            };
            console.log('✅ Zoho Meeting connected via auth callback');
            return res.redirect(`${frontendUrl}?zoho_meeting_connected=1`);
        }

        // Otherwise normal Desk login — fetch user info
        let userInfo = { name: 'Zoho User', email: '', accountId: '' };
        try {
            const userRes = await fetch('https://accounts.zoho.in/oauth/user/info', {
                headers: { Authorization: `Zoho-oauthtoken ${tokenData.access_token}` },
            });
            if (userRes.ok) {
                const u = await userRes.json() as any;
                userInfo = {
                    name: u.Display_Name || u.First_Name || u.Email || 'Zoho User',
                    email: u.Email || '',
                    accountId: u.ZUID || '',
                };
            }
        } catch {
            // User info is optional — proceed without it
        }

        // Store in session
        req.session.zoho = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || '',
            user: userInfo,
        };

        console.log(`✅ User logged in: ${userInfo.email || userInfo.name}`);
        res.redirect(`${frontendUrl}?auth_success=1`);
    } catch (err) {
        console.error('❌ Auth callback error:', err);
        res.redirect(`${frontendUrl}?auth_error=callback_failed`);
    }
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
// cookie-session does NOT have .destroy() — set to null to clear the cookie
authRouter.post('/logout', (req: Request, res: Response) => {
    req.session = null as any;
    res.json({ loggedOut: true });
});

// ─── GET /api/auth/refresh ───────────────────────────────────────────────────
// Silently refresh the access token using the session refresh token.
authRouter.get('/refresh', async (req: Request, res: Response) => {
    const refreshToken = req.session.zoho?.refreshToken;
    const clientId = getClientId();
    const clientSecret = getClientSecret();

    if (!refreshToken || !clientId || !clientSecret) {
        return res.status(401).json({ error: 'No refresh token or client credentials' });
    }

    try {
        const tokenRes = await fetch(`${ACCOUNTS_BASE}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
            }),
        });

        const data = await tokenRes.json() as any;
        if (!data.access_token) {
            throw new Error(`Refresh failed: ${JSON.stringify(data)}`);
        }

        req.session.zoho!.accessToken = data.access_token;
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Token refresh failed', details: String(err) });
    }
});
