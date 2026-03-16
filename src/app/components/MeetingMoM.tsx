import { apiFetch } from '../../utils/apiFetch';
import React, { useState } from 'react';
import { Download, Share2, CheckCircle2, Clock, Users, Edit2, Save, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export interface ActionItem {
  id: string;
  task: string;
  assignee: string;
  dueDate: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Pending' | 'In Progress' | 'Completed';
}

export interface MeetingMoMData {
  meetingTitle: string;
  date: string;
  duration: string;
  attendees: string[];
  summary: string;
  keyDiscussions: string[];
  decisions: string[];
  actionItems: ActionItem[];
  nextMeeting?: string;
  transcript?: string;
}

interface MeetingMoMProps {
  data: MeetingMoMData & { id?: string };
  onUpdate: (data: MeetingMoMData) => void;
  onShare: () => void;
  onDownload: () => void;
}

type Verbosity = 'brief' | 'standard' | 'detailed';

export function MeetingMoM({ data, onUpdate, onShare, onDownload }: MeetingMoMProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [verbosity, setVerbosity] = useState<Verbosity>('standard');
  const [isRegenerating, setIsRegenerating] = useState<string | null>(null);

  const startEdit = (field: string, value: string) => {
    setEditingField(field);
    setEditValue(value);
  };

  const saveEdit = (field: string) => {
    if (field === 'summary') {
      onUpdate({ ...data, summary: editValue });
    }
    setEditingField(null);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const updateActionItem = (id: string, updates: Partial<ActionItem>) => {
    const updatedItems = data.actionItems.map(item =>
      item.id === id ? { ...item, ...updates } : item
    );
    onUpdate({ ...data, actionItems: updatedItems });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High': return 'text-red-600 bg-red-50 border-red-200';
      case 'Medium': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'Low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed': return 'text-green-600 bg-green-50';
      case 'In Progress': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const regenerateSection = async (section: string) => {
    setIsRegenerating(section);
    toast.info(`Regenerating ${section === 'discussion' ? 'Key Discussions' : 'Actions & Decisions'} from transcript...`);
    try {
      if (!data.transcript) {
        toast.error('Transcript not available — please regenerate the full MoM first.');
        setIsRegenerating(null);
        return;
      }
      const res = await apiFetch('/api/meeting-mom/regenerate-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ section, verbosity, transcript: data.transcript, meetingTitle: data.meetingTitle, attendees: data.attendees }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details || err.error || `Server error ${res.status}`);
      }
      const updatedFields = await res.json();
      onUpdate({ ...data, ...updatedFields });
      toast.success(`${section === 'discussion' ? 'Key Discussions' : 'Actions & Decisions'} regenerated!`);
    } catch (err: any) {
      toast.error(`Regenerate failed: ${err.message}`);
    } finally {
      setIsRegenerating(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-8 py-6 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">{data.meetingTitle}</h2>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>{data.date}</span>
              </div>
              <span>·</span>
              <span>{data.duration}</span>
              <span>·</span>
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                <span>{data.attendees.length} attendees</span>
              </div>
            </div>
            {data.attendees.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {data.attendees.map((attendee, i) => (
                  <span key={i} className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                    {attendee}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Verbosity */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {(['brief', 'standard', 'detailed'] as Verbosity[]).map((level) => (
                <button
                  key={level}
                  onClick={() => setVerbosity(level)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${verbosity === level
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
              ))}
            </div>
            <button
              onClick={onDownload}
              className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 text-sm"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={onShare}
              className="px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-1.5 text-sm"
            >
              <Share2 className="w-4 h-4" />
              Share via Cliq
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6 space-y-8">

        {/* Summary */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">Summary</h3>
            {editingField !== 'summary' && (
              <button
                onClick={() => startEdit('summary', data.summary)}
                className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
              >
                <Edit2 className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
          {editingField === 'summary' ? (
            <div className="space-y-2">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px] text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => saveEdit('summary')}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors flex items-center gap-1"
                >
                  <Save className="w-3 h-3" /> Save
                </button>
                <button
                  onClick={cancelEdit}
                  className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50 transition-colors flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-gray-700 leading-relaxed text-sm">{data.summary}</p>
          )}
        </div>

        {/* Key Discussions */}
        <div className="border-t border-gray-100 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Key Discussions</h3>
            <button
              onClick={() => regenerateSection('discussion')}
              disabled={isRegenerating === 'discussion'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${isRegenerating === 'discussion'
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating === 'discussion' ? 'animate-spin' : ''}`} />
              Regenerate
            </button>
          </div>
          <ul className="space-y-2.5">
            {data.keyDiscussions.map((discussion, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                <span className="text-gray-700 text-sm leading-relaxed">{discussion}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Decisions */}
        <div className="border-t border-gray-100 pt-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Decisions Made</h3>
          <ul className="space-y-2.5">
            {data.decisions.map((decision, index) => (
              <li key={index} className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 text-sm leading-relaxed">{decision}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Action Items */}
        <div className="border-t border-gray-100 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">
              Action Items <span className="text-gray-400 font-normal">({data.actionItems.length})</span>
            </h3>
            <button
              onClick={() => regenerateSection('actions')}
              disabled={isRegenerating === 'actions'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${isRegenerating === 'actions'
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating === 'actions' ? 'animate-spin' : ''}`} />
              Regenerate
            </button>
          </div>
          <div className="space-y-3">
            {data.actionItems.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4 p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`px-2 py-0.5 rounded text-xs border font-medium ${getPriorityColor(item.priority)}`}>
                      {item.priority}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="text-gray-900 text-sm mb-2">{item.task}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      <span>{item.assignee}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Due {item.dueDate}</span>
                    </div>
                  </div>
                </div>
                <select
                  value={item.status}
                  onChange={(e) => updateActionItem(item.id, { status: e.target.value as ActionItem['status'] })}
                  className="px-2.5 py-1.5 border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent flex-shrink-0"
                >
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Next Meeting */}
        {data.nextMeeting && (
          <div className="border-t border-gray-100 pt-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Next Meeting</h3>
            <p className="text-gray-700 text-sm">{data.nextMeeting}</p>
          </div>
        )}
      </div>
    </div>
  );
}
