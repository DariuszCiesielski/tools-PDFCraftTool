'use client';

/**
 * CombineFilesWizard — pełnoekranowy modal Acrobat-style.
 *
 * Czyta listę otwartych zakładek z sessionStore + pozwala odznaczyć/reorder/dodać nowe pliki,
 * potem `documentActions.combineDocuments` tworzy nowy plik C jako nową zakładkę.
 *
 * Per WebSearch Acrobat 2024:
 * - "Add Open Files" jako first-class option (czyli default = wszystkie z otwartych zakładek checked)
 * - Output: nowa zakładka "Połączony N.pdf", oryginały zostają otwarte
 * - Reorder przez drag-drop
 *
 * Per cross-model review:
 * - ARIA: role="dialog" aria-modal focus trap
 * - Keyboard: Esc zamyka, Tab focus management
 */

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
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, Plus, Loader2, FileText } from 'lucide-react';
import {
  useStudioSessionStore,
  selectTabs,
  type TabState,
  type CombineWizardMode,
} from '@/lib/stores/studioSessionStore';
import { useStudioStore } from '@/lib/stores/studioStore';
import { documentActions } from '@/lib/services/documentActions';
import { Button } from '@/components/ui/Button';

interface CombineFilesWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SelectionItem {
  tabId: string;
  selected: boolean;
}

// Faza 4: konfiguracja per-mode (min selected, opcje, etykiety i18n keys)
const MODE_CONFIG: Record<
  CombineWizardMode,
  {
    titleKey: string;
    hintKey: string;
    submitKey: string;
    minSelected: number;
    outputPatternKey: string;
  }
> = {
  merge: {
    titleKey: 'combineWizard.title',
    hintKey: 'combineWizard.hint',
    submitKey: 'combineWizard.combine',
    minSelected: 2,
    outputPatternKey: 'combineWizard.outputNamePattern',
  },
  'alternate-merge': {
    titleKey: 'combineWizard.alternateMerge.title',
    hintKey: 'combineWizard.alternateMerge.hint',
    submitKey: 'combineWizard.alternateMerge.submit',
    minSelected: 2,
    outputPatternKey: 'combineWizard.alternateMerge.outputName',
  },
  'grid-combine': {
    titleKey: 'combineWizard.gridCombine.title',
    hintKey: 'combineWizard.gridCombine.hint',
    submitKey: 'combineWizard.gridCombine.submit',
    minSelected: 2,
    outputPatternKey: 'combineWizard.gridCombine.outputName',
  },
  repair: {
    titleKey: 'combineWizard.repair.title',
    hintKey: 'combineWizard.repair.hint',
    submitKey: 'combineWizard.repair.submit',
    minSelected: 1,
    outputPatternKey: 'combineWizard.repair.outputName',
  },
};

