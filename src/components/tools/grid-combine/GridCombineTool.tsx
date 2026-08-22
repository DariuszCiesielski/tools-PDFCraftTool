'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { createGridCombinePDF, type GridCombineOptions } from '@/lib/pdf/processors/grid-combine';
import { loadPdfjs } from '@/lib/pdf/loader';
import type { UploadedFile, ProcessOutput } from '@/types/pdf';

/**
 * Generate a unique ID for files
 */
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Extended file type with thumbnail
 */
interface ExtendedUploadedFile extends UploadedFile {
    thumbnail?: string;
    pageCount?: number;
}

export interface GridCombineToolProps {
    /** Custom class name */
    className?: string;
}

/**
 * GridCombineTool Component
 * 
 * Provides the UI for combining multiple PDFs into a grid layout.
 */
export function GridCombineTool({ className = '' }: GridCombineToolProps) {
    const t = useTranslations('common');
    const tTools = useTranslations('tools');

    // State
    const [files, setFiles] = useState<ExtendedUploadedFile[]>([]);
    const [status, setStatus] = useState<ProcessingStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [result, setResult] = useState<Blob | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [errorDetails, setErrorDetails] = useState<string | null>(null);

    // Options
    const [gridLayout, setGridLayout] = useState<GridCombineOptions['gridLayout']>('2x2');
    const [pageSize, setPageSize] = useState<GridCombineOptions['pageSize']>('A4');
    const [orientation, setOrientation] = useState<GridCombineOptions['orientation']>('landscape');
    const [useMargins, setUseMargins] = useState(true);
    const [addBorder, setAddBorder] = useState(true);
    const [borderColor, setBorderColor] = useState('#CCCCCC');
    const [spacing, setSpacing] = useState(10);
    const [fillMode, setFillMode] = useState<GridCombineOptions['fillMode']>('leave-empty');
    const [pageMode, setPageMode] = useState<GridCombineOptions['pageMode']>('first-page-only');

    // Drag state
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    // Ref for cancellation
    const cancelledRef = useRef(false);

    /**
     * Generate thumbnail for PDF file
     */
    const generateThumbnail = useCallback(async (file: File): Promise<{ thumbnail: string; pageCount: number } | null> => {
        try {
            // Use the centralized loader which configures the worker correctly
            const pdfjsLib = await loadPdfjs();

            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const pageCount = pdf.numPages;

            // Get first page
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 0.3 });

            // Create canvas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) return null;

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({
                canvasContext: context,
                viewport: viewport,
            }).promise;

            const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
            return { thumbnail, pageCount };
        } catch (err) {
            console.error('Failed to generate thumbnail:', err);
            return null;
        }
    }, []);

    /**
     * Handle files selected from uploader
     */
    const handleFilesSelected = useCallback(async (newFiles: File[]) => {
        const uploadedFiles: ExtendedUploadedFile[] = newFiles.map(file => ({
            id: generateId(),
            file,
            status: 'pending' as const,
        }));

        setFiles(prev => [...prev, ...uploadedFiles]);
        setError(null);
        setErrorDetails(null);
        setResult(null);

        // Generate thumbnails in background
        for (const uploadedFile of uploadedFiles) {
            const result = await generateThumbnail(uploadedFile.file);
            if (result) {
                setFiles(prev => prev.map(f =>
                    f.id === uploadedFile.id
                        ? { ...f, thumbnail: result.thumbnail, pageCount: result.pageCount }
                        : f
                ));
            }
        }
    }, [generateThumbnail]);

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
        setResult(null);
    }, []);

    /**
     * Clear all files
     */
    const handleClearAll = useCallback(() => {
        setFiles([]);
        setResult(null);
        setError(null);
        setErrorDetails(null);
        setStatus('idle');
        setProgress(0);
    }, []);

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
     * Move file up in the list
     */
    const handleMoveUp = useCallback((index: number) => {
        if (index === 0) return;
        setFiles(prev => {
            const newFiles = [...prev];
            [newFiles[index - 1], newFiles[index]] = [newFiles[index], newFiles[index - 1]];
            return newFiles;
        });
    }, []);

    /**
     * Move file down in the list
     */
    const handleMoveDown = useCallback((index: number) => {
        setFiles(prev => {
            if (index === prev.length - 1) return prev;
            const newFiles = [...prev];
            [newFiles[index], newFiles[index + 1]] = [newFiles[index + 1], newFiles[index]];
            return newFiles;
        });
    }, []);

    /**
     * Handle combine operation
     */
    const handleCombine = useCallback(async () => {
        if (files.length < 2) {
            setError(tTools('gridCombine.minFilesError') || 'Please add at least 2 PDF files to combine.');
            return;
        }

        cancelledRef.current = false;
        setStatus('processing');
        setProgress(0);
        setError(null);
        setErrorDetails(null);
        setResult(null);

        const options: Partial<GridCombineOptions> = {
            gridLayout,
            pageSize,
            orientation,
            useMargins,
            addBorder,
            borderColor,
            spacing,
            fillMode,
            pageMode,
        };

        try {
            const output: ProcessOutput = await createGridCombinePDF(
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

            if (output.success && output.result) {
                setResult(output.result as Blob);
                setStatus('complete');
            } else {
                setError(output.error?.message || 'Failed to combine PDF files.');
                setErrorDetails(output.error?.details || null);
                setStatus('error');
            }
        } catch (err) {
            if (!cancelledRef.current) {
                const errMsg = err instanceof Error ? err.message : 'An unexpected error occurred.';
                const errStack = err instanceof Error ? err.stack : undefined;
                setError(errMsg);
                setErrorDetails(errStack || null);
                setStatus('error');
            }
        }
    }, [files, gridLayout, pageSize, orientation, useMargins, addBorder, borderColor, spacing, fillMode, pageMode, tTools]);

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
    const canCombine = files.length >= 2 && !isProcessing;

    // Calculate preview info
    const [cols, rows] = gridLayout.split('x').map(Number);
    const cellsPerPage = cols * rows;

    // Calculate total pages based on pageMode
    const totalSourcePages = pageMode === 'all-pages'
        ? files.reduce((sum, f) => sum + (f.pageCount || 1), 0)
        : files.length;
    const outputPages = Math.ceil(totalSourcePages / cellsPerPage);

    return (
        <div className={`space-y-6 ${className}`.trim()}>
            {/* File Upload Area */}
            <FileUploader
                accept={['application/pdf', '.pdf']}
                multiple
                maxFiles={100}
                onFilesSelected={handleFilesSelected}
                onError={handleUploadError}
                disabled={isProcessing}
                label={tTools('gridCombine.uploadLabel') || 'Upload PDF Files'}
                description={tTools('gridCombine.uploadDescription') || 'Drag and drop multiple PDF files here.'}
            />

            {/* Error Message */}
            {error && (
                <div className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700" role="alert">
                    <p className="text-sm font-medium">{error}</p>
                    {errorDetails && (
                        <details className="mt-2">
                            <summary className="text-xs cursor-pointer hover:underline text-red-500">
                                {tTools('gridCombine.showErrorDetails') || 'Show error details'}
                            </summary>
                            <pre className="mt-2 p-2 text-xs bg-red-100 rounded overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">{errorDetails}</pre>
                        </details>
                    )}
                </div>
            )}

            {/* Preview Info */}
            {files.length > 0 && (
                <Card variant="outlined" className="bg-blue-50 border-blue-200">
                    <div className="flex items-center gap-2 text-blue-800">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm font-medium">
                            {pageMode === 'all-pages'
                                ? tTools('gridCombine.previewInfoAllPages', { fileCount: files.length, totalPages: totalSourcePages, layout: gridLayout, outputPages })
                                : tTools('gridCombine.previewInfoFirstPage', { fileCount: files.length, layout: gridLayout, outputPages })
                            }
                        </p>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* File List (2/3 width) */}
                <div className="lg:col-span-2 space-y-4">
                    {files.length > 0 && (
                        <Card variant="outlined" size="lg">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))]">
                                    {tTools('gridCombine.filesTitle') || 'Files to Combine'} ({files.length})
                                </h3>
                                <Button variant="ghost" size="sm" onClick={handleClearAll} disabled={isProcessing}>
                                    {t('buttons.clearAll') || 'Clear All'}
                                </Button>
                            </div>

                            <p className="text-sm text-[hsl(var(--color-muted-foreground))] mb-4">
                                {tTools('gridCombine.reorderHint') || 'Drag and drop to reorder files.'}
                            </p>

                            <ul className="space-y-2 max-h-[500px] overflow-y-auto pr-2" role="list">
                                {files.map((file, index) => (
                                    <li
                                        key={file.id}
                                        draggable={!isProcessing}
                                        onDragStart={() => handleDragStart(index)}
                                        onDragOver={(e) => handleDragOver(e, index)}
                                        onDragEnd={handleDragEnd}
                                        className={`
                                            flex items-center gap-3 p-3 rounded-[var(--radius-md)] border transition-all duration-200
                                            ${draggedIndex === index ? 'opacity-50 border-dashed' : ''}
                                            ${dragOverIndex === index ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.05)]' : 'border-[hsl(var(--color-border))]'}
                                            ${!isProcessing ? 'cursor-grab hover:bg-[hsl(var(--color-muted)/0.5)]' : ''}
                                        `}
                                    >
                                        {/* Drag Handle */}
                                        <div className="flex-shrink-0 text-[hsl(var(--color-muted-foreground))]">
                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                <circle cx="9" cy="6" r="1.5" />
                                                <circle cx="15" cy="6" r="1.5" />
                                                <circle cx="9" cy="12" r="1.5" />
                                                <circle cx="15" cy="12" r="1.5" />
                                                <circle cx="9" cy="18" r="1.5" />
                                                <circle cx="15" cy="18" r="1.5" />
                                            </svg>
                                        </div>

                                        {/* File Number */}
                                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[hsl(var(--color-primary))] text-[hsl(var(--color-primary-foreground))] text-xs font-medium flex items-center justify-center">
                                            {index + 1}
                                        </span>

                                        {/* Thumbnail or PDF Icon */}
                                        <div className="flex-shrink-0 w-12 h-16 rounded overflow-hidden bg-[hsl(var(--color-muted))] flex items-center justify-center">
                                            {file.thumbnail ? (
                                                <img src={file.thumbnail} alt={file.file.name} className="w-full h-full object-contain" />
                                            ) : (
                                                <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                                                    <path d="M14 2v6h6" fill="white" />
                                                    <text x="7" y="17" fontSize="6" fill="white" fontWeight="bold">PDF</text>
                                                </svg>
                                            )}
                                        </div>

                                        {/* File Info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-[hsl(var(--color-foreground))] truncate">
                                                {file.file.name}
                                            </p>
                                            <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                                                {formatSize(file.file.size)}
                                                {file.pageCount && ` • ${file.pageCount} ${file.pageCount === 1 ? (tTools('gridCombine.page') || 'page') : (tTools('gridCombine.pages') || 'pages')}`}
                                            </p>
                                        </div>

                                        {/* Reorder Buttons */}
                                        <div className="flex-shrink-0 flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => handleMoveUp(index)}
                                                disabled={index === 0 || isProcessing}
                                                className="p-1 rounded hover:bg-[hsl(var(--color-muted))] disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M18 15l-6-6-6 6" />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleMoveDown(index)}
                                                disabled={index === files.length - 1 || isProcessing}
                                                className="p-1 rounded hover:bg-[hsl(var(--color-muted))] disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M6 9l6 6 6-6" />
                                                </svg>
                                            </button>
                                        </div>

                                        {/* Remove Button */}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveFile(file.id)}
                                            disabled={isProcessing}
                                            className="flex-shrink-0 p-1 rounded hover:bg-red-100 text-[hsl(var(--color-muted-foreground))] hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
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
                </div>

                {/* Options Panel (1/3 width) */}
                <div className="lg:col-span-1">
                    {files.length > 0 && (
                        <Card variant="outlined" className="sticky top-4">
                            <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
                                {tTools('gridCombine.optionsTitle') || 'Layout Options'}
                            </h3>

                            <div className="space-y-4">
                                {/* Grid Layout */}
                                <div>
                                    <label htmlFor="gridLayout" className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-1">
                                        {tTools('gridCombine.gridLayout') || 'Grid Layout'}
                                    </label>
                                    <select
                                        id="gridLayout"
                                        value={gridLayout}
                                        onChange={(e) => setGridLayout(e.target.value as GridCombineOptions['gridLayout'])}
                                        disabled={isProcessing}
                                        className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))]"
                                    >
                                        <option value="1x2">1×2 (2 {tTools('gridCombine.cells') || 'cells'})</option>
                                        <option value="2x1">2×1 (2 {tTools('gridCombine.cells') || 'cells'})</option>
                                        <option value="2x2">2×2 (4 {tTools('gridCombine.cells') || 'cells'})</option>
                                        <option value="2x3">2×3 (6 {tTools('gridCombine.cells') || 'cells'})</option>
                                        <option value="3x2">3×2 (6 {tTools('gridCombine.cells') || 'cells'})</option>
                                        <option value="3x3">3×3 (9 {tTools('gridCombine.cells') || 'cells'})</option>
                                        <option value="4x4">4×4 (16 {tTools('gridCombine.cells') || 'cells'})</option>
                                    </select>

                                    {/* 布局可视化预览 - 带缩略图 */}
                                    <div className="mt-3 p-3 bg-[hsl(var(--color-muted)/0.3)] rounded-[var(--radius-md)]">
                                        <p className="text-xs text-[hsl(var(--color-muted-foreground))] mb-2">
                                            {tTools('gridCombine.layoutPreview') || 'Layout Preview'}:
                                        </p>
                                        <div
                                            className="grid mx-auto border border-[hsl(var(--color-border))] rounded bg-white transition-all duration-300 ease-in-out"
                                            style={{
                                                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                                                gridTemplateRows: `repeat(${rows}, 1fr)`,
                                                width: orientation === 'landscape' ? '160px' : '120px',
                                                height: orientation === 'landscape' ? '120px' : '160px',
                                                gap: `${spacing * 0.3}px`,
                                                padding: useMargins ? '12px' : '4px',
                                            }}
                                        >
                                            {Array.from({ length: cellsPerPage }).map((_, idx) => {
                                                const file = files[idx];
                                                const repeatFile = fillMode === 'repeat' && files.length > 0
                                                    ? files[idx % files.length]
                                                    : fillMode === 'stretch-last' && files.length > 0 && idx >= files.length
                                                        ? files[files.length - 1]
                                                        : null;
                                                const displayFile = file || repeatFile;

                                                return (
                                                    <div
                                                        key={idx}
                                                        className={`
                                                            flex items-center justify-center text-xs font-medium rounded-sm overflow-hidden
                                                            ${displayFile
                                                                ? 'bg-[hsl(var(--color-primary)/0.1)]'
                                                                : 'bg-[hsl(var(--color-muted))] border border-dashed border-[hsl(var(--color-border))]'
                                                            }
                                                        `}
                                                        title={displayFile?.file.name}
                                                    >
                                                        {displayFile?.thumbnail ? (
                                                            <img
                                                                src={displayFile.thumbnail}
                                                                alt=""
                                                                className={`w-full h-full object-contain ${!file && repeatFile ? 'opacity-50' : ''}`}
                                                            />
                                                        ) : displayFile ? (
                                                            <span className={`text-[hsl(var(--color-primary))] ${!file && repeatFile ? 'opacity-50' : ''}`}>
                                                                {idx < files.length ? idx + 1 : '↺'}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <p className="text-xs text-center text-[hsl(var(--color-muted-foreground))] mt-2">
                                            {cols} {tTools('gridCombine.columns') || 'columns'} × {rows} {tTools('gridCombine.rows') || 'rows'}
                                        </p>
                                    </div>
                                </div>

                                {/* Page Mode */}
                                <div>
                                    <label htmlFor="pageMode" className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-1">
                                        {tTools('gridCombine.pageMode') || 'Page Mode'}
                                    </label>
                                    <select
                                        id="pageMode"
                                        value={pageMode}
                                        onChange={(e) => setPageMode(e.target.value as GridCombineOptions['pageMode'])}
                                        disabled={isProcessing}
                                        className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))]"
                                    >
                                        <option value="first-page-only">{tTools('gridCombine.firstPageOnly') || 'First page only'}</option>
                                        <option value="all-pages">{tTools('gridCombine.allPages') || 'All pages'}</option>
                                    </select>
                                    <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-1">
                                        {pageMode === 'all-pages'
                                            ? (tTools('gridCombine.allPagesHint') || 'Include all pages from each PDF in the grid.')
                                            : (tTools('gridCombine.firstPageOnlyHint') || 'Only use the first page from each PDF.')
                                        }
                                    </p>
                                </div>

                                {/* Fill Mode */}
                                <div>
                                    <label htmlFor="fillMode" className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-1">
                                        {tTools('gridCombine.fillMode') || 'Fill Mode'}
                                    </label>
                                    <select
                                        id="fillMode"
                                        value={fillMode}
                                        onChange={(e) => setFillMode(e.target.value as GridCombineOptions['fillMode'])}
                                        disabled={isProcessing}
                                        className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))]"
                                    >
                                        <option value="leave-empty">{tTools('gridCombine.leaveEmpty') || 'Leave empty cells'}</option>
                                        <option value="repeat">{tTools('gridCombine.repeat') || 'Repeat from start'}</option>
                                        <option value="stretch-last">{tTools('gridCombine.stretchLast') || 'Repeat last page'}</option>
                                    </select>
                                    <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-1">
                                        {tTools('gridCombine.fillModeHint') || 'How to fill empty cells when files are fewer than grid cells.'}
                                    </p>
                                </div>

                                {/* Page Size */}
                                <div>
                                    <label htmlFor="pageSize" className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-1">
                                        {tTools('gridCombine.pageSize') || 'Page Size'}
                                    </label>
                                    <select
                                        id="pageSize"
                                        value={pageSize}
                                        onChange={(e) => setPageSize(e.target.value as GridCombineOptions['pageSize'])}
                                        disabled={isProcessing}
                                        className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))]"
                                    >
                                        <option value="A4">A4</option>
                                        <option value="Letter">Letter</option>
                                        <option value="Legal">Legal</option>
                                        <option value="A3">A3</option>
                                    </select>
                                </div>

                                {/* Orientation */}
                                <div>
                                    <label htmlFor="orientation" className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-1">
                                        {tTools('gridCombine.orientation') || 'Orientation'}
                                    </label>
                                    <select
                                        id="orientation"
                                        value={orientation}
                                        onChange={(e) => setOrientation(e.target.value as GridCombineOptions['orientation'])}
                                        disabled={isProcessing}
                                        className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))]"
                                    >
                                        <option value="landscape">{t('options.landscape') || 'Landscape'}</option>
                                        <option value="portrait">{t('options.portrait') || 'Portrait'}</option>
                                    </select>
                                </div>

                                {/* Spacing */}
                                <div>
                                    <label htmlFor="spacing" className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-1">
                                        {tTools('gridCombine.spacing') || 'Spacing'} ({spacing}px)
                                    </label>
                                    <input
                                        type="range"
                                        id="spacing"
                                        min="0"
                                        max="50"
                                        step="1"
                                        value={spacing}
                                        onChange={(e) => setSpacing(Number(e.target.value))}
                                        disabled={isProcessing}
                                        className="w-full"
                                    />
                                </div>

                                {/* Margins & Borders */}
                                <div className="space-y-2 pt-2 border-t border-[hsl(var(--color-border))]">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="useMargins"
                                            checked={useMargins}
                                            onChange={(e) => setUseMargins(e.target.checked)}
                                            disabled={isProcessing}
                                            className="w-4 h-4 rounded border-[hsl(var(--color-border))]"
                                        />
                                        <label htmlFor="useMargins" className="text-sm text-[hsl(var(--color-foreground))]">
                                            {tTools('gridCombine.useMargins') || 'Add margins'}
                                        </label>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="addBorder"
                                            checked={addBorder}
                                            onChange={(e) => setAddBorder(e.target.checked)}
                                            disabled={isProcessing}
                                            className="w-4 h-4 rounded border-[hsl(var(--color-border))]"
                                        />
                                        <label htmlFor="addBorder" className="text-sm text-[hsl(var(--color-foreground))]">
                                            {tTools('gridCombine.addBorder') || 'Add borders'}
                                        </label>
                                    </div>

                                    {addBorder && (
                                        <div className="pl-6">
                                            <label htmlFor="borderColor" className="block text-xs text-[hsl(var(--color-muted-foreground))] mb-1">
                                                {tTools('gridCombine.borderColor') || 'Border Color'}
                                            </label>
                                            <input
                                                type="color"
                                                id="borderColor"
                                                value={borderColor}
                                                onChange={(e) => setBorderColor(e.target.value)}
                                                disabled={isProcessing}
                                                className="w-full h-8 rounded border border-[hsl(var(--color-border))] cursor-pointer p-0"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Card>
                    )}
                </div>
            </div>

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
            {files.length > 0 && (
                <div className="flex flex-wrap items-center gap-4">
                    <Button
                        variant="primary"
                        size="lg"
                        onClick={handleCombine}
                        disabled={!canCombine}
                        loading={isProcessing}
                    >
                        {isProcessing
                            ? (t('status.processing') || 'Processing...')
                            : (tTools('gridCombine.combineButton') || 'Combine PDFs')
                        }
                    </Button>

                    {result && (
                        <DownloadButton
                            file={result}
                            filename={`grid_combine_${files.length}_files.pdf`}
                            variant="secondary"
                            size="lg"
                            showFileSize
                        />
                    )}
                </div>
            )}

            {/* Success Message */}
            {status === 'complete' && result && (
                <div className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700" role="status">
                    <p className="text-sm font-medium">
                        {tTools('gridCombine.successMessage') || 'PDFs combined successfully! Click the download button to save your file.'}
                    </p>
                </div>
            )}
        </div>
    );
}

export default GridCombineTool;
