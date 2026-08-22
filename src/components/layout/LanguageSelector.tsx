'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { type Locale, locales, localeConfig, getLocalizedPath } from '@/lib/i18n/config';
import { Button } from '@/components/ui/Button';

export interface LanguageSelectorProps {
  currentLocale: Locale;
}

// Storage key for language preference
const LANGUAGE_PREFERENCE_KEY = 'pdfcraft-language-preference';

/**
 * Save language preference to localStorage
 */
export function saveLanguagePreference(locale: Locale): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LANGUAGE_PREFERENCE_KEY, locale);
  }
}

/**
 * Get language preference from localStorage
 */
export function getLanguagePreference(): Locale | null {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(LANGUAGE_PREFERENCE_KEY);
    if (stored && locales.includes(stored as Locale)) {
      return stored as Locale;
    }
  }
  return null;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ currentLocale }) => {
  const t = useTranslations('common.buttons');
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const currentConfig = localeConfig[currentLocale];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  // Focus option when focusedIndex changes
  useEffect(() => {
    if (focusedIndex >= 0 && optionRefs.current[focusedIndex]) {
      optionRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) {
        // Find current locale index when opening
        const currentIndex = locales.indexOf(currentLocale);
        setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
      } else {
        setFocusedIndex(-1);
      }
      return !prev;
    });
  }, [currentLocale]);

  const handleButtonKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      }
      const currentIndex = locales.indexOf(currentLocale);
      setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, currentLocale]);

  const handleLanguageSelect = useCallback((locale: Locale) => {
    // Save preference to localStorage
    saveLanguagePreference(locale);
    
    // Navigate to the new locale path
    const newPath = getLocalizedPath(pathname, locale);
    router.push(newPath);
    
    setIsOpen(false);
    setFocusedIndex(-1);
  }, [pathname, router]);

  const handleOptionKeyDown = useCallback((event: React.KeyboardEvent, locale: Locale, _index: number) => {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        handleLanguageSelect(locale);
        break;
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex((prev) => (prev < locales.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : locales.length - 1));
        break;
      case 'Home':
        event.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setFocusedIndex(locales.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        setFocusedIndex(-1);
        break;
      case 'Tab':
        setIsOpen(false);
        setFocusedIndex(-1);
        break;
    }
  }, [handleLanguageSelect]);

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggle}
        onKeyDown={handleButtonKeyDown}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={t('selectLanguage')}
        className="flex items-center gap-1.5"
      >
        <Globe className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline text-sm">{currentConfig.nativeName}</span>
        <ChevronDown 
          className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </Button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute top-full right-0 mt-1 w-48 py-1 bg-[hsl(var(--color-background))] border border-[hsl(var(--color-border))] rounded-[var(--radius-lg)] shadow-lg z-50"
          role="listbox"
          aria-label={t('selectLanguage')}
          aria-activedescendant={focusedIndex >= 0 ? `language-option-${locales[focusedIndex]}` : undefined}
        >
          {locales.map((locale, index) => {
            const config = localeConfig[locale];
            const isSelected = locale === currentLocale;

            return (
              <button
                key={locale}
                id={`language-option-${locale}`}
                ref={(el) => { optionRefs.current[index] = el; }}
                onClick={() => handleLanguageSelect(locale)}
                onKeyDown={(e) => handleOptionKeyDown(e, locale, index)}
                className={`
                  flex items-center justify-between w-full px-3 py-2 text-sm text-left
                  transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--color-ring))]
                  ${isSelected 
                    ? 'bg-[hsl(var(--color-primary)/0.1)] text-[hsl(var(--color-primary))]' 
                    : 'text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))] focus:bg-[hsl(var(--color-muted))]'
                  }
                `}
                role="option"
                aria-selected={isSelected}
                tabIndex={focusedIndex === index ? 0 : -1}
                dir={config.direction}
              >
                <span className="flex items-center gap-2">
                  <span>{config.nativeName}</span>
                  <span className="text-xs text-[hsl(var(--color-muted-foreground))]">
                    ({config.name})
                  </span>
                </span>
                {isSelected && (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