export function CombineFilesWizard({ isOpen, onClose }: CombineFilesWizardProps) {
  const t = useTranslations('studio');
  const tabs = useStudioSessionStore(selectTabs);
  const mode = useStudioSessionStore((s) => s.combineWizardMode);
  const config = MODE_CONFIG[mode];
  const addFiles = useStudioStore((state) => state.addFiles);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [order, setOrder] = useState<SelectionItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // grid-combine: rows × cols (default 2×2 = 4 stron na arkuszu)
  const [gridLayout, setGridLayout] = useState<{ rows: number; cols: number }>({
    rows: 2,
    cols: 2,
  });

  // Sync state z tabs przy otwarciu (default: wszystkie checked, kolejność jak w tabs)
  useEffect(() => {
    if (isOpen) {
      setOrder(
        tabs.map((tab) => ({ tabId: tab.id, selected: true })),
      );
      setError(null);
      setIsProcessing(false);
    }
  }, [isOpen, tabs]);

  // Dodaj nowe taby do listy gdy otwarty modal i user dodał plik z drawera
  useEffect(() => {
    if (!isOpen) return;
    setOrder((prev) => {
      const known = new Set(prev.map((p) => p.tabId));
      const additions = tabs
        .filter((t) => !known.has(t.id))
        .map((t) => ({ tabId: t.id, selected: true }));
      if (additions.length === 0) return prev;
      return [...prev, ...additions];
    });
  }, [tabs, isOpen]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const ids = useMemo(() => order.map((o) => `combine-${o.tabId}`), [order]);

  const tabsById = useMemo(() => {
    const map = new Map<string, TabState>();
    for (const t of tabs) map.set(t.id, t);
    return map;
  }, [tabs]);

  const selectedCount = order.filter((o) => o.selected).length;
  const canCombine = selectedCount >= config.minSelected && !isProcessing;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setOrder((prev) => arrayMove(prev, oldIndex, newIndex));
  };

  const toggleSelected = (tabId: string) => {
    setOrder((prev) =>
      prev.map((o) =>
        o.tabId === tabId ? { ...o, selected: !o.selected } : o,
      ),
    );
  };

  const removeFromList = (tabId: string) => {
    setOrder((prev) => prev.filter((o) => o.tabId !== tabId));
  };

  const handleAddFiles = () => fileInputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList) return;
    const pdfFiles = Array.from(fileList).filter(
      (f) =>
        f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    );
    if (pdfFiles.length > 0) {
      addFiles(pdfFiles);
      // useEffect powyżej automatycznie doda nowe taby do `order`
    }
    event.target.value = '';
  };

  const handleCombine = async () => {
    const selected = order.filter((o) => o.selected).map((o) => o.tabId);
    if (selected.length < config.minSelected) return;

    setIsProcessing(true);
    setError(null);
    try {
      // Generuj nazwę "{Prefix} N.pdf" gdzie N = kolejny numer per-mode
      const allTabs = useStudioSessionStore.getState().tabs;
      // Wyciągnij prefix z translation pattern (np. "Połączony {n}.pdf" → "Połączony")
      const samplePattern = t(config.outputPatternKey, { n: 0 });
      const prefixMatch = samplePattern.match(/^(.+?)\s*0/);
      const prefix = prefixMatch ? prefixMatch[1].trim() : 'Wynik';
      const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d+\\.pdf$`, 'i');
      const existingCount = allTabs.filter((t) => re.test(t.name)).length;
      const nextNumber = existingCount + 1;
      const outputName = t(config.outputPatternKey, { n: nextNumber });

      switch (mode) {
        case 'merge':
          await documentActions.combineDocuments(selected, outputName);
          break;
        case 'alternate-merge':
          await documentActions.alternateMergeDocuments(selected, outputName);
          break;
        case 'grid-combine':
          await documentActions.gridCombineDocuments(
            selected,
            gridLayout,
            outputName,
          );
          break;
        case 'repair':
          await documentActions.repairDocuments(selected);
          break;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  // Esc to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, isProcessing]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="combine-wizard-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <div className="bg-[hsl(var(--color-card))] text-[hsl(var(--color-foreground))] rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--color-border))]">
          <h2 id="combine-wizard-title" className="text-lg font-semibold">
            {t(config.titleKey)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            aria-label={t('combineWizard.close') || 'Zamknij'}
            className="p-1 rounded hover:bg-[hsl(var(--color-muted))]/40 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="text-sm text-[hsl(var(--color-muted-foreground))] mb-4">
            {t(config.hintKey)}
          </p>

          {mode === 'grid-combine' && (
            <div className="mb-4 p-3 rounded-md border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted))]/30">
              <div className="text-sm font-medium mb-2">
                {t('combineWizard.gridCombine.layoutLabel')}
              </div>
              <div className="flex gap-2" role="radiogroup" aria-label={t('combineWizard.gridCombine.layoutLabel')}>
                {([
                  [2, 1],
                  [2, 2],
                  [3, 3],
                ] as const).map(([cols, rows]) => {
                  const active = gridLayout.cols === cols && gridLayout.rows === rows;
                  return (
                    <button
                      key={`${cols}x${rows}`}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setGridLayout({ cols, rows })}
                      className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                        active
                          ? 'bg-[hsl(var(--color-primary))] text-[hsl(var(--color-primary-foreground))] border-[hsl(var(--color-primary))]'
                          : 'border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-muted))]/40'
                      }`}
                    >
                      {cols}×{rows}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {order.length === 0 ? (
            <div className="text-center py-8 text-[hsl(var(--color-muted-foreground))]">
              {t('combineWizard.noFiles') || 'Brak otwartych plików'}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={ids}
                strategy={verticalListSortingStrategy}
              >
                <ul role="list" className="space-y-2">
                  {order.map((item, index) => {
                    const tab = tabsById.get(item.tabId);
                    if (!tab) return null;
                    return (
                      <CombineFileItem
                        key={item.tabId}
                        sortableId={`combine-${item.tabId}`}
                        position={index + 1}
                        tab={tab}
                        selected={item.selected}
                        onToggle={() => toggleSelected(item.tabId)}
                        onRemove={() => removeFromList(item.tabId)}
                      />
                    );
                  })}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          <button
            type="button"
            onClick={handleAddFiles}
            disabled={isProcessing}
            className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-md border-2 border-dashed border-[hsl(var(--color-border))] text-[hsl(var(--color-muted-foreground))] hover:border-[hsl(var(--color-primary))] hover:text-[hsl(var(--color-primary))] text-sm disabled:opacity-50"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {t('combineWizard.addFiles') || 'Dodaj kolejne pliki PDF'}
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

          {error && (
            <div
              role="alert"
              className="mt-4 p-3 rounded bg-[hsl(var(--color-destructive))]/15 text-[hsl(var(--color-destructive))] text-sm"
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[hsl(var(--color-border))]">
          <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
            {t('combineWizard.selectedCount', { count: selectedCount }) ||
              `Zaznaczonych: ${selectedCount}`}
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isProcessing}
            >
              {t('combineWizard.cancel') || 'Anuluj'}
            </Button>
            <Button onClick={handleCombine} disabled={!canCombine}>
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {t('combineWizard.processing') || 'Łączenie…'}
                </>
              ) : (
                t(config.submitKey)
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CombineFileItemProps {
  sortableId: string;
  position: number;
  tab: TabState;
  selected: boolean;
  onToggle: () => void;
  onRemove: () => void;
}

function CombineFileItem({
  sortableId,
  position,
  tab,
  selected,
  onToggle,
  onRemove,
}: CombineFileItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sortableId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 rounded-md border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))]"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Przeciągnij ${tab.name}`}
        className="cursor-grab active:cursor-grabbing text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <span className="text-xs tabular-nums text-[hsl(var(--color-muted-foreground))] w-6">
        {position}.
      </span>

      <input
        type="checkbox"
        id={`combine-${tab.id}-cb`}
        checked={selected}
        onChange={onToggle}
        className="h-4 w-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-ring))]"
      />

      <FileText className="w-4 h-4 text-[hsl(var(--color-muted-foreground))]" aria-hidden="true" />

      <label
        htmlFor={`combine-${tab.id}-cb`}
        className="flex-1 text-sm cursor-pointer truncate"
      >
        {tab.name}
        {tab.pageCount !== null && (
          <span className="ml-2 text-xs text-[hsl(var(--color-muted-foreground))]">
            ({tab.pageCount} {tab.pageCount === 1 ? 'strona' : 'stron'})
          </span>
        )}
      </label>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Usuń ${tab.name} z listy`}
        className="p-1 rounded hover:bg-[hsl(var(--color-muted))]/40 text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-destructive))]"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}
