import { Router, Request } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { transcribeVideo } from '../utils/audioTranscription';
import { generateMeetingMoM } from '../agents/meetingMoM';
import { saveMoM } from '../utils/storage';
import { getJob } from '../utils/jobStore';

export const zohoMeetingRouter = Router();

const ACCOUNTS_BASE = 'https://accounts.zoho.in/oauth/v2';
const MEETING_API_BASE = 'https://meeting.zohocorp.com/api/v2';
const MEETING_RECORDINGS_BASE = 'https://meeting.zohocorp.com/meeting/api/v2';
// Dynamic URIs constructed inside routes instead of globally using env constants

// In-memory token store — seeded from .env
const store: { accessToken: string; refreshToken: string; userKey: string } = {
    accessToken: process.env.ZOHO_MEETING_ACCESS_TOKEN || '',
    refreshToken: process.env.ZOHO_MEETING_REFRESH_TOKEN || '',
    userKey: process.env.ZOHO_MEETING_USER_KEY || '',
};

async function refreshAccessToken(): Promise<void> {
    const { ZOHO_MEETING_CLIENT_ID, ZOHO_MEETING_CLIENT_SECRET } = process.env;
    if (!store.refreshToken || !ZOHO_MEETING_CLIENT_ID || !ZOHO_MEETING_CLIENT_SECRET) {
        throw new Error(
            'Cannot refresh: ZOHO_MEETING_REFRESH_TOKEN, ZOHO_MEETING_CLIENT_ID, or ZOHO_MEETING_CLIENT_SECRET missing in .env'
        );
    }

    console.log('🔄 Refreshing Zoho Meeting access token...');
    const res = await fetch(`${ACCOUNTS_BASE}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: store.refreshToken,
            client_id: ZOHO_MEETING_CLIENT_ID,
            client_secret: ZOHO_MEETING_CLIENT_SECRET,
        }),
    });

    const data = await res.json() as any;
    if (!data.access_token) {
        throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
    }

    store.accessToken = data.access_token;
    process.env.ZOHO_MEETING_ACCESS_TOKEN = store.accessToken;
    console.log('✅ Zoho Meeting access token refreshed');
}

async function meetingFetch(url: string, options: RequestInit = {}, tokenOverride?: string): Promise<Response> {
    const tok = tokenOverride || store.accessToken;
    if (!tok) {
        throw new Error('Not connected to Zoho Meeting. Please sign in or connect your Zoho Meeting account.');
    }

    const makeReq = (t: string) =>
        fetch(url, {
            ...options,
            headers: {
                ...((options.headers as Record<string, string>) || {}),
                Authorization: `Zoho-oauthtoken ${t}`,
            },
        });

    let res = await makeReq(tok);

    // Only auto-refresh for the shared store token (not per-user session tokens)
    if (res.status === 401 && !tokenOverride) {
        await refreshAccessToken();
        res = await makeReq(store.accessToken);
    }

    return res;
}

async function resolveUserKey(token?: string): Promise<string> {
    // For per-user tokens, always fetch dynamically (no caching across users)
    if (!token && store.userKey) return store.userKey;

    const res = await meetingFetch(`${MEETING_API_BASE}/user.json`, {}, token);
    const data = await res.json() as any;
    const key = data.userKey || data.key || data.uid || '';

    if (!token) {
        store.userKey = key;
        if (key) process.env.ZOHO_MEETING_USER_KEY = key;
    }

    return key;
}

// Helper: get the best available token
// Priority: Meeting-specific session token > Desk session token (also has ZohoMeeting scopes) > .env store
function resolveToken(req: any): string {
    return req.session?.zohoMeeting?.accessToken
        || req.session?.zoho?.accessToken   // Desk login includes ZohoMeeting.meeting.READ + ZohoMeeting.recording.READ
        || store.accessToken;
}

// ─── GET /api/zoho-meeting/status ───────────────────────────────────────────
zohoMeetingRouter.get('/status', (req, res) => {
    const token = (req as any).session?.zohoMeeting?.accessToken
        || (req as any).session?.zoho?.accessToken
        || store.accessToken;
    res.json({ connected: !!token });
});

// ─── GET /api/zoho-meeting/auth ─────────────────────────────────────────────
zohoMeetingRouter.get('/auth', (req, res) => {
    const clientId = process.env.ZOHO_MEETING_CLIENT_ID
        || process.env.ZOHO_CLIENT_ID
        || process.env.ZOHO_DESK_CLIENT_ID;

    if (!clientId) {
        return res.status(500).json({ error: 'No Zoho OAuth client ID found. Set ZOHO_CLIENT_ID in .env.' });
    }

    // Reuse the main auth redirect URI
    // state=meeting tells the callback to store this as a Meeting token
    const host = req.get('host') || 'localhost:5001';
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    const prefix = req.originalUrl?.startsWith('/server/')
        ? '/' + req.originalUrl.split('/')[1] + '/' + req.originalUrl.split('/')[2]
        : '';
    const mainRedirectUri = `${protocol}://${host}${prefix}/api/auth/callback`;

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: 'ZohoMeeting.meeting.READ,ZohoMeeting.recording.READ',
        redirect_uri: mainRedirectUri,
        access_type: 'offline',
        prompt: 'consent',
        state: 'meeting',
    });

    res.redirect(`${ACCOUNTS_BASE}/auth?${params.toString()}`);
});

