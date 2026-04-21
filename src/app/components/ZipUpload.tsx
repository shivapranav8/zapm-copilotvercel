import React, { useState, useRef } from 'react';
import { X, Upload, FileArchive, Check } from 'lucide-react';

interface ZipUploadProps {
  onUpload: (file: File) => void;
  onClose: () => void;
}

export function ZipUpload({ onUpload, onClose }: ZipUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.zip') || file.name.endsWith('.docx')) {
        setSelectedFile(file);
      } else {
        alert('Please upload a .zip (React folder) or .docx (MRD document)');
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.name.endsWith('.zip') || file.name.endsWith('.docx')) {
        setSelectedFile(file);
      } else {
        alert('Please upload a .zip (React folder) or .docx (MRD document)');
      }
    }
  };

  const handleUploadClick = () => {
    if (selectedFile) {
      onUpload(selectedFile);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
            <FileArchive className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl text-gray-900">Upload File</h2>
            <p className="text-sm text-gray-500">ZIP (React folder) or DOCX (MRD) to generate PRD</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Upload Area */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive
              ? 'border-indigo-600 bg-indigo-50'
              : 'border-gray-300 hover:border-indigo-400'
          }`}
        >
          {selectedFile ? (
            <div className="space-y-4">
              <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <p className="text-gray-900 font-medium">{selectedFile.name}</p>
                <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
              </div>
              <button
                onClick={() => setSelectedFile(null)}
                className="text-sm text-indigo-600 hover:text-indigo-700"
              >
                Choose a different file
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-16 h-16 mx-auto bg-indigo-100 rounded-full flex items-center justify-center">
                <Upload className="w-8 h-8 text-indigo-600" />
              </div>
              <div>
                <p className="text-gray-900 mb-1">
                  Drag and drop your ZIP file here, or
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  browse to upload
                </button>
              </div>
              <p className="text-xs text-gray-500">.zip (React folder) or .docx (MRD document)</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.docx"
            onChange={handleChange}
            className="hidden"
          />
        </div>

        {/* Info */}
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <strong>ZIP (React folder):</strong> Upload a zipped React/TypeScript project — the AI reverse-engineers every feature, interaction, and edge case into a full PRD.<br />
            <strong>DOCX (MRD):</strong> Upload a Marketing Requirements Document — the AI expands it into a granular functional PRD.<br />
            <strong>Output:</strong> A <code>.zip</code> file containing both an <strong>Excel (.xlsx)</strong> and an <strong>HTML (.html)</strong> version of the PRD.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg">
        <button
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleUploadClick}
          disabled={!selectedFile}
          className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Generate PRD
        </button>
      </div>
    </div>
  );
}