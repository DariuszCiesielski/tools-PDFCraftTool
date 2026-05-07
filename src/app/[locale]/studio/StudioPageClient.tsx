'use client';

import dynamic from 'next/dynamic';
import { type Locale } from '@/lib/i18n/config';
import { AuthProvider } from '@/lib/contexts/AuthContext';

const StudioLayout = dynamic(
  () => import('@/components/studio/StudioLayout').then((m) => m.StudioLayout),
  { ssr: false },
);

interface StudioPageClientProps {
  locale: Locale;
}

export default function StudioPageClient({ locale }: StudioPageClientProps) {
  return (
    <AuthProvider>
      <StudioLayout locale={locale} />
    </AuthProvider>
  );
}
