import { apiFetch } from '../utils/apiFetch';
import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Plus, Share2, Menu, PanelLeftClose, PanelLeft, ArrowLeft, Users, TicketCheck, PenLine, Code } from 'lucide-react';
import { FeatureInput } from './components/FeatureInput';
import { ChatInterface, ChatMessage } from './components/ChatInterface';
import { CompetitorAnalysis, CompetitorAnalysisData } from './components/CompetitorAnalysis';
import { MRDDocument, MRDData } from './components/MRDDocument';
import { FRDDocument, FRDData } from './components/FRDDocument';
import { DesignPreview, DesignData } from './components/DesignPreview';
import { ShareModal } from './components/ShareModal';
import { ZohoSheetsEditor, SheetData, SheetRow, SheetCell } from './components/ZohoSheetsEditor';
import { FigmaLinkModal } from './components/FigmaLinkModal';
import { ChatHistory, ChatSession } from './components/ChatHistory';
import { HomePage } from './components/HomePage';
import { MeetingMoMPage } from './components/MeetingMoMPage';
import { MeetingInput } from './components/MeetingInput';
import { MeetingMoM, MeetingMoMData, ActionItem } from './components/MeetingMoM';
import { SupportTicket, SupportTicketData } from './components/SupportTicket';
import { CommunityTicketPage } from './components/CommunityTicketPage';
import { CommunityTicketInput } from './components/CommunityTicketInput';
import { CommunityTicket, CommunityTicketData } from './components/CommunityTicket';
import { PRDGeneratorPage } from './components/PRDGeneratorPage';
import { ZipUpload } from './components/ZipUpload';
import { PRDExcel, PRDExcelData } from './components/PRDExcel';
import { FRDAuditPage } from './components/FRDAuditPage';
import { FRDAudit, AuditData } from './components/FRDAudit';
import { GenQAPage } from './components/GenQAPage';
import { LoginPage } from './components/LoginPage';
import { AppHeader } from './components/AppHeader';
import { toast } from 'sonner';
import { Toaster } from 'sonner';

type WorkflowStage =
  | 'input'
  | 'analysis'
  | 'mrd'
  | 'mrd-approved'
  | 'frd'
  | 'frd-approved'
  | 'design';

type View = 'home' | 'pm-buddy' | 'community-ticket' | 'prd-generator' | 'meeting-mom' | 'frd-audit' | 'genqa';

interface FeatureData {
  featureName: string;
  domain: string;
  problemStatement: string;
  targetUsers: string;
}

