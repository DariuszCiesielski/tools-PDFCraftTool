'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { readPsd } from 'ag-psd';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { imagesToPDF, type PageSizeType, type ImageToPDFOptions } from '@/lib/pdf/processors/image-to-pdf';
import type { UploadedFile, ProcessOutput } from '@/types/pdf';

/**
 * Generate a unique ID for files
 */
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface PSDToPDFToolProps {
    /** Custom class name */
    className?: string;
}

/**
 * PSDToPDFTool Component
 * 
 * Converts PSD files to PDF by first rendering them to images.
 */
export function PSDToPDFTool({ className = '' }: PSDToPDFToolProps) {
    const t = useTranslations('common');
    const tTools = useTranslations('tools');

    // State
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [status, setStatus] = useState<ProcessingStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [result, setResult] = useState<Blob | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Options state
    const [pageSize, setPageSize] = useState<PageSizeType>('A4');
    const [orientation, setOrientation] = useState<'portrait' | 'landscape' | 'auto'>('auto');
    const [margin, setMargin] = useState(36);
    const [centerImage, setCenterImage] = useState(true);
    const [scaleToFit, setScaleToFit] = useState(true);

    // Drag state for reordering
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    // Ref for cancellation
    const cancelledRef = useRef(false);

    /**
     * Accepted types
     */
    const acceptedTypes = ['.psd', '.psb', 'image/vnd.adobe.photoshop'];

    /**
     * Handle files selected from uploader
     */
    const handleFilesSelected = useCallback((newFiles: File[]) => {
        const uploadedFiles: UploadedFile[] = newFiles.map(file => ({
            id: generateId(),
            file,
            status: 'pending' as const,
            // We don't generate preview immediately for PSD as it's expensive/complex
            // We'll show a generic icon or try to generate a quick one if possible, 
            // but for now let's just use a placeholder text/icon in the UI
            preview: undefined,
        }));

        setFiles(prev => [...prev, ...uploadedFiles]);
        setError(null);
        setResult(null);
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
        setFiles(prev => {
            const file = prev.find(f => f.id === id);
            if (file?.preview) {
                URL.revokeObjectURL(file.preview);
            }
            return prev.filter(f => f.id !== id);
        });
        setResult(null);
    }, []);

    /**
     * Clear all files
     */
    const handleClearAll = useCallback(() => {
        files.forEach(f => {
            if (f.preview) URL.revokeObjectURL(f.preview);
        });
        setFiles([]);
        setResult(null);
        setError(null);
        setStatus('idle');
        setProgress(0);
    }, [files]);

    /**
     * Handle drag start
     */
    const handleDragStart = useCallback((index: number) => {
        setDraggedIndex(index);
    }, []);

    /**
     * Handle drag over
     */
    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex !== null && draggedIndex !== index) {
            setDragOverIndex(index);
        }
    }, [draggedIndex]);

    /**
     * Handle drag end
     */
    const handleDragEnd = useCallback(() => {
        if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
            setFiles(prev => {
                const newFiles = [...prev];
                const [draggedFile] = newFiles.splice(draggedIndex, 1);
                newFiles.splice(dragOverIndex, 0, draggedFile);
                return newFiles;
            });
        }
        setDraggedIndex(null);
        setDragOverIndex(null);
    }, [draggedIndex, dragOverIndex]);

    /**
     * Convert single PSD to PNG File
     */
    const convertPsdToPng = async (file: File): Promise<File> => {
        const buffer = await file.arrayBuffer();

        // Read PSD
        // We try to read the composite image first for speed/accuracy if available
        const psd = readPsd(buffer, {
            skipLayerImageData: false,
            skipThumbnail: true,
        });

        const canvas = psd.canvas as HTMLCanvasElement | undefined;

        if (!canvas) {
            // If ag-psd didn't automatically create a canvas, we might need to construct it.
            // However, ag-psd in browser typically creates it.
            throw new Error(`Could not render PSD: ${file.name}. No canvas generated.`);
        }

        // const canvas = psd.canvas as HTMLCanvasElement;

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    // Replace extension with .png
                    const newName = file.name.replace(/\.(psd|psb)$/i, '.png');
                    resolve(new File([blob], newName, { type: 'image/png' }));
                } else {
                    reject(new Error(`Failed to convert PSD to PNG: ${file.name}`));
                }
            }, 'image/png');
        });
    };

    /**
     * Handle convert operation
     */
    const handleConvert = useCallback(async () => {
        if (files.length < 1) {
            setError('Please add at least 1 PSD file.');
            return;
        }

        cancelledRef.current = false;
        setStatus('processing');
        setProgress(0);
        setError(null);
        setResult(null);

        try {
            // 1. Convert PSDs to PNGs
            setProgressMessage('Parsing and rendering PSD files...');
            const pngFiles: File[] = [];
            const totalFiles = files.length;

            for (let i = 0; i < totalFiles; i++) {
                if (cancelledRef.current) return;

                setProgress(Math.round((i / totalFiles) * 50)); // First 50% is PSD -> PNG
                setProgressMessage(`Rendering ${files[i].file.name}...`);

                try {
                    const pngFile = await convertPsdToPng(files[i].file);
                    pngFiles.push(pngFile);
                } catch (err) {
                    console.error(err);
                    throw new Error(`Failed to process ${files[i].file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
                }
            }

            // 2. Convert PNGs to PDF
            if (cancelledRef.current) return;

            setProgress(50);
            setProgressMessage('Generating PDF...');

            const options: Partial<ImageToPDFOptions> = {
                pageSize,
                orientation,
                margin,
                centerImage,
                scaleToFit,
                svgScale: 2, // Not relevant for PSD->PNG but required by type
            };

            const output: ProcessOutput = await imagesToPDF(
                pngFiles,
                options,
                (prog, message) => {
                    if (!cancelledRef.current) {
                        // Scale progress to 50-100% range
                        setProgress(50 + Math.round(prog / 2));
                        setProgressMessage(message || 'Creating PDF...');
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
                setError(output.error?.message || 'Failed to convert to PDF.');
                setStatus('error');
            }
        } catch (err) {
            if (!cancelledRef.current) {
                setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
                setStatus('error');
            }
        }
    }, [files, pageSize, orientation, margin, centerImage, scaleToFit]);

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
    const canConvert = files.length >= 1 && !isProcessing;

    return (
        <div className={`space-y-6 ${className}`.trim()}>
            {/* File Upload Area */}
            <FileUploader
                accept={acceptedTypes}
                multiple
                maxFiles={100}
                onFilesSelected={handleFilesSelected}
                onError={handleUploadError}
                disabled={isProcessing}
                label={tTools('psdToPdf.uploadLabel') || t('buttons.upload')}
                description={tTools('psdToPdf.uploadDescription')}
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

            {/* File List */}
            {files.length > 0 && (
                <Card variant="outlined" size="lg">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))]">
                            Files ({files.length})
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

                    <p className="text-sm text-[hsl(var(--color-muted-foreground))] mb-4">
                        {tTools('psdToPdf.reorderHint') || 'Drag and drop to reorder files.'}
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {files.map((file, index) => (
                            <div
                                key={file.id}
                                draggable={!isProcessing}
                                onDragStart={() => handleDragStart(index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDragEnd={handleDragEnd}
                                className={`
                  relative group rounded-[var(--radius-md)] border overflow-hidden
                  transition-all duration-200
                  ${draggedIndex === index ? 'opacity-50 border-dashed' : ''}
                  ${dragOverIndex === index ? 'border-[hsl(var(--color-primary))] ring-2 ring-[hsl(var(--color-primary)/0.2)]' : 'border-[hsl(var(--color-border))]'}
                  ${!isProcessing ? 'cursor-grab hover:border-[hsl(var(--color-primary)/0.5)]' : ''}
                `}
                            >
                                {/* File Icon/Preview */}
                                <div className="aspect-square bg-[hsl(var(--color-muted)/0.3)] flex items-center justify-center p-4">
                                    {/* Generic PSD Icon since preview isn't instant */}
                                    <div className="flex flex-col items-center justify-center text-[hsl(var(--color-muted-foreground))]">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                            <polyline points="14 2 14 8 20 8" />
                                            <path d="M10 13v-1.5a1.5 1.5 0 0 0-3 0V13" />
                                        </svg>
                                        <span className="text-xs font-bold mt-1">PSD</span>
                                    </div>
                                </div>

                                {/* Page Number Badge */}
                                <span className="absolute top-2 left-2 w-6 h-6 rounded-full bg-[hsl(var(--color-primary))] text-[hsl(var(--color-primary-foreground))] text-xs font-medium flex items-center justify-center">
                                    {index + 1}
                                </span>

                                {/* Remove Button */}
                                <button
                                    type="button"
                                    onClick={() => handleRemoveFile(file.id)}
                                    disabled={isProcessing}
                                    className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                                    aria-label={`Remove ${file.file.name}`}
                                >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M18 6L6 18M6 6l12 12" />
                                    </svg>
                                </button>

                                {/* File Info */}
                                <div className="p-2 bg-white">
                                    <p className="text-xs font-medium text-[hsl(var(--color-foreground))] truncate">
                                        {file.file.name}
                                    </p>
                                    <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                                        {formatSize(file.file.size)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}


            {/* Options Panel */}
            {files.length >= 1 && (
                <Card variant="outlined">
                    <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
                        PDF Options
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Page Size */}
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                {tTools('imageToPdf.pageSize') || 'Page Size'}
                            </label>
                            <select
                                value={pageSize}
                                onChange={(e) => setPageSize(e.target.value as PageSizeType)}
                                disabled={isProcessing}
                                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                            >
                                <option value="A4">A4</option>
                                <option value="LETTER">Letter</option>
                                <option value="LEGAL">Legal</option>
                                <option value="A3">A3</option>
                                <option value="A5">A5</option>
                                <option value="FIT">Fit to Image</option>
                            </select>
                        </div>

                        {/* Orientation */}
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                {tTools('imageToPdf.orientation') || 'Orientation'}
                            </label>
                            <select
                                value={orientation}
                                onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape' | 'auto')}
                                disabled={isProcessing}
                                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                            >
                                <option value="auto">{tTools('imageToPdf.orientationAuto') || 'Auto (match image)'}</option>
                                <option value="portrait">{tTools('imageToPdf.orientationPortrait') || 'Portrait'}</option>
                                <option value="landscape">{tTools('imageToPdf.orientationLandscape') || 'Landscape'}</option>
                            </select>
                        </div>

                        {/* Margin */}
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                {tTools('imageToPdf.margin') || 'Margin'}
                            </label>
                            <select
                                value={margin}
                                onChange={(e) => setMargin(Number(e.target.value))}
                                disabled={isProcessing}
                                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                            >
                                <option value="0">{tTools('imageToPdf.marginNone') || 'None'}</option>
                                <option value="18">{tTools('imageToPdf.marginSmall') || 'Small (0.25")'}</option>
                                <option value="36">{tTools('imageToPdf.marginMedium') || 'Medium (0.5")'}</option>
                                <option value="72">{tTools('imageToPdf.marginLarge') || 'Large (1")'}</option>
                            </select>
                        </div>
                    </div>

                    <div className="mt-4 space-y-3">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={centerImage}
                                onChange={(e) => setCenterImage(e.target.checked)}
                                disabled={isProcessing}
                                className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
                            />
                            <span className="text-sm text-[hsl(var(--color-foreground))]">
                                {tTools('imageToPdf.centerImage') || 'Center images on page'}
                            </span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={scaleToFit}
                                onChange={(e) => setScaleToFit(e.target.checked)}
                                disabled={isProcessing}
                                className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
                            />
                            <span className="text-sm text-[hsl(var(--color-foreground))]">
                                {tTools('imageToPdf.scaleToFit') || 'Scale images to fit page'}
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
                        : (tTools('imageToPdf.convertButton') || 'Convert to PDF')
                    }
                </Button>

                {result && (
                    <DownloadButton
                        file={result}
                        filename={files.length === 1 ? `${files[0].file.name.replace(/\.(psd|psb)$/i, '')}.pdf` : `psd_bundle.pdf`}
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
                        {tTools('imageToPdf.successMessage') || 'PDF created successfully! Click the download button to save your file.'}
                    </p>
                </div>
            )}
        </div>
    );
}
