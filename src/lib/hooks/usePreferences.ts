'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAuthOptional } from '@/lib/contexts/AuthContext';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useStudioStore } from '@/lib/stores/studioStore';
import { useStudioSessionStore } from '@/lib/stores/studioSessionStore';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  locale: string;
  left_sidebar_width: number;
  right_panel_width: number;
  show_left_sidebar: boolean;
  show_right_panel: boolean;
  sync_metadata_enabled: boolean;
}

const DEBOUNCE_MS = 400;

const THEME_KEY = 'theme';
const LEFT_WIDTH_KEY = 'studio.leftSidebarWidth';
const RIGHT_WIDTH_KEY = 'studio.rightPanelWidth';

function applyThemeToDom(theme: 'light' | 'dark' | 'system') {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    window.localStorage.setItem(THEME_KEY, 'dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
    window.localStorage.setItem(THEME_KEY, 'light');
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
    window.localStorage.setItem(THEME_KEY, 'system');
  }
}

function readCurrentTheme(): 'light' | 'dark' | 'system' {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function readWidth(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  if (!stored) return fallback;
  const parsed = parseInt(stored, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function fetchFromCloud(userId: string): Promise<UserPreferences | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('user_preferences')
    .select(
      'theme, locale, left_sidebar_width, right_panel_width, show_left_sidebar, show_right_panel, sync_metadata_enabled',
    )
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as UserPreferences;
}

async function upsertToCloud(
  userId: string,
  updates: Partial<UserPreferences>,
): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, ...updates }, { onConflict: 'user_id' });
}

/**
 * Bridge cloud user_preferences ↔ local mechanisms (theme localStorage, sidebar widths localStorage,
 * studioStore showLeftSidebar/showRightPanel). Non-invasive: existing components keep working unchanged.
 *
 * Mount once in StudioLayout.
 */
export function usePreferences() {
  const auth = useAuthOptional();
  const status = auth?.status ?? 'unconfigured';
  const user = auth?.user ?? null;
  const showLeftSidebar = useStudioStore((s) => s.showLeftSidebar);
  const showRightPanel = useStudioStore((s) => s.showRightPanel);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdatesRef = useRef<Partial<UserPreferences>>({});
  const initialLoadDoneRef = useRef(false);

  const scheduleWrite = useCallback(
    (updates: Partial<UserPreferences>) => {
      if (status !== 'authenticated' || !user) return;
      pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates };
      if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
      writeTimerRef.current = setTimeout(() => {
        const toWrite = pendingUpdatesRef.current;
        pendingUpdatesRef.current = {};
        void upsertToCloud(user.id, toWrite);
      }, DEBOUNCE_MS);
    },
    [status, user],
  );

  // Initial load from cloud → push to local mechanisms (server-wins on login)
  useEffect(() => {
    if (status !== 'authenticated' || !user) {
      initialLoadDoneRef.current = false;
      return;
    }
    let cancelled = false;
    void (async () => {
      const cloud = await fetchFromCloud(user.id);
      if (cancelled || !cloud) {
        initialLoadDoneRef.current = true;
        return;
      }
      // Apply theme
      applyThemeToDom(cloud.theme);
      // Apply widths to localStorage so useResizable can pick them up on next mount
      // (already-mounted instances need a refresh, but typical user lands fresh on /studio)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LEFT_WIDTH_KEY, String(cloud.left_sidebar_width));
        window.localStorage.setItem(RIGHT_WIDTH_KEY, String(cloud.right_panel_width));
      }
      // Apply sidebar visibility to studioStore
      const store = useStudioStore.getState();
      if (store.showLeftSidebar !== cloud.show_left_sidebar) store.toggleLeftSidebar();
      if (store.showRightPanel !== cloud.show_right_panel) store.toggleRightPanel();
      // Apply sync_metadata_enabled to sessionStore (Faza 3 cross-device sync gate)
      useStudioSessionStore
        .getState()
        .setSyncMetadataEnabled(cloud.sync_metadata_enabled ?? false);
      initialLoadDoneRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [status, user]);

  // Sync sidebar visibility changes → cloud
  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    scheduleWrite({ show_left_sidebar: showLeftSidebar });
  }, [showLeftSidebar, scheduleWrite]);

  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    scheduleWrite({ show_right_panel: showRightPanel });
  }, [showRightPanel, scheduleWrite]);

  // Public setters that also push to cloud
  const setTheme = useCallback(
    (theme: 'light' | 'dark' | 'system') => {
      applyThemeToDom(theme);
      scheduleWrite({ theme });
    },
    [scheduleWrite],
  );

  const setLeftSidebarWidth = useCallback(
    (width: number) => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LEFT_WIDTH_KEY, String(width));
      }
      scheduleWrite({ left_sidebar_width: width });
    },
    [scheduleWrite],
  );

  const setRightPanelWidth = useCallback(
    (width: number) => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(RIGHT_WIDTH_KEY, String(width));
      }
      scheduleWrite({ right_panel_width: width });
    },
    [scheduleWrite],
  );

  const setSyncMetadataEnabled = useCallback(
    (enabled: boolean) => {
      useStudioSessionStore.getState().setSyncMetadataEnabled(enabled);
      scheduleWrite({ sync_metadata_enabled: enabled });
    },
    [scheduleWrite],
  );

  return {
    setTheme,
    setLeftSidebarWidth,
    setRightPanelWidth,
    setSyncMetadataEnabled,
    readCurrentTheme,
  };
}
