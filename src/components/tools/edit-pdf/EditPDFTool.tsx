'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export interface EditPDFToolProps {
  className?: string;
}

/**
 * EditPDFTool Component
 * 
 * Provides PDF editing capabilities using PDF.js viewer with annotation support.
 * Users can add text, draw, highlight, and add images to PDFs.
 * The PDF.js viewer has built-in save functionality (export button in toolbar).
 */
export function EditPDFTool({ className = '' }: EditPDFToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools.editPdf');
  
  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditorReady, setIsEditorReady] = useState(false);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleFilesSelected = useCallback((files: File[]) => {
    if (files.length > 0) {
      const selectedFile = files[0];
      setFile(selectedFile);
      setError(null);
      setPdfUrl(URL.createObjectURL(selectedFile));
    }
  }, []);

  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const handleIframeLoad = useCallback(() => {
    setTimeout(() => {
      setIsEditorReady(true);
      // Hide the save button in PDF.js viewer, keep only export
      // The save button is added by pdfjs-annotation-extension
      try {
        const iframe = iframeRef.current;
        if (iframe?.contentDocument) {
          const doc = iframe.contentDocument;
          // Hide native PDF.js download/save buttons
          const downloadBtn = doc.getElementById('download');
          const secondaryDownloadBtn = doc.getElementById('secondaryDownload');
          if (downloadBtn) downloadBtn.style.display = 'none';
          if (secondaryDownloadBtn) secondaryDownloadBtn.style.display = 'none';
          
          // Hide save button from CustomToolbar (pdfjs-annotation-extension)
          // The button has text "保存" (Save in Chinese) - exact match only
          const customToolbar = doc.querySelector('.CustomToolbar');
          if (customToolbar) {
            const buttons = customToolbar.querySelectorAll('li, button');
            buttons.forEach((btn: Element) => {
              const text = btn.textContent?.trim();
              // Only hide if the text is exactly "保存" or "Save"
              if (text === '保存' || text === 'Save') {
                (btn as HTMLElement).style.display = 'none';
              }
            });
          }
        }
      } catch {
        // Cross-origin restrictions may prevent access
        console.warn('Could not access iframe content to hide save button');
      }
    }, 1000);
  }, []);

  const handleClear = useCallback(() => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setFile(null);
    setPdfUrl(null);
    setError(null);
    setIsEditorReady(false);
  }, [pdfUrl]);

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {!file && (
        <FileUploader
          accept={['application/pdf', '.pdf']}
          multiple={false}
          maxFiles={1}
          onFilesSelected={handleFilesSelected}
          onError={handleUploadError}
          label={tTools('uploadLabel')}
          description={tTools('uploadDescription')}
        />
      )}

      {error && (
        <div className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700" role="alert">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {file && pdfUrl && (
        <div className="space-y-4">
          <Card variant="outlined" size="sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                  <path d="M14 2v6h6" fill="white" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--color-foreground))]">{file.name}</p>
                  <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={handleClear}>
                {t('buttons.clear') || 'Clear'}
              </Button>
            </div>
          </Card>

          {/* PDF Viewer iframe */}
          <div className="relative border border-[hsl(var(--color-border))] rounded-[var(--radius-md)] overflow-hidden bg-gray-100">
            <iframe
              ref={iframeRef}
              src={`/pdfjs-annotation-viewer/web/viewer.html?file=${encodeURIComponent(pdfUrl)}`}
              className="w-full h-[700px] border-0"
              title="PDF Editor"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
              onLoad={handleIframeLoad}
            />
            {!isEditorReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(var(--color-primary))] mx-auto mb-2"></div>
                  <p className="text-sm text-[hsl(var(--color-muted-foreground))]">{t('status.loading') || 'Loading...'}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default EditPDFTool;
