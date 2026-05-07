'use client';

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { extractImages, type ExtractedImage, type ExtractImagesOptions } from '@/lib/pdf/processors/extract-images';
import type { ProcessOutput } from '@/types/pdf';
import JSZip from 'jszip';

/**
 * Generate a unique ID for files
 */
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface UploadedFile {
    id: string;
    file: File;
}

export interface ExtractImagesToolProps {
    /** Custom class name */
    className?: string;
    /** Optional initial file to use (skips upload step when prefilled from Studio) */
    initialFile?: File;
    /** Hide the FileUploader UI when prefilled */
    hideUploader?: boolean;
}

/**
 * ExtractImagesTool Component
 * Requirements: 5.1, 5.2
 * 
 * Provides the UI for extracting images from PDF files.
 */
export function ExtractImagesTool({ className = '', initialFile, hideUploader }: ExtractImagesToolProps) {
    const t = useTranslations('common');
    const tTools = useTranslations('tools');

    // State
    const [files, setFiles] = useState<UploadedFile[]>(
        initialFile ? [{ id: generateId(), file: initialFile }] : [],
    );

    useEffect(() => {
        if (initialFile) {
            setFiles([{ id: generateId(), file: initialFile }]);
        }
    }, [initialFile]);
    const [status, setStatus] = useState<ProcessingStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [extractedImages, setExtractedImages] = useState<ExtractedImage[]>([]);
    const [error, setError] = useState<string | null>(null);

    const [selectedImage, setSelectedImage] = useState<ExtractedImage | null>(null);

    // Filter options
    const [minWidth, setMinWidth] = useState(50);
    const [minHeight, setMinHeight] = useState(50);
    const [minSize, setMinSize] = useState(10); // KB

    // Ref for cancellation
    const cancelledRef = useRef(false);

    /**
     * Handle files selected from uploader
     */
    const handleFilesSelected = useCallback((newFiles: File[]) => {
        const uploadedFiles: UploadedFile[] = newFiles.map(file => ({
            id: generateId(),
            file,
        }));
        setFiles(prev => [...prev, ...uploadedFiles]);
        setError(null);
        setExtractedImages([]);
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
        setExtractedImages([]);
    }, []);

    /**
     * Clear all files
     */
    const handleClearAll = useCallback(() => {
        setFiles([]);
        setExtractedImages([]);
        setError(null);
        setStatus('idle');
        setProgress(0);
    }, []);

    /**
     * Handle extract operation
     */
    const handleExtract = useCallback(async () => {
        if (files.length === 0) {
            setError('Please add at least one PDF file.');
            return;
        }

        cancelledRef.current = false;
        setStatus('processing');
        setProgress(0);
        setError(null);
        setExtractedImages([]);

        const options: ExtractImagesOptions = {
            minWidth,
            minHeight,
            minSize: minSize * 1024, // Convert KB to bytes
        };

        try {
            const output: ProcessOutput = await extractImages(
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

            if (output.success && output.metadata?.images) {
                setExtractedImages(output.metadata.images as ExtractedImage[]);
                setStatus('complete');
            } else {
                setError(output.error?.message || 'No images found in the selected PDF(s).');
                setStatus('error');
            }
        } catch (err) {
            if (!cancelledRef.current) {
                setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
                setStatus('error');
            }
        }
    }, [files, minWidth, minHeight, minSize]);

    /**
     * Handle cancel operation
     */
    const handleCancel = useCallback(() => {
        cancelledRef.current = true;
        setStatus('idle');
        setProgress(0);
    }, []);

    /**
     * Download a single image
     */
    const handleDownloadImage = useCallback((image: ExtractedImage) => {
        const blob = new Blob([new Uint8Array(image.data)]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = image.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, []);

    /**
     * Download all images as individual files
     */
    const handleDownloadAll = useCallback(() => {
        extractedImages.forEach((image, index) => {
            setTimeout(() => {
                handleDownloadImage(image);
            }, index * 200); // Stagger downloads to avoid browser blocking
        });
    }, [extractedImages, handleDownloadImage]);

    /**
     * Download all images as ZIP
     */
    const handleDownloadZip = useCallback(async () => {
        if (extractedImages.length === 0) return;

        try {
            setStatus('processing');
            setProgress(0);
            setProgressMessage('Creating ZIP archive...');

            const zip = new JSZip();

            extractedImages.forEach((image, index) => {
                setProgress((index / extractedImages.length) * 100);
                zip.file(image.name, new Uint8Array(image.data));
            });

            const zipBlob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });

            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'extracted-images.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setStatus('complete');
            setProgress(100);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create ZIP file.');
            setStatus('error');
        }
    }, [extractedImages]);

    /**
     * Format file size
     */
    const formatSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    /**
     * Create image preview URL
     */
    const getImagePreviewUrl = (image: ExtractedImage): string => {
        const blob = new Blob([new Uint8Array(image.data)]);
        return URL.createObjectURL(blob);
    };

    // Memoize image preview URLs
    const imagePreviewUrls = useMemo(() => {
        const urls: Record<number, string> = {};
        extractedImages.forEach(img => {
            urls[img.index] = getImagePreviewUrl(img);
        });
        return urls;
    }, [extractedImages]);

    // Cleanup preview URLs on unmount
    React.useEffect(() => {
        return () => {
            Object.values(imagePreviewUrls).forEach(url => {
                URL.revokeObjectURL(url);
            });
        };
    }, [imagePreviewUrls]);

    const isProcessing = status === 'processing' || status === 'uploading';
    const canExtract = files.length > 0 && !isProcessing;

    return (
        <div className={`space-y-6 ${className}`.trim()}>
            {/* File Upload Area */}
            {!hideUploader && (
                <FileUploader
                    accept={['application/pdf', '.pdf']}
                    multiple
                    maxFiles={20}
                    onFilesSelected={handleFilesSelected}
                    onError={handleUploadError}
                    disabled={isProcessing}
                    label={tTools('extractImages.uploadLabel') || 'Upload PDF Files'}
                    description={tTools('extractImages.uploadDescription') || 'Select PDF files to extract images from.'}
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

            {/* File List */}
            {files.length > 0 && (
                <Card variant="outlined" size="lg">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))]">
                            {tTools('extractImages.filesTitle') || 'Selected Files'} ({files.length})
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
                        {files.map((item) => (
                            <li
                                key={item.id}
                                className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))]"
                            >
                                <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                                    <path d="M14 2v6h6" fill="white" />
                                    <text x="7" y="17" fontSize="6" fill="white" fontWeight="bold">PDF</text>
                                </svg>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-[hsl(var(--color-foreground))] truncate">
                                        {item.file.name}
                                    </p>
                                    <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                                        {formatSize(item.file.size)}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveFile(item.id)}
                                    disabled={isProcessing}
                                    className="p-1 rounded hover:bg-red-100 text-[hsl(var(--color-muted-foreground))] hover:text-red-600"
                                    aria-label={`Remove ${item.file.name}`}
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M18 6L6 18M6 6l12 12" />
                                    </svg>
                                </button>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            {/* Filter Options */}
            {files.length > 0 && !isProcessing && extractedImages.length === 0 && (
                <Card variant="outlined" size="lg">
                    <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
                        {tTools('extractImages.filterTitle') || 'Filter Options'}
                    </h3>
                    <p className="text-sm text-[hsl(var(--color-muted-foreground))] mb-4">
                        {tTools('extractImages.filterDescription') || 'Filter out small images (icons, decorations, etc.)'}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-1">
                                {tTools('extractImages.minWidth') || 'Min Width (px)'}
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="5000"
                                value={minWidth}
                                onChange={(e) => setMinWidth(Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-full px-3 py-2 border border-[hsl(var(--color-border))] rounded-[var(--radius-md)] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-1">
                                {tTools('extractImages.minHeight') || 'Min Height (px)'}
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="5000"
                                value={minHeight}
                                onChange={(e) => setMinHeight(Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-full px-3 py-2 border border-[hsl(var(--color-border))] rounded-[var(--radius-md)] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-1">
                                {tTools('extractImages.minSizeKB') || 'Min Size (KB)'}
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="10000"
                                value={minSize}
                                onChange={(e) => setMinSize(Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-full px-3 py-2 border border-[hsl(var(--color-border))] rounded-[var(--radius-md)] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))]"
                            />
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
                    onClick={handleExtract}
                    disabled={!canExtract}
                    loading={isProcessing}
                >
                    {isProcessing
                        ? (t('status.processing') || 'Processing...')
                        : (tTools('extractImages.extractButton') || 'Extract Images')
                    }
                </Button>
            </div>

            {/* Extracted Images Grid */}
            {extractedImages.length > 0 && (
                <Card variant="outlined" size="lg">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))]">
                            {tTools('extractImages.extractedTitle') || 'Extracted Images'} ({extractedImages.length})
                        </h3>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDownloadAll}
                            >
                                {tTools('extractImages.downloadAll') || 'Download All'}
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleDownloadZip}
                            >
                                {tTools('extractImages.downloadZip') || 'Download as ZIP'}
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {extractedImages.map((image) => (
                            <div
                                key={image.index}
                                className="group relative rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] overflow-hidden bg-[hsl(var(--color-muted)/0.2)]"
                            >
                                {/* Image Preview with click handler */}
                                <div
                                    className="aspect-square flex items-center justify-center overflow-hidden bg-[hsl(var(--color-muted)/0.1)] cursor-pointer"
                                    onClick={() => setSelectedImage(image)}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={imagePreviewUrls[image.index]}
                                        alt={image.name}
                                        className="max-w-full max-h-full object-contain transition-transform group-hover:scale-105"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <svg className="w-8 h-8 text-white drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M15 3h6v6M14 10l6.1-6.1M9 21H3v-6M10 14l-6.1 6.1" />
                                        </svg>
                                    </div>
                                </div>

                                {/* Image Info */}
                                <div className="p-2">
                                    <p className="text-xs font-medium text-[hsl(var(--color-foreground))] truncate" title={image.name}>
                                        {image.name}
                                    </p>
                                    <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                                        {image.width}×{image.height} • {formatSize(image.size)}
                                    </p>
                                    <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                                        {tTools('extractImages.page') || 'Page'} {image.pageNumber}
                                    </p>
                                </div>

                                {/* Download Button Overlay */}
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownloadImage(image);
                                    }}
                                    className="absolute top-2 right-2 p-1.5 rounded-[var(--radius-md)] bg-[hsl(var(--color-background)/0.9)] border border-[hsl(var(--color-border))] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[hsl(var(--color-primary))] hover:text-white"
                                    aria-label={`Download ${image.name}`}
                                >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="7 10 12 15 17 10" />
                                        <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Success Message */}
            {status === 'complete' && extractedImages.length > 0 && (
                <div
                    className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
                    role="status"
                >
                    <p className="text-sm font-medium">
                        {tTools('extractImages.successMessage') || `Successfully extracted ${extractedImages.length} image(s). Click to download individual images or use "Download as ZIP".`}
                    </p>
                </div>
            )}

            {/* Image Preview Modal */}
            {selectedImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    onClick={() => setSelectedImage(null)}
                >
                    <div
                        className="relative max-w-full max-h-full flex flex-col items-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Close Button */}
                        <button
                            className="absolute -top-12 right-0 p-2 text-white hover:text-white/80 transition-colors"
                            onClick={() => setSelectedImage(null)}
                        >
                            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>

                        {/* Image */}
                        <img
                            src={imagePreviewUrls[selectedImage.index]}
                            alt={selectedImage.name}
                            className="max-w-full max-h-[85vh] object-contain rounded shadow-2xl bg-[hsl(var(--color-background))]"
                        />

                        {/* Info Bar */}
                        <div className="mt-4 flex items-center gap-4 px-6 py-3 bg-[hsl(var(--color-background))] rounded-full shadow-lg">
                            <div className="text-sm text-[hsl(var(--color-foreground))]">
                                <span className="font-medium mr-2">{selectedImage.name}</span>
                                <span className="text-[hsl(var(--color-muted-foreground))]">
                                    {selectedImage.width}×{selectedImage.height} • {formatSize(selectedImage.size)}
                                </span>
                            </div>
                            <div className="h-4 w-px bg-[hsl(var(--color-border))]" />
                            <Button
                                size="sm"
                                variant="primary"
                                onClick={() => handleDownloadImage(selectedImage)}
                            >
                                {t('buttons.download') || 'Download'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ExtractImagesTool;
