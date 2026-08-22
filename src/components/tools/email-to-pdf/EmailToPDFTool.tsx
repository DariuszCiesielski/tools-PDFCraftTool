'use client';

import React, { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { emailToPDF, type EmailToPDFOptions, type EmailPageSize } from '@/lib/pdf/processors/email-to-pdf';
import { Mail } from 'lucide-react';

export interface EmailToPDFToolProps {
    className?: string;
}

export function EmailToPDFTool({ className = '' }: EmailToPDFToolProps) {
    const t = useTranslations('common');
    const tTools = useTranslations('tools');

    const [file, setFile] = useState<File | null>(null);
    const [resultBlob, setResultBlob] = useState<Blob | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const [pageSize, setPageSize] = useState<EmailPageSize>('a4');
    const [includeCcBcc, setIncludeCcBcc] = useState(true);
    const [includeAttachments, setIncludeAttachments] = useState(true);
    const [dateFormat] = useState<'full' | 'short' | 'iso'>('full');
    const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

    const handleFilesSelected = useCallback((files: File[]) => {
        if (files.length > 0) {
            setFile(files[0]);
            setResultBlob(null);
            setError(null);
        }
    }, []);

    const handleUploadError = useCallback((errorMessage: string) => {
        setError(errorMessage);
    }, []);

    const handleConvert = useCallback(async () => {
        if (!file) {
            setError('Please select an email file.');
            return;
        }

        setIsProcessing(true);
        setProgress(0);
        setError(null);

        try {
            const options: EmailToPDFOptions = {
                pageSize,
                includeCcBcc,
                includeAttachments,
                dateFormat,
                timezone,
            };

            const output = await emailToPDF(file, options, (prog) => setProgress(prog));

            if (output.success && output.result) {
                setResultBlob(output.result as Blob);
            } else {
                setError(output.error?.message || 'Failed to convert email.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred.');
        } finally {
            setIsProcessing(false);
        }
    }, [file, pageSize, includeCcBcc, includeAttachments, dateFormat, timezone]);

    const handleReset = useCallback(() => {
        setFile(null);
        setResultBlob(null);
        setError(null);
        setProgress(0);
    }, []);

    const hasFile = file !== null;
    const canProcess = hasFile && !isProcessing;

    return (
        <div className={`space-y-6 ${className}`.trim()}>
            <FileUploader
                accept={['.eml', '.msg', 'message/rfc822', 'application/vnd.ms-outlook']}
                multiple={false}
                maxFiles={1}
                onFilesSelected={handleFilesSelected}
                onError={handleUploadError}
                disabled={isProcessing}
                label={tTools('emailToPdf.uploadLabel') || 'Upload Email File'}
                description={tTools('emailToPdf.uploadDescription') || 'Drag and drop an email file (.eml or .msg) to convert to PDF.'}
            />

            {error && (
                <div className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700" role="alert">
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {hasFile && (
                <Card variant="outlined">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-[hsl(var(--color-foreground))]">{file.name}</p>
                            <p className="text-sm text-[hsl(var(--color-muted-foreground))]">{(file.size / 1024).toFixed(2)} KB</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={handleReset} disabled={isProcessing}>
                            {t('buttons.clear') || 'Clear'}
                        </Button>
                    </div>
                </Card>
            )}

            {hasFile && (
                <Card variant="outlined">
                    <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
                        {tTools('emailToPdf.optionsTitle') || 'Conversion Options'}
                    </h3>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                {tTools('emailToPdf.pageSizeLabel') || 'Page Size'}
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['a4', 'letter', 'legal'] as EmailPageSize[]).map((size) => (
                                    <button
                                        key={size}
                                        type="button"
                                        onClick={() => setPageSize(size)}
                                        disabled={isProcessing}
                                        className={`px-4 py-2 rounded-[var(--radius-md)] border text-sm font-medium uppercase transition-colors duration-200
                      ${pageSize === size ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary))] text-[hsl(var(--color-primary-foreground))]' : 'border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-muted)/0.5)]'}
                      disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={includeCcBcc}
                                onChange={(e) => setIncludeCcBcc(e.target.checked)}
                                disabled={isProcessing}
                                className="w-4 h-4 rounded"
                            />
                            <span className="text-sm text-[hsl(var(--color-foreground))]">
                                {tTools('emailToPdf.includeCcBccLabel') || 'Include CC/BCC fields'}
                            </span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={includeAttachments}
                                onChange={(e) => setIncludeAttachments(e.target.checked)}
                                disabled={isProcessing}
                                className="w-4 h-4 rounded"
                            />
                            <span className="text-sm text-[hsl(var(--color-foreground))]">
                                {tTools('emailToPdf.includeAttachmentsLabel') || 'Include attachment list'}
                            </span>
                        </label>

                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                {tTools('emailToPdf.timezoneLabel') || 'Timezone'}
                            </label>
                            <input
                                type="text"
                                value={timezone}
                                onChange={(e) => setTimezone(e.target.value)}
                                disabled={isProcessing}
                                className="w-full px-3 py-2 border border-[hsl(var(--color-border))] rounded-[var(--radius-md)] text-sm"
                            />
                        </div>
                    </div>
                </Card>
            )}

            {isProcessing && (
                <ProcessingProgress progress={progress} status="processing" message="Converting email to PDF..." showPercentage />
            )}

            <div className="flex flex-wrap items-center gap-4">
                <Button variant="primary" size="lg" onClick={handleConvert} disabled={!canProcess} loading={isProcessing}>
                    <Mail className="w-4 h-4 mr-2" />
                    {isProcessing ? (t('status.processing') || 'Processing...') : (tTools('emailToPdf.convertButton') || 'Convert to PDF')}
                </Button>

                {resultBlob && (
                    <DownloadButton
                        file={resultBlob}
                        filename={file ? `${file.name.replace(/\.(eml|msg)$/i, '')}.pdf` : 'email.pdf'}
                        variant="secondary"
                        size="lg"
                    />
                )}
            </div>

            {resultBlob && (
                <div className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700" role="status">
                    <p className="text-sm font-medium">{tTools('emailToPdf.successMessage') || 'Email converted successfully!'}</p>
                </div>
            )}
        </div>
    );
}

export default EmailToPDFTool;
