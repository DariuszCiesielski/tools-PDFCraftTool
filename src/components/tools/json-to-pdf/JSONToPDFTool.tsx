'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { jsonToPDF, type JSONPageSizeType, type JSONToPDFOptions } from '@/lib/pdf/processors/json-to-pdf';
import type { UploadedFile, ProcessOutput } from '@/types/pdf';

/**
 * Generate a unique ID for files
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface JSONToPDFToolProps {
  /** Custom class name */
  className?: string;
}

/**
 * JSONToPDFTool Component
 * Requirements: 5.1, 5.2
 * 
 * Converts JSON files to PDF with formatted output.
 */
export function JSONToPDFTool({ className = '' }: JSONToPDFToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');
  
  // State
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonPreview, setJsonPreview] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  
  // Options state
  const [pageSize, setPageSize] = useState<JSONPageSizeType>('A4');
  const [fontSize, setFontSize] = useState(10);
  const [indentSpaces, setIndentSpaces] = useState(2);
  const [prettyPrint, setPrettyPrint] = useState(true);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  
  // Ref for cancellation
  const cancelledRef = useRef(false);

  /**
   * Handle files selected from uploader
   */
  const handleFilesSelected = useCallback(async (newFiles: File[]) => {
    const uploadedFiles: UploadedFile[] = newFiles.map(file => ({
      id: generateId(),
      file,
      status: 'pending' as const,
    }));
    
    setFiles(prev => [...prev, ...uploadedFiles]);
    setError(null);
    setResult(null);
    setParseError(null);
    
    // Load and validate preview of first file
    if (newFiles.length > 0) {
      try {
        const text = await newFiles[0].text();
        const parsed = JSON.parse(text);
        const formatted = JSON.stringify(parsed, null, 2);
        setJsonPreview(formatted.slice(0, 3000) + (formatted.length > 3000 ? '\n...' : ''));
        setParseError(null);
      } catch (err) {
        setJsonPreview('');
        setParseError(err instanceof Error ? err.message : 'Invalid JSON');
      }
    }
  }, []);

  /**
   * Handle file upload error
   */
  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  /**
   * Remove a file from the list
   */
  const handleRemoveFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    setResult(null);
    setJsonPreview('');
    setParseError(null);
  }, []);

  /**
   * Clear all files
   */
  const handleClearAll = useCallback(() => {
    setFiles([]);
    setResult(null);
    setError(null);
    setStatus('idle');
    setProgress(0);
    setJsonPreview('');
    setParseError(null);
  }, []);

  /**
   * Handle convert operation
   */
  const handleConvert = useCallback(async () => {
    if (files.length < 1) {
      setError('Please add at least 1 JSON file.');
      return;
    }

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);

    const options: Partial<JSONToPDFOptions> = {
      pageSize,
      fontSize,
      indentSpaces,
      prettyPrint,
      showLineNumbers,
    };

    try {
      const output: ProcessOutput = await jsonToPDF(
        files.map(f => f.file),
        options,
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || '');
          }
        }
      );

      if (cancelledRef.current) {
        setStatus('idle');
        return;
      }

      if (output.success && output.result) {
        setResult(output.result as Blob);
        setStatus('complete');
      } else {
        setError(output.error?.message || 'Failed to convert JSON to PDF.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setStatus('error');
      }
    }
  }, [files, pageSize, fontSize, indentSpaces, prettyPrint, showLineNumbers]);

  /**
   * Handle cancel operation
   */
  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setStatus('idle');
    setProgress(0);
  }, []);

  /**
   * Format file size
   */
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isProcessing = status === 'processing' || status === 'uploading';
  const canConvert = files.length >= 1 && !isProcessing && !parseError;

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {/* File Upload Area */}
      <FileUploader
        accept={['application/json', '.json']}
        multiple
        maxFiles={10}
        onFilesSelected={handleFilesSelected}
        onError={handleUploadError}
        disabled={isProcessing}
        label={tTools('jsonToPdf.uploadLabel') || 'Upload JSON Files'}
        description={tTools('jsonToPdf.uploadDescription') || 'Drag and drop JSON files here, or click to browse.'}
      />

      {/* Error Message */}
      {error && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700"
          role="alert"
        >
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Parse Error */}
      {parseError && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-yellow-50 border border-yellow-200 text-yellow-700"
          role="alert"
        >
          <p className="text-sm font-medium">Invalid JSON</p>
          <p className="text-sm mt-1">{parseError}</p>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <Card variant="outlined" size="lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))]">
              {tTools('jsonToPdf.filesTitle') || 'JSON Files'} ({files.length})
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              disabled={isProcessing}
            >
              {t('buttons.clearAll') || 'Clear All'}
            </Button>
          </div>

          <ul className="space-y-2" role="list">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white"
              >
                {/* File Icon */}
                <div className="flex-shrink-0">
                  <svg className="w-8 h-8 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                    <path d="M14 2v6h6" fill="white" />
                    <text x="5" y="17" fontSize="4.5" fill="white" fontWeight="bold">JSON</text>
                  </svg>
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[hsl(var(--color-foreground))] truncate">
                    {file.file.name}
                  </p>
                  <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                    {formatSize(file.file.size)}
                  </p>
                </div>

                {/* Remove Button */}
                <button
                  type="button"
                  onClick={() => handleRemoveFile(file.id)}
                  disabled={isProcessing}
                  className="flex-shrink-0 p-1 rounded hover:bg-red-100 text-[hsl(var(--color-muted-foreground))] hover:text-red-600 disabled:opacity-30"
                  aria-label={`Remove ${file.file.name}`}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>

          {/* JSON Preview */}
          {jsonPreview && !parseError && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                {tTools('jsonToPdf.preview') || 'Preview'}
              </h4>
              <pre className="p-3 rounded-[var(--radius-md)] bg-[hsl(var(--color-muted)/0.3)] text-xs font-mono text-[hsl(var(--color-foreground))] overflow-auto max-h-64 whitespace-pre">
                {jsonPreview}
              </pre>
            </div>
          )}
        </Card>
      )}


      {/* Options Panel */}
      {files.length >= 1 && (
        <Card variant="outlined">
          <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
            {tTools('jsonToPdf.optionsTitle') || 'PDF Options'}
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Page Size */}
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                {tTools('jsonToPdf.pageSize') || 'Page Size'}
              </label>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value as JSONPageSizeType)}
                disabled={isProcessing}
                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
              >
                <option value="A4">A4</option>
                <option value="LETTER">Letter</option>
                <option value="LEGAL">Legal</option>
                <option value="A3">A3</option>
              </select>
            </div>

            {/* Font Size */}
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                {tTools('jsonToPdf.fontSize') || 'Font Size'}
              </label>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                disabled={isProcessing}
                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
              >
                <option value="8">8pt</option>
                <option value="9">9pt</option>
                <option value="10">10pt</option>
                <option value="11">11pt</option>
                <option value="12">12pt</option>
              </select>
            </div>

            {/* Indent Spaces */}
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                {tTools('jsonToPdf.indentSpaces') || 'Indentation'}
              </label>
              <select
                value={indentSpaces}
                onChange={(e) => setIndentSpaces(Number(e.target.value))}
                disabled={isProcessing}
                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
              >
                <option value="2">2 spaces</option>
                <option value="4">4 spaces</option>
                <option value="8">8 spaces (tab)</option>
              </select>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={prettyPrint}
                onChange={(e) => setPrettyPrint(e.target.checked)}
                disabled={isProcessing}
                className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
              />
              <span className="text-sm text-[hsl(var(--color-foreground))]">
                {tTools('jsonToPdf.prettyPrint') || 'Format JSON (pretty print)'}
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={showLineNumbers}
                onChange={(e) => setShowLineNumbers(e.target.checked)}
                disabled={isProcessing}
                className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
              />
              <span className="text-sm text-[hsl(var(--color-foreground))]">
                {tTools('jsonToPdf.showLineNumbers') || 'Show line numbers'}
              </span>
            </label>
          </div>
        </Card>
      )}

      {/* Processing Progress */}
      {isProcessing && (
        <ProcessingProgress
          progress={progress}
          status={status}
          message={progressMessage}
          onCancel={handleCancel}
          showPercentage
        />
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="primary"
          size="lg"
          onClick={handleConvert}
          disabled={!canConvert}
          loading={isProcessing}
        >
          {isProcessing 
            ? (t('status.processing') || 'Processing...') 
            : (tTools('jsonToPdf.convertButton') || 'Convert to PDF')
          }
        </Button>

        {result && (
          <DownloadButton
            file={result}
            filename={files.length === 1 ? `${files[0].file.name.replace(/\.[^/.]+$/, '')}.pdf` : `json_${files.length}_files.pdf`}
            variant="secondary"
            size="lg"
            showFileSize
          />
        )}
      </div>

      {/* Success Message */}
      {status === 'complete' && result && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
          role="status"
        >
          <p className="text-sm font-medium">
            {tTools('jsonToPdf.successMessage') || 'JSON converted to PDF successfully! Click the download button to save your file.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default JSONToPDFTool;
