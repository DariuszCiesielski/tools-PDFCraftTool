'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Loader2, FileText, Plus } from 'lucide-react';
import { useStudioStore, selectCurrentFile } from '@/lib/stores/studioStore';
import {
  useStudioSessionStore,
  selectCurrentPage,
} from '@/lib/stores/studioSessionStore';
import { loadPdfjs } from '@/lib/pdf/loader';
import type { PDFDocumentProxy } from 'pdfjs-dist';

interface PagesPanelProps {
  onFilesAdded: (files: File[]) => void;
}

export function PagesPanel({ onFilesAdded }: PagesPanelProps) {
  const t = useTranslations('studio');
  const currentFile = useStudioStore(selectCurrentFile);
  const files = useStudioStore((state) => state.files);
  const selectFile = useStudioStore((state) => state.selectFile);
  // Per-tab viewState: currentPage z sessionStore aktywnego taba
  const currentPage = useStudioSessionStore(selectCurrentPage);
  const setCurrentPage = useStudioStore((state) => state.setCurrentPage);
  const removePage = useStudioStore((state) => state.removePage);
  const reorderPages = useStudioStore((state) => state.reorderPages);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddClick = () => fileInputRef.current?.click();
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (fileList) {
      onFilesAdded(Array.from(fileList));
      event.target.value = '';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {files.length > 1 && (
        <div className="p-3 border-b border-[hsl(var(--color-border))]">
          <label
            className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--color-muted-foreground))] block mb-1"
            htmlFor="active-file-select"
          >
            {t('pagesPanel.activeFile')}
          </label>
          <select
            id="active-file-select"
            value={currentFile?.id ?? ''}
            onChange={(e) => selectFile(e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))]"
          >
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {currentFile ? (
        <PagesGrid
          file={currentFile}
          currentPage={currentPage}
          onSelectPage={setCurrentPage}
          onRemovePage={(idx) => removePage(currentFile.id, idx)}
          onReorder={(from, to) => reorderPages(currentFile.id, from, to)}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-[hsl(var(--color-muted-foreground))] p-4 text-center">
          {t('pagesPanel.noFile')}
        </div>
      )}

      <button
        type="button"
        onClick={handleAddClick}
        className="m-3 flex items-center justify-center gap-2 p-2.5 rounded-md border-2 border-dashed border-[hsl(var(--color-border))] text-[hsl(var(--color-muted-foreground))] hover:border-[hsl(var(--color-primary))] hover:text-[hsl(var(--color-primary))] text-sm"
        aria-label={t('thumbnails.addMore')}
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        {t('thumbnails.addMore')}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />
    </div>
  );
}

interface PagesGridProps {
  file: ReturnType<typeof selectCurrentFile> & {};
  currentPage: number;
  onSelectPage: (page: number) => void;
  onRemovePage: (pageIndex: number) => Promise<void>;
  onReorder: (fromIndex: number, toIndex: number) => Promise<void>;
}

function PagesGrid({ file, currentPage, onSelectPage, onRemovePage, onReorder }: PagesGridProps) {
  const t = useTranslations('studio');
  const fileId = file.id;
  const fileVersion = file.version;
  const pageCount = file.pageCount ?? 0;

  const [order, setOrder] = useState<number[]>([]);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  useEffect(() => {
    if (pageCount > 0) {
      setOrder(Array.from({ length: pageCount }, (_, i) => i));
    } else {
      setOrder([]);
    }
  }, [pageCount, fileVersion]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => order.map((idx) => `page-${fileId}-${idx}`), [order, fileId]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    setOrder((prev) => arrayMove(prev, oldIndex, newIndex));
    await onReorder(oldIndex, newIndex);
  };

  if (pageCount === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[hsl(var(--color-muted-foreground))] p-4">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        {t('pagesPanel.loading')}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-3">
            {order.map((originalIdx, position) => (
              <PageThumbnail
                key={`page-${fileId}-${originalIdx}`}
                id={`page-${fileId}-${originalIdx}`}
                fileId={fileId}
                fileVersion={fileVersion}
                originalPageIndex={originalIdx}
                displayNumber={position + 1}
                isCurrent={position + 1 === currentPage}
                isDeleting={pendingDelete === position}
                onSelect={() => onSelectPage(position + 1)}
                onDelete={async () => {
                  if (pageCount <= 1) return;
                  setPendingDelete(position);
                  try {
                    await onRemovePage(position);
                  } finally {
                    setPendingDelete(null);
                  }
                }}
                deleteLabel={t('pagesPanel.deletePage', { page: position + 1 })}
                dragLabel={t('pagesPanel.dragPage', { page: position + 1 })}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface PageThumbnailProps {
  id: string;
  fileId: string;
  fileVersion: number;
  originalPageIndex: number;
  displayNumber: number;
  isCurrent: boolean;
  isDeleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
  deleteLabel: string;
  dragLabel: string;
}

function PageThumbnail({
  id,
  fileId,
  fileVersion,
  displayNumber,
  isCurrent,
  isDeleting,
  onSelect,
  onDelete,
  deleteLabel,
  dragLabel,
}: PageThumbnailProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number>(0.75);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    setThumbnailLoaded(false);
    setThumbnailError(false);

    (async () => {
      try {
        const data = await useStudioStore.getState().getCurrentBuffer(fileId);
        if (cancelled) return;

        const pdfjs = await loadPdfjs();
        if (cancelled) return;

        const loadingTask = pdfjs.getDocument({ data: data.slice() });
        doc = await loadingTask.promise;
        if (cancelled) {
          doc.destroy();
          return;
        }

        const page = await doc.getPage(displayNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 0.4 });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        if (!cancelled) setAspectRatio(viewport.width / viewport.height);

        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setThumbnailLoaded(true);
      } catch {
        if (!cancelled) setThumbnailError(true);
      } finally {
        doc?.destroy();
      }
    })();

    return () => {
      cancelled = true;
      doc?.destroy();
    };
  }, [fileId, fileVersion, displayNumber]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group rounded-md border ${
        isCurrent
          ? 'border-[hsl(var(--color-primary))] ring-2 ring-[hsl(var(--color-primary))]/30'
          : 'border-[hsl(var(--color-border))]'
      } bg-white overflow-hidden`}
    >
      <button
        type="button"
        onClick={onSelect}
        style={{ aspectRatio }}
        className="block w-full bg-white relative focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-ring))]"
        aria-label={`Strona ${displayNumber}`}
      >
        {!thumbnailLoaded && !thumbnailError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--color-muted-foreground))]" />
          </div>
        )}
        {thumbnailError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <FileText className="w-8 h-8 text-[hsl(var(--color-muted-foreground))]" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className={`w-full h-full object-contain ${thumbnailLoaded ? 'opacity-100' : 'opacity-0'}`}
        />
      </button>

      <div className="absolute top-1 left-1 flex gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="p-1 rounded bg-[hsl(var(--color-card))]/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-grab active:cursor-grabbing"
          aria-label={dragLabel}
        >
          <GripVertical className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        disabled={isDeleting}
        className="absolute top-1 right-1 p-1 rounded bg-[hsl(var(--color-card))]/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-[hsl(var(--color-destructive))]/20 hover:text-[hsl(var(--color-destructive))] disabled:opacity-50"
        aria-label={deleteLabel}
      >
        {isDeleting ? (
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="w-3 h-3" aria-hidden="true" />
        )}
      </button>

      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-[hsl(var(--color-card))]/90 backdrop-blur-sm text-xs tabular-nums">
        {displayNumber}
      </div>
    </div>
  );
}
