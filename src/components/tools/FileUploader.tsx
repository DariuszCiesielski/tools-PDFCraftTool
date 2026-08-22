'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { UploadCloud, File, Plus } from 'lucide-react';

export interface FileUploaderProps {
  /** Accepted file types (MIME types or extensions) */
  accept?: string[];
  /** Allow multiple file selection */
  multiple?: boolean;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Maximum number of files */
  maxFiles?: number;
  /** Callback when files are selected */
  onFilesSelected: (files: File[]) => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
  /** Custom class name */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Custom label text */
  label?: string;
  /** Custom description text */
  description?: string;
}

/**
 * FileUploader Component
 * Requirements: 5.2
 * 
 * Supports drag-and-drop, file picker, and paste from clipboard.
 * Beautified with premium UI and glassmorphism.
 */
export const FileUploader: React.FC<FileUploaderProps> = ({
  accept = ['application/pdf'],
  multiple = false,
  maxSize = Infinity, // No limit by default
  maxFiles = 10,
  onFilesSelected,
  onError,
  className = '',
  disabled = false,
  label,
  description,
}) => {
  const t = useTranslations('common');
  const tErrors = useTranslations('errors');

  const [isDragging, setIsDragging] = useState(false);
  const [_dragCounter, setDragCounter] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Generate accept string for input element
  const acceptString = accept.join(',');

  /**
   * Validate files against constraints
   */
  const validateFiles = useCallback((files: File[]): { valid: File[]; errors: string[] } => {
    const valid: File[] = [];
    const errors: string[] = [];

    // Check max files
    if (!multiple && files.length > 1) {
      errors.push('Only one file can be uploaded at a time.');
      return { valid: [files[0]], errors };
    }

    if (files.length > maxFiles) {
      errors.push(`Maximum ${maxFiles} files allowed.`);
      files = files.slice(0, maxFiles);
    }

    for (const file of files) {
      // Check file size (skip if no limit)
      if (maxSize !== Infinity && file.size > maxSize) {
        const maxSizeMB = Math.round(maxSize / (1024 * 1024));
        errors.push(tErrors('fileTooLarge', { maxSize: maxSizeMB }));
        continue;
      }

      // Check file type
      const isValidType = accept.some(type => {
        // Accept all files
        if (type === '*/*' || type === '*') {
          return true;
        }
        if (type.startsWith('.')) {
          // Extension check
          return file.name.toLowerCase().endsWith(type.toLowerCase());
        }
        if (type.endsWith('/*')) {
          // Wildcard MIME type
          const baseType = type.slice(0, -2);
          return file.type.startsWith(baseType);
        }
        // Exact MIME type match
        return file.type === type;
      });

      // Also check by extension for PDF files
      const isPdfByExtension = file.name.toLowerCase().endsWith('.pdf');
      const acceptsPdf = accept.includes('application/pdf');

      if (!isValidType && !(acceptsPdf && isPdfByExtension)) {
        errors.push(tErrors('fileTypeInvalid', { acceptedTypes: accept.join(', ') }));
        continue;
      }

      valid.push(file);
    }

    return { valid, errors };
  }, [accept, maxSize, maxFiles, multiple, tErrors]);

  /**
   * Handle file selection
   */
  const handleFiles = useCallback((files: FileList | File[]) => {
    if (disabled) return;

    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const { valid, errors } = validateFiles(fileArray);

    if (errors.length > 0 && onError) {
      onError(errors[0]);
    }

    if (valid.length > 0) {
      onFilesSelected(valid);
    }
  }, [disabled, validateFiles, onError, onFilesSelected]);

  /**
   * Handle drag enter
   */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) return;

    setDragCounter(prev => prev + 1);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, [disabled]);

  /**
   * Handle drag leave
   */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setDragCounter(prev => {
      const newCount = prev - 1;
      if (newCount === 0) {
        setIsDragging(false);
      }
      return newCount;
    });
  }, []);

  /**
   * Handle drag over
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /**
   * Handle drop
   */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(false);
    setDragCounter(0);

    if (disabled) return;

    const files = e.dataTransfer.files;
    handleFiles(files);
  }, [disabled, handleFiles]);

  /**
   * Handle file input change
   */
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      handleFiles(files);
    }
    // Reset input value to allow selecting the same file again
    e.target.value = '';
  }, [handleFiles]);

  /**
   * Handle click to open file picker
   */
  const handleClick = useCallback(() => {
    if (disabled) return;
    fileInputRef.current?.click();
  }, [disabled]);

  /**
   * Handle keyboard interaction
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  }, [disabled]);

  /**
   * Handle paste from clipboard
   */
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (disabled) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        handleFiles(files);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [disabled, handleFiles]);

  const baseStyles = `
    relative flex flex-col items-center justify-center
    w-full min-h-[250px] p-10
    border-2 border-dashed
    rounded-[2rem]
    transition-all duration-300
    cursor-pointer
    group
  `;

  // Dynamic styles based on state
  const stateStyles = disabled
    ? 'border-[hsl(var(--color-muted))] bg-[hsl(var(--color-muted)/0.3)] cursor-not-allowed opacity-50'
    : isDragging
      ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.05)] scale-[1.01] shadow-2xl shadow-primary/10'
      : `
      border-[hsl(var(--color-border))] 
      bg-[hsl(var(--color-card)/0.5)] 
      hover:border-[hsl(var(--color-primary))] 
      hover:bg-[hsl(var(--color-background))] 
      hover:shadow-xl hover:shadow-[hsl(var(--color-primary)/0.05)]
      glass-card
    `;

  return (
    <div
      ref={dropZoneRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label || t('buttons.upload')}
      aria-disabled={disabled}
      className={`${baseStyles} ${stateStyles} ${className}`.trim()}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptString}
        multiple={multiple}
        onChange={handleInputChange}
        className="hidden"
        aria-hidden="true"
        disabled={disabled}
      />

      {/* Decorative background blob */}
      <div className="absolute inset-0 overflow-hidden rounded-[2rem] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[hsl(var(--color-primary)/0.03)] rounded-full blur-3xl" />
      </div>

      {/* Upload icon */}
      <div className={`
        mb-6 p-4 rounded-full transition-transform duration-300 group-hover:scale-110
        ${isDragging ? 'bg-[hsl(var(--color-primary)/0.1)] text-[hsl(var(--color-primary))]' : 'bg-[hsl(var(--color-muted))] text-[hsl(var(--color-muted-foreground))] group-hover:bg-[hsl(var(--color-primary)/0.1)] group-hover:text-[hsl(var(--color-primary))]'}
      `}>
        <UploadCloud className="w-10 h-10" aria-hidden="true" />
      </div>

      {/* Label */}
      <p className="text-xl font-semibold text-[hsl(var(--color-foreground))] mb-3 text-center">
        {label || t('buttons.upload')}
      </p>

      {/* Description */}
      <div className="text-sm text-[hsl(var(--color-muted-foreground))] text-center max-w-sm leading-relaxed">
        {description || (
          <>
            <p className="mb-2">{t('fileUploader.dragDrop')}</p>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[hsl(var(--color-muted)/0.5)] text-xs font-medium">
              <span className="opacity-70">{t('fileUploader.support')}:</span>
              <span>{t('fileUploader.paste')}</span>
            </div>
          </>
        )}
      </div>

      {/* File info hints - only show when multiple files allowed */}
      {multiple && (
        <div className="mt-6 flex flex-wrap gap-2 justify-center">
          <span className="text-xs px-2 py-1 rounded-md bg-[hsl(var(--color-muted))] text-[hsl(var(--color-muted-foreground))]">
            Files: {maxFiles}
          </span>
        </div>
      )}

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[hsl(var(--color-background)/0.9)] backdrop-blur-sm rounded-[2rem] z-10 transition-opacity duration-200">
          <div className="p-4 rounded-full bg-[hsl(var(--color-primary)/0.1)] text-[hsl(var(--color-primary))] mb-4 motion-safe:animate-bounce">
            <Plus className="w-8 h-8" />
          </div>
          <p className="text-xl font-bold text-[hsl(var(--color-primary))]">
            {t('fileUploader.dropToUpload')}
          </p>
        </div>
      )}
    </div>
  );
};

export default FileUploader;
