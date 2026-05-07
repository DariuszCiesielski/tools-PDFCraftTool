'use client';

import React, {
  forwardRef,
  useEffect,
  useRef,
  useCallback,
  HTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
}

const sizeStyles: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

// Get all focusable elements within a container
const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  const focusableSelectors = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors));
};

export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      isOpen,
      onClose,
      title,
      children,
      size = 'md',
      closeOnOverlayClick = true,
      closeOnEscape = true,
      className = '',
      ...props
    },
    ref
  ) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const previousActiveElement = useRef<HTMLElement | null>(null);

    // Handle escape key press
    const handleKeyDown = useCallback(
      (event: KeyboardEvent) => {
        if (event.key === 'Escape' && closeOnEscape) {
          onClose();
          return;
        }

        // Focus trap - Tab key handling
        if (event.key === 'Tab' && modalRef.current) {
          const focusableElements = getFocusableElements(modalRef.current);
          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          if (event.shiftKey) {
            // Shift + Tab
            if (document.activeElement === firstElement) {
              event.preventDefault();
              lastElement?.focus();
            }
          } else {
            // Tab
            if (document.activeElement === lastElement) {
              event.preventDefault();
              firstElement?.focus();
            }
          }
        }
      },
      [closeOnEscape, onClose]
    );

    // Handle overlay click
    const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
      if (closeOnOverlayClick && event.target === event.currentTarget) {
        onClose();
      }
    };

    // Keep latest handler in ref to avoid effect re-fires on every parent re-render
    const handleKeyDownRef = useRef(handleKeyDown);
    useEffect(() => {
      handleKeyDownRef.current = handleKeyDown;
    }, [handleKeyDown]);

    // Focus management and event listeners — runs only when isOpen toggles
    useEffect(() => {
      if (!isOpen) return;

      previousActiveElement.current = document.activeElement as HTMLElement;

      const stableHandler = (event: KeyboardEvent) => handleKeyDownRef.current(event);
      document.addEventListener('keydown', stableHandler);

      document.body.style.overflow = 'hidden';

      if (modalRef.current) {
        const focusableElements = getFocusableElements(modalRef.current);
        if (focusableElements.length > 0) {
          // Skip the close button (first focusable) — focus first interactive content
          const target = focusableElements[1] ?? focusableElements[0];
          target.focus();
        } else {
          modalRef.current.focus();
        }
      }

      return () => {
        document.removeEventListener('keydown', stableHandler);
        document.body.style.overflow = '';

        if (previousActiveElement.current) {
          previousActiveElement.current.focus();
        }
      };
    }, [isOpen]);

    if (!isOpen) return null;

    const modalContent = (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="presentation"
      >
        {/* Overlay */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity duration-[var(--transition-normal)]"
          onClick={handleOverlayClick}
          aria-hidden="true"
        />

        {/* Modal */}
        <div
          ref={(node) => {
            // Handle both refs
            (modalRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          tabIndex={-1}
          className={`
            relative z-10 w-full ${sizeStyles[size]}
            bg-[hsl(var(--color-card))]
            rounded-[var(--radius-lg)]
            shadow-[var(--shadow-xl)]
            transform transition-all duration-[var(--transition-normal)]
            ${className}
          `.trim()}
          {...props}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--color-border))]">
            <h2
              id="modal-title"
              className="text-lg font-semibold text-[hsl(var(--color-card-foreground))]"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="
                p-1 rounded-[var(--radius-sm)]
                text-[hsl(var(--color-muted-foreground))]
                hover:text-[hsl(var(--color-foreground))]
                hover:bg-[hsl(var(--color-muted))]
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-ring))]
                transition-colors duration-[var(--transition-fast)]
              "
              aria-label="Close modal"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-4 text-[hsl(var(--color-card-foreground))]">
            {children}
          </div>
        </div>
      </div>
    );

    // Use portal to render modal at document body level
    if (typeof document !== 'undefined') {
      return createPortal(modalContent, document.body);
    }

    return null;
  }
);

Modal.displayName = 'Modal';

export default Modal;
