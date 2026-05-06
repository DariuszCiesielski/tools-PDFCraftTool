import { defineRouting } from 'next-intl/routing';
import { locales, defaultLocale } from '@/lib/i18n/config';

export const routing = defineRouting({
  // A list of all locales that are supported
  locales,

  // Used when no locale matches
  defaultLocale,

  // Always use locale prefix in URL (compatibility with output: 'export')
  // 'as-needed' wymaga runtime middleware do redirectów, niekompatybilne ze static export
  localePrefix: 'always',
});
