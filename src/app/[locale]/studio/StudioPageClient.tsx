'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { type Locale } from '@/lib/i18n/config';
import { AuthProvider, useAuth } from '@/lib/contexts/AuthContext';

const StudioLayout = dynamic(
  () => import('@/components/studio/StudioLayout').then((m) => m.StudioLayout),
  { ssr: false },
);

interface StudioPageClientProps {
  locale: Locale;
}

function StudioGate({ locale }: { locale: Locale }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/${locale}/`);
    }
  }, [status, locale, router]);

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-[hsl(var(--color-background))]">
        <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--color-muted-foreground))]" aria-hidden="true" />
      </main>
    );
  }

  // 'authenticated' or 'unconfigured' (Supabase not set — let StudioLayout handle as guest)
  return <StudioLayout locale={locale} />;
}

export default function StudioPageClient({ locale }: StudioPageClientProps) {
  return (
    <AuthProvider>
      <StudioGate locale={locale} />
    </AuthProvider>
  );
}
