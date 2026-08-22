'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Search, ArrowRight } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { type Locale } from '@/lib/i18n/config';

interface FAQPageClientProps {
  locale: Locale;
}

interface FAQItem {
  question: string;
  answer: string;
  category: string;
  categoryLabel: string; // Display label
}

export default function FAQPageClient({ locale }: FAQPageClientProps) {
  const t = useTranslations('faqPage');
  const tCommon = useTranslations('common');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Helper to get FAQs for a category
  const getCategoryFaqs = (categoryKey: string, categoryLabel: string): FAQItem[] => {
    const categoryMapping: Record<string, string[]> = {
      'general': ['whatIs', 'isFree', 'account'],
      'privacy': ['uploaded', 'safe', 'storage'],
      'features': ['operations', 'merge', 'images', 'edit'],
      'technical': ['browsers', 'sizeLimit', 'slow', 'offline'],
      'languages': ['supported', 'change']
    };

    const keys = categoryMapping[categoryKey] || [];

    return keys.map(key => ({
      category: categoryKey,
      categoryLabel: categoryLabel,
      question: t(`sections.${categoryKey}.${key}.question`),
      answer: t(`sections.${categoryKey}.${key}.answer`)
    }));
  };

  // Construct FAQ data dynamically
  const faqs: FAQItem[] = [
    ...getCategoryFaqs('general', t('categories.general')),
    ...getCategoryFaqs('privacy', t('categories.privacy')),
    ...getCategoryFaqs('features', t('categories.features')),
    ...getCategoryFaqs('technical', t('categories.technical')),
    ...getCategoryFaqs('languages', t('categories.languages')),
  ];

  // Get unique categories for filter buttons
  const categories = [
    { key: 'all', label: t('categories.all') },
    { key: 'general', label: t('categories.general') },
    { key: 'privacy', label: t('categories.privacy') },
    { key: 'features', label: t('categories.features') },
    { key: 'technical', label: t('categories.technical') },
    { key: 'languages', label: t('categories.languages') },
  ];

  // Filter FAQs
  const filteredFaqs = faqs.filter(faq => {
    const matchesSearch = searchQuery === '' ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleItem = (index: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  const expandAll = () => {
    setExpandedItems(new Set(filteredFaqs.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedItems(new Set());
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header locale={locale} />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-[hsl(var(--color-muted)/0.3)] pt-20 pb-12">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-3xl md:text-4xl font-bold text-[hsl(var(--color-foreground))] mb-4">
                {t('title')}
              </h1>
              <p className="text-[hsl(var(--color-muted-foreground))] mb-8">
                {t('subtitle', { brand: tCommon('brand') })}
              </p>

              {/* Search Bar */}
              <div className="relative max-w-xl mx-auto">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[hsl(var(--color-muted-foreground))]" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="w-full pl-12 pr-4 py-3 text-base rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-ring))]"
                  aria-label="Search FAQs"
                />
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Content */}
        <section className="py-12">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              {/* Category Filters */}
              <div className="flex flex-wrap gap-2 mb-6">
                {categories.map((cat) => (
                  <Button
                    key={cat.key}
                    variant={selectedCategory === cat.key ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory(cat.key)}
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>

              {/* Expand/Collapse Controls */}
              <div className="flex justify-end gap-2 mb-4">
                <Button variant="ghost" size="sm" onClick={expandAll}>
                  {t('expandAll')}
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAll}>
                  {t('collapseAll')}
                </Button>
              </div>

              {/* FAQ List */}
              {filteredFaqs.length > 0 ? (
                <div className="space-y-4">
                  {filteredFaqs.map((faq, index) => (
                    <Card key={index} className="overflow-hidden">
                      <button
                        className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-[hsl(var(--color-muted)/0.5)] transition-colors"
                        onClick={() => toggleItem(index)}
                        aria-expanded={expandedItems.has(index)}
                      >
                        <div className="flex-1">
                          <span className="text-xs text-[hsl(var(--color-primary))] font-medium mb-1 block">
                            {faq.categoryLabel}
                          </span>
                          <span className="font-medium text-[hsl(var(--color-foreground))]">
                            {faq.question}
                          </span>
                        </div>
                        {expandedItems.has(index) ? (
                          <ChevronUp className="h-5 w-5 text-[hsl(var(--color-muted-foreground))] flex-shrink-0" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-[hsl(var(--color-muted-foreground))] flex-shrink-0" />
                        )}
                      </button>
                      {expandedItems.has(index) && (
                        <div className="px-6 pb-4">
                          <p className="text-[hsl(var(--color-muted-foreground))] leading-relaxed">
                            {faq.answer}
                          </p>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="p-12 text-center">
                  <p className="text-[hsl(var(--color-muted-foreground))]">
                    {t('noResults')}
                  </p>
                </Card>
              )}
            </div>
          </div>
        </section>

        {/* Contact CTA */}
        <section className="py-12 bg-[hsl(var(--color-muted)/0.3)]">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-2xl font-bold text-[hsl(var(--color-foreground))] mb-4">
                {t('cta.title')}
              </h2>
              <p className="text-[hsl(var(--color-muted-foreground))] mb-6">
                {t('cta.description')}
              </p>
              <Link href={`/${locale}/contact`}>
                <Button variant="primary">
                  {t('cta.button')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer locale={locale} />
    </div>
  );
}
