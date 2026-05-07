'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { rotatePDF } from '@/lib/pdf/processors/rotate';
import { configurePdfjsWorker } from '@/lib/pdf/loader';
import type { ProcessOutput } from '@/types/pdf';

export interface RotatePDFToolProps {
  /** Custom class name */
  className?: string;
  /** Pre-fill the tool with this file (e.g. from Studio Mode current file) */
  initialFile?: File;
  /** Hide the FileUploader UI (useful when initialFile is provided from outside) */
  hideUploader?: boolean;
  /** Callback fired with the result Blob when processing completes successfully */
  onComplete?: (result: Blob, originalFile: File) => void;
}

interface PagePreview {
  pageNumber: number;
  thumbnail?: string;
  rotation: number;
}

/**
 * RotatePDFTool Component
 * Requirements: 5.1, 5.2
 * 
 * Provides the UI for rotating PDF pages.
 */
export function RotatePDFTool({
  className = '',
  initialFile,
  hideUploader = false,
  onComplete,
}: RotatePDFToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');
  
  // State
  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Page previews and rotations
  const [pagePreviews, setPagePreviews] = useState<PagePreview[]>([]);
  const [isLoadingPreviews, setIsLoadingPreviews] = useState(false);
  
  // Ref for cancellation
  const cancelledRef = useRef(false);

  /**
   * Load PDF and generate page previews
   */
  const loadPdfPreviews = useCallback(async (pdfFile: File) => {
    setIsLoadingPreviews(true);
    setPagePreviews([]);
    
    try {
      const pdfjsLib = await import('pdfjs-dist');
      configurePdfjsWorker(pdfjsLib);
      
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      setTotalPages(pdf.numPages);
      
      // Generate thumbnails for each page
      const previews: PagePreview[] = [];
      const maxPreviewPages = Math.min(pdf.numPages, 50);
      
      for (let i = 1; i <= maxPreviewPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.15 });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          await page.render({
            canvasContext: context,
            viewport: viewport,
          }).promise;
          
          previews.push({
            pageNumber: i,
            thumbnail: canvas.toDataURL('image/jpeg', 0.6),
            rotation: 0,
          });
        }
      }
      
      // Add remaining pages without thumbnails
      for (let i = maxPreviewPages + 1; i <= pdf.numPages; i++) {
        previews.push({ pageNumber: i, rotation: 0 });
      }
      
      setPagePreviews(previews);
    } catch (err) {
      console.error('Failed to load PDF previews:', err);
      setError('Failed to load PDF preview. The file may be corrupted or encrypted.');
    } finally {
      setIsLoadingPreviews(false);
    }
  }, []);

  /**
   * Handle file selected from uploader
   */
  const handleFilesSelected = useCallback((files: File[]) => {
    if (files.length > 0) {
      const selectedFile = files[0];
      setFile(selectedFile);
      setError(null);
      setResult(null);
      loadPdfPreviews(selectedFile);
    }
  }, [loadPdfPreviews]);

  // Pre-fill from Studio Mode (initialFile prop) — runs once on mount.
  useEffect(() => {
    if (initialFile) {
      handleFilesSelected([initialFile]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Handle file upload error
   */
  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  /**
   * Clear file and reset state
   */
  const handleClearFile = useCallback(() => {
    setFile(null);
    setTotalPages(0);
    setPagePreviews([]);
    setResult(null);
    setError(null);
    setStatus('idle');
    setProgress(0);
  }, []);

  /**
   * Rotate a single page
   */
  const handleRotatePage = useCallback((pageNumber: number, angle: number) => {
    setPagePreviews(prev => prev.map(p => 
      p.pageNumber === pageNumber 
        ? { ...p, rotation: (p.rotation + angle + 360) % 360 }
        : p
    ));
    setResult(null);
  }, []);

  /**
   * Rotate all pages
   */
  const handleRotateAll = useCallback((angle: number) => {
    setPagePreviews(prev => prev.map(p => ({
      ...p,
      rotation: (p.rotation + angle + 360) % 360,
    })));
    setResult(null);
  }, []);

  /**
   * Reset all rotations
   */
  const handleResetAll = useCallback(() => {
    setPagePreviews(prev => prev.map(p => ({ ...p, rotation: 0 })));
    setResult(null);
  }, []);

  /**
   * Handle rotate operation
   */
  const handleRotate = useCallback(async () => {
    if (!file) {
      setError('Please upload a PDF file first.');
      return;
    }

    // Check if any pages have rotation
    const hasRotations = pagePreviews.some(p => p.rotation !== 0);
    if (!hasRotations) {
      setError('Please rotate at least one page before processing.');
      return;
    }

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);

    // Build rotations map
    const rotations: Record<number, number> = {};
    pagePreviews.forEach(p => {
      if (p.rotation !== 0) {
        rotations[p.pageNumber] = p.rotation;
      }
    });

    try {
      const output: ProcessOutput = await rotatePDF(
        file,
        { rotations },
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
        const resultBlob = output.result as Blob;
        setResult(resultBlob);
        setStatus('complete');
        onComplete?.(resultBlob, file);
      } else {
        setError(output.error?.message || 'Failed to rotate PDF.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setStatus('error');
      }
    }
  }, [file, pagePreviews]);

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
  const hasRotations = pagePreviews.some(p => p.rotation !== 0);
  const canRotate = file && totalPages > 0 && hasRotations && !isProcessing;
  const rotatedCount = pagePreviews.filter(p => p.rotation !== 0).length;

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {/* File Upload Area */}
      {!file && (
        <FileUploader
          accept={['application/pdf', '.pdf']}
          multiple={false}
          maxFiles={1}
          onFilesSelected={handleFilesSelected}
          onError={handleUploadError}
          disabled={isProcessing}
          label={tTools('rotatePdf.uploadLabel') || 'Upload PDF File'}
          description={tTools('rotatePdf.uploadDescription') || 'Drag and drop a PDF file here, or click to browse.'}
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
        <Card variant="outlined">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-10 h-10 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                <path d="M14 2v6h6" fill="white" />
                <text x="7" y="17" fontSize="6" fill="white" fontWeight="bold">PDF</text>
              </svg>
              <div>
                <p className="font-medium text-[hsl(var(--color-foreground))]">{file.name}</p>
                <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
                  {formatSize(file.size)} • {totalPages} {totalPages === 1 ? 'page' : 'pages'}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFile}
              disabled={isProcessing}
            >
              {t('buttons.remove') || 'Remove'}
            </Button>
          </div>
        </Card>
      )}

      {/* Rotation Controls */}
      {file && totalPages > 0 && (
        <Card variant="outlined" size="lg">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))]">
              {tTools('rotatePdf.rotateTitle') || 'Rotate Pages'}
              {rotatedCount > 0 && (
                <span className="ml-2 text-[hsl(var(--color-primary))]">
                  ({rotatedCount} page{rotatedCount !== 1 ? 's' : ''} rotated)
                </span>
              )}
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => handleRotateAll(-90)} disabled={isProcessing}>
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                {t('buttons.rotateAllLeft') || 'Rotate All Left'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleRotateAll(90)} disabled={isProcessing}>
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
                </svg>
                {t('buttons.rotateAllRight') || 'Rotate All Right'}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleResetAll} disabled={isProcessing || !hasRotations}>
                {t('buttons.reset') || 'Reset'}
              </Button>
            </div>
          </div>

          <p className="text-sm text-[hsl(var(--color-muted-foreground))] mb-4">
            {tTools('rotatePdf.hint') || 'Click the rotation buttons on each page to rotate individually, or use the buttons above to rotate all pages.'}
          </p>

          {isLoadingPreviews ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-[hsl(var(--color-primary))] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
                  {t('status.loading') || 'Loading previews...'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 max-h-[500px] overflow-y-auto p-1">
              {pagePreviews.map((preview) => (
                <div
                  key={preview.pageNumber}
                  className="relative flex flex-col items-center"
                >
                  <div 
                    className={`relative aspect-[3/4] w-full rounded-[var(--radius-md)] border-2 overflow-hidden bg-[hsl(var(--color-muted))] ${
                      preview.rotation !== 0 
                        ? 'border-[hsl(var(--color-primary))] ring-2 ring-[hsl(var(--color-primary)/0.3)]' 
                        : 'border-[hsl(var(--color-border))]'
                    }`}
                  >
                    <div 
                      className="w-full h-full flex items-center justify-center transition-transform duration-300"
                      style={{ transform: `rotate(${preview.rotation}deg)` }}
                    >
                      {preview.thumbnail ? (
                        <img
                          src={preview.thumbnail}
                          alt={`Page ${preview.pageNumber}`}
                          className="max-w-full max-h-full object-contain"
                        />
                      ) : (
                        <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
                          {preview.pageNumber}
                        </span>
                      )}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs py-0.5 text-center">
                      {preview.pageNumber}
                      {preview.rotation !== 0 && (
                        <span className="ml-1 text-[hsl(var(--color-primary))]">
                          ({preview.rotation}°)
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Per-page rotation controls */}
                  <div className="flex items-center gap-1 mt-2">
                    <button
                      type="button"
                      onClick={() => handleRotatePage(preview.pageNumber, -90)}
                      disabled={isProcessing}
                      className="w-7 h-7 flex items-center justify-center rounded bg-[hsl(var(--color-muted))] hover:bg-[hsl(var(--color-muted-foreground)/0.2)] text-[hsl(var(--color-foreground))] transition-colors disabled:opacity-50"
                      aria-label={`Rotate page ${preview.pageNumber} left`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRotatePage(preview.pageNumber, 90)}
                      disabled={isProcessing}
                      className="w-7 h-7 flex items-center justify-center rounded bg-[hsl(var(--color-muted))] hover:bg-[hsl(var(--color-muted-foreground)/0.2)] text-[hsl(var(--color-foreground))] transition-colors disabled:opacity-50"
                      aria-label={`Rotate page ${preview.pageNumber} right`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
      {file && (
        <div className="flex flex-wrap items-center gap-4">
          <Button
            variant="primary"
            size="lg"
            onClick={handleRotate}
            disabled={!canRotate}
            loading={isProcessing}
          >
            {isProcessing 
              ? (t('status.processing') || 'Processing...') 
              : (tTools('rotatePdf.rotateButton') || `Rotate ${rotatedCount} Page${rotatedCount !== 1 ? 's' : ''}`)
            }
          </Button>

          {result && (
            <DownloadButton
              file={result}
              filename={file.name.replace('.pdf', '_rotated.pdf')}
              variant="secondary"
              size="lg"
              showFileSize
            />
          )}
        </div>
      )}

      {/* Success Message */}
      {status === 'complete' && result && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
          role="status"
        >
          <p className="text-sm font-medium">
            {tTools('rotatePdf.successMessage') || 'PDF pages rotated successfully! Click the download button to save your file.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default RotatePDFTool;