// ─── GET /api/zoho-meeting/callback ──────────────────────────────────────────
zohoMeetingRouter.get('/callback', async (req, res) => {
    const { code, error } = req.query as Record<string, string>;

    const host = req.get('host') || 'localhost:5001';
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    const prefix = req.originalUrl?.startsWith('/server/')
        ? '/' + req.originalUrl.split('/')[1] + '/' + req.originalUrl.split('/')[2]
        : '';

    // Fallback frontend url for local dev, dynamic host for prod
    let frontendUrl = `${protocol}://${host}${prefix}`;
    if (host.includes('localhost:') && protocol === 'http') {
        frontendUrl = 'http://localhost:5173'; // fallback for local dev
    }

    if (error) {
        console.error('❌ Zoho Meeting OAuth error:', error);
        return res.redirect(`${frontendUrl}?zoho_meeting_error=${encodeURIComponent(error)}`);
    }

    if (!code) {
        return res.status(400).send('No authorization code received from Zoho.');
    }

    const clientId = process.env.ZOHO_MEETING_CLIENT_ID
        || process.env.ZOHO_CLIENT_ID
        || process.env.ZOHO_DESK_CLIENT_ID || '';
    const clientSecret = process.env.ZOHO_MEETING_CLIENT_SECRET
        || process.env.ZOHO_CLIENT_SECRET
        || process.env.ZOHO_DESK_CLIENT_SECRET || '';

    if (!clientId || !clientSecret) {
        return res.status(500).json({ error: 'Client credentials not configured in .env' });
    }

    try {
        const tokenRes = await fetch(`${ACCOUNTS_BASE}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: `${protocol}://${host}${prefix}/api/zoho-meeting/callback`,
            }),
        });

        const tokenData = await tokenRes.json() as any;
        if (!tokenData.access_token) {
            throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
        }

        // Store Meeting token in session (survives server restarts with cookie-session)
        (req as any).session.zohoMeeting = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || '',
        };

        // Also keep in-memory as backup
        store.accessToken = tokenData.access_token;
        store.refreshToken = tokenData.refresh_token || store.refreshToken;

        console.log('✅ Zoho Meeting connected successfully');
        res.redirect(`${frontendUrl}?zoho_meeting_connected=1`);
    } catch (err) {
        console.error('❌ Zoho Meeting callback error:', err);
        res.redirect(`${frontendUrl}?zoho_meeting_error=auth_failed`);
    }
});

