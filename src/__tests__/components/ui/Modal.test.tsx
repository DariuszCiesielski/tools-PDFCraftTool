import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '@/components/ui/Modal';

describe('Modal', () => {
  beforeEach(() => {
    // Reset body overflow before each test
    document.body.style.overflow = '';
  });

  afterEach(() => {
    // Clean up any modals that might be left in the DOM
    document.body.style.overflow = '';
  });

  describe('Rendering', () => {
    it('renders nothing when closed', () => {
      render(
        <Modal isOpen={false} onClose={() => {}} title="Test Modal">
          Modal content
        </Modal>
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders when open', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          Modal content
        </Modal>
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('renders title', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="My Modal Title">
          Content
        </Modal>
      );
      expect(screen.getByText('My Modal Title')).toBeInTheDocument();
    });

    it('renders children content', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test">
          <p>Modal body content</p>
        </Modal>
      );
      expect(screen.getByText('Modal body content')).toBeInTheDocument();
    });

    it('renders close button', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test">
          Content
        </Modal>
      );
      expect(screen.getByRole('button', { name: 'Close modal' })).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has role="dialog"', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test">
          Content
        </Modal>
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has aria-modal="true"', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test">
          Content
        </Modal>
      );
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('has aria-labelledby pointing to title', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Title">
          Content
        </Modal>
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
      expect(screen.getByText('Test Title')).toHaveAttribute('id', 'modal-title');
    });

    it('prevents body scroll when open', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test">
          Content
        </Modal>
      );
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('restores body scroll when closed', () => {
      const { rerender } = render(
        <Modal isOpen={true} onClose={() => {}} title="Test">
          Content
        </Modal>
      );
      expect(document.body.style.overflow).toBe('hidden');

      rerender(
        <Modal isOpen={false} onClose={() => {}} title="Test">
          Content
        </Modal>
      );
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('Keyboard Navigation', () => {
    it('closes on Escape key press', async () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Test">
          Content
        </Modal>
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('does not close on Escape when closeOnEscape is false', () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Test" closeOnEscape={false}>
          Content
        </Modal>
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(handleClose).not.toHaveBeenCalled();
    });
  });

  describe('Close Button', () => {
    it('calls onClose when close button is clicked', async () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Test">
          Content
        </Modal>
      );

      const closeButton = screen.getByRole('button', { name: 'Close modal' });
      await userEvent.click(closeButton);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Overlay Click', () => {
    it('closes when overlay is clicked', async () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Test">
          Content
        </Modal>
      );

      // Find the overlay (the element with bg-black/50)
      const overlay = document.querySelector('.bg-black\\/50');
      if (overlay) {
        fireEvent.click(overlay);
        expect(handleClose).toHaveBeenCalledTimes(1);
      }
    });

    it('does not close when closeOnOverlayClick is false', () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Test" closeOnOverlayClick={false}>
          Content
        </Modal>
      );

      const overlay = document.querySelector('.bg-black\\/50');
      if (overlay) {
        fireEvent.click(overlay);
        expect(handleClose).not.toHaveBeenCalled();
      }
    });

    it('does not close when clicking inside modal content', async () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Test">
          <button>Inside button</button>
        </Modal>
      );

      await userEvent.click(screen.getByText('Inside button'));
      expect(handleClose).not.toHaveBeenCalled();
    });
  });

  describe('Sizes', () => {
    it('renders small size', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test" size="sm">
          Content
        </Modal>
      );
      expect(screen.getByRole('dialog')).toHaveClass('max-w-sm');
    });

    it('renders medium size (default)', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test">
          Content
        </Modal>
      );
      expect(screen.getByRole('dialog')).toHaveClass('max-w-md');
    });

    it('renders large size', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test" size="lg">
          Content
        </Modal>
      );
      expect(screen.getByRole('dialog')).toHaveClass('max-w-lg');
    });

    it('renders extra large size', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test" size="xl">
          Content
        </Modal>
      );
      expect(screen.getByRole('dialog')).toHaveClass('max-w-xl');
    });
  });
});
