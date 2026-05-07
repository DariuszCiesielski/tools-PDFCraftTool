'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PDFDocument } from 'pdf-lib';

export interface SignPDFToolProps {
  className?: string;
  /** Optional initial file to use (skips upload step when prefilled from Studio) */
  initialFile?: File;
  /** Hide the FileUploader UI when prefilled */
  hideUploader?: boolean;
  /** Callback fired with the resulting blob and original file when save succeeds */
  onComplete?: (blob: Blob, originalFile: File) => void;
}

interface SignState {
  file: File | null;
  blobUrl: string | null;
  viewerReady: boolean;
}

/**
 * SignPDFTool Component
 * Uses PDF.js viewer with native signature editor for comprehensive signing support.
 * Supports: draw (handwritten), type (text), and image signatures.
 */
export function SignPDFTool({ className = '', initialFile, hideUploader, onComplete }: SignPDFToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');

  const [signState, setSignState] = useState<SignState>(() =>
    initialFile
      ? { file: initialFile, blobUrl: URL.createObjectURL(initialFile), viewerReady: false }
      : { file: null, blobUrl: null, viewerReady: false },
  );

  useEffect(() => {
    if (initialFile && !signState.file) {
      const blobUrl = URL.createObjectURL(initialFile);
      setSignState({ file: initialFile, blobUrl, viewerReady: false });
    }
  }, [initialFile]); // eslint-disable-line react-hooks/exhaustive-deps
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [flattenSignature, setFlattenSignature] = useState(true);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Cleanup blob URL on unmount or file change
  useEffect(() => {
    return () => {
      if (signState.blobUrl) {
        URL.revokeObjectURL(signState.blobUrl);
      }
    };
  }, [signState.blobUrl]);

  /**
   * Handle file selected
   */
  const handleFilesSelected = useCallback((files: File[]) => {
    if (files.length > 0) {
      const file = files[0];

      // Cleanup previous blob URL
      if (signState.blobUrl) {
        URL.revokeObjectURL(signState.blobUrl);
      }

      // Create new blob URL
      const blobUrl = URL.createObjectURL(file);

      // Configure PDF.js preferences for signature editor
      try {
        const existingPrefsRaw = localStorage.getItem('pdfjs.preferences');
        const existingPrefs = existingPrefsRaw ? JSON.parse(existingPrefsRaw) : {};
        delete existingPrefs.annotationEditorMode;
        const newPrefs = {
          ...existingPrefs,
          enableSignatureEditor: true,
          enablePermissions: false,
        };
        localStorage.setItem('pdfjs.preferences', JSON.stringify(newPrefs));
      } catch (e) {
        console.warn('Could not set PDF.js preferences:', e);
      }

      setSignState({
        file,
        blobUrl,
        viewerReady: false,
      });
      setError(null);
    }
  }, [signState.blobUrl]);

  /**
   * Handle file upload error
   */
  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  /**
   * Handle iframe load
   */
  const handleIframeLoad = useCallback(() => {
    setSignState(prev => ({ ...prev, viewerReady: true }));

    // Try to enable signature tools
    try {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;

      const viewerWindow = iframe.contentWindow as any;
      if (viewerWindow?.PDFViewerApplication) {
        const app = viewerWindow.PDFViewerApplication;
        const doc = viewerWindow.document;
        const eventBus = app.eventBus;

        eventBus?._on('annotationeditoruimanager', () => {
          // Show signature editor buttons
          const editorModeButtons = doc.getElementById('editorModeButtons');
          editorModeButtons?.classList.remove('hidden');

          const editorSignature = doc.getElementById('editorSignature');
          editorSignature?.removeAttribute('hidden');

          const editorSignatureButton = doc.getElementById('editorSignatureButton') as HTMLButtonElement | null;
          if (editorSignatureButton) {
            editorSignatureButton.disabled = false;
          }

          const editorStamp = doc.getElementById('editorStamp');
          editorStamp?.removeAttribute('hidden');

          const editorStampButton = doc.getElementById('editorStampButton') as HTMLButtonElement | null;
          if (editorStampButton) {
            editorStampButton.disabled = false;
          }
        });
      }
    } catch (e) {
      console.error('Could not initialize PDF.js viewer:', e);
    }
  }, []);

  /**
   * Save signed PDF
   */
  const handleSave = useCallback(async () => {
    if (!signState.viewerReady || !iframeRef.current) {
      setError('Viewer not ready. Please wait for the PDF to load.');
      return;
    }

    try {
      setIsProcessing(true);
      const viewerWindow = iframeRef.current.contentWindow as any;

      if (!viewerWindow?.PDFViewerApplication) {
        setError('PDF viewer not initialized.');
        setIsProcessing(false);
        return;
      }

      const app = viewerWindow.PDFViewerApplication;

      if (flattenSignature) {
        // Flatten and save
        const rawPdfBytes = await app.pdfDocument.saveDocument(app.pdfDocument.annotationStorage);
        const pdfBytes = new Uint8Array(rawPdfBytes);
        const pdfDoc = await PDFDocument.load(pdfBytes);

        try {
          pdfDoc.getForm().flatten();
        } catch (e) {
          // Form might not exist, continue
        }

        const flattenedPdfBytes = await pdfDoc.save();
        const blob = new Blob([new Uint8Array(flattenedPdfBytes).buffer as ArrayBuffer], { type: 'application/pdf' });

        if (onComplete && signState.file) {
          onComplete(blob, signState.file);
        } else {
          // Standalone mode: download directly
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `signed_${signState.file?.name || 'document.pdf'}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } else {
        // Use PDF.js native download
        app.eventBus?.dispatch('download', { source: app });
      }

      setIsProcessing(false);
    } catch (error) {
      console.error('Failed to save signed PDF:', error);
      setError('Failed to save signed PDF. Please try again.');
      setIsProcessing(false);
    }
  }, [signState.viewerReady, signState.file, flattenSignature, onComplete]);

  /**
   * Clear and start over
   */
  const handleClear = useCallback(() => {
    if (signState.blobUrl) {
      URL.revokeObjectURL(signState.blobUrl);
    }
    setSignState({
      file: null,
      blobUrl: null,
      viewerReady: false,
    });
    setError(null);
  }, [signState.blobUrl]);

  const viewerUrl = signState.blobUrl
    ? `/pdfjs-viewer/viewer.html?file=${encodeURIComponent(signState.blobUrl)}`
    : null;

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {/* File Upload Area - Only show when no file and uploader not hidden */}
      {!signState.file && !hideUploader && (
        <FileUploader
          accept={['application/pdf', '.pdf']}
          multiple={false}
          maxFiles={1}
          onFilesSelected={handleFilesSelected}
          onError={handleUploadError}
          disabled={isProcessing}
          label={tTools('signPdf.uploadLabel') || 'Upload PDF File'}
          description={tTools('signPdf.uploadDescription') || 'Drag and drop a PDF file to sign.'}
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

      {/* PDF Viewer */}
      {signState.file && viewerUrl && (
        <>
          {/* File Info & Clear Button */}
          <Card variant="outlined">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                  <path d="M14 2v6h6" fill="white" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--color-foreground))]">
                    {signState.file.name}
                  </p>
                  <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                    {(signState.file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={isProcessing}
              >
                {t('buttons.remove') || 'Remove'}
              </Button>
            </div>
          </Card>

          {/* Instructions */}
          <Card variant="outlined" className="bg-blue-50 border-blue-200">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">{tTools('signPdf.instructionsTitle') || 'How to Sign'}</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-600">
                  <li>{tTools('signPdf.instruction1') || 'Click the Signature tool (pen icon) in the toolbar'}</li>
                  <li>{tTools('signPdf.instruction2') || 'Draw, type, or upload your signature'}</li>
                  <li>{tTools('signPdf.instruction3') || 'Click where you want to place the signature'}</li>
                  <li>{tTools('signPdf.instruction4') || 'Click "Save Signed PDF" below when done'}</li>
                </ol>
              </div>
            </div>
          </Card>

          {/* PDF.js Viewer Iframe */}
          <div className="border border-[hsl(var(--color-border))] rounded-[var(--radius-lg)] overflow-hidden">
            <iframe
              ref={iframeRef}
              src={viewerUrl}
              onLoad={handleIframeLoad}
              className="w-full bg-gray-100"
              style={{ height: '600px', border: 'none' }}
              title="PDF Signature Editor"
            />
          </div>

          {/* Options and Save Button */}
          <Card variant="outlined">
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={flattenSignature}
                  onChange={(e) => setFlattenSignature(e.target.checked)}
                  disabled={isProcessing}
                  className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
                />
                <span className="text-sm text-[hsl(var(--color-foreground))]">
                  {tTools('signPdf.flattenOption') || 'Flatten signature (recommended - makes signature permanent)'}
                </span>
              </label>

              <div className="flex gap-4">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleSave}
                  disabled={!signState.viewerReady || isProcessing}
                  loading={isProcessing}
                >
                  {isProcessing
                    ? (t('status.processing') || 'Processing...')
                    : (tTools('signPdf.saveButton') || 'Save Signed PDF')
                  }
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

export default SignPDFTool;
