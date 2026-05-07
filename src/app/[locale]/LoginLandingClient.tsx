'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FileText, Shield, Cloud, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { LoginForm } from '@/components/studio/LoginForm';
import { type Locale } from '@/lib/i18n/config';

interface LoginLandingClientProps {
  locale: Locale;
}

export default function LoginLandingClient({ locale }: LoginLandingClientProps) {
  const t = useTranslations('studio');
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(`/${locale}/studio`);
    }
  }, [status, locale, router]);

  if (status === 'loading' || status === 'authenticated') {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-[hsl(var(--color-background))]">
        <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--color-muted-foreground))]" />
      </main>
    );
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-2 bg-[hsl(var(--color-background))]">
      <section className="flex flex-col justify-center px-8 py-16 lg:px-16 bg-[hsl(var(--color-card))] border-r border-[hsl(var(--color-border))]">
        <div className="max-w-md mx-auto lg:mx-0">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-[hsl(var(--color-primary))] text-[hsl(var(--color-primary-foreground))] flex items-center justify-center">
              <FileText className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[hsl(var(--color-foreground))]">
                {t('landing.heroTitle')}
              </h1>
              <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                {t('landing.heroSubtitle')}
              </p>
            </div>
          </div>

          <p className="text-lg text-[hsl(var(--color-foreground))] mb-8 leading-relaxed">
            {t('landing.heroTagline')}
          </p>

          <ul className="flex flex-col gap-5">
            <li className="flex gap-3">
              <FileText
                className="w-5 h-5 mt-0.5 flex-shrink-0 text-[hsl(var(--color-primary))]"
                aria-hidden="true"
              />
              <div>
                <h3 className="font-medium text-[hsl(var(--color-foreground))]">
                  {t('landing.bullet1Title')}
                </h3>
                <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
                  {t('landing.bullet1Body')}
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <Shield
                className="w-5 h-5 mt-0.5 flex-shrink-0 text-[hsl(var(--color-primary))]"
                aria-hidden="true"
              />
              <div>
                <h3 className="font-medium text-[hsl(var(--color-foreground))]">
                  {t('landing.bullet2Title')}
                </h3>
                <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
                  {t('landing.bullet2Body')}
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <Cloud
                className="w-5 h-5 mt-0.5 flex-shrink-0 text-[hsl(var(--color-primary))]"
                aria-hidden="true"
              />
              <div>
                <h3 className="font-medium text-[hsl(var(--color-foreground))]">
                  {t('landing.bullet3Title')}
                </h3>
                <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
                  {t('landing.bullet3Body')}
                </p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section className="flex flex-col justify-center px-8 py-16 lg:px-16">
        <div className="max-w-md w-full mx-auto">
          <h2 className="text-2xl font-bold mb-2 text-[hsl(var(--color-foreground))]">
            {t('auth.signinTitle')}
          </h2>
          <p className="text-sm text-[hsl(var(--color-muted-foreground))] mb-8">
            {t('landing.formIntro')}
          </p>
          <LoginForm initialMode="signin" showPrivacyNote={false} />
        </div>
      </section>
    </main>
  );
}
