import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales, type Locale } from '@/lib/i18n/config';
import StudioPageClient from './StudioPageClient';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const validLocale = locales.includes(locale as Locale) ? (locale as Locale) : 'en';
  const t = await getTranslations({ locale: validLocale, namespace: 'studio' });

  return {
    title: t('meta.title'),
    description: t('meta.description'),
    robots: { index: true, follow: true },
  };
}

interface StudioPageProps {
  params: Promise<{ locale: string }>;
}

export default async function StudioPage({ params }: StudioPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <StudioPageClient locale={locale as Locale} />;
}
