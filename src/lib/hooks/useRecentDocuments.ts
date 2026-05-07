'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthOptional } from '@/lib/contexts/AuthContext';
import { getSupabaseClient } from '@/lib/supabase/client';

export interface RecentDocument {
  name: string;
  size: number;
  lastOpened: number;
}

const STORAGE_KEY = 'studio.recentDocuments';
const MAX_RECENT = 10;

function readFromStorage(): RecentDocument[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is RecentDocument =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.name === 'string' &&
          typeof item.size === 'number' &&
          typeof item.lastOpened === 'number',
      )
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

async function fetchFromCloud(userId: string): Promise<RecentDocument[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('recent_documents')
    .select('file_name, file_size, last_opened_at')
    .eq('user_id', userId)
    .order('last_opened_at', { ascending: false })
    .limit(MAX_RECENT);
  if (error || !data) return [];
  return data.map((row) => ({
    name: row.file_name,
    size: row.file_size,
    lastOpened: new Date(row.last_opened_at).getTime(),
  }));
}

async function upsertToCloud(userId: string, file: File): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.from('recent_documents').upsert(
    {
      user_id: userId,
      file_name: file.name,
      file_size: file.size,
      last_opened_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,file_name' },
  );
}

async function clearCloud(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.from('recent_documents').delete().eq('user_id', userId);
}

async function syncLocalToCloud(userId: string): Promise<void> {
  const local = readFromStorage();
  if (local.length === 0) return;
  const supabase = getSupabaseClient();
  const rows = local.map((doc) => ({
    user_id: userId,
    file_name: doc.name,
    file_size: doc.size,
    last_opened_at: new Date(doc.lastOpened).toISOString(),
  }));
  await supabase
    .from('recent_documents')
    .upsert(rows, { onConflict: 'user_id,file_name' });
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function useRecentDocuments() {
  const auth = useAuthOptional();
  const status = auth?.status ?? 'unconfigured';
  const user = auth?.user ?? null;
  const [recent, setRecent] = useState<RecentDocument[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (status === 'authenticated' && user) {
        await syncLocalToCloud(user.id);
        const cloud = await fetchFromCloud(user.id);
        if (!cancelled) setRecent(cloud);
      } else {
        setRecent(readFromStorage());
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [status, user]);

  useEffect(() => {
    if (status === 'authenticated') return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setRecent(readFromStorage());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [status]);

  const addRecent = useCallback(
    async (file: File) => {
      if (status === 'authenticated' && user) {
        await upsertToCloud(user.id, file);
        const cloud = await fetchFromCloud(user.id);
        setRecent(cloud);
      } else if (typeof window !== 'undefined') {
        const current = readFromStorage();
        const filtered = current.filter((item) => item.name !== file.name);
        const next: RecentDocument[] = [
          { name: file.name, size: file.size, lastOpened: Date.now() },
          ...filtered,
        ].slice(0, MAX_RECENT);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setRecent(next);
      }
    },
    [status, user],
  );

  const clearRecent = useCallback(async () => {
    if (status === 'authenticated' && user) {
      await clearCloud(user.id);
      setRecent([]);
    } else if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
      setRecent([]);
    }
  }, [status, user]);

  return { recent, addRecent, clearRecent };
}
