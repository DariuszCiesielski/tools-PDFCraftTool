'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Trash2, RefreshCw, CheckCircle2, AlertCircle, Settings2, Code, Eye } from 'lucide-react';
import { marked } from 'marked';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { pdfToMarkdown } from '@/lib/pdf/processors/pdf-to-markdown';
import type { UploadedFile, ProcessOutput } from '@/types/pdf';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';

/**
 * Generate a unique ID for files
 */
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface PDFToMarkdownToolProps {
    /** Custom class name */
    className?: string;
}

/**
 * PDFToMarkdownTool Component
 * 
 * Converts PDF files to Markdown format.
 */
export function PDFToMarkdownTool({ className = '' }: PDFToMarkdownToolProps) {
    const t = useTranslations('common');
    const tTools = useTranslations('tools');

    // State
    const [file, setFile] = useState<UploadedFile | null>(null);
    const [status, setStatus] = useState<ProcessingStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [result, setResult] = useState<Blob | Blob[] | null>(null);
    const [markdownContent, setMarkdownContent] = useState<string>('');
    const [activeTab, setActiveTab] = useState<'preview' | 'source'>('preview');
    const [htmlContent, setHtmlContent] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    // Options state
    const [includePageNumbers, setIncludePageNumbers] = useState(false);
    const [pageRange, setPageRange] = useState('');
    const [preserveLineBreaks, setPreserveLineBreaks] = useState(true);

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
            setMarkdownContent('');
            setHtmlContent('');
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
        setFile(null);
        setResult(null);
        setMarkdownContent('');
        setHtmlContent('');
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
        setError(null);
        setResult(null);
        setMarkdownContent('');
        setHtmlContent('');

        try {
            const output: ProcessOutput = await pdfToMarkdown(
                file.file,
                {
                    includePageNumbers,
                    pageRange,
                    preserveLineBreaks,
                },
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

                // Read content for preview
                try {
                    const text = await (output.result as Blob).text();
                    setMarkdownContent(text);
                    // Parse markdown significantly async if needed, but handled inside effect or here
                    const parsed = await marked.parse(text);
                    setHtmlContent(parsed);
                } catch (e) {
                    console.error('Failed to parse result for preview', e);
                }

                setStatus('complete');
            } else {
                setError(output.error?.message || tTools('pdfToMarkdown.failed') || 'Failed to convert PDF to Markdown.');
                setStatus('error');
            }
        } catch (err) {
            if (!cancelledRef.current) {
                setError(err instanceof Error ? err.message : t('errors.unexpectedError') || 'An unexpected error occurred.');
                setStatus('error');
            }
        }
    }, [file, t, tTools, includePageNumbers, pageRange, preserveLineBreaks]);

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
            <FileUploader
                accept={['application/pdf', '.pdf']}
                multiple={false}
                maxFiles={1}
                onFilesSelected={handleFilesSelected}
                onError={handleUploadError}
                disabled={isProcessing}
                label={tTools('pdfToMarkdown.uploadLabel') || 'Upload PDF'}
                description={tTools('pdfToMarkdown.uploadDescription') || 'Drag and drop a PDF file here, or click to browse.'}
            />

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
                                <FileText className="w-6 h-6" />
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

            {/* Options */}
            {file && !isProcessing && status !== 'complete' && (
                <Card variant="outlined" size="lg" className="glass-card">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-[hsl(var(--color-foreground))]">
                            <Settings2 className="w-5 h-5" />
                            <h3 className="font-semibold">{tTools('pdfToMarkdown.optionsTitle') || 'Conversion Options'}</h3>
                        </div>

                        {/* Page Range */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))]">
                                {tTools('pdfToMarkdown.pageRange') || 'Page Range'}
                            </label>
                            <input
                                type="text"
                                value={pageRange}
                                onChange={(e) => setPageRange(e.target.value)}
                                placeholder={tTools('pdfToMarkdown.pageRangePlaceholder') || 'e.g., 1-3, 5, 7'}
                                className="w-full px-3 py-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))] placeholder:text-[hsl(var(--color-muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                            />
                            <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                                {tTools('pdfToMarkdown.pageRangeHint') || 'Leave empty for all pages'}
                            </p>
                        </div>

                        {/* Include Page Numbers */}
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="includePageNumbers"
                                checked={includePageNumbers}
                                onChange={(e) => setIncludePageNumbers(e.target.checked)}
                                className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
                            />
                            <label htmlFor="includePageNumbers" className="text-sm text-[hsl(var(--color-foreground))]">
                                {tTools('pdfToMarkdown.includePageNumbers') || 'Include page numbers as headers'}
                            </label>
                        </div>

                        {/* Preserve Line Breaks */}
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="preserveLineBreaks"
                                checked={preserveLineBreaks}
                                onChange={(e) => setPreserveLineBreaks(e.target.checked)}
                                className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
                            />
                            <label htmlFor="preserveLineBreaks" className="text-sm text-[hsl(var(--color-foreground))]">
                                {tTools('pdfToMarkdown.preserveLineBreaks') || 'Preserve line breaks'}
                            </label>
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
                        : (tTools('pdfToMarkdown.convertButton') || 'Convert to Markdown')
                    }
                </Button>

                {result && !Array.isArray(result) && (
                    <DownloadButton
                        file={result as Blob}
                        filename={`${file?.file.name.replace(/\.pdf$/i, '')}.md`}
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
                        {tTools('pdfToMarkdown.successMessage') || 'Your PDF has been converted to Markdown. You can now download the file.'}
                    </p>
                </div>
            )}

            {/* Preview Section */}
            {status === 'complete' && markdownContent && (
                <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card variant="outlined" className="overflow-hidden glass-card p-0">
                        {/* Preview Tabs */}
                        <div className="flex border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted))]/30">
                            <button
                                onClick={() => setActiveTab('preview')}
                                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'preview'
                                        ? 'bg-[hsl(var(--color-background))] text-[hsl(var(--color-primary))] border-b-2 border-[hsl(var(--color-primary))] -mb-[1px]'
                                        : 'text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]'
                                    }`}
                            >
                                <Eye className="w-4 h-4" />
                                {tTools('pdfToMarkdown.previewTab') || 'Preview'}
                            </button>
                            <button
                                onClick={() => setActiveTab('source')}
                                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'source'
                                        ? 'bg-[hsl(var(--color-background))] text-[hsl(var(--color-primary))] border-b-2 border-[hsl(var(--color-primary))] -mb-[1px]'
                                        : 'text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]'
                                    }`}
                            >
                                <Code className="w-4 h-4" />
                                {tTools('pdfToMarkdown.sourceTab') || 'Markdown Source'}
                            </button>
                        </div>

                        {/* Preview Content */}
                        <div className="p-6 max-h-[600px] overflow-y-auto bg-[hsl(var(--color-background))]">
                            {activeTab === 'preview' ? (
                                <div
                                    className="prose prose-sm md:prose-base lg:prose-lg dark:prose-invert max-w-none
                                    prose-headings:font-bold prose-headings:tracking-tight
                                    prose-h1:text-3xl prose-h1:mb-4 prose-h1:mt-6
                                    prose-h2:text-2xl prose-h2:mb-3 prose-h2:mt-5
                                    prose-h3:text-xl prose-h3:mb-2 prose-h3:mt-4
                                    prose-p:leading-relaxed prose-p:mb-4
                                    prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
                                    prose-strong:font-semibold prose-strong:text-[hsl(var(--color-foreground))]
                                    prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                                    prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto
                                    prose-ul:list-disc prose-ul:pl-6 prose-ul:mb-4
                                    prose-ol:list-decimal prose-ol:pl-6 prose-ol:mb-4
                                    prose-li:mb-1
                                    prose-blockquote:border-l-4 prose-blockquote:border-gray-300 prose-blockquote:pl-4 prose-blockquote:italic
                                    prose-img:rounded-lg prose-img:shadow-md
                                    prose-table:border-collapse prose-table:w-full
                                    prose-th:bg-gray-100 prose-th:p-2 prose-th:border prose-th:border-gray-300
                                    prose-td:p-2 prose-td:border prose-td:border-gray-300
                                    dark:prose-code:bg-gray-800 dark:prose-code:text-gray-200
                                    dark:prose-th:bg-gray-800 dark:prose-td:border-gray-700 dark:prose-th:border-gray-700"
                                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(htmlContent) }}
                                />
                            ) : (
                                <pre className="p-4 rounded-lg bg-[hsl(var(--color-muted))] text-[hsl(var(--color-foreground))] overflow-x-auto text-sm font-mono whitespace-pre-wrap break-words">
                                    {markdownContent}
                                </pre>
                            )}
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}

export default PDFToMarkdownTool;
