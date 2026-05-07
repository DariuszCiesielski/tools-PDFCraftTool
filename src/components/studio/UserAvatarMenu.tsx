'use client';

import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTranslations } from 'next-intl';
import { LogOut, Loader2, User } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { LoginModal } from './LoginModal';

function getInitials(email: string | null | undefined): string {
  if (!email) return '?';
  const local = email.split('@')[0] ?? '';
  return local.charAt(0).toUpperCase() || '?';
}

export function UserAvatarMenu() {
  const t = useTranslations('studio');
  const { status, user, signOut } = useAuth();
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  if (status === 'unconfigured') return null;

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center w-9 h-9" aria-hidden="true">
        <Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--color-muted-foreground))]" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsLoginOpen(true)}
          aria-label={t('menubar.file.signIn')}
        >
          <User className="w-4 h-4 mr-2" />
          <span className="hidden sm:inline">{t('menubar.file.signIn')}</span>
        </Button>
        <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
      </>
    );
  }

  const initials = getInitials(user?.email);
  const email = user?.email ?? '';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center justify-center w-9 h-9 rounded-full bg-[hsl(var(--color-primary))] text-[hsl(var(--color-primary-foreground))] text-sm font-semibold hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-ring))] focus-visible:ring-offset-2"
          aria-label={t('auth.email') + ': ' + email}
          title={email}
        >
          {initials}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[240px] rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] p-1 shadow-lg"
        >
          <div className="px-3 py-2 border-b border-[hsl(var(--color-border))]">
            <div className="text-xs text-[hsl(var(--color-muted-foreground))]">
              {t('auth.email')}
            </div>
            <div
              className="text-sm font-medium text-[hsl(var(--color-foreground))] truncate"
              title={email}
            >
              {email}
            </div>
          </div>

          <DropdownMenu.Item
            onSelect={() => signOut()}
            className="flex items-center gap-2 px-3 py-2 mt-1 text-sm rounded cursor-pointer text-[hsl(var(--color-destructive))] hover:bg-[hsl(var(--color-muted))] focus:bg-[hsl(var(--color-muted))] outline-none"
          >
            <LogOut className="w-4 h-4" />
            {t('menubar.file.signOut')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
