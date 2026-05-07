'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { FolderOpen, Download, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { type Locale } from '@/lib/i18n/config';
import { useStudioStore } from '@/lib/stores/studioStore';

interface StudioHeaderProps {
  locale: Locale;
  onFilesAdded: (files: File[]) => void;
}

export function StudioHeader({ locale, onFilesAdded }: StudioHeaderProps) {
  const t = useTranslations('studio');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reset = useStudioStore((state) => state.reset);
  const filesCount = useStudioStore((state) => state.files.length);

  const handleOpenClick = () => fileInputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (fileList) {
      onFilesAdded(Array.from(fileList));
      event.target.value = '';
    }
  };

  return (
    <header className="h-14 border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] flex items-center px-4 gap-2">
      <Link
        href={`/${locale}`}
        className="flex items-center gap-2 mr-4 text-[hsl(var(--color-foreground))] hover:text-[hsl(var(--color-primary))]"
        aria-label={t('header.home')}
      >
        <Home className="w-5 h-5" />
        <span className="font-semibold hidden sm:inline">{t('header.appName')}</span>
      </Link>

      <Button
        variant="primary"
        size="sm"
        onClick={handleOpenClick}
        aria-label={t('header.openFiles')}
      >
        <FolderOpen className="w-4 h-4 mr-2" />
        {t('header.openFiles')}
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

      {filesCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          aria-label={t('header.clearAll')}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          <span className="hidden sm:inline">{t('header.clearAll')}</span>
        </Button>
      )}

      <div className="flex-1" />

      <Button variant="ghost" size="sm" disabled aria-label={t('header.export')}>
        <Download className="w-4 h-4 mr-2" />
        <span className="hidden sm:inline">{t('header.export')}</span>
      </Button>

      <ThemeToggle />
    </header>
  );
}
