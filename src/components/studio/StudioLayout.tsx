'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { type Locale } from '@/lib/i18n/config';
import { useStudioStore } from '@/lib/stores/studioStore';
import {
  useStudioSessionStore,
  selectAnyDirty,
} from '@/lib/stores/studioSessionStore';
import {
  getDocumentRepository,
  type PdfDocument,
} from '@/lib/persistence/pdfDocumentRepository';
import { useResizable } from '@/lib/hooks/useResizable';
import { useRecentDocuments } from '@/lib/hooks/useRecentDocuments';
import { usePreferences } from '@/lib/hooks/usePreferences';
import { StudioHeader } from './StudioHeader';
import { StudioMenuBar } from './StudioMenuBar';
import { StudioFooter } from './StudioFooter';
import { PagesPanel } from './PagesPanel';
import { PdfViewer } from './PdfViewer';
import { ToolsPanel } from './ToolsPanel';
import { StudioDropZone } from './StudioDropZone';
import { FileTabs } from './FileTabs';
import { CombineFilesWizard } from './CombineFilesWizard';
import { RestoreSessionPrompt } from './RestoreSessionPrompt';

interface StudioLayoutProps {
  locale: Locale;
}

interface ResizeHandleProps {
  side: 'left' | 'right';
  isResizing: boolean;
  handleRef: React.RefObject<HTMLDivElement | null>;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  ariaLabel: string;
}

function ResizeHandle({
  isResizing,
  handleRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  ariaLabel,
}: ResizeHandleProps) {
  return (
    <div
      ref={handleRef}
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`group w-1 hover:w-1.5 cursor-col-resize bg-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-primary))] transition-all ${
        isResizing ? 'w-1.5 bg-[hsl(var(--color-primary))]' : ''
      }`}
    />
  );
}

