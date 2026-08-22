'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { imagesToPDF, imagesToPDFBatch, type PageSizeType, type ImageToPDFOptions, type BatchExportResult } from '@/lib/pdf/processors/image-to-pdf';
import type { UploadedFile, ProcessOutput } from '@/types/pdf';

/**
 * Generate a unique ID for files
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface ImageToPDFToolProps {
  /** Custom class name */
  className?: string;
  /** Specific image type filter (e.g., 'jpg', 'png') */
  imageType?: string;
}

/**
 * ImageToPDFTool Component
 * Requirements: 5.1, 5.2
 * 
 * Converts images to PDF with support for multiple formats.
 */
export function ImageToPDFTool({ className = '', imageType }: ImageToPDFToolProps) {
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
  const [svgScale, setSvgScale] = useState(2); // SVG render scale for quality

  // Batch mode options
  const [batchMode, setBatchMode] = useState(false);
  const [imagesPerPdf, setImagesPerPdf] = useState(10);
  const [batchResult, setBatchResult] = useState<BatchExportResult | null>(null);

  // Drag state for reordering
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Ref for cancellation
  const cancelledRef = useRef(false);

  /**
   * Get accepted file types based on imageType prop
   */
  const getAcceptedTypes = useCallback(() => {
    if (imageType) {
      switch (imageType.toLowerCase()) {
        case 'jpg':
        case 'jpeg':
          return ['image/jpeg', '.jpg', '.jpeg'];
        case 'png':
          return ['image/png', '.png'];
        case 'webp':
          return ['image/webp', '.webp'];
        case 'bmp':
          return ['image/bmp', '.bmp'];
        case 'tiff':
        case 'tif':
          return ['image/tiff', '.tiff', '.tif'];
        case 'svg':
          return ['image/svg+xml', '.svg'];
        case 'heic':
        case 'heif':
          return ['image/heic', 'image/heif', '.heic', '.heif'];
        default:
          break;
      }
    }
    // All supported formats
    return [
      'image/jpeg', 'image/png', 'image/webp', 'image/bmp',
      'image/tiff', 'image/svg+xml', 'image/heic', 'image/heif',
      '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif', '.svg', '.heic', '.heif'
    ];
  }, [imageType]);


  /**
   * Handle files selected from uploader
   */
  const handleFilesSelected = useCallback((newFiles: File[]) => {
    const uploadedFiles: UploadedFile[] = newFiles.map(file => ({
      id: generateId(),
      file,
      status: 'pending' as const,
      preview: URL.createObjectURL(file),
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
    setBatchResult(null);
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
   * Handle convert operation
   */
  const handleConvert = useCallback(async () => {
    if (files.length < 1) {
      setError('Please add at least 1 image file.');
      return;
    }

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);
    setBatchResult(null);

    const options: Partial<ImageToPDFOptions> = {
      pageSize,
      orientation,
      margin,
      centerImage,
      scaleToFit,
      svgScale,
    };

    try {
      // Check if batch mode is enabled and there are enough images
      if (batchMode && files.length > imagesPerPdf) {
        // Batch export mode
        const output = await imagesToPDFBatch(
          files.map(f => f.file),
          imagesPerPdf,
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
          setBatchResult(output.result);
          setStatus('complete');
        } else {
          setError(output.error?.message || 'Failed to create batch PDFs.');
          setStatus('error');
        }
      } else {
        // Single PDF mode
        const output: ProcessOutput = await imagesToPDF(
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
          setError(output.error?.message || 'Failed to convert images to PDF.');
          setStatus('error');
        }
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setStatus('error');
      }
    }
  }, [files, pageSize, orientation, margin, centerImage, scaleToFit, svgScale, batchMode, imagesPerPdf]);

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
        accept={getAcceptedTypes()}
        multiple
        maxFiles={100}
        onFilesSelected={handleFilesSelected}
        onError={handleUploadError}
        disabled={isProcessing}
        label={tTools('imageToPdf.uploadLabel') || 'Upload Images'}
        description={tTools('imageToPdf.uploadDescription') || 'Drag and drop images here, or click to browse. Supports JPG, PNG, WebP, BMP, TIFF, SVG, HEIC.'}
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

      {/* Image List */}
      {files.length > 0 && (
        <Card variant="outlined" size="lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))]">
              {tTools('imageToPdf.imagesTitle') || 'Images'} ({files.length})
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
            {tTools('imageToPdf.reorderHint') || 'Drag and drop to reorder images. Images will appear in the PDF in the order shown.'}
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
                {/* Image Preview */}
                <div className="aspect-square bg-[hsl(var(--color-muted)/0.3)]">
                  {file.preview && (
                    <img
                      src={file.preview}
                      alt={file.file.name}
                      className="w-full h-full object-cover"
                    />
                  )}
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
            {tTools('imageToPdf.optionsTitle') || 'PDF Options'}
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

          {/* Batch Export Options */}
          {files.length > 1 && (
            <div className="mt-4 pt-4 border-t border-[hsl(var(--color-border))]">
              <label className="flex items-center gap-3 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={batchMode}
                  onChange={(e) => setBatchMode(e.target.checked)}
                  disabled={isProcessing}
                  className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
                />
                <span className="text-sm font-medium text-[hsl(var(--color-foreground))]">
                  {tTools('imageToPdf.batchMode') || 'Split into multiple PDFs'}
                </span>
              </label>

              {batchMode && (
                <div className="ml-7 space-y-2">
                  <label className="block text-sm text-[hsl(var(--color-foreground))]">
                    {tTools('imageToPdf.imagesPerPdf') || 'Images per PDF'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={files.length}
                    value={imagesPerPdf}
                    onChange={(e) => setImagesPerPdf(Math.max(1, Math.min(files.length, parseInt(e.target.value) || 1)))}
                    disabled={isProcessing}
                    className="w-24 px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                  />
                  <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                    {tTools('imageToPdf.batchModeHint', { pdfCount: Math.ceil(files.length / imagesPerPdf) }) ||
                      `Will create ${Math.ceil(files.length / imagesPerPdf)} PDF file(s), packaged as a ZIP archive.`}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* SVG Quality Option - only show for SVG files */}
          {(imageType === 'svg' || files.some(f => f.file.name.toLowerCase().endsWith('.svg') || f.file.type === 'image/svg+xml')) && (
            <div className="mt-4 pt-4 border-t border-[hsl(var(--color-border))]">
              <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                {tTools('imageToPdf.svgQuality') || 'SVG Export Quality'}
              </label>
              <select
                value={svgScale}
                onChange={(e) => setSvgScale(Number(e.target.value))}
                disabled={isProcessing}
                className="w-full sm:w-auto px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
              >
                <option value="1">{tTools('imageToPdf.svgQualityLow') || 'Low (1x - smaller file)'}</option>
                <option value="2">{tTools('imageToPdf.svgQualityMedium') || 'Medium (2x - balanced)'}</option>
                <option value="3">{tTools('imageToPdf.svgQualityHigh') || 'High (3x - better quality)'}</option>
                <option value="4">{tTools('imageToPdf.svgQualityVeryHigh') || 'Very High (4x - best quality)'}</option>
              </select>
              <p className="mt-1 text-xs text-[hsl(var(--color-muted-foreground))]">
                {tTools('imageToPdf.svgQualityHint') || 'Higher quality produces sharper images but larger file sizes.'}
              </p>
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
            filename={files.length === 1 ? `${files[0].file.name.replace(/\.[^/.]+$/, '')}.pdf` : `images_${files.length}_pages.pdf`}
            variant="secondary"
            size="lg"
            showFileSize
          />
        )}

        {batchResult && (
          <DownloadButton
            file={batchResult.zipBlob}
            filename={`images_${batchResult.pdfCount}_pdfs.zip`}
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
            {tTools('imageToPdf.successMessage') || 'Images converted to PDF successfully! Click the download button to save your file.'}
          </p>
        </div>
      )}

      {/* Batch Success Message */}
      {status === 'complete' && batchResult && (
        <div
          className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
          role="status"
        >
          <p className="text-sm font-medium">
            {tTools('imageToPdf.batchSuccessMessage', { pdfCount: batchResult.pdfCount, imageCount: batchResult.imageCount }) ||
              `Successfully created ${batchResult.pdfCount} PDF files from ${batchResult.imageCount} images! Click the download button to save your ZIP archive.`}
          </p>
        </div>
      )}
    </div>
  );
}

export default ImageToPDFTool;
