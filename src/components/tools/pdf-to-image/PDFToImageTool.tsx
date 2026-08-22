'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { pdfToImages, type ImageFormat, type PDFToImageOptions, type PageLayoutPreset } from '@/lib/pdf/processors/pdf-to-image';
import type { UploadedFile, ProcessOutput } from '@/types/pdf';
import JSZip from 'jszip';

/**
 * Generate a unique ID for files
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface PDFToImageToolProps {
  /** Custom class name */
  className?: string;
  /** Specific output format (e.g., 'jpg', 'png') */
  outputFormat?: ImageFormat;
}

/**
 * PDFToImageTool Component
 * Requirements: 5.1, 5.2
 * 
 * Converts PDF pages to images (JPG, PNG, WebP, BMP, TIFF).
 */
export function PDFToImageTool({ className = '', outputFormat }: PDFToImageToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');

  // State
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | Blob[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Options state
  const [format, setFormat] = useState<ImageFormat>(outputFormat || 'png');
  const [quality, setQuality] = useState(0.92);
  const [scale, setScale] = useState(2);
  const [pageRange, setPageRange] = useState('');

  // Page layout state
  const [layoutPreset, setLayoutPreset] = useState<PageLayoutPreset>('1x1');
  const [customColumns, setCustomColumns] = useState(2);
  const [customRows, setCustomRows] = useState(2);
  const [skipFirstPage, setSkipFirstPage] = useState(false);

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
   * Parse page range string to array of page numbers
   */
  const parsePageRange = (rangeStr: string): number[] => {
    if (!rangeStr.trim()) return [];

    const pages: number[] = [];
    const parts = rangeStr.split(',');

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map(s => parseInt(s.trim(), 10));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            if (!pages.includes(i)) pages.push(i);
          }
        }
      } else {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && !pages.includes(num)) {
          pages.push(num);
        }
      }
    }

    return pages.sort((a, b) => a - b);
  };

  /**
   * Handle convert operation
   */
  const handleConvert = useCallback(async () => {
    if (!file) {
      setError('Please upload a PDF file.');
      return;
    }

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);

    // Calculate actual columns and rows from preset
    const getGridDimensions = (): [number, number] => {
      switch (layoutPreset) {
        case '1x1': return [1, 1];
        case '2x1': return [2, 1];
        case '1x2': return [1, 2];
        case '2x2': return [2, 2];
        case '3x3': return [3, 3];
        case 'custom': return [customColumns, customRows];
        default: return [1, 1];
      }
    };

    const [cols, rows] = getGridDimensions();

    const options: Partial<PDFToImageOptions> = {
      format,
      quality,
      scale,
      pages: parsePageRange(pageRange),
      pageLayout: {
        preset: layoutPreset,
        columns: cols,
        rows: rows,
        skipFirstPage,
      },
    };

    try {
      const output: ProcessOutput = await pdfToImages(
        file.file,
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
        setResult(output.result);
        setStatus('complete');
      } else {
        setError(output.error?.message || 'Failed to convert PDF to images.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setStatus('error');
      }
    }
  }, [file, format, quality, scale, pageRange, layoutPreset, customColumns, customRows, skipFirstPage]);

  /**
   * Handle cancel operation
   */
  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setStatus('idle');
    setProgress(0);
  }, []);

  /**
   * Download all images as ZIP
   */
  const handleDownloadZip = useCallback(async () => {
    if (!result || !Array.isArray(result) || !file) return;

    const zip = new JSZip();
    const baseName = file.file.name.replace(/\.pdf$/i, '');
    const ext = format === 'jpeg' ? 'jpg' : format;

    result.forEach((blob, index) => {
      zip.file(`${baseName}_page_${index + 1}.${ext}`, blob);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_images.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, file, format]);

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
  const isMultipleImages = Array.isArray(result) && result.length > 1;

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {/* File Upload Area */}
      <FileUploader
        accept={['application/pdf', '.pdf']}
        multiple={false}
        maxFiles={1}
        onFilesSelected={handleFilesSelected}
        onError={handleUploadError}
        disabled={isProcessing}
        label={tTools('pdfToImage.uploadLabel') || 'Upload PDF'}
        description={tTools('pdfToImage.uploadDescription') || 'Drag and drop a PDF file here, or click to browse.'}
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

      {/* File Info */}
      {file && (
        <Card variant="outlined" size="lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[hsl(var(--color-primary)/0.1)] flex items-center justify-center">
                <svg className="w-5 h-5 text-[hsl(var(--color-primary))]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-[hsl(var(--color-foreground))]">{file.file.name}</p>
                <p className="text-sm text-[hsl(var(--color-muted-foreground))]">{formatSize(file.file.size)}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveFile}
              disabled={isProcessing}
            >
              {t('buttons.remove') || 'Remove'}
            </Button>
          </div>
        </Card>
      )}


      {/* Options Panel */}
      {file && (
        <Card variant="outlined">
          <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
            {tTools('pdfToImage.optionsTitle') || 'Conversion Options'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Output Format */}
            {!outputFormat && (
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                  {tTools('pdfToImage.format') || 'Output Format'}
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as ImageFormat)}
                  disabled={isProcessing}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                >
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                  <option value="webp">WebP</option>
                  <option value="bmp">BMP</option>
                  <option value="tiff">TIFF</option>
                </select>
              </div>
            )}

            {/* Quality (for lossy formats) */}
            {['jpg', 'jpeg', 'webp'].includes(format) && (
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                  {tTools('pdfToImage.quality') || 'Quality'} ({Math.round(quality * 100)}%)
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={quality}
                  onChange={(e) => setQuality(parseFloat(e.target.value))}
                  disabled={isProcessing}
                  className="w-full"
                />
              </div>
            )}

            {/* Scale/DPI */}
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                {tTools('pdfToImage.resolution') || 'Resolution'}
              </label>
              <select
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                disabled={isProcessing}
                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
              >
                <option value="1">72 DPI (Low)</option>
                <option value="2">144 DPI (Medium)</option>
                <option value="3">216 DPI (High)</option>
                <option value="4">288 DPI (Very High)</option>
              </select>
            </div>

            {/* Page Range */}
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                {tTools('pdfToImage.pageRange') || 'Page Range'}
              </label>
              <input
                type="text"
                value={pageRange}
                onChange={(e) => setPageRange(e.target.value)}
                placeholder={tTools('pdfToImage.pageRangePlaceholder') || 'e.g., 1-3, 5, 7'}
                disabled={isProcessing}
                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
              />
              <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-1">
                {tTools('pdfToImage.pageRangeHint') || 'Leave empty for all pages'}
              </p>
            </div>
          </div>

          {/* Page Layout Section */}
          <div className="mt-4 pt-4 border-t border-[hsl(var(--color-border))]">
            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-3">
              {tTools('pdfToImage.layoutTitle') || 'Page Layout'}
            </label>

            {/* Layout Preset Selection */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
              {([
                { value: '1x1', label: '1×1', cols: 1, rows: 1 },
                { value: '2x1', label: '2×1', cols: 2, rows: 1 },
                { value: '1x2', label: '1×2', cols: 1, rows: 2 },
                { value: '2x2', label: '2×2', cols: 2, rows: 2 },
                { value: '3x3', label: '3×3', cols: 3, rows: 3 },
                { value: 'custom', label: tTools('pdfToImage.customLayout') || 'Custom', cols: customColumns, rows: customRows },
              ] as const).map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setLayoutPreset(preset.value)}
                  disabled={isProcessing}
                  className={`
                    p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1.5
                    ${layoutPreset === preset.value
                      ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.05)]'
                      : 'border-[hsl(var(--color-border))] hover:border-[hsl(var(--color-primary)/0.5)]'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  {/* Mini grid preview */}
                  <div
                    className="grid gap-0.5"
                    style={{
                      gridTemplateColumns: `repeat(${preset.cols}, 1fr)`,
                      gridTemplateRows: `repeat(${preset.rows}, 1fr)`,
                      width: '32px',
                      height: '24px',
                    }}
                  >
                    {Array.from({ length: preset.cols * preset.rows }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`rounded-sm ${layoutPreset === preset.value
                          ? 'bg-[hsl(var(--color-primary))]'
                          : 'bg-[hsl(var(--color-muted-foreground)/0.3)]'
                          }`}
                      />
                    ))}
                  </div>
                  <span className={`text-xs font-medium ${layoutPreset === preset.value
                    ? 'text-[hsl(var(--color-primary))]'
                    : 'text-[hsl(var(--color-muted-foreground))]'
                    }`}>
                    {preset.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Custom Layout Inputs */}
            {layoutPreset === 'custom' && (
              <div className="flex gap-4 mb-4 p-3 rounded-lg bg-[hsl(var(--color-muted)/0.3)]">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-[hsl(var(--color-foreground))] mb-1">
                    {tTools('pdfToImage.columns') || 'Columns'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={customColumns}
                    onChange={(e) => setCustomColumns(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                    disabled={isProcessing}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-[hsl(var(--color-foreground))] mb-1">
                    {tTools('pdfToImage.rows') || 'Rows'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={customRows}
                    onChange={(e) => setCustomRows(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                    disabled={isProcessing}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                  />
                </div>
              </div>
            )}

            {/* Skip First Page Option - only show when layout is not 1x1 */}
            {layoutPreset !== '1x1' && (
              <label className="flex items-center gap-3 cursor-pointer mb-4">
                <input
                  type="checkbox"
                  checked={skipFirstPage}
                  onChange={(e) => setSkipFirstPage(e.target.checked)}
                  disabled={isProcessing}
                  className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
                />
                <span className="text-sm text-[hsl(var(--color-foreground))]">
                  {tTools('pdfToImage.skipFirstPage') || 'Without first/cover page'}
                </span>
              </label>
            )}

            {/* Layout Preview */}
            {layoutPreset !== '1x1' && (
              <div className="p-4 rounded-xl bg-gradient-to-br from-[hsl(var(--color-muted))] to-[hsl(var(--color-background))] border border-[hsl(var(--color-border))]">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-[hsl(var(--color-primary))]"></div>
                  <h4 className="text-sm font-semibold text-[hsl(var(--color-foreground))]">
                    {tTools('pdfToImage.layoutPreview') || 'Layout Preview'}
                  </h4>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  {/* Grid visualization */}
                  <div
                    className="border-2 border-[hsl(var(--color-primary)/0.3)] rounded-lg p-3 bg-white"
                    style={{ width: '140px', height: '100px' }}
                  >
                    <div
                      className="w-full h-full grid gap-1"
                      style={{
                        gridTemplateColumns: `repeat(${layoutPreset === 'custom' ? customColumns : parseInt(layoutPreset.split('x')[0])}, 1fr)`,
                        gridTemplateRows: `repeat(${layoutPreset === 'custom' ? customRows : parseInt(layoutPreset.split('x')[1])}, 1fr)`,
                      }}
                    >
                      {Array.from({ length: (layoutPreset === 'custom' ? customColumns * customRows : parseInt(layoutPreset.split('x')[0]) * parseInt(layoutPreset.split('x')[1])) }).map((_, idx) => (
                        <div
                          key={idx}
                          className="bg-gradient-to-br from-[hsl(var(--color-primary)/0.15)] to-[hsl(var(--color-primary)/0.05)] border border-[hsl(var(--color-primary)/0.2)] rounded flex items-center justify-center text-xs font-bold text-[hsl(var(--color-primary))]"
                        >
                          {idx + 1}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 text-sm text-[hsl(var(--color-muted-foreground))]">
                    <p>
                      <span className="font-medium text-[hsl(var(--color-foreground))]">
                        {layoutPreset === 'custom' ? `${customColumns}×${customRows}` : layoutPreset.replace('x', '×')}
                      </span>
                      {' '}{tTools('pdfToImage.pagesPerImage') || 'pages per image'}
                    </p>
                    {skipFirstPage && (
                      <p className="mt-1 text-xs">
                        ℹ️ {tTools('pdfToImage.skipFirstPageHint') || 'The first page (cover) will be rendered as a separate image'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-3">
              {tTools('pdfToImage.layoutHint') || 'Combine multiple PDF pages into a single image with the selected grid layout.'}
            </p>
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
            : (tTools('pdfToImage.convertButton') || 'Convert to Images')
          }
        </Button>

        {result && !isMultipleImages && (
          <DownloadButton
            file={result as Blob}
            filename={`${file?.file.name.replace(/\.pdf$/i, '')}.${format === 'jpeg' ? 'jpg' : format}`}
            variant="secondary"
            size="lg"
            showFileSize
          />
        )}

        {isMultipleImages && (
          <Button
            variant="secondary"
            size="lg"
            onClick={handleDownloadZip}
          >
            {tTools('pdfToImage.downloadZip') || `Download All (${(result as Blob[]).length} images)`}
          </Button>
        )}
      </div>

      {/* Image Preview for multiple images */}
      {isMultipleImages && (
        <Card variant="outlined" size="lg">
          <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
            {tTools('pdfToImage.previewTitle') || 'Converted Images'} ({(result as Blob[]).length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {(result as Blob[]).map((blob, index) => (
              <div key={index} className="relative group">
                <div className="aspect-[3/4] rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] overflow-hidden bg-[hsl(var(--color-muted)/0.3)]">
                  <img
                    src={URL.createObjectURL(blob)}
                    alt={`Page ${index + 1}`}
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="absolute top-2 left-2 px-2 py-1 rounded bg-black/50 text-white text-xs">
                  {index + 1}
                </span>
                <DownloadButton
                  file={blob}
                  filename={`${file?.file.name.replace(/\.pdf$/i, '')}_page_${index + 1}.${format === 'jpeg' ? 'jpg' : format}`}
                  variant="ghost"
                  size="sm"
                  className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Success Message */}
      {status === 'complete' && result && (
        <div
          className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
          role="status"
        >
          <p className="text-sm font-medium">
            {tTools('pdfToImage.successMessage') || 'PDF converted to images successfully! Click the download button to save your files.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default PDFToImageTool;
