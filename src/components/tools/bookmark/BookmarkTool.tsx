'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { processBookmarks, BookmarkItem, BookmarkOptions } from '@/lib/pdf/processors/bookmark';
import type { ProcessOutput } from '@/types/pdf';

// Store pdfjs module reference
let pdfjsModule: typeof import('pdfjs-dist') | null = null;

// Load pdfjs module dynamically
const loadPdfjsLib = async () => {
  if (pdfjsModule) return pdfjsModule;

  const pdfjsLib = await import('pdfjs-dist');
  const { configurePdfjsWorker } = await import('@/lib/pdf/loader');

  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    configurePdfjsWorker(pdfjsLib);
  }

  pdfjsModule = pdfjsLib;
  return pdfjsLib;
};

export interface BookmarkToolProps {
  className?: string;
  /** Optional initial file (skips upload step when prefilled from Studio) */
  initialFile?: File;
  /** Hide the FileUploader UI when prefilled */
  hideUploader?: boolean;
  /** Callback fired with the resulting blob and original file when processing succeeds */
  onComplete?: (blob: Blob, originalFile: File) => void;
}

interface BookmarkNode {
  id: string;
  title: string;
  pageNumber: number;
  children: BookmarkNode[];
  color?: string;
  style?: 'bold' | 'italic' | 'bold-italic';
  isExpanded?: boolean;
}

/**
 * BookmarkTool Component - Visual Bookmark Editor
 * Provides a visual interface for editing PDF bookmarks with PDF preview
 */
