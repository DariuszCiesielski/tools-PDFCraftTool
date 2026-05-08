'use client';

import { useEffect, useRef } from 'react';
import { useAuthOptional } from '@/lib/contexts/AuthContext';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  useStudioSessionStore,
  type TabState,
} from '@/lib/stores/studioSessionStore';
import {
  useStudioStore,
  type StudioFile,
} from '@/lib/stores/studioStore';
import { computeContentHash } from '@/lib/persistence/contentHash';

const DEBOUNCE_MS = 5000;

async function syncTabsToCloud(
  userId: string,
  tabs: TabState[],
  files: StudioFile[],
  activeTabId: string | null,
): Promise<void> {
  const supabase = getSupabaseClient();
  const rows = await Promise.all(
    tabs.map(async (tab, index) => {
      const file = files.find((f) => f.id === tab.id);
      if (!file) return null;
      const hash = await computeContentHash(file.name, file.size);
      return {
        user_id: userId,
        file_name: file.name,
        file_size: file.size,
        content_hash: hash,
        page_count: tab.pageCount,
        current_page: tab.viewState.currentPage,
        zoom_level: tab.viewState.zoomLevel,
        scroll_top: tab.viewState.scrollTop,
        order_index: index,
        is_active_tab: activeTabId === tab.id,
        last_opened_at: new Date().toISOString(),
      };
    }),
  );
  const validRows = rows.filter((r): r is NonNullable<typeof r> => r !== null);
  if (validRows.length === 0) return;
  const { error } = await supabase
    .from('recent_documents')
    .upsert(validRows, { onConflict: 'user_id,file_name' });
  if (error) {
    console.warn('[useTabStateSync] upsert error', error);
  }
}

/**
 * Faza 3: bridge studioSessionStore.tabs ↔ recent_documents (Supabase).
 *
 * Synchronizuje TYLKO METADATA: nazwy, content_hash (SHA-256 name+size),
 * pageCount, viewState (currentPage/zoomLevel/scrollTop), kolejność tabs,
 * aktywny tab. NIE wysyła plików — USP "Twoje pliki nigdy nie opuszczają
 * urządzenia" zachowany.
 *
 * Gate: syncMetadataEnabled (user opt-in z SettingsModal).
 * Debounce: 5s przy zmianach w tabs/activeTabId.
 *
 * Mount once w StudioLayout.
 */
export function useTabStateSync(): void {
  const auth = useAuthOptional();
  const status = auth?.status ?? 'unconfigured';
  const user = auth?.user ?? null;
  const tabs = useStudioSessionStore((s) => s.tabs);
  const activeTabId = useStudioSessionStore((s) => s.activeTabId);
  const syncEnabled = useStudioSessionStore((s) => s.syncMetadataEnabled);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (
      status !== 'authenticated' ||
      !user ||
      !syncEnabled ||
      tabs.length === 0
    ) {
      if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
      return;
    }
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(() => {
      const files = useStudioStore.getState().files;
      void syncTabsToCloud(user.id, tabs, files, activeTabId);
    }, DEBOUNCE_MS);
    return () => {
      if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    };
  }, [tabs, activeTabId, syncEnabled, status, user]);
}