// ─── GET /api/zoho-meeting/debug ─────────────────────────────────────────────
// Diagnostic endpoint: tests all known domains + endpoints to find what works
zohoMeetingRouter.get('/debug', async (req, res) => {
    const token = resolveToken(req);
    if (!token) {
        return res.status(401).json({ error: 'No token. Please sign in first.' });
    }

    const result: any = { token_present: true, userJsonResults: [], endpointResults: [] };

    // Step 1: Try user.json on ALL known Zoho Meeting domains
    const domains = [
        'https://meeting.zoho.in/api/v2',
        'https://meeting.zoho.com/api/v2',
        'https://meeting.zohocorp.com/api/v2',
    ];

    let zsoid = '';
    let userKey = '';

    for (const base of domains) {
        try {
            const r = await fetch(`${base}/user.json`, {
                headers: { Authorization: `Zoho-oauthtoken ${token}` },
            });
            const body = await r.json() as any;
            result.userJsonResults.push({ domain: base, status: r.status, body });
            if (r.ok) {
                zsoid = body.zsoid || body.organizationId || body.orgId || body.companyId || '';
                userKey = body.userKey || body.key || body.uid || body.id || body.userId || '';
            }
        } catch (e) {
            result.userJsonResults.push({ domain: base, error: String(e) });
        }
    }

    // Use Desk org ID as fallback if user.json didn't give zsoid
    if (!zsoid) zsoid = process.env.ZOHO_DESK_ORG_ID || '';
    result.parsed = { zsoid, userKey };

    // Step 2: Try recordings on all known domain+path combos
    const recordingBases = [
        'https://meeting.zoho.in/meeting/api/v2',
        'https://meeting.zoho.com/meeting/api/v2',
        'https://meeting.zohocorp.com/meeting/api/v2',
    ];

    const urlsToTry: string[] = [];
    for (const base of recordingBases) {
        if (zsoid) urlsToTry.push(`${base}/${zsoid}/recordings.json`);
        if (userKey) urlsToTry.push(`${base}/${userKey}/recordings.json`);
    }

    for (const url of urlsToTry) {
        try {
            const r = await fetch(url, {
                headers: { Authorization: `Zoho-oauthtoken ${token}` },
            });
            const body = await r.text();
            result.endpointResults.push({ url, status: r.status, body: body.slice(0, 300) });
        } catch (e) {
            result.endpointResults.push({ url, error: String(e) });
        }
    }

    res.json(result);
});

