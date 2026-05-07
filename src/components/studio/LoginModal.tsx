'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Mail, Lock, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/contexts/AuthContext';

type ModalMode = 'signin' | 'signup' | 'forgot';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: ModalMode;
}

export function LoginModal({ isOpen, onClose, initialMode = 'signin' }: LoginModalProps) {
  const t = useTranslations('studio');
  const { signIn, signUp, resetPassword } = useAuth();

  const [mode, setMode] = useState<ModalMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const reset = () => {
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleClose = () => {
    reset();
    setMode(initialMode);
    onClose();
  };

  const switchMode = (newMode: ModalMode) => {
    reset();
    setMode(newMode);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (mode === 'signin') {
        const result = await signIn(email, password);
        if (result.error) setErrorMessage(result.error);
        else handleClose();
      } else if (mode === 'signup') {
        const result = await signUp(email, password);
        if (result.error) {
          setErrorMessage(result.error);
        } else if (result.needsConfirm) {
          setSuccessMessage(t('auth.confirmSent'));
        } else {
          handleClose();
        }
      } else {
        const result = await resetPassword(email);
        if (result.error) setErrorMessage(result.error);
        else setSuccessMessage(t('auth.resetSent'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const titleKey =
    mode === 'signin'
      ? 'auth.signinTitle'
      : mode === 'signup'
        ? 'auth.signupTitle'
        : 'auth.forgotTitle';

  const submitKey =
    mode === 'signin'
      ? 'auth.signinSubmit'
      : mode === 'signup'
        ? 'auth.signupSubmit'
        : 'auth.forgotSubmit';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t(titleKey)}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-1">
        <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
          {t('auth.privacyNote')}
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t('auth.email')}</span>
          <div className="relative">
            <Mail
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--color-muted-foreground))]"
              aria-hidden="true"
            />
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-md border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-ring))]"
              placeholder="email@example.com"
              disabled={isSubmitting}
            />
          </div>
        </label>

        {mode !== 'forgot' && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t('auth.password')}</span>
            <div className="relative">
              <Lock
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--color-muted-foreground))]"
                aria-hidden="true"
              />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={mode === 'signup' ? 6 : undefined}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-10 py-2 rounded-md border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-ring))]"
                placeholder="••••••••"
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--color-ring))]"
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                title={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {mode === 'signup' && (
              <span className="text-xs text-[hsl(var(--color-muted-foreground))]">
                {t('auth.passwordHint')}
              </span>
            )}
          </label>
        )}

        {errorMessage && (
          <div
            className="flex items-start gap-2 p-3 rounded-md border border-[hsl(var(--color-destructive))]/30 bg-[hsl(var(--color-destructive))]/10 text-sm"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-[hsl(var(--color-destructive))]" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div
            className="flex items-start gap-2 p-3 rounded-md border border-green-500/30 bg-green-500/10 text-sm"
            role="status"
          >
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600" aria-hidden="true" />
            <span>{successMessage}</span>
          </div>
        )}

        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : t(submitKey)}
        </Button>

        <div className="flex flex-col gap-2 text-sm text-center text-[hsl(var(--color-muted-foreground))]">
          {mode === 'signin' && (
            <>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="hover:text-[hsl(var(--color-primary))] underline-offset-2 hover:underline"
              >
                {t('auth.toSignup')}
              </button>
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="hover:text-[hsl(var(--color-primary))] underline-offset-2 hover:underline"
              >
                {t('auth.toForgot')}
              </button>
            </>
          )}
          {mode === 'signup' && (
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="hover:text-[hsl(var(--color-primary))] underline-offset-2 hover:underline"
            >
              {t('auth.toSignin')}
            </button>
          )}
          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="hover:text-[hsl(var(--color-primary))] underline-offset-2 hover:underline"
            >
              {t('auth.backToSignin')}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
