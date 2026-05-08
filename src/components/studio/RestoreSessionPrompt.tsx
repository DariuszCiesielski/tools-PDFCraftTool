'use client';

/**
 * RestoreSessionPrompt — pyta usera czy przywrócić poprzednią sesję
 * (zakładki + edycje z IndexedDB).
 *
 * Acrobat-style "Reopen PDFs from last session" — wymaga explicit decyzji,
 * NIE bezwarunkowy auto-restore (per cross-model review Codex finding).
 */

import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { PdfDocument } from '@/lib/persistence/pdfDocumentRepository';

interface RestoreSessionPromptProps {
  docs: PdfDocument[];
  onRestore: () => void;
  onSkip: () => void;
}

export function RestoreSessionPrompt({
  docs,
  onRestore,
  onSkip,
}: RestoreSessionPromptProps) {
  const t = useTranslations('studio');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-prompt-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <div className="bg-[hsl(var(--color-card))] text-[hsl(var(--color-foreground))] rounded-lg shadow-2xl w-full max-w-md flex flex-col">
        <div className="px-6 py-4 border-b border-[hsl(var(--color-border))]">
          <h2 id="restore-prompt-title" className="text-lg font-semibold">
            {t('restorePrompt.title') || 'Przywrócić poprzednią sesję?'}
          </h2>
        </div>

        <div className="px-6 py-4">
          <p className="text-sm text-[hsl(var(--color-muted-foreground))] mb-3">
            {t('restorePrompt.body', { count: docs.length }) ||
              `Znaleziono ${docs.length} ${docs.length === 1 ? 'plik' : 'pliki'} z poprzedniej sesji. Otworzyć je ponownie?`}
          </p>
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-2 text-sm text-[hsl(var(--color-foreground))] py-1"
              >
                <FileText
                  className="w-4 h-4 flex-shrink-0 text-[hsl(var(--color-muted-foreground))]"
                  aria-hidden="true"
                />
                <span className="truncate">{doc.name}</span>
                {doc.pageCount > 0 && (
                  <span className="text-xs text-[hsl(var(--color-muted-foreground))]">
                    ({doc.pageCount}{' '}
                    {doc.pageCount === 1 ? 'strona' : 'stron'})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-[hsl(var(--color-border))]">
          <Button variant="ghost" onClick={onSkip}>
            {t('restorePrompt.skip') || 'Zacznij od nowa'}
          </Button>
          <Button onClick={onRestore}>
            {t('restorePrompt.restore') || 'Przywróć sesję'}
          </Button>
        </div>
      </div>
    </div>
  );
}
