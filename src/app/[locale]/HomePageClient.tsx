'use client';

import dynamic from 'next/dynamic';
import { type Locale } from '@/lib/i18n/config';
import { AuthProvider } from '@/lib/contexts/AuthContext';

const LoginLandingClient = dynamic(() => import('./LoginLandingClient'), { ssr: false });

interface HomePageClientProps {
  locale: Locale;
}

export default function HomePageClient({ locale }: HomePageClientProps) {
  return (
    <AuthProvider>
      <LoginLandingClient locale={locale} />
    </AuthProvider>
  );
}
