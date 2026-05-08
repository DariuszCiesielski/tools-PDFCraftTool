'use client';

import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useStudioStore, selectCurrentFile } from '@/lib/stores/studioStore';
import {
  useStudioSessionStore,
  selectCurrentPage,
  selectZoomLevel,
} from '@/lib/stores/studioSessionStore';
import { Button } from '@/components/ui/Button';

export function ViewerToolbar() {
  const t = useTranslations('studio');
  const currentFile = useStudioStore(selectCurrentFile);
  // Per-tab viewState: czytamy z sessionStore aktywnego taba
  const currentPage = useStudioSessionStore(selectCurrentPage);
  const zoomLevel = useStudioSessionStore(selectZoomLevel);
  // Settery: studioStore (legacy) propaguje przez bridge do sessionStore
  const setCurrentPage = useStudioStore((state) => state.setCurrentPage);
  const setZoom = useStudioStore((state) => state.setZoom);

  const pageCount = currentFile?.pageCount ?? 0;
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= pageCount;

  const handlePageInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    if (!Number.isNaN(value) && value >= 1 && value <= pageCount) {
      setCurrentPage(value);
    }
  };

  return (
    <div
      className="flex items-center justify-center gap-1 px-3 py-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] shadow-sm"
      role="toolbar"
      aria-label={t('viewerToolbar.aria')}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCurrentPage(currentPage - 1)}
        disabled={isFirstPage || pageCount === 0}
        aria-label={t('footer.previousPage')}
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <div className="flex items-center gap-1 text-xs tabular-nums px-2">
        <input
          type="number"
          min={1}
          max={pageCount || 1}
          value={currentPage}
          onChange={handlePageInput}
          className="w-12 text-center bg-transparent border border-[hsl(var(--color-border))] rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[hsl(var(--color-ring))]"
          aria-label={t('viewerToolbar.pageInput')}
          disabled={pageCount === 0}
        />
        <span className="text-[hsl(var(--color-muted-foreground))]">/</span>
        <span className="text-[hsl(var(--color-muted-foreground))] min-w-[2ch]">
          {pageCount || '—'}
        </span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCurrentPage(currentPage + 1)}
        disabled={isLastPage || pageCount === 0}
        aria-label={t('footer.nextPage')}
      >
        <ChevronRight className="w-4 h-4" />
      </Button>

      <div className="mx-2 w-px h-5 bg-[hsl(var(--color-border))]" aria-hidden="true" />

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setZoom(zoomLevel - 0.1)}
        aria-label={t('footer.zoomOut')}
      >
        <ZoomOut className="w-4 h-4" />
      </Button>

      <button
        type="button"
        onClick={() => setZoom(1.0)}
        className="text-xs tabular-nums w-14 text-center hover:text-[hsl(var(--color-primary))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--color-ring))] rounded"
        aria-label={t('viewerToolbar.resetZoom')}
        title={t('viewerToolbar.resetZoom')}
      >
        {Math.round(zoomLevel * 100)}%
      </button>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setZoom(zoomLevel + 0.1)}
        aria-label={t('footer.zoomIn')}
      >
        <ZoomIn className="w-4 h-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setZoom(1.5)}
        aria-label={t('viewerToolbar.fitWidth')}
        title={t('viewerToolbar.fitWidth')}
      >
        <Maximize2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
