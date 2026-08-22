'use client';

import React, {
  forwardRef,
  useState,
  useRef,
  useCallback,
  KeyboardEvent,
  HTMLAttributes,
} from 'react';

export interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  tabs: Tab[];
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  orientation?: 'horizontal' | 'vertical';
}

export const Tabs = forwardRef<HTMLDivElement, TabsProps>(
  (
    {
      tabs,
      defaultTab,
      onChange,
      orientation = 'horizontal',
      className = '',
      ...props
    },
    ref
  ) => {
    const [activeTab, setActiveTab] = useState<string>(
      defaultTab || tabs[0]?.id || ''
    );
    const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

    const handleTabChange = useCallback(
      (tabId: string) => {
        setActiveTab(tabId);
        onChange?.(tabId);
      },
      [onChange]
    );

    const handleKeyDown = useCallback(
      (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
        const enabledTabs = tabs.filter((tab) => !tab.disabled);
        const currentEnabledIndex = enabledTabs.findIndex(
          (tab) => tab.id === tabs[currentIndex].id
        );

        let nextIndex: number | null = null;

        const isHorizontal = orientation === 'horizontal';
        const prevKey = isHorizontal ? 'ArrowLeft' : 'ArrowUp';
        const nextKey = isHorizontal ? 'ArrowRight' : 'ArrowDown';

        switch (event.key) {
          case prevKey:
            event.preventDefault();
            nextIndex =
              currentEnabledIndex > 0
                ? currentEnabledIndex - 1
                : enabledTabs.length - 1;
            break;
          case nextKey:
            event.preventDefault();
            nextIndex =
              currentEnabledIndex < enabledTabs.length - 1
                ? currentEnabledIndex + 1
                : 0;
            break;
          case 'Home':
            event.preventDefault();
            nextIndex = 0;
            break;
          case 'End':
            event.preventDefault();
            nextIndex = enabledTabs.length - 1;
            break;
          case 'Enter':
          case ' ':
            event.preventDefault();
            handleTabChange(tabs[currentIndex].id);
            return;
          default:
            return;
        }

        if (nextIndex !== null) {
          const nextTab = enabledTabs[nextIndex];
          const nextTabElement = tabRefs.current.get(nextTab.id);
          nextTabElement?.focus();
          handleTabChange(nextTab.id);
        }
      },
      [tabs, orientation, handleTabChange]
    );


    const isVertical = orientation === 'vertical';

    return (
      <div
        ref={ref}
        className={`${isVertical ? 'flex gap-4' : ''} ${className}`.trim()}
        {...props}
      >
        {/* Tab List */}
        <div
          role="tablist"
          aria-orientation={orientation}
          className={`
            ${isVertical ? 'flex-col' : 'flex'}
            ${isVertical ? 'border-r' : 'border-b'}
            border-[hsl(var(--color-border))]
            ${isVertical ? 'pr-4' : 'pb-0'}
          `.trim()}
        >
          {tabs.map((tab, index) => {
            const isActive = activeTab === tab.id;
            const isDisabled = tab.disabled;

            return (
              <button
                key={tab.id}
                ref={(el) => {
                  if (el) {
                    tabRefs.current.set(tab.id, el);
                  } else {
                    tabRefs.current.delete(tab.id);
                  }
                }}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                aria-disabled={isDisabled}
                tabIndex={isActive ? 0 : -1}
                disabled={isDisabled}
                onClick={() => !isDisabled && handleTabChange(tab.id)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className={`
                  px-4 py-2
                  font-medium text-sm
                  transition-all duration-[var(--transition-fast)]
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-ring))] focus-visible:ring-inset
                  ${isVertical ? 'text-left w-full' : ''}
                  ${
                    isActive
                      ? `
                        text-[hsl(var(--color-primary))]
                        ${isVertical ? 'border-r-2 border-[hsl(var(--color-primary))] -mr-[2px]' : 'border-b-2 border-[hsl(var(--color-primary))] -mb-[2px]'}
                        bg-[hsl(var(--color-muted))]
                      `
                      : `
                        text-[hsl(var(--color-muted-foreground))]
                        hover:text-[hsl(var(--color-foreground))]
                        hover:bg-[hsl(var(--color-muted))]
                      `
                  }
                  ${
                    isDisabled
                      ? 'opacity-50 cursor-not-allowed'
                      : 'cursor-pointer'
                  }
                `.trim()}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Panels */}
        <div className={`${isVertical ? 'flex-1' : 'mt-4'}`}>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="tabpanel"
              id={`tabpanel-${tab.id}`}
              aria-labelledby={`tab-${tab.id}`}
              hidden={activeTab !== tab.id}
              tabIndex={0}
              className={`
                focus:outline-none
                ${activeTab === tab.id ? 'block' : 'hidden'}
              `.trim()}
            >
              {activeTab === tab.id && tab.content}
            </div>
          ))}
        </div>
      </div>
    );
  }
);

Tabs.displayName = 'Tabs';

export default Tabs;
