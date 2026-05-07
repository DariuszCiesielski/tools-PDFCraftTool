'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { UploadCloud } from 'lucide-react';

interface StudioDropZoneProps {
  onFilesAdded: (files: File[]) => void;
}

export function StudioDropZone({ onFilesAdded }: StudioDropZoneProps) {
  const t = useTranslations('studio');
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current += 1;
    if (event.dataTransfer.items?.length) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);
      const droppedFiles = Array.from(event.dataTransfer.files);
      if (droppedFiles.length > 0) {
        onFilesAdded(droppedFiles);
      }
    },
    [onFilesAdded],
  );

  const handleClick = () => fileInputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (fileList) {
      onFilesAdded(Array.from(fileList));
      event.target.value = '';
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={t('dropzone.aria')}
      className={`flex flex-col items-center justify-center h-full p-8 border-4 border-dashed transition-colors cursor-pointer ${
        isDragging
          ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary))]/5'
          : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted))] hover:bg-[hsl(var(--color-muted))]/70'
      }`}
    >
      <UploadCloud
        className={`w-20 h-20 mb-4 ${
          isDragging
            ? 'text-[hsl(var(--color-primary))]'
            : 'text-[hsl(var(--color-muted-foreground))]'
        }`}
        aria-hidden="true"
      />
      <h2 className="text-2xl font-bold mb-2 text-[hsl(var(--color-foreground))]">
        {t('dropzone.title')}
      </h2>
      <p className="text-[hsl(var(--color-muted-foreground))] mb-6 max-w-md text-center">
        {t('dropzone.subtitle')}
      </p>
      <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
        {t('dropzone.privacyNote')}
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
