'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Presentation, Trash2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { pdfToPptx } from '@/lib/pdf/processors/pdf-to-pptx';
import type { UploadedFile, ProcessOutput } from '@/types/pdf';

/**
 * Generate a unique ID for files
 */
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface PDFToPptxToolProps {
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
 * PDFToPptxTool Component
 * 
 * Converts PDF files to PowerPoint presentations (PPTX).
 */
export function PDFToPptxTool({ className = '', initialFile, hideUploader, onComplete }: PDFToPptxToolProps) {
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
    const [result, setResult] = useState<Blob | Blob[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Options
    const [dpi, setDpi] = useState(150);

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
            setStatus('idle');
            setProgress(0);
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
        setError(null);
        setStatus('idle');
        setProgress(0);
    }, []);

    /**
     * Handle convert operation
     */
    const handleConvert = useCallback(async () => {
        if (!file) {
            setError(t('errors.uploadFile') || 'Please upload a PDF file.');
            return;
        }

        cancelledRef.current = false;
        setStatus('processing');
        setProgress(0);
        setError(null);
        setResult(null);

        try {
            const output: ProcessOutput = await pdfToPptx(
                file.file,
                { dpi },
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
                setResult(output.result);
                setStatus('complete');
                if (onComplete && !Array.isArray(output.result)) {
                    onComplete(output.result, file.file);
                }
            } else {
                setError(output.error?.message || t('errors.conversionFailed') || 'Failed to convert PDF to PowerPoint.');
                setStatus('error');
            }
        } catch (err) {
            if (!cancelledRef.current) {
                setError(err instanceof Error ? err.message : t('errors.unexpectedError') || 'An unexpected error occurred.');
                setStatus('error');
            }
        }
    }, [file, dpi, t, onComplete]);

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
    const canConvert = file && !isProcessing;

    return (
        <div className={`space-y-8 ${className}`.trim()}>
            {/* File Upload Area */}
            {!hideUploader && (
                <FileUploader
                    accept={['application/pdf', '.pdf']}
                    multiple={false}
                    maxFiles={1}
                    onFilesSelected={handleFilesSelected}
                    onError={handleUploadError}
                    disabled={isProcessing}
                    label={tTools('pdfToPptx.uploadLabel') || 'Upload PDF'}
                    description={tTools('pdfToPptx.uploadDescription') || 'Drag and drop a PDF file here, or click to browse.'}
                />
            )}

            {/* Error Message */}
            {error && (
                <div
                    className="p-4 rounded-xl bg-red-50/50 border border-red-200 text-red-700 flex items-start gap-3 animate-in fade-in slide-in-from-top-2"
                    role="alert"
                >
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            {/* File Info */}
            {file && (
                <Card variant="outlined" size="lg" className="glass-card">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-[hsl(var(--color-primary)/0.1)] flex items-center justify-center text-[hsl(var(--color-primary))]">
                                <Presentation className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="font-semibold text-[hsl(var(--color-foreground))]">{file.file.name}</p>
                                <p className="text-sm text-[hsl(var(--color-muted-foreground))]">{formatSize(file.file.size)}</p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveFile}
                            disabled={isProcessing}
                            className="text-[hsl(var(--color-muted-foreground))] hover:text-red-500 hover:bg-red-50"
                        >
                            <Trash2 className="w-5 h-5" />
                            <span className="sr-only">{t('buttons.remove') || 'Remove'}</span>
                        </Button>
                    </div>
                </Card>
            )}

            {/* Options Panel */}
            {file && (
                <Card variant="outlined">
                    <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
                        {tTools('pdfToPptx.optionsTitle') || 'Conversion Options'}
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                {tTools('pdfToPptx.dpiLabel') || 'Image Quality (DPI)'}
                            </label>
                            <select
                                value={dpi}
                                onChange={(e) => setDpi(Number(e.target.value))}
                                disabled={isProcessing}
                                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                            >
                                <option value="72">{tTools('pdfToPptx.lowSet') || 'Low (72 DPI - smaller file)'}</option>
                                <option value="150">{tTools('pdfToPptx.mediumSet') || 'Medium (150 DPI - balanced)'}</option>
                                <option value="200">{tTools('pdfToPptx.highSet') || 'High (200 DPI - better quality)'}</option>
                                <option value="300">{tTools('pdfToPptx.veryHighSet') || 'Very High (300 DPI - best quality)'}</option>
                            </select>
                            <p className="mt-1 text-xs text-[hsl(var(--color-muted-foreground))]">
                                {tTools('pdfToPptx.dpiHint') || 'Higher DPI produces better quality slides but larger file sizes.'}
                            </p>
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
            <div className="flex flex-wrap items-center justify-center gap-4">
                <Button
                    variant="primary"
                    size="lg"
                    onClick={handleConvert}
                    disabled={!canConvert}
                    loading={isProcessing}
                    className="min-w-[200px] shadow-lg hover:shadow-primary/25 transition-all hover:-translate-y-0.5"
                >
                    {!isProcessing && <RefreshCw className="w-5 h-5 mr-2" />}
                    {isProcessing
                        ? (t('status.processing') || 'Converting...')
                        : (tTools('pdfToPptx.convertButton') || 'Convert to PowerPoint')
                    }
                </Button>

                {result && !Array.isArray(result) && (
                    <DownloadButton
                        file={result as Blob}
                        filename={`${file?.file.name.replace(/\.pdf$/i, '')}.pptx`}
                        variant="secondary"
                        size="lg"
                        showFileSize
                        className="min-w-[200px] shadow-lg transition-all hover:-translate-y-0.5"
                    />
                )}
            </div>

            {/* Success Message */}
            {status === 'complete' && result && (
                <div
                    className="p-6 rounded-2xl bg-green-50/50 border border-green-200 text-green-700 text-center animate-in fade-in zoom-in-95 duration-300"
                    role="status"
                >
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-4">
                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{tTools('successTitle') || 'Conversion Successful!'}</h3>
                    <p className="text-green-800/80 max-w-md mx-auto">
                        {tTools('pdfToPptx.successMessage') || 'Your PDF has been converted to PowerPoint. Each page is now a slide with full-quality images.'}
                    </p>
                </div>
            )}
        </div>
    );
}

export default PDFToPptxTool;