export function StudioLayout({ locale }: StudioLayoutProps) {
  const t = useTranslations('studio');
  const files = useStudioStore((state) => state.files);
  const addFiles = useStudioStore((state) => state.addFiles);
  const showLeftSidebar = useStudioStore((state) => state.showLeftSidebar);
  const showRightPanel = useStudioStore((state) => state.showRightPanel);
  const showCombineWizard = useStudioSessionStore((s) => s.showCombineWizard);
  const closeCombineWizard = useStudioSessionStore((s) => s.closeCombineWizard);
  const anyDirty = useStudioSessionStore(selectAnyDirty);

  // Faza 2: boot gate + recovery prompt
  const [bootState, setBootState] = useState<'pending' | 'restore-prompt' | 'ready'>(
    'pending',
  );
  const [persistedDocs, setPersistedDocs] = useState<PdfDocument[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const repo = getDocumentRepository();
        const docs = await repo.listAll();
        if (cancelled) return;
        if (docs.length === 0) {
          setBootState('ready');
          return;
        }
        setPersistedDocs(docs);
        setBootState('restore-prompt');
      } catch (err) {
        console.error('[StudioLayout] boot error', err);
        setBootState('ready');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRestoreSession = useCallback(async () => {
    const setFileData = useStudioStore.getState().setFileData;
    const addFiles = useStudioStore.getState().addFiles;
    const setPageCount = useStudioStore.getState().setPageCount;
    // Każdy doc → File → addFiles → setFileData/setPageCount
    for (const doc of persistedDocs) {
      const blob = new Blob([doc.currentData.slice() as BlobPart], {
        type: 'application/pdf',
      });
      const file = new File([blob], doc.name, { type: 'application/pdf' });
      const beforeIds = new Set(useStudioStore.getState().files.map((f) => f.id));
      addFiles([file]);
      const newFile = useStudioStore.getState().files.find((f) => !beforeIds.has(f.id));
      if (newFile) {
        // setFileData zaktualizuje tab.version → trafi z powrotem do persistDocument,
        // ale to OK (idempotentne). Plus setPageCount.
        setFileData(newFile.id, doc.currentData);
        setPageCount(newFile.id, doc.pageCount);
      }
    }
    setPersistedDocs([]);
    setBootState('ready');
  }, [persistedDocs]);

  const handleSkipRestore = useCallback(async () => {
    try {
      await getDocumentRepository().clear();
    } catch (err) {
      console.warn('[StudioLayout] clear repo error', err);
    }
    setPersistedDocs([]);
    setBootState('ready');
  }, []);

  // beforeunload prompt gdy są niezapisane zmiany lub otwarte zakładki
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (anyDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [anyDirty]);

  const leftSidebar = useResizable({
    initialWidth: 288,
    minWidth: 200,
    maxWidth: 480,
    side: 'left',
    storageKey: 'studio.leftSidebarWidth',
  });

  const rightPanel = useResizable({
    initialWidth: 384,
    minWidth: 280,
    maxWidth: 560,
    side: 'right',
    storageKey: 'studio.rightPanelWidth',
  });

  const { addRecent } = useRecentDocuments();
  const { setLeftSidebarWidth, setRightPanelWidth } = usePreferences();

  useEffect(() => {
    setLeftSidebarWidth(leftSidebar.width);
  }, [leftSidebar.width, setLeftSidebarWidth]);

  useEffect(() => {
    setRightPanelWidth(rightPanel.width);
  }, [rightPanel.width, setRightPanelWidth]);

  const [confirmationToast, setConfirmationToast] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Supabase wraca z type w hash (?type=signup) lub query — sprawdź oba
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const queryParams = new URLSearchParams(window.location.search);
    const type = hashParams.get('type') ?? queryParams.get('type');
    if (type === 'signup') {
      setConfirmationToast(t('auth.confirmedToast'));
    } else if (type === 'recovery') {
      setConfirmationToast(t('auth.recoveryToast'));
    }
    if (type === 'signup' || type === 'recovery') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [t]);

  useEffect(() => {
    if (!confirmationToast) return;
    const timer = setTimeout(() => setConfirmationToast(null), 5000);
    return () => clearTimeout(timer);
  }, [confirmationToast]);

  const handleFilesAdded = useCallback(
    (newFiles: File[]) => {
      const pdfFiles = newFiles.filter(
        (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
      );
      if (pdfFiles.length > 0) {
        addFiles(pdfFiles);
        pdfFiles.forEach((file) => {
          void addRecent(file);
        });
      }
    },
    [addFiles, addRecent],
  );

  const hasFiles = files.length > 0;

  return (
    <div
      className={`flex flex-col h-screen bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))] ${
        leftSidebar.isResizing || rightPanel.isResizing ? 'select-none cursor-col-resize' : ''
      }`}
    >
      <StudioHeader locale={locale} onFilesAdded={handleFilesAdded} />
      <StudioMenuBar locale={locale} onFilesAdded={handleFilesAdded} />
      <FileTabs />

      {confirmationToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg bg-[hsl(var(--color-primary))] text-[hsl(var(--color-primary-foreground))] animate-in slide-in-from-top-2 duration-300"
        >
          <span className="text-sm font-medium">{confirmationToast}</span>
          <button
            type="button"
            onClick={() => setConfirmationToast(null)}
            aria-label={t('auth.dismissToast')}
            className="opacity-80 hover:opacity-100 transition-opacity"
          >
            ×
          </button>
        </div>
      )}

      {hasFiles ? (
        <div className="flex flex-1 overflow-hidden">
          {showLeftSidebar && (
            <>
              <aside
                style={{ width: leftSidebar.width }}
                className="border-r border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] hidden md:flex md:flex-col flex-shrink-0"
                aria-label={t('a11y.pagesSidebar')}
              >
                <PagesPanel onFilesAdded={handleFilesAdded} />
              </aside>
              <ResizeHandle
                side="left"
                isResizing={leftSidebar.isResizing}
                handleRef={leftSidebar.handleRef}
                onPointerDown={leftSidebar.handlePointerDown}
                onPointerMove={leftSidebar.handlePointerMove}
                onPointerUp={leftSidebar.handlePointerUp}
                ariaLabel={t('a11y.resizeLeftSidebar')}
              />
            </>
          )}

          <main
            className="flex-1 overflow-auto bg-[hsl(var(--color-muted))] min-w-0"
            aria-label={t('a11y.viewer')}
          >
            <PdfViewer />
          </main>

          {showRightPanel && (
            <>
              <ResizeHandle
                side="right"
                isResizing={rightPanel.isResizing}
                handleRef={rightPanel.handleRef}
                onPointerDown={rightPanel.handlePointerDown}
                onPointerMove={rightPanel.handlePointerMove}
                onPointerUp={rightPanel.handlePointerUp}
                ariaLabel={t('a11y.resizeRightPanel')}
              />
              <aside
                style={{ width: rightPanel.width }}
                className="border-l border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] hidden lg:flex lg:flex-col flex-shrink-0"
                aria-label={t('a11y.toolsPanel')}
              >
                <ToolsPanel />
              </aside>
            </>
          )}
        </div>
      ) : (
        <main className="flex-1 overflow-auto" aria-label={t('a11y.dropZone')}>
          <StudioDropZone onFilesAdded={handleFilesAdded} />
        </main>
      )}

      <StudioFooter />

      <CombineFilesWizard
        isOpen={showCombineWizard}
        onClose={closeCombineWizard}
      />

      {bootState === 'restore-prompt' && (
        <RestoreSessionPrompt
          docs={persistedDocs}
          onRestore={handleRestoreSession}
          onSkip={handleSkipRestore}
        />
      )}
    </div>
  );
}
