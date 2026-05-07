'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, AlertCircle } from 'lucide-react';
import { useStudioStore, selectCurrentFile } from '@/lib/stores/studioStore';
import { loadPdfjs } from '@/lib/pdf/loader';
import { ViewerToolbar } from './ViewerToolbar';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export function PdfViewer() {
  const t = useTranslations('studio');
  const currentFile = useStudioStore(selectCurrentFile);
  const currentFileId = currentFile?.id ?? null;
  const currentFileName = currentFile?.name ?? '';
  const fileVersion = currentFile?.version ?? 0;
  const currentPage = useStudioStore((state) => state.currentPage);
  const zoomLevel = useStudioStore((state) => state.zoomLevel);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentFileId) {
      docRef.current?.destroy();
      docRef.current = null;
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const data = await useStudioStore.getState().getCurrentBuffer(currentFileId);
        if (cancelled) return;

        const pdfjs = await loadPdfjs();
        if (cancelled) return;

        docRef.current?.destroy();
        const loadingTask = pdfjs.getDocument({ data: data.slice() });
        const doc = await loadingTask.promise;
        if (cancelled) {
          doc.destroy();
          return;
        }

        docRef.current = doc;
        useStudioStore.getState().setPageCount(currentFileId, doc.numPages);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentFileId, fileVersion]);

  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || !currentFileId || isLoading) return;

    let cancelled = false;
    setError(null);

    (async () => {
      try {
        renderTaskRef.current?.cancel();
        const safePage = Math.min(Math.max(1, currentPage), doc.numPages);
        const page = await doc.getPage(safePage);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: zoomLevel });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderTask = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!cancelled && !msg.toLowerCase().includes('cancelled')) {
          setError(msg);
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [currentFileId, currentPage, zoomLevel, isLoading]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      const { zoomLevel: current, setZoom } = useStudioStore.getState();
      setZoom(current + delta);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    return () => {
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, []);

  if (!currentFileId) {
    return (
      <div className="flex items-center justify-center h-full text-[hsl(var(--color-muted-foreground))]">
        {t('viewer.noFile')}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex flex-col h-full">
      <div className="flex-1 overflow-auto flex justify-center items-start p-6">
        {isLoading && (
          <div className="flex items-center gap-2 text-[hsl(var(--color-muted-foreground))] py-8">
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            {t('viewer.loading')}
          </div>
        )}
        {error && !isLoading && (
          <div
            className="flex items-center gap-2 text-[hsl(var(--color-destructive))] py-8"
            role="alert"
          >
            <AlertCircle className="w-5 h-5" aria-hidden="true" />
            {error}
          </div>
        )}
        {!error && !isLoading && (
          <canvas
            ref={canvasRef}
            className="shadow-lg bg-white"
            aria-label={t('viewer.canvasAria', { fileName: currentFileName })}
          />
        )}
      </div>

      <div className="sticky bottom-3 z-10 flex justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <ViewerToolbar />
        </div>
      </div>

      <p
        className="absolute top-3 right-3 text-xs text-[hsl(var(--color-muted-foreground))] bg-[hsl(var(--color-card))]/80 backdrop-blur-sm rounded px-2 py-1 pointer-events-none"
        aria-hidden="true"
      >
        {t('viewer.zoomHint')}
      </p>
    </div>
  );
}
