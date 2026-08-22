/**
 * LiveRegion Component
 * Requirements: 9.4
 * 
 * Provides screen reader announcements for dynamic content changes
 */

'use client';

import React, { useEffect, useState, useRef, createContext, useContext, useCallback } from 'react';

export type LiveRegionPoliteness = 'polite' | 'assertive' | 'off';

export interface LiveRegionProps {
  /** The message to announce */
  message: string;
  /** Politeness level for the announcement */
  politeness?: LiveRegionPoliteness;
  /** Clear the message after announcement */
  clearOnAnnounce?: boolean;
  /** Delay before clearing (ms) */
  clearDelay?: number;
}

/**
 * LiveRegion component for screen reader announcements
 * Uses ARIA live regions to announce dynamic content changes
 */
export const LiveRegion: React.FC<LiveRegionProps> = ({
  message,
  politeness = 'polite',
  clearOnAnnounce = true,
  clearDelay = 1000,
}) => {
  const [announcement, setAnnouncement] = useState('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (message) {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set the announcement
      setAnnouncement(message);

      // Clear after delay if configured
      if (clearOnAnnounce) {
        timeoutRef.current = setTimeout(() => {
          setAnnouncement('');
        }, clearDelay);
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [message, clearOnAnnounce, clearDelay]);

  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </div>
  );
};

/**
 * Context for global announcements
 */
interface AnnouncementContextValue {
  announce: (message: string, politeness?: LiveRegionPoliteness) => void;
}

const AnnouncementContext = createContext<AnnouncementContextValue | null>(null);

/**
 * Provider for global screen reader announcements
 */
export const AnnouncementProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');

  const announce = useCallback((message: string, politeness: LiveRegionPoliteness = 'polite') => {
    if (politeness === 'assertive') {
      setAssertiveMessage(message);
      // Clear after a short delay to allow re-announcement of same message
      setTimeout(() => setAssertiveMessage(''), 100);
    } else {
      setPoliteMessage(message);
      setTimeout(() => setPoliteMessage(''), 100);
    }
  }, []);

  return (
    <AnnouncementContext.Provider value={{ announce }}>
      {children}
      {/* Polite live region */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {politeMessage}
      </div>
      {/* Assertive live region */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertiveMessage}
      </div>
    </AnnouncementContext.Provider>
  );
};

/**
 * Hook to access the announcement function
 */
export function useAnnouncement() {
  const context = useContext(AnnouncementContext);
  if (!context) {
    // Return a no-op function if not within provider
    return {
      announce: (_message: string, _politeness?: LiveRegionPoliteness) => {
        console.warn('useAnnouncement: AnnouncementProvider not found');
      },
    };
  }
  return context;
}

/**
 * Hook for announcing status changes
 */
export function useStatusAnnouncement() {
  const { announce } = useAnnouncement();

  const announceStatus = useCallback((status: string) => {
    announce(status, 'polite');
  }, [announce]);

  const announceError = useCallback((error: string) => {
    announce(error, 'assertive');
  }, [announce]);

  const announceSuccess = useCallback((message: string) => {
    announce(message, 'polite');
  }, [announce]);

  const announceLoading = useCallback((message: string = 'Loading, please wait') => {
    announce(message, 'polite');
  }, [announce]);

  return {
    announceStatus,
    announceError,
    announceSuccess,
    announceLoading,
  };
}

export default LiveRegion;
