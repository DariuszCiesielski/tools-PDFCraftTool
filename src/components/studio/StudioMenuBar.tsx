'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { useStudioStore, selectCurrentFile, type StudioToolId } from '@/lib/stores/studioStore';
import { type Locale } from '@/lib/i18n/config';
import { downloadBlob, printBlob, suggestSaveAsName } from '@/lib/studio/file-actions';
import { useRecentDocuments } from '@/lib/hooks/useRecentDocuments';

interface StudioMenuBarProps {
  locale: Locale;
  onFilesAdded: (files: File[]) => void;
}

const TOOL_GROUPS: Array<{
  group: 'pages' | 'enhance' | 'compress' | 'security' | 'convert';
  tools: NonNullable<StudioToolId>[];
}> = [
  // Pages — operacje na stronach PDF
  { group: 'pages', tools: [
    'split', 'merge', 'rotate', 'extract-images',
    // Wave-2
    'delete', 'organize', 'extract', 'crop', 'add-blank-page', 'n-up',
    // Wave-3
    'alternate-merge', 'combine-single-page', 'divide', 'grid-combine',
    'page-dimensions', 'pdf-booklet', 'posterize', 'reverse', 'rotate-custom',
  ] },
  // Enhance — wzbogacanie zawartości
  { group: 'enhance', tools: [
    'page-numbers', 'watermark', 'edit-metadata', 'sign', 'ocr',
    // Wave-2
    'flatten', 'header-footer', 'remove-annotations', 'remove-blank-pages',
    // Wave-3
    'background-color', 'bookmark', 'decrypt', 'deskew', 'edit-pdf',
    'find-and-redact', 'fix-page-size', 'font-to-outline', 'invert-colors',
    'ocg-manager', 'pdf-to-greyscale', 'rasterize', 'remove-metadata', 'repair',
    'stamps', 'table-of-contents', 'text-color',
  ] },
  // Compress
  { group: 'compress', tools: ['compress', 'linearize'] },
  // Security
  { group: 'security', tools: ['encrypt', 'remove-restrictions', 'sanitize'] },
  // Convert — konwersje formatów
  { group: 'convert', tools: [
    'pdf-to-docx', 'pdf-to-excel', 'pdf-to-pptx',
    'word-to-pdf', 'excel-to-pdf', 'image-to-pdf',
  ] },
];