// ─── GET /api/zoho-meeting/raw-recording ─────────────────────────────────────
// Shows every field Zoho returns for the first recording — used to find the real download URL
zohoMeetingRouter.get('/raw-recording', async (req, res) => {
    const token = resolveToken(req);
    if (!token) return res.status(401).json({ error: 'Not logged in' });
    const zsoid = process.env.ZOHO_MEETING_ORG_ID || process.env.ZOHO_DESK_ORG_ID || '';
    const r = await fetch(`${MEETING_RECORDINGS_BASE}/${zsoid}/recordings.json`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    const data = await r.json() as any;
    const first = (data.recordings || [])[0] || {};
    res.json({ allFields: Object.keys(first), firstRecording: first });
});

// ─── GET /api/zoho-meeting/recordings ────────────────────────────────────────
zohoMeetingRouter.get('/recordings', async (req, res) => {
    try {
        const token = resolveToken(req);
        const sessionMeetingToken = (req as any).session?.zohoMeeting?.accessToken;

        console.log('📥 /recordings called | token present:', !!token,
            '| session.zohoMeeting:', !!sessionMeetingToken,
            '| using session token:', token === sessionMeetingToken);

        // Warn if falling back to the Desk token (which won't have Meeting scopes)
        if (!sessionMeetingToken && token) {
            console.warn('⚠️  No Meeting-specific session token found. Falling back to store token — this may lack ZohoMeeting scopes.');
        }

        // Fetch user info from Zoho Meeting user.json using the Meeting-specific token
        let zsoid = '';
        let userKey = '';
        let userJsonBody: any = null;

        try {
            console.log('🔍 Fetching Zoho Meeting user info...');
            const userRes = await meetingFetch(`${MEETING_API_BASE}/user.json`, {}, token);
            userJsonBody = await userRes.json() as any;
            console.log('👤 user.json status:', userRes.status);
            console.log('👤 user.json response:', JSON.stringify(userJsonBody));

            zsoid = userJsonBody.zsoid || userJsonBody.ZSOID || userJsonBody.organizationId
                || userJsonBody.orgId || userJsonBody.companyId || userJsonBody.accountId || '';
            userKey = userJsonBody.userKey || userJsonBody.key || userJsonBody.uid
                || userJsonBody.id || userJsonBody.userId || '';
        } catch (e) {
            console.warn('⚠️  Could not fetch user.json:', e);
        }

        // Fallback: use Meeting-specific org ID first, then Desk org ID
        if (!zsoid) {
            zsoid = process.env.ZOHO_MEETING_ORG_ID || process.env.ZOHO_DESK_ORG_ID || '';
            if (zsoid) console.log('ℹ️  zsoid not in user.json — using env fallback:', zsoid);
        }

        console.log('🔑 zsoid:', zsoid, '| userKey:', userKey);

        // Build endpoint list in priority order
        // Zoho Meeting API docs: GET /api/v2/{zsoid}/recordings.json
        const endpoints: string[] = [];
        if (zsoid) {
            endpoints.push(`${MEETING_RECORDINGS_BASE}/${zsoid}/recordings.json`);
            if (userKey) {
                endpoints.push(`${MEETING_RECORDINGS_BASE}/${zsoid}/user/${userKey}/recordings.json`);
            }
        }
        if (userKey) {
            endpoints.push(`${MEETING_RECORDINGS_BASE}/${userKey}/recordings.json`);
            endpoints.push(`${MEETING_API_BASE}/${userKey}/recordings.json`);
            endpoints.push(`${MEETING_API_BASE}/${userKey}/sessions.json?type=pastSession`);
        }
        endpoints.push(`${MEETING_API_BASE}/sessions.json?type=pastSession`);
        endpoints.push(`${MEETING_API_BASE}/recordings.json`);

        let data: any = null;
        let lastError = '';
        const triedEndpoints: string[] = [];

        for (const url of endpoints) {
            console.log(`📡 Trying: ${url}`);
            triedEndpoints.push(url);
            try {
                const response = await meetingFetch(url, {}, token);
                if (response.ok) {
                    data = await response.json();
                    console.log(`✅ Success at: ${url}`, JSON.stringify(data).slice(0, 200));
                    break;
                } else {
                    const body = await response.text();
                    lastError = `${url} → HTTP ${response.status}: ${body.slice(0, 200)}`;
                    console.warn(`⚠️  ${lastError}`);
                }
            } catch (e) {
                lastError = `${url} → ${String(e)}`;
                console.warn(`⚠️  Endpoint error: ${lastError}`);
            }
        }

        if (!data) {
            console.error('❌ All recording endpoints failed. Tried:', triedEndpoints);
            return res.status(500).json({
                error: 'Failed to fetch recordings from Zoho Meeting',
                details: `All ${triedEndpoints.length} endpoints failed. Last error: ${lastError}`,
                hint: 'Run GET /api/zoho-meeting/debug to see raw API responses and diagnose the issue.',
                zsoid,
                userKey,
                triedEndpoints,
            });
        }

        // Normalize whichever shape was returned
        const raw: any[] = data.recordings || data.sessions || data.pastSessions
            || data.sessionList || data.data || [];

        const recordings = raw.map((r: any) => ({
            key: r.erecordingId || r.sessionKey || r.meetingKey || r.key || r.id || '',
            title: r.topic || r.sessionTopic || r.title || r.subject || r.meetingTitle || 'Untitled Meeting',
            startTime: r.datenTime || r.startTime || r.start_time || r.scheduledTime || r.startDateTime || '',
            duration: r.duration || 0,
            downloadUrl: r.downloadUrl || r.download_url || r.recordingUrl || r.recordingLink || r.playUrl || '',
            transcriptUrl: r.transcriptionPublicDownloadUrl || r.transcriptUrl || r.transcriptionUrl || '',
            fileSize: r.fileSize || r.file_size || r.size || 0,
        }));

        res.json({ recordings });
    } catch (err) {
        console.error('❌ Error fetching Zoho recordings:', err);
        res.status(500).json({
            error: 'Failed to fetch recordings from Zoho Meeting',
            details: err instanceof Error ? err.message : 'Unknown error',
        });
    }
});

// ─── POST /api/zoho-meeting/process ──────────────────────────────────────────
// Streams SSE progress events so the HTTP connection stays open.
// This prevents Vercel from freezing the CPU between requests.
zohoMeetingRouter.post('/process', async (req, res) => {
    const { recordingKey, downloadUrl, transcriptUrl, meetingTitle, detailed } = req.body as {
        recordingKey?: string;
        downloadUrl?: string;
        transcriptUrl?: string;
        meetingTitle?: string;
        detailed?: boolean;
    };

    if (!downloadUrl && !recordingKey) {
        return res.status(400).json({ error: 'downloadUrl or recordingKey is required' });
    }

    // Keep connection alive — Vercel won't freeze CPU while streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const token = resolveToken(req);
    const jobId = uuidv4();
    const tmpFile = path.join(os.tmpdir(), `zoho_rec_${jobId}.mp4`);
    try {
        send({ status: 'processing', progress: 5, message: 'Resolving recording URL...' });

        let finalDownloadUrl = downloadUrl;
        if (!finalDownloadUrl && recordingKey) {
            try {
                const userKey = await resolveUserKey(token);
                const url = userKey
                    ? `${MEETING_API_BASE}/${userKey}/recordings/${recordingKey}.json`
                    : `${MEETING_API_BASE}/recordings/${recordingKey}.json`;
                const response = await meetingFetch(url, {}, token);
                const data = await response.json() as any;
                finalDownloadUrl = data.downloadUrl || data.download_url || data.recordingUrl || '';
            } catch (err) {
                // try constructed URL
            }
        }
        if (!finalDownloadUrl && recordingKey) {
            finalDownloadUrl = `https://download-accl.zoho.com/webdownload?event-id=${recordingKey}&x-service=meetinglab&x-cli-msg=`;
        }
        if (!finalDownloadUrl) {
            throw new Error('Could not determine download URL for this recording.');
        }

        send({ status: 'processing', progress: 15, message: 'Downloading recording...' });
        console.log(`\n📝 [${jobId}] Processing: "${meetingTitle || recordingKey}"`);

        let transcript = '';

        // Try plain fetch first (Zoho download URLs are often pre-signed — no auth header needed)
        let dlResponse = await fetch(finalDownloadUrl);
        // If pre-signed URL fails, fall back to authenticated request
        if (!dlResponse.ok) {
            console.log(`⚠️  Plain fetch failed (${dlResponse.status}), retrying with auth token...`);
            dlResponse = await meetingFetch(finalDownloadUrl, {}, token);
        }
        console.log(`📡 Download HTTP status: ${dlResponse.status}, Content-Type: ${dlResponse.headers.get('content-type')}`);
        if (!dlResponse.ok) {
            throw new Error(`Download failed (HTTP ${dlResponse.status}). Re-login after adding new scopes.`);
        }

        const contentType = dlResponse.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
            throw new Error('Download URL returned an HTML page instead of a video — the link may have expired. Please retry.');
        }

        const buffer = await dlResponse.arrayBuffer();
        fs.writeFileSync(tmpFile, Buffer.from(buffer));
        const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(2);
        console.log(`✅ Downloaded: ${sizeMB} MB`);

        if (buffer.byteLength < 10000) {
            throw new Error(`Downloaded file is too small (${sizeMB} MB) — likely not a real video file. The URL may have expired.`);
        }

        send({ status: 'processing', progress: 35, message: `Downloaded (${sizeMB} MB). Extracting audio...` });
        console.log('🎵 Extracting audio with ffmpeg...');

        send({ status: 'processing', progress: 45, message: 'Transcribing audio with Whisper...' });
        console.log('🎙️  Transcribing with Whisper...');

        const result = await transcribeVideo(tmpFile);
        transcript = result.transcript;
        const transcriptLen = transcript?.trim().length ?? 0;
        console.log(`📝 Transcript length: ${transcriptLen} chars`);
        console.log(`📝 Transcript preview: ${transcript?.slice(0, 300)}`);
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
        try { if (result.audioPath) fs.unlinkSync(result.audioPath); } catch { /* ignore */ }

        // Fallback to Zoho transcript
        if (!transcript?.trim() && transcriptUrl) {
            send({ status: 'processing', progress: 80, message: 'Whisper returned empty — trying Zoho transcript fallback...' });
            const txtRes = await fetch(transcriptUrl);
            if (txtRes.ok) transcript = await txtRes.text();
            console.log(`📝 Zoho fallback transcript length: ${transcript?.trim().length ?? 0} chars`);
        }

        if (!transcript?.trim()) {
            throw new Error('Whisper returned an empty transcript. The audio may be silent or the video has no speech track.');
        }
        if (transcript.trim().length < 100) {
            throw new Error(`Transcript too short (${transcript.trim().length} chars): "${transcript.trim()}" — audio may be silent or corrupted.`);
        }

        send({ status: 'processing', progress: 82, message: `Transcript ready (${transcriptLen} chars). Generating MoM...`, transcriptPreview: transcript.trim().slice(0, 300) });

        send({ status: 'processing', progress: 85, message: 'Generating Minutes of Meeting with GPT-4o...' });
        console.log('🤖 Generating MoM with GPT-4o...');
        const momData = await generateMeetingMoM({
            transcript,
            meetingTitle: meetingTitle || 'Zoho Meeting Recording',
            detailed,
        });

        send({ status: 'processing', progress: 97, message: 'Saving...' });
        const storedMoM = await saveMoM(momData, transcript);

        send({ status: 'done', progress: 100, message: 'Done!', result: storedMoM });
        console.log(`✅ [${jobId}] MoM generated successfully`);
    } catch (err) {
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`❌ [${jobId}] Error:`, msg);
        send({ status: 'error', message: msg });
    } finally {
        res.end();
    }
});

// ─── GET /api/zoho-meeting/job/:jobId ────────────────────────────────────────
zohoMeetingRouter.get('/job/:jobId', (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});
