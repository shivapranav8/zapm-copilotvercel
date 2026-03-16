import { apiFetch } from '../../utils/apiFetch';
import React, { useState } from 'react';
import { Link, Upload, X, Video, Calendar, RefreshCw, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface ZohoMeetingRecording {
  id: string;
  meetingId: string;
  meetingTitle: string;
  startTime: string;
  durationMs: number;
  recordingUrl: string;
  transcriptUrl: string;
  participants: number | null;
}

function formatDuration(ms: number): string {
  if (!ms) return '';
  const totalMins = Math.round(ms / 1000 / 60);
  if (totalMins < 60) return `${totalMins} min${totalMins !== 1 ? 's' : ''}`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatStartTime(raw: string): string {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw; // e.g. "Thu Dec 18, 17:00 IST" — show as-is
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch {
    return raw;
  }
}

interface MeetingInputProps {
  onSubmit: (data: { type: 'link' | 'video' | 'zoho'; value: string; title?: string; key?: string; transcriptUrl?: string }) => void;
  onClose: () => void;
}

export function MeetingInput({ onSubmit, onClose }: MeetingInputProps) {
  const [inputType, setInputType] = useState<'link' | 'video' | 'zoho'>('link');
  const [meetingLink, setMeetingLink] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingRecordings, setIsLoadingRecordings] = useState(false);
  const [zohoRecordings, setZohoRecordings] = useState<ZohoMeetingRecording[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<ZohoMeetingRecording | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (inputType === 'link' && meetingLink.trim()) {
      onSubmit({ type: 'link', value: meetingLink.trim() });
    } else if (inputType === 'video' && videoFile) {
      onSubmit({ type: 'video', value: videoFile.name });
    } else if (inputType === 'zoho' && selectedRecording) {
      onSubmit({ type: 'zoho', value: selectedRecording.recordingUrl, title: selectedRecording.meetingTitle, key: selectedRecording.id, transcriptUrl: selectedRecording.transcriptUrl });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      setVideoFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
    }
  };

  const isValid =
    inputType === 'link'
      ? meetingLink.trim() !== ''
      : inputType === 'video'
        ? videoFile !== null
        : selectedRecording !== null;

  const fetchZohoRecordings = async () => {
    setIsLoadingRecordings(true);
    toast.info('Fetching recordings from Zoho Meeting...');

    try {
      const res = await apiFetch('/api/zoho-meeting/recordings', {
        credentials: 'include', // sends session cookie so backend knows who you are
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details || err.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      const recordings: ZohoMeetingRecording[] = (data.recordings || []).map((r: any) => ({
        id: r.key || r.id || '',
        meetingId: r.key || '',
        meetingTitle: r.title || 'Untitled Meeting',
        startTime: r.startTime || '',
        durationMs: r.durationMs || 0,
        recordingUrl: r.downloadUrl || '',
        transcriptUrl: r.transcriptUrl || '',
        participants: typeof r.participants === 'number' ? r.participants : null,
      }));

      setZohoRecordings(recordings);
      setHasFetched(true);
      toast.success(recordings.length
        ? `Fetched ${recordings.length} recording${recordings.length > 1 ? 's' : ''}`
        : 'No recordings found in your Zoho Meeting account');
    } catch (err: any) {
      toast.error(`Could not fetch recordings: ${err.message}`);
    } finally {
      setIsLoadingRecordings(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-lg flex items-center justify-center">
            <Video className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl text-gray-900">New Meeting MoM</h2>
            <p className="text-sm text-gray-500">Add meeting link or upload recording</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-md transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Content */}
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Input Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Input Type
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setInputType('link')}
              className={`flex-1 p-4 border-2 rounded-lg transition-all ${inputType === 'link'
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-3">
                <Link className={`w-5 h-5 ${inputType === 'link' ? 'text-blue-600' : 'text-gray-400'}`} />
                <div className="text-left">
                  <div className={`font-medium ${inputType === 'link' ? 'text-blue-600' : 'text-gray-700'}`}>
                    Meeting Link
                  </div>
                  <div className="text-xs text-gray-500">Zoho Meeting link</div>
                </div>
              </div>
            </button>

            {/* <button
              type="button"
              onClick={() => setInputType('video')}
              className={`flex-1 p-4 border-2 rounded-lg transition-all ${inputType === 'video'
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-3">
                <Upload className={`w-5 h-5 ${inputType === 'video' ? 'text-blue-600' : 'text-gray-400'}`} />
                <div className="text-left">
                  <div className={`font-medium ${inputType === 'video' ? 'text-blue-600' : 'text-gray-700'}`}>
                    Video Upload
                  </div>
                  <div className="text-xs text-gray-500">MP4, MOV, AVI, etc.</div>
                </div>
              </div>
            </button> */}

            <button
              type="button"
              onClick={() => setInputType('zoho')}
              className={`flex-1 p-4 border-2 rounded-lg transition-all ${inputType === 'zoho'
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-3">
                <Video className={`w-5 h-5 ${inputType === 'zoho' ? 'text-blue-600' : 'text-gray-400'}`} />
                <div className="text-left">
                  <div className={`font-medium ${inputType === 'zoho' ? 'text-blue-600' : 'text-gray-700'}`}>
                    Zoho Recording
                  </div>
                  <div className="text-xs text-gray-500">Fetch from Zoho</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Meeting Link Input */}
        {inputType === 'link' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Meeting Link
            </label>
            <input
              type="url"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="https://meeting.zoho.in/meeting/..."
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-2">
              Paste your Zoho Meeting link here
            </p>
          </div>
        )}

        {/* Video Upload */}
        {inputType === 'video' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Video Recording
            </label>

            {!videoFile ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragging
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                  }`}
              >
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-sm text-gray-600 mb-2">
                  Drag and drop your video file here, or
                </p>
                <label className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer transition-colors">
                  Browse Files
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-gray-500 mt-3">
                  Supported formats: MP4, MOV, AVI, MKV (Max 500MB)
                </p>
              </div>
            ) : (
              <div className="border border-gray-300 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Video className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{videoFile.name}</div>
                    <div className="text-xs text-gray-500">
                      {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setVideoFile(null)}
                  className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Zoho Recording Selection */}
        {inputType === 'zoho' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Zoho Meeting Recordings
            </label>
            <button
              type="button"
              onClick={fetchZohoRecordings}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${isLoadingRecordings
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              disabled={isLoadingRecordings}
            >
              {isLoadingRecordings ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Video className="w-5 h-5" />
              )}
              <span>Fetch Recordings</span>
            </button>

            {hasFetched && zohoRecordings.length === 0 && (
              <p className="text-sm text-gray-500 mt-3">No recordings found</p>
            )}

            {zohoRecordings.length > 0 && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Recording ({zohoRecordings.length} available)
                </label>
                <div className="border border-gray-300 rounded-lg max-h-64 overflow-y-auto">
                  {zohoRecordings.map((recording) => (
                    <div
                      key={recording.id}
                      onClick={() => setSelectedRecording(recording)}
                      className={`p-4 border-b border-gray-200 last:border-b-0 cursor-pointer transition-colors ${selectedRecording?.id === recording.id
                          ? 'bg-blue-50 border-l-4 border-l-blue-600'
                          : 'hover:bg-gray-50'
                        }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className={`text-sm font-medium ${selectedRecording?.id === recording.id ? 'text-blue-900' : 'text-gray-900'
                            }`}>
                            {recording.meetingTitle}
                          </h4>
                          <div className="flex items-center gap-4 mt-2">
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Calendar className="w-3 h-3" />
                              <span>{formatStartTime(recording.startTime)}</span>
                            </div>
                            {recording.durationMs > 0 && (
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Clock className="w-3 h-3" />
                                <span>{formatDuration(recording.durationMs)}</span>
                              </div>
                            )}
                            {recording.participants !== null && recording.participants > 0 && (
                              <div className="text-xs text-gray-500">
                                {recording.participants} participants
                              </div>
                            )}
                          </div>
                        </div>
                        {selectedRecording?.id === recording.id && (
                          <div className="ml-3">
                            <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isValid}
            className={`flex-1 px-4 py-3 rounded-md transition-colors ${isValid
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
          >
            Generate MoM
          </button>
        </div>
      </form>
    </div>
  );
}