export function StudioMenuBar({ locale, onFilesAdded }: StudioMenuBarProps) {
  const t = useTranslations('studio');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useStudioStore((state) => state.reset);
  const setZoom = useStudioStore((state) => state.setZoom);
  const zoomLevel = useStudioStore((state) => state.zoomLevel);
  const showLeftSidebar = useStudioStore((state) => state.showLeftSidebar);
  const showRightPanel = useStudioStore((state) => state.showRightPanel);
  const toggleLeftSidebar = useStudioStore((state) => state.toggleLeftSidebar);
  const toggleRightPanel = useStudioStore((state) => state.toggleRightPanel);
  const selectTool = useStudioStore((state) => state.selectTool);
  const currentFile = useStudioStore(selectCurrentFile);
  const filesCount = useStudioStore((state) => state.files.length);

  const setProcessing = useStudioStore((state) => state.setProcessing);
  const isProcessing = useStudioStore((state) => state.isProcessing);
  const { recent, clearRecent } = useRecentDocuments();
  const exportCurrentFile = useCallback(async () => {
    if (!currentFile) return;
    const data = await useStudioStore.getState().getCurrentBuffer(currentFile.id);
    const blob = new Blob([data as BlobPart], { type: 'application/pdf' });
    downloadBlob(blob, currentFile.name);
  }, [currentFile]);

  const exportAs = useCallback(
    async (format: 'docx' | 'pptx' | 'xlsx' | 'png') => {
      if (!currentFile || isProcessing) return;
      setProcessing(true);
      try {
        const data = await useStudioStore.getState().getCurrentBuffer(currentFile.id);
        const fileForProcess = new File([data as BlobPart], currentFile.name, {
          type: 'application/pdf',
        });

        const baseName = currentFile.name.replace(/\.pdf$/i, '');
        let result: { success: boolean; result?: Blob | Blob[]; filename?: string; error?: { message?: string } };
        let extension = format;

        if (format === 'docx') {
          const { pdfToDocx } = await import('@/lib/pdf/processors/pdf-to-docx');
          result = await pdfToDocx(fileForProcess);
        } else if (format === 'pptx') {
          const { pdfToPptx } = await import('@/lib/pdf/processors/pdf-to-pptx');
          result = await pdfToPptx(fileForProcess);
        } else if (format === 'xlsx') {
          const { pdfToExcel } = await import('@/lib/pdf/processors/pdf-to-excel');
          result = await pdfToExcel(fileForProcess);
        } else {
          const { pdfToImages } = await import('@/lib/pdf/processors/pdf-to-image');
          result = await pdfToImages(fileForProcess, { format: 'png' });
          extension = 'png';
        }

        if (!result.success || !result.result) {
          window.alert(t('menubar.file.exportError', { error: result.error?.message ?? 'Unknown error' }));
          return;
        }

        const output = result.result;
        if (Array.isArray(output)) {
          output.forEach((blob, idx) => {
            const name = result.filename ?? `${baseName}-${idx + 1}.${extension}`;
            downloadBlob(blob, name);
          });
        } else {
          const name = result.filename ?? `${baseName}.${extension}`;
          downloadBlob(output, name);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        window.alert(t('menubar.file.exportError', { error: msg }));
      } finally {
        setProcessing(false);
      }
    },
    [currentFile, isProcessing, setProcessing, t],
  );

  const saveAsCurrentFile = useCallback(async () => {
    if (!currentFile) return;
    const suggested = suggestSaveAsName(currentFile.name);
    const filename = window.prompt(t('menubar.file.saveAsPrompt'), suggested);
    if (!filename) return;
    const finalName = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
    const data = await useStudioStore.getState().getCurrentBuffer(currentFile.id);
    const blob = new Blob([data as BlobPart], { type: 'application/pdf' });
    downloadBlob(blob, finalName);
  }, [currentFile, t]);

  const printCurrentFile = useCallback(async () => {
    if (!currentFile) return;
    const data = await useStudioStore.getState().getCurrentBuffer(currentFile.id);
    const blob = new Blob([data as BlobPart], { type: 'application/pdf' });
    printBlob(blob);
  }, [currentFile]);

  const handleOpenClick = () => fileInputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (fileList) {
      onFilesAdded(Array.from(fileList));
      event.target.value = '';
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey;
      if (!isMod) return;

      if (event.key === 'o' || event.key === 'O') {
        event.preventDefault();
        handleOpenClick();
      } else if (event.key === 's' || event.key === 'S') {
        event.preventDefault();
        if (event.shiftKey) saveAsCurrentFile();
        else exportCurrentFile();
      } else if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        printCurrentFile();
      } else if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        setZoom(useStudioStore.getState().zoomLevel + 0.1);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        setZoom(useStudioStore.getState().zoomLevel - 0.1);
      } else if (event.key === '0') {
        event.preventDefault();
        setZoom(1.0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setZoom, exportCurrentFile, saveAsCurrentFile, printCurrentFile]);

  return (
    <nav
      className="h-8 border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] flex items-center px-2 gap-1 text-sm select-none"
      aria-label={t('menubar.aria')}
    >
      <MenuRoot label={t('menubar.file.label')}>
        <MenuItem onSelect={handleOpenClick} shortcut="⌘O">
          {t('menubar.file.open')}
        </MenuItem>

        {recent.length > 0 ? (
          <SubMenu label={t('menubar.file.recent')}>
            {recent.map((doc, idx) => (
              <MenuItem
                key={`${doc.name}-${doc.lastOpened}`}
                onSelect={handleOpenClick}
                shortcut={idx < 9 ? `⌘${idx + 1}` : undefined}
              >
                <span className="truncate max-w-[260px]" title={doc.name}>
                  {doc.name}
                </span>
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem onSelect={() => void clearRecent()}>
              {t('menubar.file.clearRecent')}
            </MenuItem>
          </SubMenu>
        ) : (
          <MenuItem disabled>{t('menubar.file.recentEmpty')}</MenuItem>
        )}

        <MenuItem onSelect={reset} disabled={filesCount === 0}>
          {t('menubar.file.clearAll')}
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={exportCurrentFile} disabled={!currentFile} shortcut="⌘S">
          {t('menubar.file.save')}
        </MenuItem>
        <MenuItem onSelect={saveAsCurrentFile} disabled={!currentFile} shortcut="⇧⌘S">
          {t('menubar.file.saveAs')}
        </MenuItem>

        <SubMenu label={t('menubar.file.export')}>
          <MenuItem onSelect={() => exportAs('docx')} disabled={!currentFile || isProcessing}>
            {t('menubar.file.exportDocx')}
          </MenuItem>
          <MenuItem onSelect={() => exportAs('pptx')} disabled={!currentFile || isProcessing}>
            {t('menubar.file.exportPptx')}
          </MenuItem>
          <MenuItem onSelect={() => exportAs('xlsx')} disabled={!currentFile || isProcessing}>
            {t('menubar.file.exportXlsx')}
          </MenuItem>
          <MenuItem onSelect={() => exportAs('png')} disabled={!currentFile || isProcessing}>
            {t('menubar.file.exportPng')}
          </MenuItem>
        </SubMenu>

        <MenuSeparator />
        <MenuItem onSelect={printCurrentFile} disabled={!currentFile} shortcut="⌘P">
          {t('menubar.file.print')}
        </MenuItem>
        <MenuSeparator />
        <MenuItem asChild>
          <Link href={`/${locale}`} className="block w-full">
            {t('menubar.file.exit')}
          </Link>
        </MenuItem>
      </MenuRoot>

      <MenuRoot label={t('menubar.view.label')}>
        <MenuItem onSelect={() => setZoom(zoomLevel + 0.1)} shortcut="⌘+">
          {t('menubar.view.zoomIn')}
        </MenuItem>
        <MenuItem onSelect={() => setZoom(zoomLevel - 0.1)} shortcut="⌘−">
          {t('menubar.view.zoomOut')}
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => setZoom(1.0)} shortcut="⌘0">
          {t('menubar.view.actualSize')}
        </MenuItem>
        <MenuItem onSelect={() => setZoom(1.5)}>{t('menubar.view.fitWidth')}</MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={toggleLeftSidebar} checked={showLeftSidebar}>
          {t('menubar.view.toggleLeftSidebar')}
        </MenuItem>
        <MenuItem onSelect={toggleRightPanel} checked={showRightPanel}>
          {t('menubar.view.toggleRightPanel')}
        </MenuItem>
      </MenuRoot>

      <MenuRoot label={t('menubar.tools.label')}>
        {TOOL_GROUPS.map(({ group, tools }) => (
          <SubMenu key={group} label={t(`tools.categories.${group}`)}>
            {tools.map((tool) => (
              <MenuItem
                key={tool}
                onSelect={() => selectTool(tool)}
                disabled={filesCount === 0}
              >
                {t(`tools.${tool}.name`)}
              </MenuItem>
            ))}
          </SubMenu>
        ))}
      </MenuRoot>

      <MenuRoot label={t('menubar.help.label')}>
        <MenuItem disabled>{t('menubar.help.about')}</MenuItem>
        <MenuItem disabled>{t('menubar.help.shortcuts')}</MenuItem>
        <MenuSeparator />
        <MenuItem asChild>
          <Link href={`/${locale}`} className="block w-full">
            {t('menubar.help.home')}
          </Link>
        </MenuItem>
      </MenuRoot>

      {isProcessing && (
        <div
          className="ml-auto flex items-center gap-2 px-2 text-xs text-[hsl(var(--color-muted-foreground))]"
          aria-live="polite"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          {t('menubar.processing')}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

    </nav>
  );
}

const menuItemClasses =
  'flex items-center justify-between gap-6 px-3 py-1.5 text-sm rounded outline-none cursor-pointer ' +
  'data-[highlighted]:bg-[hsl(var(--color-primary))]/10 data-[highlighted]:text-[hsl(var(--color-primary))] ' +
  'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:hover:bg-transparent';

function MenuRoot({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="px-3 h-7 rounded text-sm outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-ring))] hover:bg-[hsl(var(--color-muted))] data-[state=open]:bg-[hsl(var(--color-muted))]"
          type="button"
        >
          {label}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-[220px] rounded-md border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] shadow-lg p-1 z-50"
          align="start"
          sideOffset={2}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

interface MenuItemProps {
  onSelect?: () => void;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  children: React.ReactNode;
  asChild?: boolean;
}

function MenuItem({ onSelect, shortcut, disabled, checked, children, asChild }: MenuItemProps) {
  return (
    <DropdownMenu.Item
      className={menuItemClasses}
      disabled={disabled}
      onSelect={onSelect ? () => onSelect() : undefined}
      asChild={asChild}
    >
      {asChild ? (
        children
      ) : (
        <>
          <span className="flex items-center gap-2">
            {checked !== undefined && (
              <Check
                className={`w-3.5 h-3.5 ${checked ? 'opacity-100' : 'opacity-0'}`}
                aria-hidden="true"
              />
            )}
            {children}
          </span>
          {shortcut && (
            <span className="text-xs text-[hsl(var(--color-muted-foreground))] tabular-nums">
              {shortcut}
            </span>
          )}
        </>
      )}
    </DropdownMenu.Item>
  );
}

function MenuSeparator() {
  return (
    <DropdownMenu.Separator className="h-px my-1 bg-[hsl(var(--color-border))]" />
  );
}

function SubMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={menuItemClasses}>
        <span>{label}</span>
        <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--color-muted-foreground))]" aria-hidden="true" />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent
          className="min-w-[200px] rounded-md border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] shadow-lg p-1 z-50"
          sideOffset={4}
        >
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}
