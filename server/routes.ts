import { Router } from 'express';
import { discoveryAgent } from './agents/discovery';
import { saveMoM, getMoMHistory, getMoMById } from './utils/storage';
import { runPythonAnalysis, askPythonQuestion } from './utils/pythonRunner';

export const router = Router();

router.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Agents
router.post('/mrd', async (req, res) => {
    try {
        const { topic } = req.body;
        if (!topic) {
            return res.status(400).json({ error: 'Topic is required' });
        }
        console.log(`🧠 [Discovery] Thinking about: ${topic}`);
        const data = await discoveryAgent(topic);
        res.json(data);
    } catch (error) {
        console.error('Error in Discovery Agent:', error);
        res.status(500).json({ error: 'Failed to generate MRD' });
    }
});

import { competitorAgent } from './agents/competitor';

// ... (Discovery Agent route above) ...

router.post('/competitors', async (req, res) => {
    try {
        const { topic, productUrl } = req.body;
        console.log(`🧠 [Researcher] Thinking about: ${topic} (URL: ${productUrl})`);
        const data = await competitorAgent(topic, productUrl);
        res.json(data);
    } catch (error) {
        console.error('Error in Competitor Agent:', error);
        res.status(500).json({ error: 'Failed to analyze competitors' });
    }
});

import { designAgent } from './agents/design';
import { prdAgent } from './agents/prd';

// ... (Result of Competitor route) ...

router.post('/design-prompt', async (req, res) => {
    try {
        const { topic, mrdData } = req.body;
        console.log(`🎨 [Design] Generating prompt for: ${topic}`);
        const data = await designAgent(topic, mrdData);
        res.json(data);
    } catch (error) {
        console.error('Error in Design Agent:', error);
        res.status(500).json({ error: 'Failed to generate design prompt' });
    }
});

router.post('/prd', async (req, res) => {
    try {
        const { topic, mrdData, competitorData, images } = req.body;
        console.log(`📝 [Architect] Drafting PRD for: ${topic}`);
        console.log(`   Images provided: ${images ? images.length : 0}`);
        const data = await prdAgent(topic, mrdData, competitorData, images);
        res.json(data);
    } catch (error) {
        console.error('Error in PRD Agent:', error);
        res.status(500).json({ error: 'Failed to generate PRD' });
    }
});

// PRD Use Cases
import { generateUseCases } from './agents/useCaseAgent';
import { fillUseCasesSheet } from './utils/excelWriter';

