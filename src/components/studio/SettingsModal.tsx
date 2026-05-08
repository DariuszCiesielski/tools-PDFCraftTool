'use client';

/**
 * SettingsModal — preferencje per-user (Faza 3 PDFCraft).
 *
 * Aktualnie pokazuje:
 * - Toggle "Synchronizuj metadane między urządzeniami" (default OFF, opt-in)
 *
 * Default OFF per Codex finding: USP "Twoje pliki nigdy nie opuszczają urządzenia"
 * priorytetowy nad UX "automatic sync". User świadomie włącza.
 */

import { useTranslations } from 'next-intl';
import { Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useStudioSessionStore } from '@/lib/stores/studioSessionStore';
import { usePreferences } from '@/lib/hooks/usePreferences';

export function SettingsModal() {
  const t = useTranslations('studio.settings');
  const isOpen = useStudioSessionStore((s) => s.showSettingsModal);
  const closeModal = useStudioSessionStore((s) => s.closeSettingsModal);
  const syncEnabled = useStudioSessionStore((s) => s.syncMetadataEnabled);
  const { setSyncMetadataEnabled } = usePreferences();

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className="bg-[hsl(var(--color-card))] text-[hsl(var(--color-foreground))] rounded-lg shadow-2xl w-full max-w-lg flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--color-border))]">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" aria-hidden="true" />
            <h2
              id="settings-modal-title"
              className="text-lg font-semibold"
            >
              {t('title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="p-1 rounded hover:bg-[hsl(var(--color-muted))] transition-colors"
            aria-label={t('close')}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={syncEnabled}
                onChange={(e) => setSyncMetadataEnabled(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[hsl(var(--color-border))] accent-[hsl(var(--color-primary))]"
              />
              <div className="flex-1">
                <span className="font-medium block">
                  {t('syncMetadata.label')}
                </span>
                <p className="text-sm text-[hsl(var(--color-muted-foreground))] mt-1">
                  {t('syncMetadata.description')}
                </p>
              </div>
            </label>
          </div>

          <div className="rounded-md bg-[hsl(var(--color-muted))] px-3 py-2 text-sm text-[hsl(var(--color-muted-foreground))]">
            {t('syncMetadata.warning')}
          </div>
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-[hsl(var(--color-border))]">
          <Button onClick={closeModal}>{t('close')}</Button>
        </div>
      </div>
    </div>
  );
}
