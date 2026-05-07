'use client';

import { useTranslations } from 'next-intl';
import { useStudioStore, selectCurrentFile } from '@/lib/stores/studioStore';

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function StudioFooter() {
  const t = useTranslations('studio');
  const currentFile = useStudioStore(selectCurrentFile);
  const filesCount = useStudioStore((state) => state.files.length);

  return (
    <footer
      className="h-9 border-t border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] flex items-center px-4 gap-3 text-xs text-[hsl(var(--color-muted-foreground))]"
      aria-label={t('a11y.footer')}
    >
      {currentFile ? (
        <>
          <span className="truncate" title={currentFile.name}>
            {currentFile.name}
          </span>
          <span className="text-[hsl(var(--color-muted-foreground))]/60">·</span>
          <span>{formatBytes(currentFile.size)}</span>
          {currentFile.pageCount !== null && (
            <>
              <span className="text-[hsl(var(--color-muted-foreground))]/60">·</span>
              <span>
                {t('footer.pageCount', { count: currentFile.pageCount })}
              </span>
            </>
          )}
          <div className="flex-1" />
          <span>
            {t('footer.filesLoaded', { count: filesCount })}
          </span>
        </>
      ) : (
        <span>{t('footer.noFile')}</span>
      )}
    </footer>
  );
}
