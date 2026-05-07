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
  type LucideIcon,
} from 'lucide-react';
import { useStudioStore, type StudioToolId } from '@/lib/stores/studioStore';
import { Button } from '@/components/ui/Button';

interface StudioTool {
  id: NonNullable<StudioToolId>;
  category: 'pages' | 'compress' | 'security' | 'enhance';
  icon: LucideIcon;
}

const STUDIO_TOOLS: StudioTool[] = [
  { id: 'split', category: 'pages', icon: Scissors },
  { id: 'merge', category: 'pages', icon: Combine },
  { id: 'rotate', category: 'pages', icon: RotateCw },
  { id: 'page-numbers', category: 'enhance', icon: Hash },
  { id: 'compress', category: 'compress', icon: Minimize2 },
  { id: 'watermark', category: 'enhance', icon: Droplets },
  { id: 'encrypt', category: 'security', icon: Lock },
];

const CATEGORY_ORDER: StudioTool['category'][] = ['pages', 'enhance', 'compress', 'security'];

export function ToolsPanel() {
  const t = useTranslations('studio');
  const currentTool = useStudioStore((state) => state.currentTool);
  const selectTool = useStudioStore((state) => state.selectTool);
  const filesCount = useStudioStore((state) => state.files.length);

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
                        onClick={() => selectTool(tool.id)}
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
