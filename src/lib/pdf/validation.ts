/**
 * File Validation Utilities
 * Requirements: 5.1
 * 
 * Provides validation functions for files before PDF processing.
 */

import type { ValidationResult, PDFError } from '@/types/pdf';
import {
  PDFErrorCode,
  ErrorCategory,
  ERROR_CODE_CATEGORY,
  FILE_SIZE_LIMITS,
  SUPPORTED_FILE_TYPES,
} from '@/types/pdf';

/**
 * File validation options
 */
export interface FileValidationOptions {
  maxSize?: number;
  acceptedTypes?: string[];
  requirePdf?: boolean;
}

/**
 * Default validation options
 */
const DEFAULT_OPTIONS: FileValidationOptions = {
  maxSize: FILE_SIZE_LIMITS.DEFAULT_MAX_SIZE,
  acceptedTypes: [...SUPPORTED_FILE_TYPES.PDF],
  requirePdf: true,
};

/**
 * Validate a file against specified criteria
 */
export function validateFile(
  file: File,
  options: FileValidationOptions = {}
): ValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const errors: PDFError[] = [];

  // Check if file exists and has content
  if (!file || file.size === 0) {
    errors.push(createValidationError(
      PDFErrorCode.FILE_EMPTY,
      'The file is empty or could not be read.'
    ));
    return { valid: false, errors };
  }

  // Check file size (skip if no limit)
  if (opts.maxSize && opts.maxSize !== Infinity && file.size > opts.maxSize) {
    const maxSizeMB = Math.round(opts.maxSize / (1024 * 1024));
    errors.push(createValidationError(
      PDFErrorCode.FILE_TOO_LARGE,
      `File size exceeds the maximum limit of ${maxSizeMB}MB.`,
      `File size: ${formatFileSize(file.size)}, Maximum: ${maxSizeMB}MB`
    ));
  }

  // Check file type
  if (opts.acceptedTypes && opts.acceptedTypes.length > 0) {
    const isAcceptedType = opts.acceptedTypes.includes(file.type) ||
      opts.acceptedTypes.some(type => {
        // Handle wildcard types like 'image/*'
        if (type.endsWith('/*')) {
          const baseType = type.slice(0, -2);
          return file.type.startsWith(baseType);
        }
        return false;
      });

    // Also check by file extension for PDF files
    const isPdfByExtension = file.name.toLowerCase().endsWith('.pdf');
    const acceptsPdf = opts.acceptedTypes.includes('application/pdf');

    if (!isAcceptedType && !(acceptsPdf && isPdfByExtension)) {
      errors.push(createValidationError(
        PDFErrorCode.FILE_TYPE_INVALID,
        `Invalid file type. Expected: ${opts.acceptedTypes.join(', ')}`,
        `Received: ${file.type || 'unknown'}`
      ));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate PDF file structure by checking magic bytes
 */
export async function validatePdfStructure(file: File): Promise<ValidationResult> {
  const errors: PDFError[] = [];

  try {
    // Read the first few bytes to check PDF magic bytes
    const headerBytes = await readFileHeader(file, 8);

    if (!isPdfHeader(headerBytes)) {
      errors.push(createValidationError(
        PDFErrorCode.FILE_NOT_PDF,
        'The file does not appear to be a valid PDF.',
        'PDF files must start with %PDF-'
      ));
      return { valid: false, errors };
    }

    // Check for PDF version
    const version = extractPdfVersion(headerBytes);
    if (!version) {
      errors.push(createValidationError(
        PDFErrorCode.PDF_MALFORMED,
        'Could not determine PDF version.',
        'The PDF header may be corrupted.'
      ));
    }

    // Check for EOF marker (basic structure validation)
    const hasEof = await checkPdfEofMarker(file);
    if (!hasEof) {
      errors.push(createValidationError(
        PDFErrorCode.PDF_MALFORMED,
        'PDF file appears to be incomplete or corrupted.',
        'Missing EOF marker.'
      ));
    }

  } catch (error) {
    errors.push(createValidationError(
      PDFErrorCode.FILE_CORRUPTED,
      'Could not read the file.',
      error instanceof Error ? error.message : 'Unknown error'
    ));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if a PDF is encrypted
 */
export async function checkPdfEncryption(file: File): Promise<boolean> {
  try {
    const content = await readFileAsText(file, 0, 4096);
    // Look for /Encrypt dictionary in the PDF
    return content.includes('/Encrypt');
  } catch {
    return false;
  }
}

/**
 * Read the first n bytes of a file
 */
async function readFileHeader(file: File, bytes: number): Promise<Uint8Array> {
  const slice = file.slice(0, bytes);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Read file content as text
 */
async function readFileAsText(file: File, start: number, end: number): Promise<string> {
  const slice = file.slice(start, end);
  return slice.text();
}

/**
 * Check if bytes match PDF magic bytes (%PDF-)
 */
function isPdfHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;

  // Check for %PDF-
  return bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2D;   // -
}

/**
 * Extract PDF version from header bytes
 */
function extractPdfVersion(bytes: Uint8Array): string | null {
  if (bytes.length < 8) return null;

  // Convert bytes 5-7 to string (version number like "1.7")
  const versionBytes = bytes.slice(5, 8);
  const version = String.fromCharCode(...versionBytes).trim();

  // Validate version format (e.g., "1.7", "2.0")
  if (/^\d\.\d/.test(version)) {
    return version;
  }

  return null;
}

/**
 * Check for PDF EOF marker
 */
async function checkPdfEofMarker(file: File): Promise<boolean> {
  try {
    // Read the last 1024 bytes
    const tailSize = Math.min(1024, file.size);
    const tail = await readFileAsText(file, file.size - tailSize, file.size);

    // Look for %%EOF marker
    return tail.includes('%%EOF');
  } catch {
    return false;
  }
}

/**
 * Create a validation error
 */
function createValidationError(
  code: PDFErrorCode,
  message: string,
  details?: string
): PDFError {
  return {
    code,
    category: ERROR_CODE_CATEGORY[code] || ErrorCategory.VALIDATION_ERROR,
    message,
    details,
    recoverable: code !== PDFErrorCode.FILE_CORRUPTED,
  };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Check if file is a PDF by extension
 */
export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Check if file is an image
 */
export function isImageFile(file: File): boolean {
  return SUPPORTED_FILE_TYPES.IMAGES.some(type =>
    file.type === type || file.type.startsWith('image/')
  );
}
