import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { localeConfig, type Locale, locales, defaultLocale } from '@/lib/i18n/config';
import { generateHomeMetadata } from '@/lib/seo';
import { fontVariables } from '@/lib/fonts';
import { SkipLink } from '@/components/common/SkipLink';
import '@/app/globals.css';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/**
 * Viewport configuration for performance
 * Requirements: 8.1 - Lighthouse performance score 90+
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Validate locale
  const validLocale = locales.includes(locale as Locale) ? (locale as Locale) : defaultLocale;

  // Get localized SEO translations
  const t = await getTranslations({ locale: validLocale, namespace: 'metadata' });

  // Generate metadata using the SEO module with translations
  return generateHomeMetadata(validLocale, {
    title: t('home.title'),
    description: t('home.description'),
  });
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Validate locale
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  // Get messages for the locale
  const messages = await getMessages();

  // Get direction for the locale
  const direction = localeConfig[locale as Locale]?.direction || 'ltr';

  return (
    <NextIntlClientProvider messages={messages}>
      <div lang={locale} dir={direction} className={`${fontVariables} min-h-screen bg-background text-foreground antialiased font-sans`}>
        <SkipLink targetId="main-content">Pomiń nawigację, przejdź do treści</SkipLink>
        {children}
      </div>
    </NextIntlClientProvider>
  );
}
