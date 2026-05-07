'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { rasterizePDF, type RasterizePDFOptions, type RasterizeFormat, DPI_PRESETS } from '@/lib/pdf/processors/rasterize';
import { Grid2X2, Image } from 'lucide-react';

export interface RasterizePDFToolProps {
    /** Custom class name */
    className?: string;
  /** Optional initial file (skips upload step when prefilled from Studio) */
  initialFile?: File;
  /** Hide the FileUploader UI when prefilled */
  hideUploader?: boolean;
}

/**
 * RasterizePDFTool Component
 * 
 * Converts PDF pages to high-quality images.
 */
export function RasterizePDFTool({ className = '', initialFile, hideUploader }: RasterizePDFToolProps) {
    const t = useTranslations('common');
    const tTools = useTranslations('tools');

    // State
    const [file, setFile] = useState<File | null>(initialFile ?? null);
    const [resultBlob, setResultBlob] = useState<Blob | null>(null);
    const [resultFilename, setResultFilename] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    // Options
    const [dpi, setDpi] = useState<number>(150);
    const [format, setFormat] = useState<RasterizeFormat>('png');
    const [quality, setQuality] = useState(85);
    const [pageRange, setPageRange] = useState<string>('');
    const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  useEffect(() => {
    if (initialFile) {
      setFile(initialFile);
    }
  }, [initialFile]);


    /**
     * Handle file selected from uploader
     */
    const handleFilesSelected = useCallback((files: File[]) => {
        if (files.length > 0) {
            setFile(files[0]);
            setResultBlob(null);
            setResultFilename('');
            setError(null);
        }
    }, []);

    /**
     * Handle file upload error
     */
    const handleUploadError = useCallback((errorMessage: string) => {
        setError(errorMessage);
    }, []);

    /**
     * Handle rasterization
     */
    const handleRasterize = useCallback(async () => {
        if (!file) {
            setError('Please select a PDF file.');
            return;
        }

        setIsProcessing(true);
        setProgress(0);
        setError(null);

        try {
            const options: RasterizePDFOptions = {
                dpi,
                format,
                quality,
                pageRange: pageRange || undefined,
                backgroundColor,
            };

            const output = await rasterizePDF(
                file,
                options,
                (prog) => setProgress(prog)
            );

            if (output.success && output.result) {
                setResultBlob(output.result as Blob);
                setResultFilename(output.filename || (format === 'pdf' ? 'rasterized.pdf' : 'images.zip'));
            } else {
                setError(output.error?.message || 'Failed to rasterize PDF.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred.');
        } finally {
            setIsProcessing(false);
        }
    }, [file, dpi, format, quality, pageRange, backgroundColor]);

    /**
     * Reset state
     */
    const handleReset = useCallback(() => {
        setFile(null);
        setResultBlob(null);
        setResultFilename('');
        setError(null);
        setProgress(0);
    }, []);

    const hasFile = file !== null;
    const canProcess = hasFile && !isProcessing;

    return (
        <div className={`space-y-6 ${className}`.trim()}>
            {/* File Upload Area */}
            {!file && !hideUploader && (
              <FileUploader
                accept={['application/pdf', '.pdf']}
                multiple={false}
                maxFiles={1}
                onFilesSelected={handleFilesSelected}
                onError={handleUploadError}
                disabled={isProcessing}
                label={tTools('rasterizePdf.uploadLabel') || 'Upload PDF File'}
                description={tTools('rasterizePdf.uploadDescription') || 'Drag and drop a PDF file to convert to images.'}
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
            {hasFile && (
                <Card variant="outlined">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-[hsl(var(--color-foreground))]">{file.name}</p>
                            <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={handleReset} disabled={isProcessing}>
                            {t('buttons.clear') || 'Clear'}
                        </Button>
                    </div>
                </Card>
            )}

            {/* Rasterize Options */}
            {hasFile && (
                <Card variant="outlined">
                    <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
                        {tTools('rasterizePdf.optionsTitle') || 'Output Options'}
                    </h3>

                    <div className="space-y-4">
                        {/* DPI Preset */}
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                {tTools('rasterizePdf.dpiLabel') || 'Resolution (DPI)'}
                            </label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {Object.entries(DPI_PRESETS).map(([name, value]) => (
                                    <button
                                        key={name}
                                        type="button"
                                        onClick={() => setDpi(value)}
                                        disabled={isProcessing}
                                        className={`
                      px-4 py-2 rounded-[var(--radius-md)] border text-sm font-medium
                      transition-colors duration-200
                      ${dpi === value
                                                ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary))] text-[hsl(var(--color-primary-foreground))]'
                                                : 'border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-muted)/0.5)]'
                                            }
                      disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                                    >
                                        <span className="capitalize">{name}</span>
                                        <span className="text-xs ml-1 opacity-70">({value})</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Output Format */}
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                {tTools('rasterizePdf.formatLabel') || 'Output Format'}
                            </label>
                            <div className="grid grid-cols-4 gap-2">
                                {(['png', 'jpeg', 'webp', 'pdf'] as RasterizeFormat[]).map((fmt) => (
                                    <button
                                        key={fmt}
                                        type="button"
                                        onClick={() => setFormat(fmt)}
                                        disabled={isProcessing}
                                        className={`
                      px-4 py-2 rounded-[var(--radius-md)] border text-sm font-medium uppercase
                      transition-colors duration-200
                      ${format === fmt
                                                ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary))] text-[hsl(var(--color-primary-foreground))]'
                                                : 'border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-muted)/0.5)]'
                                            }
                      disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                                    >
                                        {fmt}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Quality (for JPEG/WebP) */}
                        {(format === 'jpeg' || format === 'webp' || format === 'pdf') && (
                            <div>
                                <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                    {tTools('rasterizePdf.qualityLabel') || 'Quality'}: {quality}%
                                </label>
                                <input
                                    type="range"
                                    min="10"
                                    max="100"
                                    value={quality}
                                    onChange={(e) => setQuality(Number(e.target.value))}
                                    disabled={isProcessing}
                                    className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-[hsl(var(--color-muted))]"
                                />
                            </div>
                        )}

                        {/* Page Range */}
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                {tTools('rasterizePdf.pageRangeLabel') || 'Page Range (optional)'}
                            </label>
                            <input
                                type="text"
                                value={pageRange}
                                onChange={(e) => setPageRange(e.target.value)}
                                disabled={isProcessing}
                                placeholder="e.g., 1-5, 8, 10-15"
                                className="w-full px-3 py-2 border border-[hsl(var(--color-border))] rounded-[var(--radius-md)] text-sm"
                            />
                            <p className="mt-1 text-xs text-[hsl(var(--color-muted-foreground))]">
                                {tTools('rasterizePdf.pageRangeDesc') || 'Leave empty to convert all pages.'}
                            </p>
                        </div>

                        {/* Background Color */}
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                {tTools('rasterizePdf.bgColorLabel') || 'Background Color'}
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={backgroundColor}
                                    onChange={(e) => setBackgroundColor(e.target.value)}
                                    disabled={isProcessing}
                                    className="w-10 h-10 rounded border-0 cursor-pointer"
                                />
                                <input
                                    type="text"
                                    value={backgroundColor}
                                    onChange={(e) => setBackgroundColor(e.target.value)}
                                    disabled={isProcessing}
                                    className="flex-1 px-3 py-2 border border-[hsl(var(--color-border))] rounded-[var(--radius-md)] text-sm font-mono"
                                />
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {/* Processing Progress */}
            {isProcessing && (
                <ProcessingProgress
                    progress={progress}
                    status="processing"
                    message="Converting pages to images..."
                    showPercentage
                />
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-4">
                <Button
                    variant="primary"
                    size="lg"
                    onClick={handleRasterize}
                    disabled={!canProcess}
                    loading={isProcessing}
                >
                    <Grid2X2 className="w-4 h-4 mr-2" />
                    {isProcessing
                        ? (t('status.processing') || 'Processing...')
                        : (tTools('rasterizePdf.convertButton') || 'Convert to Images')
                    }
                </Button>

                {resultBlob && (
                    <DownloadButton
                        file={resultBlob}
                        filename={resultFilename}
                        variant="secondary"
                        size="lg"
                    />
                )}
            </div>

            {/* Success Message */}
            {resultBlob && (
                <div
                    className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
                    role="status"
                >
                    <div className="flex items-center gap-2">
                        <Image className="w-5 h-5" />
                        <p className="text-sm font-medium">
                            {tTools('rasterizePdf.successMessage') || 'Images created successfully! Click download to save.'}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default RasterizePDFTool;