export default function App() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');

  // Force cache refresh - rebuilt from scratch
  const [currentView, setCurrentView] = useState<View>('home');
  const [stage, setStage] = useState<WorkflowStage>('input');
  const [showInput, setShowInput] = useState(false);
  const [featureData, setFeatureData] = useState<FeatureData | null>(null);
  const featureDataRef = useRef<FeatureData | null>(null);
  const [competitorData, setCompetitorData] = useState<CompetitorAnalysisData | null>(null);
  const [mrdData, setMrdData] = useState<MRDData | null>(null);
  const [frdSheetData, setFrdSheetData] = useState<SheetData | null>(null);
  const [frdData, setFrdData] = useState<FRDData | null>(null);
  const [designData, setDesignData] = useState<DesignData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showFigmaModal, setShowFigmaModal] = useState(false);
  const [figmaDesignUrl, setFigmaDesignUrl] = useState<string>('');

  // Chat History
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);

  // Meeting MoM state
  const [showMeetingInput, setShowMeetingInput] = useState(false);
  const [meetingMoMData, setMeetingMoMData] = useState<MeetingMoMData | null>(null);
  const [meetingMoMLoading, setMeetingMoMLoading] = useState(false);
  const [meetingMoMProgress, setMeetingMoMProgress] = useState(0);
  const [meetingMoMMessage, setMeetingMoMMessage] = useState('');

  // Community Ticket Generator state
  const [showCommunityTicketInput, setShowCommunityTicketInput] = useState(false);
  const [communityTicketData, setCommunityTicketData] = useState<CommunityTicketData | null>(null);

  // PRD Generator state
  const [showZipUpload, setShowZipUpload] = useState(false);
  const [prdExcelData, setPrdExcelData] = useState<PRDExcelData | null>(null);
  const [isPrdGenerating, setIsPrdGenerating] = useState(false);

  // FRD Audit state
  const [showFRDAudit, setShowFRDAudit] = useState(false);
  const [frdAuditLoading, setFrdAuditLoading] = useState(false);
  const [frdAuditProgress, setFrdAuditProgress] = useState(0);
  const [frdAuditMessage, setFrdAuditMessage] = useState('');
  const [auditData, setAuditData] = useState<AuditData | null>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('pmBuddyHistory');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) throw new Error('Invalid history format');
        // Convert timestamp strings back to Date objects
        const sessions = parsed.map((s: any) => ({
          ...s,
          timestamp: new Date(s.timestamp),
          messages: Array.isArray(s.messages) ? s.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          })) : [],
        }));
        setChatHistory(sessions);
      } catch (error) {
        console.error('Failed to load chat history:', error);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (chatHistory.length > 0) {
      localStorage.setItem('pmBuddyHistory', JSON.stringify(chatHistory));
    }
  }, [chatHistory]);

  // Welcome message
  useEffect(() => {
    setMessages([
      {
        id: '1',
        role: 'assistant',
        content:
          "👋 Hi! I'm PM Buddy, your AI-powered product management assistant. I'll help you create comprehensive product documentation with competitor analysis, MRDs, FRDs, and Zoho Analytics implementation guides.\n\nClick 'New Feature' to get started!",
        timestamp: new Date(),
      },
    ]);
  }, []);

  const handleFeatureSubmit = (data: FeatureData) => {
    console.log('=== FEATURE SUBMITTED ===');
    console.log('Feature data:', data);
    setFeatureData(data);
    featureDataRef.current = data;
    console.log('Feature data state should be set now');
    setShowInput(false);
    setIsProcessing(true);

    // Add user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `New feature: ${data.featureName} in ${data.domain} domain.`,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Simulate processing
    setTimeout(() => {
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Great! I'll analyze the market for "${data.featureName}" in the ${data.domain} space. This will help us understand the competitive landscape and identify opportunities.`,
        timestamp: new Date(),
        actions: [
          {
            label: 'Run Competitor Analysis',
            onClick: () => runCompetitorAnalysis(),
            variant: 'primary',
          },
        ],
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsProcessing(false);
    }, 1500);
  };

  const runCompetitorAnalysis = async () => {
    const currentFeatureData = featureData || featureDataRef.current;
    if (!currentFeatureData) return;
    setIsProcessing(true);

    try {
      const res = await apiFetch('/api/pm-buddy/competitor-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          featureName: currentFeatureData.featureName,
          domain: currentFeatureData.domain,
          problemStatement: currentFeatureData.problemStatement,
          targetUsers: currentFeatureData.targetUsers,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let errMsg = `HTTP ${res.status}`;
        try { const j = JSON.parse(text); errMsg = j.details || j.error || errMsg; } catch { }
        throw new Error(errMsg);
      }
      const analysis: CompetitorAnalysisData = await res.json();

      setCompetitorData(analysis);
      setStage('analysis');

      const msg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content:
          "✅ Competitor analysis complete! I've identified key players, their strengths/weaknesses, and opportunities for differentiation. Ready to generate your MRD?",
        timestamp: new Date(),
        actions: [
          {
            label: 'Generate MRD',
            onClick: () => generateMRD(),
            variant: 'primary',
          },
        ],
      };
      setMessages((prev) => [...prev, msg]);
    } catch (err: any) {
      toast.error(`Competitor analysis failed: ${err.message}`);
      const msg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `❌ Competitor analysis failed: ${err.message}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, msg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateMRD = async () => {
    const currentFeatureData = featureData || featureDataRef.current;
    if (!currentFeatureData) return;
    setIsProcessing(true);

    try {
      const res = await apiFetch('/api/pm-buddy/generate-mrd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureData: currentFeatureData, competitorData: competitorData || null }),
      });
      if (!res.ok) {
        const text = await res.text();
        let errMsg = `HTTP ${res.status}`;
        try { const j = JSON.parse(text); errMsg = j.details || j.error || errMsg; } catch { }
        throw new Error(errMsg);
      }
      const mrd: MRDData = await res.json();

      setMrdData(mrd);
      setStage('mrd');

      const msg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content:
          "📄 Your MRD is ready! It's a comprehensive single-page document covering objectives, personas, use cases, success metrics, and Zoho Analytics implementation guide. Review and approve when ready!",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, msg]);
    } catch (err: any) {
      toast.error(`MRD generation failed: ${err.message}`);
      const msg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `❌ MRD generation failed: ${err.message}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, msg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMRDApprove = () => {
    if (!mrdData) return;

    setMrdData({ ...mrdData, status: 'approved' });
    setStage('mrd-approved');
    toast.success('MRD Approved! Version locked.');

    const msg: ChatMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content:
        "🎉 MRD approved and locked! Now let's create your design in Figma Make. Click the button below to open Figma Make, design your feature, and publish the link.",
      timestamp: new Date(),
      actions: [
        {
          label: 'Open Figma Make',
          onClick: () => {
            window.open('https://www.figma.com/make', '_blank');
            // Show follow-up message after opening Figma Make
            setTimeout(() => {
              const followUpMsg: ChatMessage = {
                id: Date.now().toString(),
                role: 'assistant',
                content:
                  "✨ Figma Make opened! Once you've created and published your design, paste the published link below to continue.",
                timestamp: new Date(),
                actions: [
                  {
                    label: 'Add Published Link',
                    onClick: () => setShowFigmaModal(true),
                    variant: 'primary',
                  },
                ],
              };
              setMessages((prev) => [...prev, followUpMsg]);
            }, 1000);
          },
          variant: 'primary',
        },
        {
          label: 'Skip & Generate FRD',
          onClick: () => proceedToFRD(),
          variant: 'secondary',
        },
      ],
    };
    setMessages((prev) => [...prev, msg]);
  };

  const proceedToFRD = () => {
    const msg: ChatMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content:
        "Let's create the Functional Requirements Document (FRD) with detailed technical specifications.",
      timestamp: new Date(),
      actions: [
        {
          label: 'Generate FRD',
          onClick: () => generateFRD(),
          variant: 'primary',
        },
      ],
    };
    setMessages((prev) => [...prev, msg]);
  };

  const handleFigmaLinkSubmit = (url: string) => {
    setFigmaDesignUrl(url);
    setShowFigmaModal(false);
    toast.success('Figma design link added!');

    const msg: ChatMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `✅ Figma design link saved:\n${url}\n\nNow let's create the Functional Requirements Document (FRD).`,
      timestamp: new Date(),
      actions: [
        {
          label: 'Generate FRD',
          onClick: () => generateFRD(),
          variant: 'primary',
        },
      ],
    };
    setMessages((prev) => [...prev, msg]);
  };

  const handleMRDRequestChanges = () => {
    if (!mrdData) return;
    setMrdData({ ...mrdData, status: 'changes-requested' });
    toast.info('Changes requested for MRD');

    const msg: ChatMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content:
        'What changes would you like to make to the MRD? You can:\n\n• Double-click cells to edit directly\n• Tell me what to change (e.g., "Change Metric 1 to track daily users")\n• Add or remove rows using the buttons',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, msg]);
  };

  const generateFRD = async () => {
    const currentFeatureData = featureData || featureDataRef.current;
    if (!currentFeatureData) return;
    if (!mrdData) {
      toast.error('Generate and approve the MRD first');
      return;
    }
    setIsProcessing(true);

    try {
      const res = await apiFetch('/api/pm-buddy/generate-prd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureData: currentFeatureData, mrdData, competitorData }),
      });
      if (!res.ok) {
        const text = await res.text();
        let errMsg = `HTTP ${res.status}`;
        try { const j = JSON.parse(text); errMsg = j.details || j.error || errMsg; } catch { }
        throw new Error(errMsg);
      }

      // Response is the Excel PRD file — trigger browser download
      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] || `PRD_${currentFeatureData.featureName.replace(/\s+/g, '_')}.xlsx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStage('frd');
      const msg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `📋 PRD generated and downloaded! "${filename}" is in your Downloads folder. It includes all use cases, error handling, affected areas, and limitations based on your MRD.`,
        timestamp: new Date(),
        actions: [
          {
            label: 'Generate Design',
            onClick: () => generateDesign(),
            variant: 'primary',
          },
        ],
      };
      setMessages((prev) => [...prev, msg]);
      toast.success(`PRD downloaded: "${filename}"`);
    } catch (err: any) {
      toast.error(`PRD generation failed: ${err.message}`);
      const msg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `❌ PRD generation failed: ${err.message}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, msg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFRDApprove = () => {
    if (!frdData) return;

    setFrdData({ ...frdData, status: 'approved' });
    setStage('frd-approved');
    toast.success('FRD Approved! Version locked.');

    const msg: ChatMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content:
        "✨ FRD approved! Now I'll generate Zoho Analytics-style dashboard designs based on your requirements.",
      timestamp: new Date(),
      actions: [
        {
          label: 'Generate Design',
          onClick: () => generateDesign(),
          variant: 'primary',
        },
      ],
    };
    setMessages((prev) => [...prev, msg]);
  };

  const handleFRDRequestChanges = () => {
    if (!frdData) return;
    setFrdData({ ...frdData, status: 'changes-requested' });
    toast.info('Changes requested for FRD');

    const msg: ChatMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content:
        'What changes would you like to make to the FRD? You can edit any section directly.',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, msg]);
  };

  const generateDesign = () => {
    if (!featureData) return;
    setIsProcessing(true);

    setTimeout(() => {
      const design: DesignData = {
        prompt: `Create a modern, Zoho Analytics-style dashboard for "${featureData.featureName}" featuring:
- Real-time collaboration indicators
- Clean card-based layout with purple/blue accent colors
- Interactive charts: bar charts for trends, pie charts for distributions, line charts for time series
- Key metric cards with trend indicators
- Data table with filtering and sorting
- Mobile-responsive design
- Zoho brand aesthetic with professional spacing`,
        dashboards: [
          {
            name: 'Main Dashboard',
            widgets: [
              {
                type: 'metric',
                title: 'Active Collaborators',
              },
              {
                type: 'metric',
                title: 'Dashboards Created',
              },
              {
                type: 'chart',
                title: 'User Engagement Trend',
              },
              {
                type: 'chart',
                title: 'Feature Usage Distribution',
              },
              {
                type: 'table',
                title: 'Recent Activity',
              },
              {
                type: 'chart',
                title: 'Performance Metrics',
              },
            ],
          },
        ],
      };

      setDesignData(design);
      setStage('design');

      const msg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content:
          "🎨 Dashboard designs generated! You can edit the design prompt and regenerate. When ready, share everything with your manager via Zoho Cliq.",
        timestamp: new Date(),
        actions: [
          {
            label: 'Share via Cliq',
            onClick: () => setShowShareModal(true),
            variant: 'primary',
          },
        ],
      };
      setMessages((prev) => [...prev, msg]);
      setIsProcessing(false);
    }, 2000);
  };

  const handlePMBuddyShare = (email: string, message: string) => {
    setShowShareModal(false);
    toast.success(`Shared to ${email} via Zoho Cliq!`);

    const msg: ChatMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `✅ Successfully sent complete package to ${email} via Zoho Cliq! They'll receive:
      
• Feature summary
• Competitor analysis
• Market Requirements Document (v${mrdData?.version || 1})
• Functional Requirements Document (v${frdData?.version || 1})
• Dashboard design preview

${message ? `\nYour message: "${message}"` : ''}

They can review and provide feedback directly in Cliq!`,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, msg]);
  };

  const handleSendMessage = async (message: string) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      const res = await apiFetch('/api/pm-buddy/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          stage,
          featureData,
          mrdData,
          frdData,
        }),
      });
      let reply = "I'm here to help with your product workflow. What would you like to do?";
      if (res.ok) {
        const data = await res.json();
        reply = data.reply || reply;
      }
      const assistantMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const assistantMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: "I'm processing your request. How else can I assist you with the product workflow?",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartNewSession = () => {
    // Save current session to history if there's meaningful data
    if (currentSessionId && messages.length > 1) {
      const sessionToSave: ChatSession = {
        id: currentSessionId,
        title: featureData?.featureName || 'Untitled Feature',
        timestamp: new Date(),
        messages: messages,
        stage: stage,
      };

      setChatHistory((prev) => {
        const filtered = prev.filter((s) => s.id !== currentSessionId);
        return [sessionToSave, ...filtered];
      });
    }

    // Reset to initial state
    const newSessionId = Date.now().toString();
    setCurrentSessionId(newSessionId);
    setStage('input');
    setFeatureData(null);
    featureDataRef.current = null;
    setCompetitorData(null);
    setMrdData(null);
    setFrdData(null);
    setDesignData(null);
    setFigmaDesignUrl('');
    setMessages([
      {
        id: '1',
        role: 'assistant',
        content:
          "👋 Hi! I'm PM Buddy, your AI-powered product management assistant. I'll help you create comprehensive product documentation with competitor analysis, MRDs, FRDs, and Zoho Analytics implementation guides.\n\nClick 'New Feature' to get started!",
        timestamp: new Date(),
      },
    ]);
    setShowInput(true);
  };

  const handleLoadSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    setStage(session.stage);
    setShowHistory(false);
    toast.info(`Loaded session: ${session.title}`);
  };

  const playDoneSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        const start = ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.25, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
        osc.start(start);
        osc.stop(start + 0.4);
      });
    } catch { /* audio not supported */ }
  };

  // Meeting MoM Handlers
  const handleMeetingMoMSubmit = async (data: { type: 'link' | 'video' | 'zoho'; value: string; title?: string; key?: string; transcriptUrl?: string }) => {
    setMeetingMoMLoading(true);
    setMeetingMoMProgress(0);
    setMeetingMoMMessage('Starting...');

    try {
      let result: MeetingMoMData;

      if (data.type === 'zoho') {
        // Stream SSE — keeps HTTP connection open so Vercel doesn't freeze the CPU
        const streamRes = await apiFetch('/api/zoho-meeting/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            downloadUrl: data.value,
            recordingKey: data.key,
            transcriptUrl: data.transcriptUrl,
            meetingTitle: data.title || 'Zoho Meeting Recording',
          }),
        });
        if (!streamRes.ok) {
          const err = await streamRes.json().catch(() => ({}));
          throw new Error((err as any).details || (err as any).error || `Server error ${streamRes.status}`);
        }

        result = await new Promise<MeetingMoMData>((resolve, reject) => {
          const reader = streamRes.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          const fail = (err: unknown) => { reader.cancel(); reject(err); };

          function pump() {
            reader.read().then(({ done, value }) => {
              if (done) { fail(new Error('Stream ended unexpectedly')); return; }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                  const event = JSON.parse(line.slice(6));
                  setMeetingMoMProgress(event.progress ?? 0);
                  setMeetingMoMMessage(event.message ?? '');
                  if (event.status === 'done') { resolve(event.result); return; }
                  if (event.status === 'error') { fail(new Error(event.message || 'Processing failed')); return; }
                } catch { /* ignore malformed line */ }
              }
              pump();
            }).catch(fail);
          }
          pump();
        });
      } else if (data.type === 'link') {
        setMeetingMoMMessage('Generating MoM from link...');
        const res = await apiFetch('/api/meeting-mom/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ meetingLink: data.value }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.details || err.error || `Server error ${res.status}`);
        }
        result = await res.json();
      } else {
        throw new Error('Video upload via this form is not yet supported. Use a Zoho recording or meeting link.');
      }

      setMeetingMoMData(result);
      setMeetingMoMProgress(100);
      playDoneSound();
      toast.success('Minutes of Meeting generated!');
    } catch (err: any) {
      toast.error(`Failed to generate MoM: ${err.message}`);
    } finally {
      setMeetingMoMLoading(false);
      setMeetingMoMProgress(0);
      setMeetingMoMMessage('');
    }
  };

  const handleMeetingMoMDownload = () => {
    if (!meetingMoMData) return;

    const content = `
MINUTES OF MEETING
==================

Title: ${meetingMoMData.meetingTitle}
Date: ${meetingMoMData.date}
Duration: ${meetingMoMData.duration}

ATTENDEES
---------
${meetingMoMData.attendees.map(a => `• ${a}`).join('\n')}

SUMMARY
-------
${meetingMoMData.summary}

KEY POINTS
----------
${meetingMoMData.keyPoints.map(p => `• ${p}`).join('\n')}

ACTION ITEMS
------------
${meetingMoMData.actionItems.map((item, i) => `
${i + 1}. ${item.task}
   Assigned to: ${item.assignee}
   Due: ${item.dueDate}
   Status: ${item.status}
`).join('\n')}

NEXT STEPS
----------
${meetingMoMData.nextSteps}

RECORDING
---------
${meetingMoMData.recordingLink}

---
Generated on: ${new Date().toLocaleString()}
    `.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mom-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Meeting minutes downloaded!');
  };

  const handleActionItemUpdate = (id: string, updates: Partial<ActionItem>) => {
    if (!meetingMoMData) return;

    setMeetingMoMData({
      ...meetingMoMData,
      actionItems: meetingMoMData.actionItems.map(item =>
        item.id === id ? { ...item, ...updates } : item
      )
    });

    toast.success('Action item updated!');
  };

  // Community Ticket Generator Handlers
  const handleCommunityTicketSubmit = (data: { ticketUrl?: string; issueDescription?: string; category?: string }) => {
    setShowCommunityTicketInput(false);

    if (data.ticketUrl) {
      toast.info('Fetching ticket from Zoho Desk...');
      // In real implementation, this would fetch the ticket from Zoho Desk API
      setTimeout(() => {
        toast.success('Ticket loaded successfully!');
      }, 1500);
    } else {
      toast.info('Generating community support ticket...');

      setTimeout(() => {
        const mockTicket: CommunityTicketData = {
          ticketTitle: `[${data.category}] Issue with Data Export`,
          issueDescription: data.issueDescription || '',
          reproductionSteps: [
            'Navigate to the Analytics Dashboard',
            'Click on the Export button in the top right',
            'Select CSV format from the dropdown',
            'Click "Export Data"',
            'Observe that nothing happens - no download initiated'
          ],
          expectedBehavior: 'When clicking the Export button, the system should generate a CSV file and trigger a download.',
          actualBehavior: 'The Export button becomes unresponsive for ~2 seconds, then returns to normal state without initiating any download.',
          environment: 'Browser: Chrome 122\\nOS: Windows 11 Pro\\nZoho Analytics Version: 5.2.1',
          priority: 'high',
          category: data.category || 'General'
        };

        setCommunityTicketData(mockTicket);
        toast.success('Community ticket generated successfully!');
      }, 2000);
    }
  };

  // PRD Generator Handlers
  const handleZipUpload = async (file: File) => {
    setShowZipUpload(false);
    setIsPrdGenerating(true);

    const ext = file.name.endsWith('.docx') ? 'DOCX (MRD)' : 'ZIP';
    toast.info(`Analyzing ${ext} with Claude... This may take 30–60 seconds.`);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiFetch('/api/prd-generator/generate', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('PRD API error response:', res.status, text);
        let errMsg = `HTTP ${res.status}`;
        try { const j = JSON.parse(text); errMsg = j.details || j.error || errMsg; } catch { }
        throw new Error(errMsg);
      }

      // Response is a ZIP containing .xlsx + .html — trigger browser download
      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] || `PRD_${file.name.replace(/\.[^.]+$/, '')}.zip`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Set a placeholder so the PRD page shows a success state
      setPrdExcelData({ productName: filename, version: '1.0', overview: 'Downloaded', objectives: [], targetUsers: [], features: [], requirements: [], timeline: [] });
      toast.success(`PRD generated! "${filename}" downloaded (contains .xlsx + .html).`);
    } catch (error) {
      console.error('PRD generation error:', error);
      toast.error(`PRD generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsPrdGenerating(false);
    }
  };

  // FRD Audit Handlers
  const handleFRDAuditSubmit = async (file: File) => {
    setFrdAuditLoading(true);
    setFrdAuditProgress(0);
    setFrdAuditMessage('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const streamRes = await apiFetch('/api/frd/review', {
        method: 'POST',
        body: formData,
      });

      if (!streamRes.ok) {
        const err = await streamRes.json().catch(() => ({}));
        throw new Error((err as any).details || (err as any).error || `Server error ${streamRes.status}`);
      }

      const audit = await new Promise<AuditData>((resolve, reject) => {
        const reader = streamRes.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const fail = (err: unknown) => { reader.cancel(); reject(err); };

        function pump() {
          reader.read().then(({ done, value }) => {
            if (done) { fail(new Error('Stream ended unexpectedly')); return; }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const event = JSON.parse(line.slice(6));
                setFrdAuditProgress(event.progress ?? 0);
                setFrdAuditMessage(event.message ?? '');
                if (event.status === 'done') { resolve(event.result); return; }
                if (event.status === 'error') { fail(new Error(event.message || 'Review failed')); return; }
              } catch { /* ignore malformed line */ }
            }
            pump();
          }).catch(fail);
        }
        pump();
      });

      setAuditData(audit);
      toast.success(`FRD review complete — ${audit.issues.length} issues found`);
    } catch (err: any) {
      toast.error(`FRD review failed: ${err.message}`);
      setShowFRDAudit(true);
    } finally {
      setFrdAuditLoading(false);
    }
  };

  // View navigation handlers
  const handleViewChange = (view: View) => {
    setCurrentView(view);

    // Reset view-specific state
    if (view === 'meeting-mom') {
      setShowMeetingInput(true);
      setMeetingMoMData(null);
    } else if (view === 'community-ticket') {
      setShowCommunityTicketInput(true);
      setCommunityTicketData(null);
    } else if (view === 'prd-generator') {
      setShowZipUpload(true);
      setPrdExcelData(null);
    } else if (view === 'pm-buddy') {
      // PM Buddy keeps its state
    } else if (view === 'frd-audit') {
      setShowFRDAudit(true);
      setAuditData(null);
    }
  };

  const handleBackToHome = () => {
    setCurrentView('home');
  };

  // Authentication handlers
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Zoho OAuth just redirected back with ?auth_success=1
    if (params.get('auth_success') === '1') {
      // Ask the backend who just logged in (token is stored in their session cookie)
      apiFetch('/api/auth/status', { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          if (data.loggedIn) {
            const name = data.user?.name || data.user?.email || 'Zoho User';
            setIsAuthenticated(true);
            setUsername(name);
            localStorage.setItem('zoho_auth', JSON.stringify({ username: name }));
            toast.success(`Welcome, ${name}!`);
          } else {
            toast.error('Session not saved. Please try logging in again.');
          }
        })
        .catch((err) => toast.error(`Login check failed: ${err?.message || String(err)}`));
      // Clean the URL so ?auth_success=1 doesn't stay visible
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    // Handle OAuth error from Zoho or Server
    if (params.get('auth_error')) {
      const err = params.get('auth_error');
      const messages: Record<string, string> = {
        'access_denied': 'Login cancelled by user.',
        'invalid_code': 'Auth code expired or already used. Please try again.',
        'redirect_uri_mismatch': 'Configuration error: Redirect URI mismatch.',
        'missing_credentials': 'Server error: Missing Zoho client credentials.',
        'token_exchange_failed': 'Failed to exchange code for access token.',
        'callback_failed': 'An unexpected error occurred during login.'
      };
      const msg = messages[err!] || err;
      toast.error(`Login failed: ${msg}`, { duration: 6000 });
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    // Normal page load — check if already logged in (localStorage or active session)
    const savedAuth = localStorage.getItem('zoho_auth');
    if (savedAuth) {
      try {
        const parsed = JSON.parse(savedAuth);
        setIsAuthenticated(true);
        setUsername(parsed.username);
      } catch (error) {
        console.error('Failed to load auth:', error);
      }
    }
  }, []);

  const handleLogin = (user: string) => {
    setIsAuthenticated(true);
    setUsername(user);
    localStorage.setItem('zoho_auth', JSON.stringify({ username: user }));
  };

  const handleSignOut = () => {
    // Tell the backend to clear the session cookie
    apiFetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => { });
    setIsAuthenticated(false);
    setUsername('');
    localStorage.removeItem('zoho_auth');
    // Reset all app state
    setCurrentView('home');
    setStage('input');
    setFeatureData(null);
    setCompetitorData(null);
    setMrdData(null);
    setFrdData(null);
    setDesignData(null);
    setMeetingMoMData(null);
    setCommunityTicketData(null);
    setPrdExcelData(null);
    setAuditData(null);
  };

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return (
      <>
        <Toaster position="top-right" />
        <LoginPage onLogin={handleLogin} />
      </>
    );
  }

  // Render different views
  const renderContent = () => {
    if (currentView === 'home') {
      return <HomePage onToolSelect={handleViewChange} />;
    }

    if (currentView === 'meeting-mom') {
      return (
        <MeetingMoMPage
          onBack={handleBackToHome}
          onSubmit={handleMeetingMoMSubmit}
          meetingMoMData={meetingMoMData}
          isLoading={meetingMoMLoading}
          progress={meetingMoMProgress}
          progressMessage={meetingMoMMessage}
        />
      );
    }

    if (currentView === 'community-ticket') {
      return (
        <CommunityTicketPage
          onBack={handleBackToHome}
          onSubmit={handleCommunityTicketSubmit}
          ticketData={communityTicketData}
        />
      );
    }

    if (currentView === 'prd-generator') {
      return (
        <PRDGeneratorPage
          onBack={handleBackToHome}
          onUpload={handleZipUpload}
          prdData={prdExcelData}
          isGenerating={isPrdGenerating}
        />
      );
    }

    if (currentView === 'frd-audit') {
      return (
        <FRDAuditPage
          onBack={handleBackToHome}
          onSubmit={handleFRDAuditSubmit}
          auditData={auditData}
          isLoading={frdAuditLoading}
          progress={frdAuditProgress}
          progressMessage={frdAuditMessage}
        />
      );
    }

    if (currentView === 'genqa') {
      return (
        <GenQAPage onBack={handleBackToHome} />
      );
    }

    // PM Buddy view
    return (
      <div className="flex-1 flex flex-col lg:flex-row gap-6 p-6 overflow-hidden">
        {/* Chat History Sidebar */}
        {showHistory && (
          <div className="w-full lg:w-80 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Chat History</h3>
              <button
                onClick={() => setShowHistory(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <PanelLeftClose className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <ChatHistory
              sessions={chatHistory}
              onLoadSession={handleLoadSession}
              currentSessionId={currentSessionId}
            />
          </div>
        )}

        {/* Main Canvas Area */}
        <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 p-6 overflow-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <button
                onClick={handleBackToHome}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Home
              </button>
              <h2 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-purple-600" />
                PM Buddy Canvas
              </h2>
              <p className="text-gray-600 mt-2">
                Interactive workflow canvas - changes dynamically as you progress
              </p>
            </div>
            {!showHistory && (
              <button
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                <PanelLeft className="w-4 h-4" />
                Show History
              </button>
            )}
          </div>

          {/* Canvas content changes based on stage */}
          {stage === 'input' && !featureData && (
            <div className="text-center py-12">
              <Sparkles className="w-16 h-16 mx-auto mb-4 text-purple-600 opacity-30" />
              <p className="text-gray-500 mb-6">Click "New Feature" to start your product workflow</p>
            </div>
          )}

          {stage === 'analysis' && competitorData && (
            <CompetitorAnalysis data={competitorData} />
          )}

          {(stage === 'mrd' || stage === 'mrd-approved') && mrdData && (
            <MRDDocument
              data={mrdData}
              onApprove={handleMRDApprove}
              onRequestChanges={handleMRDRequestChanges}
            />
          )}

          {(stage === 'frd' || stage === 'frd-approved') && frdData && (
            <FRDDocument
              data={frdData}
              onApprove={handleFRDApprove}
              onRequestChanges={handleFRDRequestChanges}
            />
          )}

          {stage === 'design' && designData && (
            <DesignPreview data={designData} />
          )}
        </div>

        {/* Chat Interface Sidebar */}
        <div className="w-full lg:w-96 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              PM Buddy Chat
            </h3>
            <button
              onClick={handleStartNewSession}
              className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm"
            >
              <Plus className="w-4 h-4" />
              New Feature
            </button>
          </div>
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            isProcessing={isProcessing}
          />
        </div>

        {/* Feature Input Modal */}
        {showInput && (
          <FeatureInput
            onSubmit={handleFeatureSubmit}
            onClose={() => setShowInput(false)}
          />
        )}

        {/* Share Modal */}
        {showShareModal && currentView === 'pm-buddy' && (
          <ShareModal
            onClose={() => setShowShareModal(false)}
            onShare={handlePMBuddyShare}
          />
        )}

        {/* Figma Link Modal */}
        {showFigmaModal && (
          <FigmaLinkModal
            onClose={() => setShowFigmaModal(false)}
            onLink={handleFigmaLinkSubmit}
          />
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Toaster position="top-right" />

      {/* App Header with User Greeting */}
      <AppHeader username={username} onSignOut={handleSignOut} />

      {/* Main Content */}
      {renderContent()}
    </div>
  );
}