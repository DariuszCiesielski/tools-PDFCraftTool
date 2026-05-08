'use client';

/**
 * FileTabs — zakładki górne Acrobat-style MDI.
 *
 * Per-tab dirty indicator (kropka gdy version > 0), close button,
 * ARIA tablist, keyboard navigation (Arrow Left/Right, Home, End, Ctrl+Tab, Ctrl+W, Ctrl+1-9).
 *
 * Flexible tab width 120-200px + tooltip z full filename — Acrobat ma stałą szerokość,
 * my robimy lepiej (per cross-model review insight).
 */

import { useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { X, FileText, Circle } from 'lucide-react';
import {
  useStudioSessionStore,
  selectTabs,
  selectActiveTabId,
  type TabState,
} from '@/lib/stores/studioSessionStore';
import { useStudioStore } from '@/lib/stores/studioStore';

export function FileTabs() {
  const t = useTranslations('studio');
  const tabs = useStudioSessionStore(selectTabs);
  const activeTabId = useStudioSessionStore(selectActiveTabId);
  const tablistRef = useRef<HTMLDivElement>(null);

  const selectFile = useStudioStore((state) => state.selectFile);
  const removeFile = useStudioStore((state) => state.removeFile);

  const handleSelect = useCallback(
    (tabId: string) => {
      selectFile(tabId); // bridge → sessionStore.selectTab
    },
    [selectFile],
  );

  const handleClose = useCallback(
    (tabId: string, event?: React.MouseEvent) => {
      event?.stopPropagation();
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.isDirty) {
        const ok =
          typeof window !== 'undefined' &&
          window.confirm(
            t('tabs.closeDirtyConfirm', { name: tab.name }) ||
              `Plik "${tab.name}" ma niezapisane zmiany. Zamknąć zakładkę?`,
          );
        if (!ok) return;
      }
      removeFile(tabId); // bridge → sessionStore.closeTab
    },
    [tabs, removeFile, t],
  );

  // Keyboard shortcuts: Ctrl+Tab/Ctrl+Shift+Tab (next/prev), Ctrl+W (close), Ctrl+1..9 (switch N)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;
      if (tabs.length === 0) return;

      // Ctrl+Tab / Ctrl+Shift+Tab — switch
      if (e.key === 'Tab') {
        e.preventDefault();
        const currentIdx = tabs.findIndex((t) => t.id === activeTabId);
        const nextIdx = e.shiftKey
          ? (currentIdx - 1 + tabs.length) % tabs.length
          : (currentIdx + 1) % tabs.length;
        handleSelect(tabs[nextIdx].id);
        return;
      }

      // Ctrl+W — close active
      if (e.key === 'w' || e.key === 'W') {
        if (activeTabId) {
          e.preventDefault();
          handleClose(activeTabId);
        }
        return;
      }

      // Ctrl+1..9 — switch to tab N
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < tabs.length) {
          e.preventDefault();
          handleSelect(tabs[idx].id);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tabs, activeTabId, handleSelect, handleClose]);

  // Arrow Left/Right + Home/End — navigation w obrębie tablist
  const handleTablistKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (tabs.length === 0) return;
      const currentIdx = tabs.findIndex((t) => t.id === activeTabId);
      let nextIdx = currentIdx;

      if (e.key === 'ArrowRight') {
        nextIdx = (currentIdx + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft') {
        nextIdx = (currentIdx - 1 + tabs.length) % tabs.length;
      } else if (e.key === 'Home') {
        nextIdx = 0;
      } else if (e.key === 'End') {
        nextIdx = tabs.length - 1;
      } else {
        return;
      }
      e.preventDefault();
      handleSelect(tabs[nextIdx].id);
      // Focus management
      const button = tablistRef.current?.querySelector<HTMLButtonElement>(
        `[data-tab-id="${tabs[nextIdx].id}"]`,
      );
      button?.focus();
    },
    [tabs, activeTabId, handleSelect],
  );

  if (tabs.length === 0) return null;

  return (
    <div
      ref={tablistRef}
      role="tablist"
      aria-label={t('tabs.aria') || 'Otwarte pliki'}
      onKeyDown={handleTablistKeyDown}
      className="flex items-stretch gap-0 border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] overflow-x-auto"
    >
      {tabs.map((tab) => (
        <FileTab
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onSelect={() => handleSelect(tab.id)}
          onClose={(event) => handleClose(tab.id, event)}
          closeLabel={t('tabs.close', { name: tab.name }) || `Zamknij ${tab.name}`}
        />
      ))}
    </div>
  );
}

interface FileTabProps {
  tab: TabState;
  isActive: boolean;
  onSelect: () => void;
  onClose: (event: React.MouseEvent) => void;
  closeLabel: string;
}

function FileTab({ tab, isActive, onSelect, onClose, closeLabel }: FileTabProps) {
  const showDirty = tab.isDirty || tab.version > 0;
  const tabPanelId = `tabpanel-${tab.id}`;

  // Auxiliary middle-click → close (Chrome tab convention)
  const handleAuxClick = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      onClose(e);
    }
  };

  return (
    <button
      type="button"
      role="tab"
      data-tab-id={tab.id}
      aria-selected={isActive}
      aria-controls={tabPanelId}
      tabIndex={isActive ? 0 : -1}
      onClick={onSelect}
      onAuxClick={handleAuxClick}
      title={tab.name}
      className={`group relative flex items-center gap-2 min-w-[120px] max-w-[200px] px-3 py-2 border-r border-[hsl(var(--color-border))] text-sm transition-colors ${
        isActive
          ? 'bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))] border-b-2 border-b-[hsl(var(--color-primary))] -mb-px'
          : 'bg-[hsl(var(--color-card))] text-[hsl(var(--color-muted-foreground))] hover:bg-[hsl(var(--color-background))]/60 hover:text-[hsl(var(--color-foreground))]'
      }`}
    >
      <FileText
        className="w-3.5 h-3.5 flex-shrink-0 opacity-70"
        aria-hidden="true"
      />
      {showDirty && (
        <Circle
          className="w-2 h-2 flex-shrink-0 fill-current text-[hsl(var(--color-primary))]"
          aria-label="Zmodyfikowany"
        />
      )}
      <span className="truncate flex-1 text-left">{tab.name}</span>
      <span
        role="button"
        tabIndex={-1}
        aria-label={closeLabel}
        onClick={(e) => {
          e.stopPropagation();
          onClose(e);
        }}
        className="flex-shrink-0 opacity-50 hover:opacity-100 hover:bg-[hsl(var(--color-destructive))]/15 hover:text-[hsl(var(--color-destructive))] rounded p-0.5 transition-opacity"
      >
        <X className="w-3 h-3" />
      </span>
    </button>
  );
}
