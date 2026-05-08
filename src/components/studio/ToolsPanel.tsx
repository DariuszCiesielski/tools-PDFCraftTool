'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Search,
  Scissors,
  Combine,
  Minimize2,
  Droplets,
  Lock,
  RotateCw,
  Hash,
  ChevronRight,
  Sparkles,
  ScanText,
  FileText,
  FileSpreadsheet,
  Presentation,
  Sheet,
  Image as ImageIcon,
  Tags,
  ImageDown,
  PenLine,
  // Wave-2 icons
  Trash2,
  ArrowUpDown,
  FileOutput,
  Crop,
  FilePlus,
  Grid2x2,
  Layers,
  PanelTop,
  Eraser,
  FileX,
  // Wave-3 Group A icons
  Shuffle, Palette, Bookmark, Square, Unlock, AlignCenter, SplitSquareHorizontal,
  Pencil, Maximize, Type, LayoutGrid, Contrast, Zap, Layers3, Ruler, BookOpen,
  Droplet, Image as ImageIcon2, Grid3x3, ShieldOff, KeyRound, Wrench, Repeat,
  Rotate3d, ShieldCheck, Stamp, ListTree, Highlighter,
  type LucideIcon,
} from 'lucide-react';
import { useStudioStore, type StudioToolId } from '@/lib/stores/studioStore';
import { useStudioSessionStore } from '@/lib/stores/studioSessionStore';
import { Button } from '@/components/ui/Button';
import { ToolDrawer, isToolSupportedInDrawer } from './ToolDrawer';

interface StudioTool {
  id: NonNullable<StudioToolId>;
  category: 'pages' | 'compress' | 'security' | 'enhance' | 'convert';
  icon: LucideIcon;
}

const STUDIO_TOOLS: StudioTool[] = [
  // Pages
  { id: 'split', category: 'pages', icon: Scissors },
  { id: 'merge', category: 'pages', icon: Combine },
  { id: 'rotate', category: 'pages', icon: RotateCw },
  { id: 'extract-images', category: 'pages', icon: ImageDown },
  // Wave-2 page operations
  { id: 'delete', category: 'pages', icon: Trash2 },
  { id: 'organize', category: 'pages', icon: ArrowUpDown },
  { id: 'extract', category: 'pages', icon: FileOutput },
  { id: 'crop', category: 'pages', icon: Crop },
  { id: 'add-blank-page', category: 'pages', icon: FilePlus },
  { id: 'n-up', category: 'pages', icon: Grid2x2 },
  // Enhance
  { id: 'page-numbers', category: 'enhance', icon: Hash },
  { id: 'watermark', category: 'enhance', icon: Droplets },
  { id: 'edit-metadata', category: 'enhance', icon: Tags },
  { id: 'sign', category: 'enhance', icon: PenLine },
  { id: 'ocr', category: 'enhance', icon: ScanText },
  // Wave-2 enhance
  { id: 'flatten', category: 'enhance', icon: Layers },
  { id: 'header-footer', category: 'enhance', icon: PanelTop },
  { id: 'remove-annotations', category: 'enhance', icon: Eraser },
  { id: 'remove-blank-pages', category: 'enhance', icon: FileX },
  // Compress
  { id: 'compress', category: 'compress', icon: Minimize2 },
  // Security
  { id: 'encrypt', category: 'security', icon: Lock },
  // Convert
  { id: 'pdf-to-docx', category: 'convert', icon: FileText },
  { id: 'pdf-to-excel', category: 'convert', icon: FileSpreadsheet },
  { id: 'pdf-to-pptx', category: 'convert', icon: Presentation },
  { id: 'word-to-pdf', category: 'convert', icon: FileText },
  { id: 'excel-to-pdf', category: 'convert', icon: Sheet },
  { id: 'image-to-pdf', category: 'convert', icon: ImageIcon },
  // Wave-3 Group A — pages
  { id: 'alternate-merge', category: 'pages', icon: Shuffle },
  { id: 'combine-single-page', category: 'pages', icon: Square },
  { id: 'divide', category: 'pages', icon: SplitSquareHorizontal },
  { id: 'grid-combine', category: 'pages', icon: LayoutGrid },
  { id: 'page-dimensions', category: 'pages', icon: Ruler },
  { id: 'pdf-booklet', category: 'pages', icon: BookOpen },
  { id: 'posterize', category: 'pages', icon: ImageIcon2 },
  { id: 'reverse', category: 'pages', icon: Repeat },
  { id: 'rotate-custom', category: 'pages', icon: Rotate3d },
  // Wave-3 Group A — enhance
  { id: 'background-color', category: 'enhance', icon: Palette },
  { id: 'bookmark', category: 'enhance', icon: Bookmark },
  { id: 'decrypt', category: 'enhance', icon: Unlock },
  { id: 'deskew', category: 'enhance', icon: AlignCenter },
  { id: 'edit-pdf', category: 'enhance', icon: Pencil },
  { id: 'find-and-redact', category: 'enhance', icon: Highlighter },
  { id: 'fix-page-size', category: 'enhance', icon: Maximize },
  { id: 'font-to-outline', category: 'enhance', icon: Type },
  { id: 'invert-colors', category: 'enhance', icon: Contrast },
  { id: 'ocg-manager', category: 'enhance', icon: Layers3 },
  { id: 'pdf-to-greyscale', category: 'enhance', icon: Droplet },
  { id: 'rasterize', category: 'enhance', icon: Grid3x3 },
  { id: 'remove-metadata', category: 'enhance', icon: ShieldOff },
  { id: 'repair', category: 'enhance', icon: Wrench },
  { id: 'stamps', category: 'enhance', icon: Stamp },
  { id: 'table-of-contents', category: 'enhance', icon: ListTree },
  { id: 'text-color', category: 'enhance', icon: Type },
  // Wave-3 Group A — compress
  { id: 'linearize', category: 'compress', icon: Zap },
  // Wave-3 Group A — security
  { id: 'remove-restrictions', category: 'security', icon: KeyRound },
  { id: 'sanitize', category: 'security', icon: ShieldCheck },
];

