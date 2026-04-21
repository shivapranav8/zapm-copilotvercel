import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Clock, Code, FileText, Loader2, CheckCircle } from 'lucide-react';
import { ZipUpload } from './ZipUpload';

interface PRDGeneratorPageProps {
  onBack: () => void;
  onUpload: (file: File) => void;
  prdData: any;
  isGenerating?: boolean;
}

interface HistoryItem {
  id: number;
  title: string;
  date: string;
  filename: string;
}

const STORAGE_KEY = 'zapm-prd-history';

function loadHistory(): HistoryItem[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveHistory(items: HistoryItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 20)));
}

const PRD_MESSAGES = [
  'Parsing your file...',
  'Identifying features and use cases...',
  'Analyzing feature completeness, user flows, and edge cases...',
  'Writing use case descriptions...',
  'Structuring PRD sheets...',
  'Almost done...',
];

function PRDLoadingState() {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setMsgIndex(i => (i + 1) % PRD_MESSAGES.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-full max-w-sm px-8 text-center">
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-full flex items-center justify-center shadow-lg">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <svg className="absolute inset-0 w-16 h-16 animate-spin" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="30" fill="none" stroke="#6366f1" strokeWidth="3" strokeDasharray="40 150" strokeLinecap="round" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">🤖 Generating PRD...</h3>
        <p className="text-sm text-gray-500 min-h-[20px] transition-all duration-500">{PRD_MESSAGES[msgIndex]}</p>
      </div>
    </div>
  );
}

export function PRDGeneratorPage({ onBack, onUpload, prdData, isGenerating }: PRDGeneratorPageProps) {
  const [showUpload, setShowUpload] = useState(!prdData);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);

  // When a new PRD is generated (prdData changes to non-null), save it to history
  useEffect(() => {
    if (!prdData?.productName) return;
    const filename: string = prdData.productName;
    const title = filename
      .replace(/^PRD_/, '')
      .replace(/\.xlsx$/i, '')
      .replace(/_/g, ' ')
      .trim();

    setHistory(prev => {
      // Avoid duplicates within the same session
      if (prev.length > 0 && prev[0].filename === filename) return prev;
      const newItem: HistoryItem = {
        id: Date.now(),
        title,
        filename,
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      };
      const updated = [newItem, ...prev];
      saveHistory(updated);
      return updated;
    });
  }, [prdData]);

  const handleUpload = (file: File) => {
    onUpload(file);
    setShowUpload(false);
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
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
              <Code className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">PRD Generator</h2>
              <p className="text-xs text-gray-500">From ZIP or DOCX</p>
            </div>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="w-full px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Upload ZIP or DOCX
          </button>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-2 mb-4 px-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-medium text-gray-700">Recent History</h3>
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-gray-400 px-2">No PRDs generated yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-gray-900 mb-1 truncate">
                        {item.title}
                      </h4>
                      <p className="text-xs text-gray-500">{item.date}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {isGenerating ? (
          <PRDLoadingState />
        ) : showUpload ? (
          <div className="max-w-3xl mx-auto p-8">
            <ZipUpload
              onUpload={handleUpload}
              onClose={() => {
                setShowUpload(false);
                if (!prdData) {
                  onBack();
                }
              }}
            />
          </div>
        ) : prdData ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">PRD Generated!</h3>
              <p className="text-sm text-gray-500 mb-6">
                Your PRD has been downloaded automatically.<br />
                Check your Downloads folder for the .zip file containing the <strong>.xlsx</strong> and <strong>.html</strong> versions.
              </p>
              <button
                onClick={() => setShowUpload(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 mx-auto"
              >
                <Plus className="w-4 h-4" />
                Generate Another PRD
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Code className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No PRD Selected
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Upload a ZIP file (React folder) or DOCX (MRD)
              </p>
              <button
                onClick={() => setShowUpload(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Upload File
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
