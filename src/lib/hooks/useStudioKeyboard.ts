'use client';

/**
 * Faza 1.5: globalne keyboard shortcuts dla Edit operations.
 *
 * - Ctrl/Cmd+Z → undo
 * - Ctrl/Cmd+Y lub Ctrl/Cmd+Shift+Z → redo
 *
 * Działa na aktywnym tab'ie. Skipuje jeśli focus jest w input/textarea
 * (żeby user mógł normalnie edytować pole formularza Ctrl+Z).
 */

import { useEffect } from 'react';
import { useStudioSessionStore } from '@/lib/stores/studioSessionStore';
import { documentActions } from '@/lib/services/documentActions';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useStudioKeyboard(): void {
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      const activeTabId = useStudioSessionStore.getState().activeTabId;
      if (!activeTabId) return;

      // Cmd/Ctrl+Z (without Shift) → undo
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        await documentActions.undo(activeTabId);
        return;
      }
      // Cmd/Ctrl+Shift+Z → redo
      if (e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        await documentActions.redo(activeTabId);
        return;
      }
      // Cmd/Ctrl+Y → redo (Windows convention)
      if (e.key === 'y') {
        e.preventDefault();
        await documentActions.redo(activeTabId);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
