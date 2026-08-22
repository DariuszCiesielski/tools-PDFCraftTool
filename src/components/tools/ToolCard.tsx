'use client';
import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Tool, ToolCategory } from '@/types/tool';
import { Card } from '@/components/ui/Card';
import { ArrowUpRight } from 'lucide-react';
import { getToolIcon } from '@/config/icons';
import { FavoriteButton } from '@/components/ui/FavoriteButton';

export interface ToolCardProps {
  /** Tool data to display */
  tool: Tool;
  /** Current locale for URL generation */
  locale: string;
  /** Optional additional CSS classes */
  className?: string;
  /** Localized content */
  localizedContent?: { title: string; description: string };
}

const categoryTranslationKeys: Record<ToolCategory, string> = {
  'edit-annotate': 'editAnnotate',
  'convert-to-pdf': 'convertToPdf',
  'convert-from-pdf': 'convertFromPdf',
  'organize-manage': 'organizeManage',
  'optimize-repair': 'optimizeRepair',
  'secure-pdf': 'securePdf',
};

/**
 * ToolCard component displays a single PDF tool with icon, name, and description.
 * Includes hover effects and links to the tool page.
 */
export function ToolCard({ tool, locale, className = '', localizedContent }: ToolCardProps) {
  const t = useTranslations();
  const toolUrl = `/${locale}/tools/${tool.slug}`;

  // Get a human-readable name from the tool ID
  // Use localized title if available, otherwise fallback to formatting the ID
  const toolName = localizedContent?.title || tool.id
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  // Generate a description from features
  // Use localized description (metaDescription) if available
  const description = localizedContent?.description || tool.features
    .slice(0, 3)
    .map(f => f.replace(/-/g, ' '))
    .join(', ');

  const IconComponent = getToolIcon(tool.icon);

  const categoryName = t(`home.categories.${categoryTranslationKeys[tool.category]}`);

  return (
    <Link
      href={toolUrl}
      className={`block focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-ring))] focus-visible:ring-offset-2 rounded-[var(--radius-lg)] group ${className}`}
      data-testid="tool-card"
    >
      <Card
        className="h-full glass-card hover:bg-[hsl(var(--color-card))/0.8] transition-all duration-300 hover:shadow-xl hover:-translate-y-1 relative overflow-hidden border-[hsl(var(--color-border))/0.6]"
        data-testid="tool-card-container"
      >
        <div className="absolute top-0 right-0 p-3 z-10">
          <FavoriteButton toolId={tool.id} size="sm" />
        </div>
        <div className="absolute top-0 right-10 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <ArrowUpRight className="w-5 h-5 text-[hsl(var(--color-primary))]" />
        </div>

        <div className="flex flex-col h-full">
          <div className="flex items-start gap-4 mb-4">
            {/* Tool Icon */}
            <div
              className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-[hsl(var(--color-primary)/0.1)] to-[hsl(var(--color-accent)/0.1)] flex items-center justify-center group-hover:scale-110 transition-transform duration-300"
              data-testid="tool-card-icon"
              aria-hidden="true"
            >
              <IconComponent className="w-7 h-7 text-[hsl(var(--color-primary))]" data-icon={tool.icon} />
            </div>
          </div>

          {/* Tool Info */}
          <div className="flex-1 min-w-0">
            <h3
              className="text-lg font-bold text-[hsl(var(--color-card-foreground))] truncate mb-2 group-hover:text-[hsl(var(--color-primary))] transition-colors"
              data-testid="tool-card-name"
            >
              {toolName}
            </h3>
            <p
              className="text-sm text-[hsl(var(--color-muted-foreground))] line-clamp-2 leading-relaxed"
              data-testid="tool-card-description"
            >
              {description}
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-[hsl(var(--color-border)/0.5)] flex items-center justify-between text-xs text-[hsl(var(--color-muted-foreground))]">
            <span className="font-medium bg-[hsl(var(--color-secondary)/0.5)] px-2 py-1 rounded-md">
              {categoryName}
            </span>
            <span className="group-hover:translate-x-1 transition-transform duration-300 text-[hsl(var(--color-primary))] font-medium opacity-0 group-hover:opacity-100">
              {t('common.buttons.next') || 'Try now'} {/* Using Next as dummy or keep Try now if no key */}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default ToolCard;