router.post('/prd/use-cases', async (req, res) => {
    try {
        const { topic, mrdData, prdData } = req.body;
        if (!topic) {
            return res.status(400).json({ error: 'topic is required' });
        }
        console.log(`📋 [Use Cases] Generating for: ${topic}`);
        const useCaseData = await generateUseCases(topic, mrdData, prdData);
        const xlsxBuffer = fillUseCasesSheet(useCaseData);

        const filename = `PRD_UseCases_${topic.replace(/[^a-z0-9]/gi, '_').substring(0, 40)}.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(xlsxBuffer);
    } catch (error) {
        console.error('Error generating use cases:', error);
        res.status(500).json({
            error: 'Failed to generate use cases',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Support Ticket Agent
import { generateSupportTicketResponse } from './agents/supportTicket';
import { zohoDeskRouter } from './routes/zohoDeskRoutes';
import { zohoMeetingRouter } from './routes/zohoMeetingRoutes';
import { authRouter } from './routes/authRoutes';

router.use('/auth', authRouter);
router.use('/zoho-desk', zohoDeskRouter);
router.use('/zoho-meeting', zohoMeetingRouter);

router.post('/support-ticket/generate', async (req, res) => {
    try {
        const { communityLink, developerNotes, problemStatement, prdContent, includeDelayApology, userName } = req.body;

        if (!communityLink || !developerNotes) {
            return res.status(400).json({
                error: 'Community link and developer notes are required'
            });
        }

        console.log(`🎫 [Support Ticket] Generating response for: ${communityLink}`);

        const data = await generateSupportTicketResponse({
            communityLink,
            developerNotes,
            problemStatement,
            prdContent,
            includeDelayApology,
            userName,
        });

        res.json(data);
    } catch (error) {
        console.error('Error in Support Ticket Agent:', error);
        res.status(500).json({ error: 'Failed to generate support response' });
    }
});

// Meeting MoM Generator
import { generateMeetingMoM } from './agents/meetingMoM.js';

// Meeting MoM Generator endpoint - handles both JSON and multipart/form-data
router.post('/meeting-mom/generate', async (req, res, next) => {
    // Only use multer if content-type is multipart/form-data
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
        const { upload } = await import('./utils/multerConfig.js');
        upload.single('videoFile')(req, res, next);
    } else {
        next();
    }
}, async (req, res) => {
    try {
        console.log('\n📝 Meeting MoM generation request received');
        console.log('Content-Type:', req.headers['content-type']);
        console.log('Request body:', req.body);
        console.log('File uploaded:', req.file ? 'Yes' : 'No');

        const { transcript, meetingTitle, analyzeScreenSharing, meetingLink } = req.body;
        const videoFile = req.file;

        let finalTranscript = transcript;
        let visualContext: string | undefined;
        let tempFiles: string[] = [];

        // If video file is uploaded, process it
        if (videoFile) {
            console.log(`📹 Video file uploaded: ${videoFile.filename}`);
            console.log(`📊 File size: ${(videoFile.size / (1024 * 1024)).toFixed(2)} MB`);

            tempFiles.push(videoFile.path);

            try {
                // Lazy-load ffmpeg-dependent modules only when needed
                const { transcribeVideo } = await import('./utils/audioTranscription.js');
                const { extractKeyFrames, analyzeFramesWithVision, cleanupFrames } = await import('./utils/videoProcessing.js');
                const { cleanupFile } = await import('./utils/multerConfig.js');

                // Transcribe video
                const { transcript: videoTranscript, audioPath } = await transcribeVideo(videoFile.path);
                finalTranscript = videoTranscript;
                tempFiles.push(audioPath);

                // Optionally analyze screen sharing
                if (analyzeScreenSharing === 'true' || analyzeScreenSharing === true) {
                    console.log('👁️  Screen sharing analysis requested');

                    const frames = await extractKeyFrames(videoFile.path);
                    tempFiles.push(...frames);

                    visualContext = await analyzeFramesWithVision(frames);

                    // Cleanup frames directory
                    cleanupFrames(videoFile.path);
                }

                // Cleanup temp files on success path too
                tempFiles.forEach(cleanupFile);
            } catch (error) {
                console.error('Error processing video:', error);
                return res.status(500).json({
                    error: 'Failed to process video file',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        // Validate that we have either a transcript or meeting link
        if (!finalTranscript && !meetingLink) {
            console.error('❌ No transcript or meeting link provided');
            return res.status(400).json({
                error: 'Either transcript or meeting link is required'
            });
        }

        console.log('📄 Transcript length:', finalTranscript?.length || 0, 'characters');

        // Generate MoM
        const momData = await generateMeetingMoM({
            transcript: finalTranscript,
            meetingTitle,
            visualContext,
            meetingLink,
        });

        console.log('✅ MoM generated successfully');

        // Save to history (include transcript so Regenerate uses real audio content)
        const storedMoM = await saveMoM(momData, finalTranscript);

        res.json(storedMoM);
    } catch (error) {
        console.error('❌ Error generating MoM:', error);
        res.status(500).json({
            error: 'Failed to generate meeting minutes',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// POST /api/meeting-mom/regenerate-section
router.post('/meeting-mom/regenerate-section', async (req, res) => {
    try {
        const { section, verbosity, transcript, meetingTitle, attendees } = req.body;
        if (!section || !transcript) {
            return res.status(400).json({ error: 'section and transcript are required' });
        }

        const { ChatOpenAI } = await import('@langchain/openai');
        const model = new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0.3 });

        const verbosityGuide = verbosity === 'brief'
            ? 'Be concise — 1-2 sentences per point.'
            : verbosity === 'detailed'
            ? 'Be thorough — 4-6 sentences per discussion point, capture nuances, quotes, and specifics.'
            : 'Be descriptive — 3-4 sentences per discussion point, NEVER write one-liners or short labels.';

        const transcriptBlock = `\n**Meeting Transcript (source of truth)**:\n${transcript}\n`;
        let prompt = '';
        let updatedFields: any = {};

        if (section === 'discussion') {
            prompt = `You are a meeting minutes assistant. Using ONLY the transcript below, regenerate the Summary and Key Discussions.
${transcriptBlock}
Meeting Title: ${meetingTitle || 'Team Meeting'}
Attendees: ${(attendees || []).join(', ')}

Verbosity instruction: ${verbosityGuide}

KEY DISCUSSIONS RULES (CRITICAL):
- NEVER write a one-liner or a short label like "Feature X discussed."
- Each entry must be a full paragraph covering: what was discussed, why it matters, concerns raised, and direction agreed.
- If you cannot write 3 sentences about a topic, merge it with a related point.
- BAD: "Data pipeline performance was discussed."
- GOOD: "The team reviewed recent slowdowns in the data pipeline affecting daily report delivery times. It was noted that the bottleneck occurs during the transformation step when processing large fact tables, and two team members had independently observed this in their dashboards. The group agreed to profile the ETL job this week and consider adding incremental processing as a short-term fix."
- Cover EVERY distinct topic raised in the transcript — do not skip any discussion point, no matter how brief.

Return ONLY valid JSON (no markdown):
{ "summary": "string", "keyDiscussions": ["string", ...] }`;

            const response = await model.invoke(prompt);
            const clean = response.content.toString().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(clean);
            updatedFields = { summary: parsed.summary, keyDiscussions: parsed.keyDiscussions };

        } else if (section === 'actions') {
            prompt = `You are a meeting minutes assistant. Using ONLY the transcript below, regenerate the Decisions Made and Action Items.
${transcriptBlock}
Meeting Title: ${meetingTitle || 'Team Meeting'}
Attendees: ${(attendees || []).join(', ')}

Rules:
- Only include decisions explicitly agreed upon in the meeting.
- Only include action items explicitly assigned or volunteered.
- Assignee: name if mentioned, otherwise "Unassigned".
- Due date: only if explicitly stated, otherwise "TBD". Do NOT invent dates.
- Priority: infer from urgency words only ("urgent", "ASAP", "blocker"). Otherwise "Medium".

Return ONLY valid JSON (no markdown):
{
  "decisions": ["string", ...],
  "actionItems": [{ "id": "string", "task": "string", "assignee": "string", "dueDate": "Mon DD, YYYY or TBD", "priority": "High|Medium|Low", "status": "Pending|In Progress|Completed" }]
}`;

            const response = await model.invoke(prompt);
            const clean = response.content.toString().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(clean);
            updatedFields = { decisions: parsed.decisions, actionItems: parsed.actionItems };
        } else {
            return res.status(400).json({ error: `Unknown section: ${section}` });
        }

        res.json(updatedFields);
    } catch (error) {
        console.error('❌ Error regenerating section:', error);
        res.status(500).json({ error: 'Failed to regenerate section', details: error instanceof Error ? error.message : String(error) });
    }
});

// GET /api/mom-history - Get full history
router.get('/mom-history', async (req, res) => {
    try {
        const history = await getMoMHistory();
        res.json(history);
    } catch (error) {
        console.error('❌ Error fetching MoM history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Competitor Analysis (Python Bridge)
router.post('/competitor-analysis/run', async (req, res) => {
    try {
        const { topic, competitors } = req.body;
        console.log(`🤖 [Python Bridge] Starting analysis for: ${topic}`);
        const report = await runPythonAnalysis(topic, competitors, (progress) => {
            console.log(`[Python] ${progress.message}`);
        });
        res.json(report);
    } catch (error) {
        console.error('Error in Python Analysis:', error);
        res.status(500).json({ error: 'Failed to run competitor analysis' });
    }
});

router.post('/competitor-analysis/ask', async (req, res) => {
    try {
        const { topic, question } = req.body;
        console.log(`💬 [Python Bridge] Question: ${question}`);
        const answer = await askPythonQuestion(topic, question);
        res.json({ answer });
    } catch (error) {
        console.error('Error in Python Q&A:', error);
        res.status(500).json({ error: 'Failed to answer question' });
    }
});