export function BookmarkTool({ className = '', initialFile, hideUploader, onComplete }: BookmarkToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');

  // File state
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Bookmark state
  const [bookmarks, setBookmarks] = useState<BookmarkNode[]>([]);
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null);
  const [editingBookmark, setEditingBookmark] = useState<BookmarkNode | null>(null);

  // Processing state
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [isExtractingBookmarks, setIsExtractingBookmarks] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelledRef = useRef(false);
  useEffect(() => {
    if (initialFile) {
      setFile(initialFile);
    }
  }, [initialFile]);


  // Load PDF and extract existing bookmarks
  const loadPdf = useCallback(async (pdfFile: File) => {
    try {
      const pdfjsLib = await loadPdfjsLib();
      const arrayBuffer = await pdfFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const doc = await loadingTask.promise;

      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setCurrentPage(1);

      // Extract existing bookmarks
      setIsExtractingBookmarks(true);
      try {
        const outline = await doc.getOutline();
        if (outline && outline.length > 0) {
          const extracted = await parseOutline(outline, doc);
          setBookmarks(extracted);
        }
      } catch (err) {
        console.warn('Failed to extract bookmarks:', err);
      }
      setIsExtractingBookmarks(false);

    } catch (err) {
      setError('Failed to load PDF file.');
      console.error(err);
    }
  }, []);

  // Parse PDF outline to bookmark nodes
  const parseOutline = async (
    outline: any[], // PDF.js outline structure
    doc: any
  ): Promise<BookmarkNode[]> => {
    const result: BookmarkNode[] = [];

    for (const item of outline) {
      let pageNumber = 1;

      // Get destination page
      if (item.dest) {
        try {
          const dest = typeof item.dest === 'string'
            ? await doc.getDestination(item.dest)
            : item.dest;
          if (dest && dest[0]) {
            const pageRef = dest[0];
            const pageIndex = await doc.getPageIndex(pageRef);
            pageNumber = pageIndex + 1;
          }
        } catch (e) {
          console.warn('Failed to get destination for bookmark:', item.title);
        }
      }

      const node: BookmarkNode = {
        id: `bm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: item.title || 'Untitled',
        pageNumber,
        children: [],
        isExpanded: true,
      };

      // Parse children recursively
      if (item.items && item.items.length > 0) {
        node.children = await parseOutline(item.items, doc);
      }

      result.push(node);
    }

    return result;
  };

  // Render current page to canvas
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Calculate scale to fit container (max 600px width)
      const containerWidth = 600;
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(containerWidth / viewport.width, 1.5);
      const scaledViewport = page.getViewport({ scale });

      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      await page.render({
        canvasContext: ctx,
        viewport: scaledViewport,
      }).promise;

    } catch (err) {
      console.error('Failed to render page:', err);
    }
  }, [pdfDoc]);

  // Render page when current page changes
  useEffect(() => {
    if (pdfDoc && currentPage > 0) {
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage, renderPage]);

  const handleFilesSelected = useCallback((files: File[]) => {
    if (files.length > 0) {
      setFile(files[0]);
      setError(null);
      setResult(null);
      setBookmarks([]);
      loadPdf(files[0]);
    }
  }, [loadPdf]);

  const handleClearFile = useCallback(() => {
    setFile(null);
    setPdfDoc(null);
    setBookmarks([]);
    setResult(null);
    setError(null);
    setStatus('idle');
    setCurrentPage(1);
    setTotalPages(0);
  }, []);

  // Navigate to page when bookmark is clicked
  const handleBookmarkClick = useCallback((bookmark: BookmarkNode) => {
    setSelectedBookmarkId(bookmark.id);
    setCurrentPage(bookmark.pageNumber);
  }, []);

  // Add new bookmark at current page
  const handleAddBookmark = useCallback(() => {
    const newBookmark: BookmarkNode = {
      id: `bm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: `New Bookmark (Page ${currentPage})`,
      pageNumber: currentPage,
      children: [],
      isExpanded: true,
    };
    setBookmarks(prev => [...prev, newBookmark]);
    setEditingBookmark(newBookmark);
    setResult(null);
  }, [currentPage]);

  // Add child bookmark
  const handleAddChild = useCallback((parentId: string) => {
    const newChild: BookmarkNode = {
      id: `bm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: `New Bookmark (Page ${currentPage})`,
      pageNumber: currentPage,
      children: [],
      isExpanded: true,
    };

    const addChildTo = (nodes: BookmarkNode[]): BookmarkNode[] => {
      return nodes.map(node => {
        if (node.id === parentId) {
          return { ...node, children: [...node.children, newChild], isExpanded: true };
        }
        return { ...node, children: addChildTo(node.children) };
      });
    };

    setBookmarks(prev => addChildTo(prev));
    setEditingBookmark(newChild);
    setResult(null);
  }, [currentPage]);

  // Delete bookmark
  const handleDeleteBookmark = useCallback((id: string) => {
    const removeFrom = (nodes: BookmarkNode[]): BookmarkNode[] => {
      return nodes
        .filter(node => node.id !== id)
        .map(node => ({ ...node, children: removeFrom(node.children) }));
    };

    setBookmarks(prev => removeFrom(prev));
    if (selectedBookmarkId === id) {
      setSelectedBookmarkId(null);
    }
    setResult(null);
  }, [selectedBookmarkId]);

  // Update bookmark
  const handleUpdateBookmark = useCallback((updated: BookmarkNode) => {
    const updateIn = (nodes: BookmarkNode[]): BookmarkNode[] => {
      return nodes.map(node => {
        if (node.id === updated.id) {
          return { ...updated, children: node.children };
        }
        return { ...node, children: updateIn(node.children) };
      });
    };

    setBookmarks(prev => updateIn(prev));
    setEditingBookmark(null);
    setResult(null);
  }, []);

  // Toggle bookmark expansion
  const handleToggleExpand = useCallback((id: string) => {
    const toggleIn = (nodes: BookmarkNode[]): BookmarkNode[] => {
      return nodes.map(node => {
        if (node.id === id) {
          return { ...node, isExpanded: !node.isExpanded };
        }
        return { ...node, children: toggleIn(node.children) };
      });
    };

    setBookmarks(prev => toggleIn(prev));
  }, []);

  // Convert BookmarkNode[] to BookmarkItem[] for processor
  const convertToBookmarkItems = (nodes: BookmarkNode[]): BookmarkItem[] => {
    return nodes.map(node => ({
      id: node.id,
      title: node.title,
      pageNumber: node.pageNumber,
      children: node.children.length > 0 ? convertToBookmarkItems(node.children) : undefined,
    }));
  };

  // Process and save bookmarks
  const handleProcess = useCallback(async () => {
    if (!file || bookmarks.length === 0) return;

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const options: BookmarkOptions = {
        action: 'add', // Use 'add' to replace all bookmarks
        bookmarks: convertToBookmarkItems(bookmarks),
      };

      const output: ProcessOutput = await processBookmarks(
        file,
        options,
        (prog) => {
          if (!cancelledRef.current) {
            setProgress(prog);
          }
        }
      );

      if (output.success && output.result) {
        const blob = output.result as Blob;
        setResult(blob);
        setStatus('complete');
        if (onComplete && file) onComplete(blob, file);
      } else {
        setError(output.error?.message || 'Failed to process bookmarks.');
        setStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setStatus('error');
    }
  }, [file, bookmarks, onComplete]);

  const isProcessing = status === 'processing';

  // Render bookmark tree item
  const renderBookmarkItem = (bookmark: BookmarkNode, depth: number = 0) => {
    const isSelected = selectedBookmarkId === bookmark.id;
    const isEditing = editingBookmark?.id === bookmark.id;

    return (
      <div key={bookmark.id} style={{ marginLeft: depth * 16 }}>
        <div
          className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${isSelected
            ? 'bg-blue-100 border border-blue-300'
            : 'hover:bg-gray-100'
            }`}
          onClick={() => handleBookmarkClick(bookmark)}
        >
          {/* Expand/collapse toggle */}
          {bookmark.children.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); handleToggleExpand(bookmark.id); }}
              className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700"
            >
              {bookmark.isExpanded ? '▼' : '▶'}
            </button>
          )}
          {bookmark.children.length === 0 && <span className="w-5" />}

          {/* Bookmark content */}
          {isEditing ? (
            <div className="flex-1 flex gap-2" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={editingBookmark.title}
                onChange={(e) => setEditingBookmark({ ...editingBookmark, title: e.target.value })}
                className="flex-1 px-2 py-1 border rounded text-sm"
                autoFocus
              />
              <input
                type="number"
                value={editingBookmark.pageNumber}
                onChange={(e) => setEditingBookmark({ ...editingBookmark, pageNumber: parseInt(e.target.value) || 1 })}
                min={1}
                max={totalPages}
                className="w-16 px-2 py-1 border rounded text-sm"
              />
              <Button size="sm" onClick={() => handleUpdateBookmark(editingBookmark)}>✓</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingBookmark(null)}>✕</Button>
            </div>
          ) : (
            <>
              <span className="flex-1 text-sm truncate">{bookmark.title}</span>
              <span className="text-xs text-gray-500">p.{bookmark.pageNumber}</span>

              {/* Actions */}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 hover:opacity-100" style={{ opacity: isSelected ? 1 : undefined }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingBookmark(bookmark); }}
                  className="p-1 text-gray-400 hover:text-blue-500"
                  title="Edit"
                >
                  ✎
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleAddChild(bookmark.id); }}
                  className="p-1 text-gray-400 hover:text-green-500"
                  title="Add child"
                >
                  +
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteBookmark(bookmark.id); }}
                  className="p-1 text-gray-400 hover:text-red-500"
                  title="Delete"
                >
                  ×
                </button>
              </div>
            </>
          )}
        </div>

        {/* Render children */}
        {bookmark.isExpanded && bookmark.children.length > 0 && (
          <div className="border-l border-gray-200 ml-2">
            {bookmark.children.map(child => renderBookmarkItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {!file && !hideUploader && (
          <FileUploader
          accept={['application/pdf', '.pdf']}
          multiple={false}
          maxFiles={1}
          onFilesSelected={handleFilesSelected}
          onError={setError}
          disabled={isProcessing}
          label={tTools('bookmark.uploadLabel') || 'Upload PDF File'}
          description={tTools('bookmark.uploadDescription') || 'Drag and drop a PDF file to edit bookmarks.'}
        />
        )}

      {error && (
        <div className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700" role="alert">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {file && pdfDoc && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* PDF Preview Panel */}
          <Card variant="outlined" size="lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">{tTools('bookmark.pdfPreview') || 'PDF Preview'}</h3>
              <Button variant="ghost" size="sm" onClick={handleClearFile}>
                {t('buttons.close') || 'Close'}
              </Button>
            </div>

            {/* Page navigation */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                ← {t('buttons.back') || 'Prev'}
              </Button>
              <span className="text-sm">
                Page {currentPage} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                {t('buttons.next') || 'Next'} →
              </Button>
            </div>

            {/* Canvas */}
            <div className="flex justify-center bg-gray-100 rounded p-4 overflow-auto max-h-[600px]">
              <canvas ref={canvasRef} className="shadow-lg" />
            </div>
          </Card>

          {/* Bookmark Editor Panel */}
          <Card variant="outlined" size="lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">{tTools('bookmark.bookmarksTitle') || 'Bookmarks'}</h3>
              <Button variant="primary" size="sm" onClick={handleAddBookmark}>
                + {tTools('bookmark.addBookmark') || 'Add Bookmark'}
              </Button>
            </div>

            {isExtractingBookmarks && (
              <p className="text-sm text-gray-500 mb-4">Extracting existing bookmarks...</p>
            )}

            {/* Bookmark list */}
            <div className="border rounded max-h-[500px] overflow-y-auto">
              {bookmarks.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p>{tTools('bookmark.noBookmarks') || 'No bookmarks yet. Click "Add Bookmark" to create one.'}</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {bookmarks.map(bookmark => renderBookmarkItem(bookmark))}
                </div>
              )}
            </div>

            {/* Hint */}
            <p className="text-xs text-gray-500 mt-2">
              {tTools('bookmark.hint') || 'Click a bookmark to preview its page. Use +/✎/× to add child, edit, or delete.'}
            </p>
          </Card>
        </div>
      )}

      {isProcessing && (
        <ProcessingProgress
          progress={progress}
          status={status}
          onCancel={() => { cancelledRef.current = true; setStatus('idle'); }}
          showPercentage
        />
      )}

      {file && bookmarks.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          <Button
            variant="primary"
            size="lg"
            onClick={handleProcess}
            disabled={isProcessing}
            loading={isProcessing}
          >
            {isProcessing
              ? (t('status.processing') || 'Processing...')
              : (tTools('bookmark.saveButton') || 'Save Bookmarks')}
          </Button>

          {result && (
            <DownloadButton
              file={result}
              filename={file.name.replace('.pdf', '_bookmarked.pdf')}
              variant="secondary"
              size="lg"
              showFileSize
            />
          )}
        </div>
      )}

      {status === 'complete' && result && (
        <div className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700">
          <p className="text-sm font-medium">
            {tTools('bookmark.successMessage') || 'Bookmarks saved successfully!'}
          </p>
        </div>
      )}
    </div>
  );
}

export default BookmarkTool;
