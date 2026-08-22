'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { type Locale } from '@/lib/i18n/config';
import { type ToolCategory } from '@/types/tool';

export interface NavigationProps {
  locale: Locale;
  currentPath: string;
}

interface CategoryItem {
  id: ToolCategory;
  labelKey: string;
  href: string;
}

export const Navigation: React.FC<NavigationProps> = ({ locale, currentPath }) => {
  const t = useTranslations('home.categories');
  const tCommon = useTranslations('common');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuItemRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const categories: CategoryItem[] = [
    { id: 'edit-annotate', labelKey: 'editAnnotate', href: `/${locale}/tools?category=edit-annotate` },
    { id: 'convert-to-pdf', labelKey: 'convertToPdf', href: `/${locale}/tools?category=convert-to-pdf` },
    { id: 'convert-from-pdf', labelKey: 'convertFromPdf', href: `/${locale}/tools?category=convert-from-pdf` },
    { id: 'organize-manage', labelKey: 'organizeManage', href: `/${locale}/tools?category=organize-manage` },
    { id: 'optimize-repair', labelKey: 'optimizeRepair', href: `/${locale}/tools?category=optimize-repair` },
    { id: 'secure-pdf', labelKey: 'securePdf', href: `/${locale}/tools?category=secure-pdf` },
  ];

  const mainNavItems = [
    { href: `/${locale}`, label: tCommon('navigation.home') },
    { href: `/${locale}/tools`, label: tCommon('navigation.tools'), hasDropdown: true },
    { href: `/${locale}/about`, label: tCommon('navigation.about') },
    { href: `/${locale}/faq`, label: tCommon('navigation.faq') },
  ];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
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
        setOpenDropdown(null);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  // Focus menu item when focusedIndex changes
  useEffect(() => {
    if (focusedIndex >= 0 && menuItemRefs.current[focusedIndex]) {
      menuItemRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex]);

  const handleDropdownToggle = useCallback((itemHref: string) => {
    setOpenDropdown((prev) => {
      if (prev === itemHref) {
        setFocusedIndex(-1);
        return null;
      }
      setFocusedIndex(0);
      return itemHref;
    });
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent, itemHref: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleDropdownToggle(itemHref);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (openDropdown !== itemHref) {
        setOpenDropdown(itemHref);
      }
      setFocusedIndex(0);
    }
  }, [handleDropdownToggle, openDropdown]);

  const handleMenuKeyDown = useCallback((event: React.KeyboardEvent, _index: number) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex((prev) => (prev < categories.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : categories.length - 1));
        break;
      case 'Home':
        event.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setFocusedIndex(categories.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        setOpenDropdown(null);
        setFocusedIndex(-1);
        break;
      case 'Tab':
        setOpenDropdown(null);
        setFocusedIndex(-1);
        break;
    }
  }, [categories.length]);

  const isActive = (href: string) => {
    if (href === `/${locale}`) {
      return currentPath === `/${locale}` || currentPath === `/${locale}/`;
    }
    return currentPath.startsWith(href);
  };

  return (
    <nav 
      className="hidden md:flex items-center gap-1"
      role="navigation"
      aria-label="Main navigation"
      ref={dropdownRef}
    >
      {mainNavItems.map((item) => (
        <div key={item.href} className="relative">
          {item.hasDropdown ? (
            <>
              <button
                onClick={() => handleDropdownToggle(item.href)}
                onKeyDown={(e) => handleKeyDown(e, item.href)}
                className={`
                  flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-[var(--radius-md)]
                  transition-colors
                  ${isActive(item.href) 
                    ? 'text-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.1)]' 
                    : 'text-[hsl(var(--color-foreground))] hover:text-[hsl(var(--color-primary))] hover:bg-[hsl(var(--color-muted))]'
                  }
                `}
                aria-expanded={openDropdown === item.href}
                aria-haspopup="true"
                aria-controls={`dropdown-${item.href}`}
              >
                {item.label}
                <ChevronDown 
                  className={`h-4 w-4 transition-transform ${openDropdown === item.href ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {/* Dropdown Menu */}
              {openDropdown === item.href && (
                <div
                  id={`dropdown-${item.href}`}
                  className="absolute top-full left-0 mt-1 w-56 py-2 bg-[hsl(var(--color-background))] border border-[hsl(var(--color-border))] rounded-[var(--radius-lg)] shadow-lg z-50"
                  role="menu"
                  aria-orientation="vertical"
                >
                  {categories.map((category, index) => (
                    <Link
                      key={category.id}
                      ref={(el) => { menuItemRefs.current[index] = el; }}
                      href={category.href}
                      className="block px-4 py-2 text-sm text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))] hover:text-[hsl(var(--color-primary))] focus:bg-[hsl(var(--color-muted))] focus:text-[hsl(var(--color-primary))] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--color-ring))] transition-colors"
                      role="menuitem"
                      tabIndex={focusedIndex === index ? 0 : -1}
                      onClick={() => {
                        setOpenDropdown(null);
                        setFocusedIndex(-1);
                      }}
                      onKeyDown={(e) => handleMenuKeyDown(e, index)}
                    >
                      {t(category.labelKey)}
                    </Link>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Link
              href={item.href}
              className={`
                px-3 py-2 text-sm font-medium rounded-[var(--radius-md)]
                transition-colors
                ${isActive(item.href) 
                  ? 'text-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.1)]' 
                  : 'text-[hsl(var(--color-foreground))] hover:text-[hsl(var(--color-primary))] hover:bg-[hsl(var(--color-muted))]'
                }
              `}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
};

export default Navigation;