const CATEGORY_ORDER: StudioTool['category'][] = ['pages', 'enhance', 'convert', 'compress', 'security'];

// Multi-input tools obsługiwane przez CombineFilesWizard (Acrobat-style).
// Zamiast otwierać self-uploader w drawer, klik na nie otwiera modal pełnoekranowy.
const COMBINE_WIZARD_TOOLS = new Set<string>([
  'merge',
  // Faza 4: 'alternate-merge', 'grid-combine'
]);

export function ToolsPanel() {
  const t = useTranslations('studio');
  const currentTool = useStudioStore((state) => state.currentTool);
  const selectTool = useStudioStore((state) => state.selectTool);
  const filesCount = useStudioStore((state) => state.files.length);
  const openCombineWizard = useStudioSessionStore((s) => s.openCombineWizard);

  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return STUDIO_TOOLS;
    const q = search.toLowerCase().trim();
    return STUDIO_TOOLS.filter((tool) => {
      const name = t(`tools.${tool.id}.name`).toLowerCase();
      const description = t(`tools.${tool.id}.description`).toLowerCase();
      return name.includes(q) || description.includes(q);
    });
  }, [search, t]);

  const grouped = useMemo(() => {
    const map = new Map<StudioTool['category'], StudioTool[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const tool of filtered) {
      map.get(tool.category)?.push(tool);
    }
    return map;
  }, [filtered]);

  const activeToolMeta = currentTool ? STUDIO_TOOLS.find((tool) => tool.id === currentTool) : null;

  if (isToolSupportedInDrawer(currentTool)) {
    return <ToolDrawer toolId={currentTool} />;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-[hsl(var(--color-border))]">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--color-muted-foreground))]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('tools.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 rounded-md border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-ring))]"
            aria-label={t('tools.searchAria')}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {CATEGORY_ORDER.map((cat) => {
          const tools = grouped.get(cat) ?? [];
          if (tools.length === 0) return null;
          return (
            <section key={cat} className="mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--color-muted-foreground))] px-2 py-1">
                {t(`tools.categories.${cat}`)}
              </h3>
              <ul className="flex flex-col gap-1" role="list">
                {tools.map((tool) => {
                  const Icon = tool.icon;
                  const isActive = currentTool === tool.id;
                  return (
                    <li key={tool.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (COMBINE_WIZARD_TOOLS.has(tool.id)) {
                            openCombineWizard();
                          } else {
                            selectTool(tool.id);
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                          isActive
                            ? 'bg-[hsl(var(--color-primary))]/10 text-[hsl(var(--color-primary))]'
                            : 'hover:bg-[hsl(var(--color-muted))] text-[hsl(var(--color-foreground))]'
                        }`}
                        aria-pressed={isActive}
                      >
                        <Icon
                          className={`w-4 h-4 flex-shrink-0 ${
                            isActive
                              ? 'text-[hsl(var(--color-primary))]'
                              : 'text-[hsl(var(--color-muted-foreground))]'
                          }`}
                          aria-hidden="true"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {t(`tools.${tool.id}.name`)}
                          </p>
                          <p className="text-xs text-[hsl(var(--color-muted-foreground))] truncate">
                            {t(`tools.${tool.id}.description`)}
                          </p>
                        </div>
                        <ChevronRight
                          className="w-4 h-4 text-[hsl(var(--color-muted-foreground))] flex-shrink-0"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-sm text-[hsl(var(--color-muted-foreground))] text-center py-8">
            {t('tools.noResults')}
          </p>
        )}
      </div>

      {activeToolMeta && (
        <div className="border-t border-[hsl(var(--color-border))] p-3 bg-[hsl(var(--color-muted))]/30">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-[hsl(var(--color-primary))]" aria-hidden="true" />
            <h4 className="text-sm font-semibold">
              {t(`tools.${activeToolMeta.id}.name`)}
            </h4>
          </div>
          <p className="text-xs text-[hsl(var(--color-muted-foreground))] mb-3">
            {t(`tools.${activeToolMeta.id}.longDescription`)}
          </p>
          <Button variant="primary" size="sm" disabled className="w-full">
            {filesCount > 0 ? t('tools.runComingSoon') : t('tools.uploadFirst')}
          </Button>
        </div>
      )}
    </div>
  );
}
