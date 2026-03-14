import { apiFetch } from '../../utils/apiFetch';
import React, { useState } from 'react';
import { ArrowLeft, Plus, Clock, TicketCheck, FileText, RefreshCw } from 'lucide-react';
import { CommunityTicketInput } from './CommunityTicketInput';
import { ZohoDeskTicketViewer, ZohoDeskTicket } from './ZohoDeskTicketViewer';
import { toast } from 'sonner';

interface CommunityTicketPageProps {
  onBack: () => void;
  onSubmit: (data: { ticketUrl?: string; issueDescription?: string; category?: string }) => void;
  ticketData: any;
}

export function CommunityTicketPage({ onBack, onSubmit, ticketData }: CommunityTicketPageProps) {
  const [showInput, setShowInput] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<ZohoDeskTicket | null>(null);
  const [generatedAnswer, setGeneratedAnswer] = useState<string>('');
  const [draftContent, setDraftContent] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [isFetched, setIsFetched] = useState(false);
  const [zohoDeskTickets, setZohoDeskTickets] = useState<ZohoDeskTicket[]>([]);
  const [showTicketsList, setShowTicketsList] = useState(false);

  const handleFetchTickets = async () => {
    setIsLoadingTickets(true);
    toast.info('Fetching tickets from Zoho Desk...');
    try {
      const res = await apiFetch('/api/zoho-desk/tickets', {
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.error === 'auth_required') {
          toast.error('Session expired — please sign in again.');
          window.location.href = '/api/auth/login';
          return;
        }
        throw new Error(err.details || err.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      const tickets: ZohoDeskTicket[] = (data.tickets || []).map((t: any) => ({
        id: t.id,
        ticketNumber: t.ticketNumber || t.id,
        subject: t.subject || 'No Subject',
        description: t.description || '',
        status: t.status || 'Open',
        priority: t.priority || 'Medium',
        category: t.category || t.departmentId || 'Support',
        createdDate: t.createdTime ? new Date(t.createdTime).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
        customerName: t.contact?.name || t.customerName || 'Customer',
        customerEmail: t.contact?.email || t.customerEmail || '',
      }));
      setZohoDeskTickets(tickets);
      setIsFetched(true);
      setShowTicketsList(true);
      setSelectedTicket(null);
      toast.success(`Fetched ${tickets.length} ticket${tickets.length !== 1 ? 's' : ''} from Zoho Desk`);
    } catch (err: any) {
      toast.error(`Failed to fetch tickets: ${err.message}`);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  const handleTicketClick = (ticket: ZohoDeskTicket) => {
    setSelectedTicket(ticket);
    setGeneratedAnswer('');
    setShowInput(false);
    setShowTicketsList(false);
    toast.info(`Loaded ticket: ${ticket.ticketNumber}`);
  };

  const handleGenerateAnswer = async (solution?: string) => {
    if (!selectedTicket) return;
    setIsGenerating(true);
    setGeneratedAnswer('');
    toast.info('Generating AI response...');
    try {
      const res = await apiFetch('/api/zoho-desk/bulk-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticketIds: [selectedTicket.id],
          developerNotes: solution?.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.error === 'auth_required') {
          toast.error('Session expired — please sign in again.');
          window.location.href = '/api/auth/login';
          return;
        }
        throw new Error(err.details || err.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      const result = data.results?.[0];
      if (!result?.success) throw new Error(result?.error || 'Generation failed');
      setGeneratedAnswer(result.generatedResponse);
      setDraftContent(result.draftContent || result.generatedResponse);
      toast.success('Response generated!');
    } catch (err: any) {
      toast.error(`Failed to generate: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = (data: { ticketUrl?: string; issueDescription?: string; category?: string }) => {
    onSubmit(data);
    setShowInput(false);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high':
        return 'bg-red-100 text-red-700';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700';
      case 'low':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* History Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        {/* Sidebar Header */}
        <div className="p-6 border-b border-gray-200">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back to Home</span>
          </button>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-600 to-red-600 rounded-lg flex items-center justify-center">
              <TicketCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Community Ticket</h2>
              <p className="text-xs text-gray-500">Generator</p>
            </div>
          </div>
          <button
            onClick={() => setShowInput(true)}
            className="w-full px-4 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Generate New Response
          </button>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-2 mb-4 px-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-medium text-gray-700">Recent History</h3>
          </div>
          <div className="space-y-2">
            {zohoDeskTickets.map((item) => (
              <div
                key={item.id}
                className="p-4 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors border border-gray-200"
                onClick={() => handleTicketClick(item)}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 mb-1 truncate">
                      {item.subject}
                    </h4>
                    <p className="text-xs text-gray-500 mb-2">{item.createdDate}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 bg-white px-2 py-1 rounded border border-gray-200">
                        {item.category}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${getPriorityColor(item.priority)}`}>
                        {item.priority}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {showInput ? (
          <div className="max-w-3xl mx-auto p-8">
            <CommunityTicketInput
              onSubmit={handleSubmit}
              onClose={() => {
                setShowInput(false);
              }}
            />
          </div>
        ) : showTicketsList && zohoDeskTickets.length > 0 ? (
          <div className="p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">Fetched Zoho Desk Tickets</h2>
              <p className="text-sm text-gray-600">Click on any ticket to generate a community response</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {zohoDeskTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => handleTicketClick(ticket)}
                  className="bg-white rounded-xl p-6 border border-gray-200 hover:border-orange-300 hover:shadow-lg transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                        <TicketCheck className="w-5 h-5 text-orange-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{ticket.ticketNumber}</h3>
                        <p className="text-xs text-gray-500">{ticket.createdDate}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded ${getPriorityColor(ticket.priority)}`}>
                        {ticket.priority}
                      </span>
                    </div>
                  </div>
                  <h4 className="font-medium text-gray-900 mb-2">{ticket.subject}</h4>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{ticket.description}</p>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full">
                      {ticket.category}
                    </span>
                    <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full">
                      {ticket.status}
                    </span>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{ticket.customerName}</span>
                      <span>•</span>
                      <span>{ticket.customerEmail}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : selectedTicket ? (
          <div className="max-w-4xl mx-auto p-8">
            <ZohoDeskTicketViewer
              ticket={selectedTicket}
              generatedAnswer={generatedAnswer}
              isGenerating={isGenerating}
              onGenerateAnswer={handleGenerateAnswer}
              onSaveAsDraft={async () => {
                if (!generatedAnswer) return;
                try {
                  const res = await apiFetch(`/api/zoho-desk/tickets/${selectedTicket.id}/draft`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ content: draftContent }),
                  });
                  if (!res.ok) throw new Error((await res.json()).details || 'Draft save failed');
                  toast.success('Draft saved in Zoho Desk! (not sent to customer)');
                } catch (err: any) {
                  toast.error(`Failed to save draft: ${err.message}`);
                }
              }}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <TicketCheck className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Ticket Selected
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Select a ticket from history or create a new one
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setShowInput(true)}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create New
                </button>
                <button
                  onClick={handleFetchTickets}
                  disabled={isLoadingTickets}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingTickets ? 'animate-spin' : ''}`} />
                  {isLoadingTickets ? 'Fetching...' : 'Fetch Zoho Tickets'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}