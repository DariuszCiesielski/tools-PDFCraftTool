'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, X, Plus } from 'lucide-react';
import { useStudioStore, type StudioFile } from '@/lib/stores/studioStore';

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface PageThumbnailsProps {
  onFilesAdded: (files: File[]) => void;
}

export function PageThumbnails({ onFilesAdded }: PageThumbnailsProps) {
  const t = useTranslations('studio');
  const files = useStudioStore((state) => state.files);
  const currentFileId = useStudioStore((state) => state.currentFileId);
  const selectFile = useStudioStore((state) => state.selectFile);
  const removeFile = useStudioStore((state) => state.removeFile);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleAddClick = () => fileInputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (fileList) {
      onFilesAdded(Array.from(fileList));
      event.target.value = '';
    }
  };

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragOver(false);
      const dropped = Array.from(event.dataTransfer.files);
      if (dropped.length > 0) {
        onFilesAdded(dropped);
      }
    },
    [onFilesAdded],
  );

  return (
    <div
      className="p-3 flex flex-col gap-2 h-full"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--color-muted-foreground))] px-2 py-1">
        {t('thumbnails.heading', { count: files.length })}
      </h3>

      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
        {files.map((file) => (
          <FileItem
            key={file.id}
            file={file}
            isActive={file.id === currentFileId}
            onSelect={() => selectFile(file.id)}
            onRemove={() => removeFile(file.id)}
            removeLabel={t('thumbnails.removeFile', { name: file.name })}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handleAddClick}
        className={`flex items-center justify-center gap-2 mt-auto w-full p-3 rounded-md border-2 border-dashed transition-colors ${
          isDragOver
            ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary))]/10 text-[hsl(var(--color-primary))]'
            : 'border-[hsl(var(--color-border))] text-[hsl(var(--color-muted-foreground))] hover:border-[hsl(var(--color-primary))] hover:text-[hsl(var(--color-primary))]'
        }`}
        aria-label={t('thumbnails.addMore')}
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        <span className="text-sm">{t('thumbnails.addMore')}</span>
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

interface FileItemProps {
  file: StudioFile;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
  removeLabel: string;
}

function FileItem({ file, isActive, onSelect, onRemove, removeLabel }: FileItemProps) {
  return (
    <div
      className={`group relative rounded-md border p-2 cursor-pointer transition-colors ${
        isActive
          ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary))]/5'
          : 'border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-muted))]'
      }`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
    >
      <div className="flex gap-2 items-start">
        <FileText
          className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
            isActive
              ? 'text-[hsl(var(--color-primary))]'
              : 'text-[hsl(var(--color-muted-foreground))]'
          }`}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" title={file.name}>
            {file.name}
          </p>
          <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
            {formatBytes(file.size)}
            {file.pageCount !== null && ` · ${file.pageCount} str.`}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-[hsl(var(--color-destructive))]/20 text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-destructive))] transition-opacity"
          aria-label={removeLabel}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
