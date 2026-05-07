'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface UseResizableOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  side: 'left' | 'right';
  storageKey?: string;
}

export function useResizable({
  initialWidth,
  minWidth,
  maxWidth,
  side,
  storageKey,
}: UseResizableOptions) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return initialWidth;
    if (storageKey) {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!Number.isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
          return parsed;
        }
      }
    }
    return initialWidth;
  });

  const [isResizing, setIsResizing] = useState(false);
  const handleRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsResizing(true);
      startXRef.current = event.clientX;
      startWidthRef.current = width;
      handleRef.current?.setPointerCapture(event.pointerId);
    },
    [width],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isResizing) return;
      const dx = event.clientX - startXRef.current;
      const delta = side === 'left' ? dx : -dx;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
      setWidth(newWidth);
    },
    [isResizing, minWidth, maxWidth, side],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isResizing) return;
      setIsResizing(false);
      handleRef.current?.releasePointerCapture(event.pointerId);
    },
    [isResizing],
  );

  useEffect(() => {
    if (storageKey && typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, String(width));
    }
  }, [width, storageKey]);

  return {
    width,
    isResizing,
    handleRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    setWidth,
  };
}
