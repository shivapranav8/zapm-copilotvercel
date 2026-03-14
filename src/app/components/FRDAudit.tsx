import React, { useState } from 'react';
import { Download, Share2, AlertTriangle, CheckCircle2, Info, XCircle, Edit2, Save, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export interface AuditIssue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  location: string;
  issue: string;
  detail: string;
  suggestion: string;
  status: 'open' | 'addressed' | 'dismissed';
}

export interface AuditData {
  fileName: string;
  analyzedDate: string;
  totalSheets: number;
  totalUseCases: number;
  score: number;
  issues: AuditIssue[];
  summary: {
    critical: number;
    warnings: number;
    info: number;
  };
}

interface FRDAuditProps {
  data: AuditData;
  onUpdate: (data: AuditData) => void;
  onShare: () => void;
  onDownload: () => void;
}

export function FRDAudit({ data, onUpdate, onShare }: FRDAuditProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [editingIssue, setEditingIssue] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleDownload = () => {
    const severityIcon = (s: string) => s === 'critical' ? '🔴' : s === 'warning' ? '🟡' : 'ℹ️';
    const lines: string[] = [
      `# FRD Audit Report: ${data.fileName}`,
      ``,
      `**Analyzed on:** ${data.analyzedDate}  `,
      `**Sheets:** ${data.totalSheets} | **Use Cases:** ${data.totalUseCases}  `,
      `**Quality Score:** ${data.score}%`,
      ``,
      `## Summary`,
      ``,
      `| Severity | Count |`,
      `|----------|-------|`,
      `| 🔴 Critical | ${data.summary.critical} |`,
      `| 🟡 Warning | ${data.summary.warnings} |`,
      `| ℹ️ Info | ${data.summary.info} |`,
      ``,
      `---`,
      ``,
      `## Issues`,
      ``,
    ];

    data.issues.forEach((issue, idx) => {
      lines.push(`### ${idx + 1}. ${severityIcon(issue.severity)} \`${issue.id}\` — ${issue.issue}`);
      lines.push(``);
      lines.push(`**Category:** ${issue.category}  `);
      lines.push(`**Location:** ${issue.location}  `);
      lines.push(`**Severity:** ${issue.severity}  `);
      lines.push(`**Status:** ${issue.status}`);
      lines.push(``);
      lines.push(`**Detail:**  `);
      lines.push(issue.detail);
      lines.push(``);
      lines.push(`**Suggestion:**  `);
      lines.push(issue.suggestion);
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FRD-Audit-${data.fileName.replace(/\.[^/.]+$/, '')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Audit report downloaded as Markdown');
  };

  const categories = ['all', ...Array.from(new Set(data.issues.map(i => i.category)))];

  const filteredIssues = data.issues.filter(issue => {
    if (selectedCategory !== 'all' && issue.category !== selectedCategory) return false;
    if (selectedSeverity !== 'all' && issue.severity !== selectedSeverity) return false;
    return true;
  });

  const updateIssueStatus = (id: string, status: AuditIssue['status']) => {
    const updatedIssues = data.issues.map(issue =>
      issue.id === id ? { ...issue, status } : issue
    );
    onUpdate({ ...data, issues: updatedIssues });
    toast.success(`Issue marked as ${status}`);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'warning':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'info':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="w-5 h-5" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5" />;
      case 'info':
        return <Info className="w-5 h-5" />;
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-orange-600 bg-orange-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="bg-white rounded-lg shadow-md">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex-1">
            <h2 className="text-2xl text-gray-900">{data.fileName}</h2>
            <p className="text-sm text-gray-500 mt-1">
              Analyzed on {data.analyzedDate} • {data.totalSheets} sheets • {data.totalUseCases} use cases
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Report
            </button>
            {/* <button
              onClick={onShare}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              Share via Cliq
            </button> */}
          </div>
        </div>

        {/* Score Card */}
        <div className="flex items-center gap-6 mt-4">
          <div className={`px-6 py-3 rounded-lg border-2 ${getScoreColor(data.score)}`}>
            <div className="text-3xl font-bold">{data.score}%</div>
            <div className="text-xs font-medium mt-1">Quality Score</div>
          </div>
          <div className="flex gap-4">
            <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium text-red-900">
                  {data.summary.critical} Critical
                </span>
              </div>
            </div>
            <div className="px-4 py-2 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-medium text-orange-900">
                  {data.summary.warnings} Warnings
                </span>
              </div>
            </div>
            <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">
                  {data.summary.info} Info
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b border-gray-200 px-6 py-4 bg-gray-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'All Categories' : cat}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Severity:</span>
            <div className="flex gap-1 bg-white rounded-md border border-gray-300 p-1">
              {['all', 'critical', 'warning', 'info'].map((severity) => (
                <button
                  key={severity}
                  onClick={() => setSelectedSeverity(severity)}
                  className={`px-3 py-1 rounded text-xs transition-colors ${
                    selectedSeverity === severity
                      ? 'bg-green-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {severity.charAt(0).toUpperCase() + severity.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="ml-auto text-sm text-gray-500">
            Showing {filteredIssues.length} of {data.issues.length} issues
          </div>
        </div>
      </div>

      {/* Issues List */}
      <div className="p-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
        {filteredIssues.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No issues found</h3>
            <p className="text-sm text-gray-500">
              {selectedCategory !== 'all' || selectedSeverity !== 'all'
                ? 'Try adjusting your filters'
                : 'Your FRD looks great!'}
            </p>
          </div>
        ) : (
          filteredIssues.map((issue) => (
            <div
              key={issue.id}
              className={`border rounded-lg p-5 transition-all ${
                issue.status === 'addressed'
                  ? 'border-green-200 bg-green-50/50'
                  : issue.status === 'dismissed'
                  ? 'border-gray-200 bg-gray-50/50 opacity-60'
                  : 'border-gray-200 bg-white hover:shadow-md'
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Severity Icon */}
                <div className={`px-3 py-2 rounded-lg border ${getSeverityColor(issue.severity)}`}>
                  {getSeverityIcon(issue.severity)}
                </div>

                {/* Issue Content */}
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-gray-500 uppercase">
                          {issue.category}
                        </span>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-500">{issue.location}</span>
                      </div>
                      <h4 className="text-base font-medium text-gray-900">{issue.issue}</h4>
                      {issue.detail && (
                        <p className="text-sm text-gray-600 mt-1 leading-relaxed">{issue.detail}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={issue.status}
                        onChange={(e) => updateIssueStatus(issue.id, e.target.value as AuditIssue['status'])}
                        className={`px-3 py-1.5 border rounded text-xs font-medium transition-colors ${
                          issue.status === 'addressed'
                            ? 'bg-green-50 border-green-300 text-green-700'
                            : issue.status === 'dismissed'
                            ? 'bg-gray-100 border-gray-300 text-gray-600'
                            : 'bg-white border-gray-300 text-gray-700'
                        }`}
                      >
                        <option value="open">Open</option>
                        <option value="addressed">Addressed</option>
                        <option value="dismissed">Dismissed</option>
                      </select>
                    </div>
                  </div>

                  {/* Suggestion */}
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mt-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-blue-900 mb-1">Suggestion:</p>
                        <p className="text-sm text-blue-800">{issue.suggestion}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}