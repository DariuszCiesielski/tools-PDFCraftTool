'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ocrPDF, type OCROptions, type OCRLanguage, OCR_LANGUAGE_NAMES } from '@/lib/pdf/processors/ocr';
import type { UploadedFile, ProcessOutput } from '@/types/pdf';

/**
 * Generate a unique ID for files
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface OCRPDFToolProps {
  /** Custom class name */
  className?: string;
  /** Optional initial file to use (skips upload step when prefilled from Studio) */
  initialFile?: File;
  /** Hide the FileUploader UI when prefilled */
  hideUploader?: boolean;
  /** Callback fired with the resulting blob and original file when conversion succeeds */
  onComplete?: (blob: Blob, originalFile: File) => void;
}

/**
 * OCRPDFTool Component
 * Requirements: 5.1, 5.2
 * 
 * Performs OCR on PDF pages to extract text.
 */
export function OCRPDFTool({ className = '', initialFile, hideUploader, onComplete }: OCRPDFToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');

  // State
  const [file, setFile] = useState<UploadedFile | null>(
    initialFile
      ? { id: generateId(), file: initialFile, status: 'pending' as const }
      : null,
  );

  useEffect(() => {
    if (initialFile) {
      setFile({ id: generateId(), file: initialFile, status: 'pending' as const });
    }
  }, [initialFile]);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Options state
  const [languages, setLanguages] = useState<OCRLanguage[]>(['eng']);
  const [outputFormat, setOutputFormat] = useState<OCROptions['outputFormat']>('text');
  const [scale, setScale] = useState(2);
  const [pageRange, setPageRange] = useState('');
  
  // Ref for cancellation
  const cancelledRef = useRef(false);

  /**
   * Handle file selected from uploader
   */
  const handleFilesSelected = useCallback((newFiles: File[]) => {
    if (newFiles.length > 0) {
      const uploadedFile: UploadedFile = {
        id: generateId(),
        file: newFiles[0],
        status: 'pending' as const,
      };
      setFile(uploadedFile);
      setError(null);
      setResult(null);
      setTextPreview(null);
    }
  }, []);

  /**
   * Handle file upload error
   */
  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  /**
   * Remove the file
   */
  const handleRemoveFile = useCallback(() => {
    setFile(null);
    setResult(null);
    setTextPreview(null);
    setError(null);
    setStatus('idle');
    setProgress(0);
  }, []);

  /**
   * Toggle language selection
   */
  const toggleLanguage = useCallback((lang: OCRLanguage) => {
    setLanguages(prev => {
      if (prev.includes(lang)) {
        // Don't allow removing the last language
        if (prev.length === 1) return prev;
        return prev.filter(l => l !== lang);
      }
      return [...prev, lang];
    });
  }, []);

  /**
   * Parse page range string to array of page numbers
   */
  const parsePageRange = (rangeStr: string): number[] => {
    if (!rangeStr.trim()) return [];
    
    const pages: number[] = [];
    const parts = rangeStr.split(',');
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map(s => parseInt(s.trim(), 10));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            if (!pages.includes(i)) pages.push(i);
          }
        }
      } else {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && !pages.includes(num)) {
          pages.push(num);
        }
      }
    }
    
    return pages.sort((a, b) => a - b);
  };

  /**
   * Handle OCR operation
   */
  const handleOCR = useCallback(async () => {
    if (!file) {
      setError('Please upload a PDF file.');
      return;
    }

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);
    setTextPreview(null);

    const options: Partial<OCROptions> = {
      languages,
      outputFormat,
      scale,
      pages: parsePageRange(pageRange),
    };

    try {
      const output: ProcessOutput = await ocrPDF(
        file.file,
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
        const blob = output.result as Blob;
        setResult(blob);

        // Read text for preview if text output
        if (outputFormat === 'text') {
          const text = await blob.text();
          setTextPreview(text.length > 5000 ? text.substring(0, 5000) + '\n...(truncated)' : text);
        }

        // Only replace currentFile in Studio when output is searchable PDF (same MIME type)
        if (onComplete && outputFormat === 'searchable-pdf') {
          onComplete(blob, file.file);
        }

        setStatus('complete');
      } else {
        setError(output.error?.message || 'Failed to perform OCR on PDF.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setStatus('error');
      }
    }
  }, [file, languages, outputFormat, scale, pageRange, onComplete]);

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
  const canProcess = file && !isProcessing;

  const availableLanguages: OCRLanguage[] = ['eng', 'chi_sim', 'chi_tra', 'jpn', 'kor', 'spa', 'fra', 'deu', 'por', 'ara'];

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {/* File Upload Area */}
      {!hideUploader && (
        <FileUploader
          accept={['application/pdf', '.pdf']}
          multiple={false}
          maxFiles={1}
          onFilesSelected={handleFilesSelected}
          onError={handleUploadError}
          disabled={isProcessing}
          label={tTools('ocrPdf.uploadLabel') || 'Upload PDF'}
          description={tTools('ocrPdf.uploadDescription') || 'Drag and drop a scanned PDF file here, or click to browse.'}
        />
      )}

      {/* Error Message */}
      {error && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700"
          role="alert"
        >
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* File Info */}
      {file && (
        <Card variant="outlined" size="lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[hsl(var(--color-primary)/0.1)] flex items-center justify-center">
                <svg className="w-5 h-5 text-[hsl(var(--color-primary))]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-[hsl(var(--color-foreground))]">{file.file.name}</p>
                <p className="text-sm text-[hsl(var(--color-muted-foreground))]">{formatSize(file.file.size)}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveFile}
              disabled={isProcessing}
            >
              {t('buttons.remove') || 'Remove'}
            </Button>
          </div>
        </Card>
      )}

      {/* Options Panel */}
      {file && (
        <Card variant="outlined">
          <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
            {tTools('ocrPdf.optionsTitle') || 'OCR Options'}
          </h3>
          
          <div className="space-y-4">
            {/* Language Selection */}
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                {tTools('ocrPdf.languages') || 'Languages'}
              </label>
              <div className="flex flex-wrap gap-2">
                {availableLanguages.map(lang => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleLanguage(lang)}
                    disabled={isProcessing}
                    className={`
                      px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                      ${languages.includes(lang)
                        ? 'bg-[hsl(var(--color-primary))] text-[hsl(var(--color-primary-foreground))]'
                        : 'bg-[hsl(var(--color-muted)/0.5)] text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))]'
                      }
                      disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                  >
                    {OCR_LANGUAGE_NAMES[lang]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-2">
                {tTools('ocrPdf.languagesHint') || 'Select one or more languages for better accuracy'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Output Format */}
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                  {tTools('ocrPdf.outputFormat') || 'Output Format'}
                </label>
                <select
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value as OCROptions['outputFormat'])}
                  disabled={isProcessing}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                >
                  <option value="text">{tTools('ocrPdf.formatText') || 'Text File (.txt)'}</option>
                  <option value="searchable-pdf">{tTools('ocrPdf.formatPdf') || 'Searchable PDF'}</option>
                </select>
              </div>

              {/* Quality/Scale */}
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                  {tTools('ocrPdf.quality') || 'Quality'}
                </label>
                <select
                  value={scale}
                  onChange={(e) => setScale(parseFloat(e.target.value))}
                  disabled={isProcessing}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                >
                  <option value="1">{tTools('ocrPdf.qualityLow') || 'Low (Faster)'}</option>
                  <option value="2">{tTools('ocrPdf.qualityMedium') || 'Medium (Recommended)'}</option>
                  <option value="3">{tTools('ocrPdf.qualityHigh') || 'High (Slower)'}</option>
                </select>
              </div>

              {/* Page Range */}
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                  {tTools('ocrPdf.pageRange') || 'Page Range'}
                </label>
                <input
                  type="text"
                  value={pageRange}
                  onChange={(e) => setPageRange(e.target.value)}
                  placeholder={tTools('ocrPdf.pageRangePlaceholder') || 'e.g., 1-3, 5, 7'}
                  disabled={isProcessing}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                />
                <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-1">
                  {tTools('ocrPdf.pageRangeHint') || 'Leave empty for all pages'}
                </p>
              </div>
            </div>
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
          onClick={handleOCR}
          disabled={!canProcess}
          loading={isProcessing}
        >
          {isProcessing 
            ? (t('status.processing') || 'Processing...') 
            : (tTools('ocrPdf.processButton') || 'Start OCR')
          }
        </Button>

        {result && (
          <DownloadButton
            file={result}
            filename={`${file?.file.name.replace(/\.pdf$/i, '')}_ocr.${outputFormat === 'text' ? 'txt' : 'pdf'}`}
            variant="secondary"
            size="lg"
            showFileSize
          />
        )}
      </div>

      {/* Text Preview */}
      {textPreview && (
        <Card variant="outlined" size="lg">
          <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
            {tTools('ocrPdf.previewTitle') || 'Extracted Text Preview'}
          </h3>
          <pre className="p-4 bg-[hsl(var(--color-muted)/0.3)] rounded-[var(--radius-md)] overflow-auto max-h-96 text-sm font-mono text-[hsl(var(--color-foreground))] whitespace-pre-wrap">
            {textPreview}
          </pre>
        </Card>
      )}

      {/* Success Message */}
      {status === 'complete' && result && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
          role="status"
        >
          <p className="text-sm font-medium">
            {tTools('ocrPdf.successMessage') || 'OCR completed successfully! Click the download button to save your file.'}
          </p>
        </div>
      )}

      {/* Info Note */}
      <Card variant="outlined" className="bg-blue-50 border-blue-200">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <div className="text-sm text-blue-700">
            <p className="font-medium mb-1">{tTools('ocrPdf.infoTitle') || 'About OCR'}</p>
            <p>{tTools('ocrPdf.infoText') || 'OCR (Optical Character Recognition) extracts text from scanned documents and images. For best results, use high-quality scans and select the correct language(s).'}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default OCRPDFTool;
