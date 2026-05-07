'use client';

import { useCallback, useEffect, useState } from 'react';

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

export function useRecentDocuments() {
  const [recent, setRecent] = useState<RecentDocument[]>([]);

  useEffect(() => {
    setRecent(readFromStorage());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setRecent(readFromStorage());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const addRecent = useCallback((file: File) => {
    if (typeof window === 'undefined') return;
    const current = readFromStorage();
    const filtered = current.filter((item) => item.name !== file.name);
    const next: RecentDocument[] = [
      { name: file.name, size: file.size, lastOpened: Date.now() },
      ...filtered,
    ].slice(0, MAX_RECENT);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setRecent(next);
  }, []);

  const clearRecent = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(STORAGE_KEY);
    setRecent([]);
  }, []);

  return { recent, addRecent, clearRecent };
}
