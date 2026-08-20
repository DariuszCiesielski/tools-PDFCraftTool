'use client';

import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { configurePdfjsWorker } from '@/lib/pdf/loader';

// Use useLayoutEffect on client, useEffect on server (for SSR compatibility)
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface ComparePDFsToolProps {
  /** Custom class name */
  className?: string;
}

interface PDFFile {
  id: string;
  file: File;
  pageCount: number;
  pages: ImageData[];
}

interface DifferenceResult {
  pageIndex: number;
  hasDifference: boolean;
  differencePercentage: number;
  diffImageUrl?: string;
}

/**
 * Generate a unique ID for files
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * ComparePDFsTool Component
 * Requirements: 5.1
 * 
 * Provides side-by-side PDF comparison with difference highlighting.
 */
export function ComparePDFsTool({ className = '' }: ComparePDFsToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');

  // State
  const [file1, setFile1] = useState<PDFFile | null>(null);
  const [file2, setFile2] = useState<PDFFile | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [differences, setDifferences] = useState<DifferenceResult[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [viewMode, setViewMode] = useState<'side-by-side' | 'overlay' | 'diff'>('side-by-side');
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Canvas refs for rendering
  const canvas1Ref = useRef<HTMLCanvasElement>(null);
  const canvas2Ref = useRef<HTMLCanvasElement>(null);
  const diffCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Scroll container refs for synchronized scrolling
  const scrollContainer1Ref = useRef<HTMLDivElement>(null);
  const scrollContainer2Ref = useRef<HTMLDivElement>(null);
  const isScrollingSyncRef = useRef(false);
  
  // Ref for fullscreen container
  const comparisonContainerRef = useRef<HTMLDivElement>(null);
  
  // Ref for cancellation
  const cancelledRef = useRef(false);

  /**
   * Load PDF and render pages to images
   */
  const loadPDF = useCallback(async (file: File, slot: 1 | 2): Promise<PDFFile | null> => {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      configurePdfjsWorker(pdfjsLib);
      
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      const pages: ImageData[] = [];
      const scale = 1.5; // Render at 1.5x for better comparison
      
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelledRef.current) return null;
        
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        
        await page.render({ canvasContext: ctx, viewport }).promise;
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        pages.push(imageData);
        
        setProgress(Math.round((i / pdf.numPages) * 50 * (slot === 1 ? 1 : 0.5) + (slot === 2 ? 25 : 0)));
      }
      
      return {
        id: generateId(),
        file,
        pageCount: pdf.numPages,
        pages,
      };
    } catch (err) {
      console.error('Failed to load PDF:', err);
      throw err;
    }
  }, []);

  /**
   * Compare two images and generate difference data
   */
  const compareImages = useCallback((img1: ImageData, img2: ImageData): DifferenceResult & { diffImageData: ImageData } => {
    // Use the smaller dimensions to avoid counting size differences as content differences
    const width = Math.min(img1.width, img2.width);
    const height = Math.min(img1.height, img2.height);
    
    // For diff image, use the larger dimensions
    const maxWidth = Math.max(img1.width, img2.width);
    const maxHeight = Math.max(img1.height, img2.height);
    
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = maxWidth;
    diffCanvas.height = maxHeight;
    const diffCtx = diffCanvas.getContext('2d')!;
    const diffImageData = diffCtx.createImageData(maxWidth, maxHeight);
    
    let differentPixels = 0;
    const totalPixels = width * height; // Only count overlapping area
    
    // Compare overlapping region
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * maxWidth + x) * 4;
        const idx1 = (y * img1.width + x) * 4;
        const idx2 = (y * img2.width + x) * 4;
        
        const r1 = img1.data[idx1];
        const g1 = img1.data[idx1 + 1];
        const b1 = img1.data[idx1 + 2];
        
        const r2 = img2.data[idx2];
        const g2 = img2.data[idx2 + 1];
        const b2 = img2.data[idx2 + 2];
        
        // Calculate color difference using a perceptual approach
        // Weight RGB channels differently based on human perception
        const rDiff = Math.abs(r1 - r2);
        const gDiff = Math.abs(g1 - g2);
        const bDiff = Math.abs(b1 - b2);
        
        // Use weighted difference (green is more perceptible to human eye)
        const weightedDiff = rDiff * 0.3 + gDiff * 0.59 + bDiff * 0.11;
        
        // Higher threshold to ignore minor rendering differences (anti-aliasing, compression artifacts)
        const threshold = 15;
        
        if (weightedDiff > threshold) {
          differentPixels++;
          // Highlight difference in red with intensity based on difference magnitude
          const intensity = Math.min(255, Math.round(weightedDiff * 2));
          diffImageData.data[idx] = 255;
          diffImageData.data[idx + 1] = 0;
          diffImageData.data[idx + 2] = 0;
          diffImageData.data[idx + 3] = Math.max(150, intensity);
        } else {
          // Show original content faded
          diffImageData.data[idx] = Math.round((r1 + r2) / 2);
          diffImageData.data[idx + 1] = Math.round((g1 + g2) / 2);
          diffImageData.data[idx + 2] = Math.round((b1 + b2) / 2);
          diffImageData.data[idx + 3] = 80;
        }
      }
    }
    
    // Fill areas outside the overlapping region (size differences)
    // Mark them in blue to indicate size difference
    for (let y = 0; y < maxHeight; y++) {
      for (let x = 0; x < maxWidth; x++) {
        if (x >= width || y >= height) {
          const idx = (y * maxWidth + x) * 4;
          // Blue for size difference areas
          diffImageData.data[idx] = 0;
          diffImageData.data[idx + 1] = 100;
          diffImageData.data[idx + 2] = 255;
          diffImageData.data[idx + 3] = 150;
        }
      }
    }
    
    // Calculate percentage based on overlapping area only
    const differencePercentage = totalPixels > 0 ? (differentPixels / totalPixels) * 100 : 0;
    
    // Consider size difference as well
    const sizeDifferent = img1.width !== img2.width || img1.height !== img2.height;
    
    return {
      pageIndex: 0,
      hasDifference: differentPixels > 0 || sizeDifferent,
      differencePercentage,
      diffImageData,
    };
  }, []);

  /**
   * Handle file selected for slot 1
   */
  const handleFile1Selected = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setProgressMessage('Loading first PDF...');
    setError(null);
    setDifferences([]);
    
    try {
      const loadedFile = await loadPDF(files[0], 1);
      if (loadedFile) {
        setFile1(loadedFile);
      }
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load first PDF');
      setStatus('error');
    }
  }, [loadPDF]);

  /**
   * Handle file selected for slot 2
   */
  const handleFile2Selected = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(25);
    setProgressMessage('Loading second PDF...');
    setError(null);
    setDifferences([]);
    
    try {
      const loadedFile = await loadPDF(files[0], 2);
      if (loadedFile) {
        setFile2(loadedFile);
      }
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load second PDF');
      setStatus('error');
    }
  }, [loadPDF]);

  /**
   * Handle file upload error
   */
  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  /**
   * Compare the two PDFs
   */
  const handleCompare = useCallback(async () => {
    if (!file1 || !file2) {
      setError('Please upload both PDF files to compare.');
      return;
    }

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(50);
    setProgressMessage('Comparing pages...');
    setError(null);

    try {
      const maxPages = Math.max(file1.pageCount, file2.pageCount);
      const results: DifferenceResult[] = [];
      
      for (let i = 0; i < maxPages; i++) {
        if (cancelledRef.current) {
          setStatus('idle');
          return;
        }
        
        const img1 = file1.pages[i];
        const img2 = file2.pages[i];
        
        if (!img1 || !img2) {
          // One PDF has fewer pages
          results.push({
            pageIndex: i,
            hasDifference: true,
            differencePercentage: 100,
          });
        } else {
          const comparison = compareImages(img1, img2);
          
          // Create blob URL for diff image
          const diffCanvas = document.createElement('canvas');
          diffCanvas.width = comparison.diffImageData.width;
          diffCanvas.height = comparison.diffImageData.height;
          const ctx = diffCanvas.getContext('2d')!;
          ctx.putImageData(comparison.diffImageData, 0, 0);
          
          results.push({
            pageIndex: i,
            hasDifference: comparison.hasDifference,
            differencePercentage: comparison.differencePercentage,
            diffImageUrl: diffCanvas.toDataURL(),
          });
        }
        
        setProgress(50 + Math.round((i / maxPages) * 50));
      }
      
      setDifferences(results);
      setCurrentPage(0);
      setStatus('complete');
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setStatus('error');
      }
    }
  }, [file1, file2, compareImages]);

  /**
   * Handle cancel operation
   */
  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setStatus('idle');
    setProgress(0);
  }, []);

  /**
   * Clear file 1
   */
  const handleClearFile1 = useCallback(() => {
    setFile1(null);
    setDifferences([]);
  }, []);

  /**
   * Clear file 2
   */
  const handleClearFile2 = useCallback(() => {
    setFile2(null);
    setDifferences([]);
  }, []);

  /**
   * Clear all and reset
   */
  const handleClearAll = useCallback(() => {
    setFile1(null);
    setFile2(null);
    setDifferences([]);
    setError(null);
    setStatus('idle');
    setProgress(0);
    setCurrentPage(0);
  }, []);

  /**
   * Navigate to previous page
   */
  const handlePrevPage = useCallback(() => {
    setCurrentPage(prev => Math.max(0, prev - 1));
  }, []);

  /**
   * Navigate to next page
   */
  const handleNextPage = useCallback(() => {
    const maxPages = Math.max(file1?.pageCount || 0, file2?.pageCount || 0);
    setCurrentPage(prev => Math.min(maxPages - 1, prev + 1));
  }, [file1, file2]);

  /**
   * Handle synchronized scrolling between the two panels
   */
  const handleScroll1 = useCallback(() => {
    if (isScrollingSyncRef.current) return;
    if (!scrollContainer1Ref.current || !scrollContainer2Ref.current) return;
    
    isScrollingSyncRef.current = true;
    scrollContainer2Ref.current.scrollTop = scrollContainer1Ref.current.scrollTop;
    scrollContainer2Ref.current.scrollLeft = scrollContainer1Ref.current.scrollLeft;
    
    // Reset the flag after a short delay to allow the scroll event to complete
    requestAnimationFrame(() => {
      isScrollingSyncRef.current = false;
    });
  }, []);

  const handleScroll2 = useCallback(() => {
    if (isScrollingSyncRef.current) return;
    if (!scrollContainer1Ref.current || !scrollContainer2Ref.current) return;
    
    isScrollingSyncRef.current = true;
    scrollContainer1Ref.current.scrollTop = scrollContainer2Ref.current.scrollTop;
    scrollContainer1Ref.current.scrollLeft = scrollContainer2Ref.current.scrollLeft;
    
    // Reset the flag after a short delay to allow the scroll event to complete
    requestAnimationFrame(() => {
      isScrollingSyncRef.current = false;
    });
  }, []);

  /**
   * Toggle fullscreen mode
   */
  const toggleFullscreen = useCallback(async () => {
    if (!comparisonContainerRef.current) return;
    
    try {
      if (!document.fullscreenElement) {
        await comparisonContainerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  /**
   * Listen for fullscreen changes (e.g., user presses Escape)
   */
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Store differences length for stable dependency
  const differencesLength = differences.length;

  /**
   * Render current page to canvas - use layout effect for synchronous DOM updates
   */
  useIsomorphicLayoutEffect(() => {
    if (!file1 || !file2 || differencesLength === 0) return;
    
    const img1 = file1.pages[currentPage];
    const img2 = file2.pages[currentPage];
    const currentDiffData = differences[currentPage];
    
    // Render file 1 (for side-by-side and overlay modes)
    if (canvas1Ref.current && img1 && (viewMode === 'side-by-side' || viewMode === 'overlay')) {
      const ctx = canvas1Ref.current.getContext('2d');
      if (ctx) {
        canvas1Ref.current.width = img1.width;
        canvas1Ref.current.height = img1.height;
        ctx.putImageData(img1, 0, 0);
      }
    }
    
    // Render file 2 (for side-by-side and overlay modes)
    if (canvas2Ref.current && img2 && (viewMode === 'side-by-side' || viewMode === 'overlay')) {
      const ctx = canvas2Ref.current.getContext('2d');
      if (ctx) {
        canvas2Ref.current.width = img2.width;
        canvas2Ref.current.height = img2.height;
        ctx.putImageData(img2, 0, 0);
      }
    }
    
    // Render diff (for diff mode when no diffImageUrl)
    if (diffCanvasRef.current && currentDiffData?.diffImageUrl && viewMode === 'diff') {
      const ctx = diffCanvasRef.current.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          if (diffCanvasRef.current) {
            diffCanvasRef.current.width = img.width;
            diffCanvasRef.current.height = img.height;
            ctx.drawImage(img, 0, 0);
          }
        };
        img.src = currentDiffData.diffImageUrl;
      }
    }
   
  }, [file1, file2, differencesLength, currentPage, viewMode]);

  /**
   * Format file size
   */
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const isProcessing = status === 'processing' || status === 'uploading';
  const canCompare = file1 && file2 && !isProcessing;
  const maxPages = Math.max(file1?.pageCount || 0, file2?.pageCount || 0);
  const currentDiff = differences[currentPage];

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {/* File Upload Areas - Side by Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* File 1 Upload */}
        <div>
          <h3 className="text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
            {tTools('comparePdfs.file1Label') || 'First PDF (Original)'}
          </h3>
          {!file1 ? (
            <FileUploader
              accept={['application/pdf', '.pdf']}
              multiple={false}
              maxFiles={1}
              onFilesSelected={handleFile1Selected}
              onError={handleUploadError}
              disabled={isProcessing}
              label={tTools('comparePdfs.uploadFile1') || 'Upload First PDF'}
              description={tTools('comparePdfs.uploadDescription') || 'Drag and drop or click to browse'}
            />
          ) : (
            <Card variant="outlined">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                    <path d="M14 2v6h6" fill="white" />
                    <text x="7" y="17" fontSize="6" fill="white" fontWeight="bold">PDF</text>
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-[hsl(var(--color-foreground))] truncate max-w-[200px]">
                      {file1.file.name}
                    </p>
                    <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                      {formatSize(file1.file.size)} • {file1.pageCount} pages
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleClearFile1} disabled={isProcessing}>
                  {t('buttons.remove') || 'Remove'}
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* File 2 Upload */}
        <div>
          <h3 className="text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
            {tTools('comparePdfs.file2Label') || 'Second PDF (Modified)'}
          </h3>
          {!file2 ? (
            <FileUploader
              accept={['application/pdf', '.pdf']}
              multiple={false}
              maxFiles={1}
              onFilesSelected={handleFile2Selected}
              onError={handleUploadError}
              disabled={isProcessing}
              label={tTools('comparePdfs.uploadFile2') || 'Upload Second PDF'}
              description={tTools('comparePdfs.uploadDescription') || 'Drag and drop or click to browse'}
            />
          ) : (
            <Card variant="outlined">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-8 h-8 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                    <path d="M14 2v6h6" fill="white" />
                    <text x="7" y="17" fontSize="6" fill="white" fontWeight="bold">PDF</text>
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-[hsl(var(--color-foreground))] truncate max-w-[200px]">
                      {file2.file.name}
                    </p>
                    <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                      {formatSize(file2.file.size)} • {file2.pageCount} pages
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleClearFile2} disabled={isProcessing}>
                  {t('buttons.remove') || 'Remove'}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700"
          role="alert"
        >
          <p className="text-sm">{error}</p>
        </div>
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

      {/* Compare Button */}
      {file1 && file2 && differences.length === 0 && !isProcessing && (
        <div className="flex justify-center">
          <Button
            variant="primary"
            size="lg"
            onClick={handleCompare}
            disabled={!canCompare}
          >
            {tTools('comparePdfs.compareButton') || 'Compare PDFs'}
          </Button>
        </div>
      )}

      {/* Comparison Results */}
      {differences.length > 0 && (
        <>
          {/* Summary */}
          <Card variant="outlined">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))]">
                  {tTools('comparePdfs.resultsTitle') || 'Comparison Results'}
                </h3>
                <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
                  {differences.filter(d => d.hasDifference).length} of {differences.length} pages have differences
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleClearAll}>
                {tTools('comparePdfs.newComparison') || 'New Comparison'}
              </Button>
            </div>
          </Card>

          {/* View Mode Selector */}
          <Card variant="outlined">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm font-medium text-[hsl(var(--color-foreground))]">
                {tTools('comparePdfs.viewMode') || 'View Mode:'}
              </span>
              <div className="flex gap-2">
                <Button
                  variant={viewMode === 'side-by-side' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('side-by-side')}
                >
                  {tTools('comparePdfs.sideBySide') || 'Side by Side'}
                </Button>
                <Button
                  variant={viewMode === 'overlay' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('overlay')}
                >
                  {tTools('comparePdfs.overlay') || 'Overlay'}
                </Button>
                <Button
                  variant={viewMode === 'diff' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('diff')}
                >
                  {tTools('comparePdfs.differences') || 'Differences'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? (tTools('comparePdfs.exitFullscreen') || 'Exit Fullscreen') : (tTools('comparePdfs.fullscreen') || 'Fullscreen')}
                >
                  {isFullscreen ? (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                    </svg>
                  )}
                </Button>
              </div>
            </div>
            
            {viewMode === 'overlay' && (
              <div className="mt-4 flex items-center gap-4">
                <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
                  {tTools('comparePdfs.opacity') || 'Opacity:'}
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={overlayOpacity}
                  onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                  className="flex-1 max-w-xs"
                />
                <span className="text-sm text-[hsl(var(--color-muted-foreground))]">{overlayOpacity}%</span>
              </div>
            )}
          </Card>

          {/* Page Navigation */}
          <Card variant="outlined">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevPage}
                disabled={currentPage === 0}
              >
                ← {t('buttons.previous') || 'Previous'}
              </Button>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-[hsl(var(--color-foreground))]">
                  Page {currentPage + 1} of {maxPages}
                </span>
                {currentDiff && (
                  <span className={`text-xs px-2 py-1 rounded ${
                    currentDiff.hasDifference 
                      ? 'bg-red-100 text-red-700' 
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {currentDiff.hasDifference 
                      ? `${currentDiff.differencePercentage.toFixed(1)}% different`
                      : 'Identical'
                    }
                  </span>
                )}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={currentPage >= maxPages - 1}
              >
                {t('buttons.next') || 'Next'} →
              </Button>
            </div>
          </Card>

          {/* Comparison View */}
          <div 
            ref={comparisonContainerRef}
            className={`border border-[hsl(var(--color-border))] rounded-[var(--radius-md)] overflow-hidden bg-[hsl(var(--color-muted)/0.2)] ${
              isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none flex flex-col' : ''
            }`}
          >
            {/* Fullscreen header with controls */}
            {isFullscreen && (
              <div className="flex items-center justify-between p-4 bg-[hsl(var(--color-background))] border-b border-[hsl(var(--color-border))]">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-[hsl(var(--color-foreground))]">
                    Page {currentPage + 1} of {maxPages}
                  </span>
                  {currentDiff && (
                    <span className={`text-xs px-2 py-1 rounded ${
                      currentDiff.hasDifference 
                        ? 'bg-red-100 text-red-700' 
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {currentDiff.hasDifference 
                        ? `${currentDiff.differencePercentage.toFixed(1)}% different`
                        : 'Identical'
                      }
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={currentPage === 0}>
                    ← {t('buttons.previous') || 'Previous'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleNextPage} disabled={currentPage >= maxPages - 1}>
                    {t('buttons.next') || 'Next'} →
                  </Button>
                  <Button variant="outline" size="sm" onClick={toggleFullscreen}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                    </svg>
                  </Button>
                </div>
              </div>
            )}
            
            {viewMode === 'side-by-side' && (
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 p-4 ${isFullscreen ? 'flex-1 min-h-0' : ''}`}>
                <div className={`text-center ${isFullscreen ? 'flex flex-col min-h-0' : ''}`}>
                  <p className="text-sm font-medium text-[hsl(var(--color-foreground))] mb-2 flex-shrink-0">
                    {file1?.file.name}
                  </p>
                  <div 
                    ref={scrollContainer1Ref}
                    onScroll={handleScroll1}
                    className={`overflow-auto border border-[hsl(var(--color-border))] rounded bg-white ${
                      isFullscreen ? 'flex-1 min-h-0' : 'max-h-[600px]'
                    }`}
                  >
                    <canvas ref={canvas1Ref} className="max-w-full h-auto" />
                  </div>
                </div>
                <div className={`text-center ${isFullscreen ? 'flex flex-col min-h-0' : ''}`}>
                  <p className="text-sm font-medium text-[hsl(var(--color-foreground))] mb-2 flex-shrink-0">
                    {file2?.file.name}
                  </p>
                  <div 
                    ref={scrollContainer2Ref}
                    onScroll={handleScroll2}
                    className={`overflow-auto border border-[hsl(var(--color-border))] rounded bg-white ${
                      isFullscreen ? 'flex-1 min-h-0' : 'max-h-[600px]'
                    }`}
                  >
                    <canvas ref={canvas2Ref} className="max-w-full h-auto" />
                  </div>
                </div>
              </div>
            )}
            
            {viewMode === 'overlay' && (
              <div className={`p-4 text-center ${isFullscreen ? 'flex-1 flex flex-col min-h-0' : ''}`}>
                <p className="text-sm font-medium text-[hsl(var(--color-foreground))] mb-2 flex-shrink-0">
                  Overlay View (Red: First PDF, Blue: Second PDF)
                </p>
                <div className={`relative overflow-auto border border-[hsl(var(--color-border))] rounded bg-white ${
                  isFullscreen ? 'flex-1 min-h-0 w-full' : 'max-h-[600px] inline-block'
                }`}>
                  <canvas ref={canvas1Ref} className="max-w-full h-auto" />
                  <canvas 
                    ref={canvas2Ref} 
                    className="absolute top-0 left-0 max-w-full h-auto mix-blend-difference"
                    style={{ opacity: overlayOpacity / 100 }}
                  />
                </div>
              </div>
            )}
            
            {viewMode === 'diff' && (
              <div className={`p-4 text-center ${isFullscreen ? 'flex-1 flex flex-col min-h-0' : ''}`}>
                <p className="text-sm font-medium text-[hsl(var(--color-foreground))] mb-2 flex-shrink-0">
                  {tTools('comparePdfs.diffView') || 'Difference View (Red areas show changes)'}
                </p>
                <div className={`overflow-auto border border-[hsl(var(--color-border))] rounded bg-white ${
                  isFullscreen ? 'flex-1 min-h-0 w-full' : 'max-h-[600px] inline-block'
                }`}>
                  {currentDiff?.diffImageUrl ? (
                    <img src={currentDiff.diffImageUrl} alt="Difference view" className="max-w-full h-auto" />
                  ) : (
                    <canvas ref={diffCanvasRef} className="max-w-full h-auto" />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Page Thumbnails with Difference Indicators */}
          <Card variant="outlined" size="lg">
            <h3 className="text-sm font-medium text-[hsl(var(--color-foreground))] mb-3">
              {tTools('comparePdfs.pageOverview') || 'Page Overview'}
            </h3>
            <div className="flex flex-wrap gap-2">
              {differences.map((diff, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentPage(index)}
                  className={`
                    w-10 h-10 rounded flex items-center justify-center text-sm font-medium
                    transition-all duration-200
                    ${currentPage === index 
                      ? 'ring-2 ring-[hsl(var(--color-primary))] ring-offset-2' 
                      : ''
                    }
                    ${diff.hasDifference 
                      ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }
                  `}
                  title={diff.hasDifference 
                    ? `Page ${index + 1}: ${diff.differencePercentage.toFixed(1)}% different`
                    : `Page ${index + 1}: Identical`
                  }
                >
                  {index + 1}
                </button>
              ))}
            </div>
            <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-2">
              <span className="inline-block w-3 h-3 bg-green-100 rounded mr-1"></span> Identical
              <span className="inline-block w-3 h-3 bg-red-100 rounded ml-3 mr-1"></span> Has differences
            </p>
          </Card>

          {/* Success Message */}
          <div 
            className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
            role="status"
          >
            <p className="text-sm font-medium">
              {tTools('comparePdfs.successMessage') || 'Comparison complete! Use the view modes and page navigation to explore differences.'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export default ComparePDFsTool;
