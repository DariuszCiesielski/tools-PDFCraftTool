'use client';

import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { usePreferences } from '@/lib/hooks/usePreferences';

export function ThemeToggle() {
  const [theme, setLocalTheme] = useState<'light' | 'dark' | null>(null);
  const { setTheme: pushTheme } = usePreferences();

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setLocalTheme(isDark ? 'dark' : 'light');

    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark');
      setLocalTheme(dark ? 'dark' : 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    pushTheme(next);
    setLocalTheme(next);
  };

  // Render placeholder before hydrated to avoid mismatch
  if (!theme) {
    return <div className="h-9 w-9" aria-hidden="true" />;
  }

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center h-9 w-9 rounded-lg text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))/0.5] transition-all"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );
}
