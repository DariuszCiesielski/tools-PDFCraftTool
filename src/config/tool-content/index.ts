/**
 * Tool content exports for all languages
 * Requirements: 3.1 - Multi-language support
 */

export { toolContentEn } from './en';
export { toolContentJa } from './ja';
export { toolContentKo } from './ko';
export { toolContentEs } from './es';
export { toolContentFr } from './fr';
export { toolContentDe } from './de';
export { toolContentZh } from './zh';
export { toolContentPt } from './pt';
export { toolContentAr } from './ar';
export { toolContentIt } from './it';
export { toolContentId } from './id';
export { toolContentVn } from './vi';

import { toolContentEn } from './en';
import { toolContentJa } from './ja';
import { toolContentKo } from './ko';
import { toolContentEs } from './es';
import { toolContentFr } from './fr';
import { toolContentDe } from './de';
import { toolContentZh } from './zh';
import { toolContentPt } from './pt';
import { toolContentAr } from './ar';
import { toolContentIt } from './it';
import { toolContentId } from './id';
import { toolContentVn } from './vi';
import { ToolContent } from '@/types/tool';

export type Locale = 'pl' | 'en' | 'ja' | 'ko' | 'es' | 'fr' | 'de' | 'zh' | 'zh-TW' | 'pt' | 'ar' | 'it' | 'id' | 'vi';

/**
 * Get tool content for a specific locale
 * Falls back to English if translation not found
 * zh-TW falls back to zh (Simplified Chinese) content
 * pl falls back to en content (no per-tool Polish content yet — sesja 2 polonized only UI strings)
 * ar falls back to en content for now
 */
export function getToolContent(locale: Locale, toolId: string): ToolContent | undefined {
  const contentMap: Record<string, Record<string, ToolContent>> = {
    en: toolContentEn,
    ja: toolContentJa,
    ko: toolContentKo,
    es: toolContentEs,
    fr: toolContentFr,
    de: toolContentDe,
    zh: toolContentZh,
    pt: toolContentPt,
    ar: toolContentAr,
    it: toolContentIt,
    id: toolContentId,
    vi: toolContentVn,
  };

  // Map zh-TW → zh, pl → en (no per-tool Polish content — sesja 2 polonized only common UI strings)
  const effectiveLocale: Exclude<Locale, 'zh-TW' | 'pl'> =
    locale === 'zh-TW' ? 'zh' : locale === 'pl' ? 'en' : locale;

  const localeContent = contentMap[effectiveLocale];
  if (localeContent && localeContent[toolId]) {
    return localeContent[toolId];
  }

  // Fallback to English
  return toolContentEn[toolId];
}

