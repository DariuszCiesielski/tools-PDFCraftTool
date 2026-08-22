/**
 * PDF Error Handling System
 * Requirements: 5.5
 * 
 * Provides error handling utilities and localized error messages.
 */

import type { PDFError } from '@/types/pdf';
import { PDFErrorCode, ErrorCategory, ERROR_CODE_CATEGORY } from '@/types/pdf';

/**
 * Error message keys for i18n
 */
export const ERROR_MESSAGE_KEYS: Record<PDFErrorCode, string> = {
  [PDFErrorCode.FILE_TOO_LARGE]: 'errors.fileTooLarge',
  [PDFErrorCode.FILE_TYPE_INVALID]: 'errors.fileTypeInvalid',
  [PDFErrorCode.FILE_CORRUPTED]: 'errors.fileCorrupted',
  [PDFErrorCode.FILE_EMPTY]: 'errors.fileEmpty',
  [PDFErrorCode.FILE_NOT_PDF]: 'errors.fileNotPdf',
  [PDFErrorCode.PDF_ENCRYPTED]: 'errors.pdfEncrypted',
  [PDFErrorCode.PDF_MALFORMED]: 'errors.pdfMalformed',
  [PDFErrorCode.PROCESSING_TIMEOUT]: 'errors.processingTimeout',
  [PDFErrorCode.PROCESSING_CANCELLED]: 'errors.processingCancelled',
  [PDFErrorCode.PROCESSING_FAILED]: 'errors.processingFailed',
  [PDFErrorCode.INVALID_PASSWORD]: 'errors.invalidPassword',
  [PDFErrorCode.MEMORY_EXCEEDED]: 'errors.memoryExceeded',
  [PDFErrorCode.WORKER_FAILED]: 'errors.workerFailed',
  [PDFErrorCode.BROWSER_NOT_SUPPORTED]: 'errors.browserNotSupported',
  [PDFErrorCode.INVALID_PAGE_RANGE]: 'errors.invalidPageRange',
  [PDFErrorCode.INVALID_OPTIONS]: 'errors.invalidOptions',
  [PDFErrorCode.UNKNOWN]: 'errors.unknown',
};


/**
 * Default error messages (English) - used as fallback
 */
export const DEFAULT_ERROR_MESSAGES: Record<PDFErrorCode, string> = {
  [PDFErrorCode.FILE_TOO_LARGE]: 'File is too large. Maximum size is {maxSize}MB.',
  [PDFErrorCode.FILE_TYPE_INVALID]: 'Invalid file type. Please upload a {acceptedTypes} file.',
  [PDFErrorCode.FILE_CORRUPTED]: 'The file appears to be corrupted or unreadable.',
  [PDFErrorCode.FILE_EMPTY]: 'The file is empty.',
  [PDFErrorCode.FILE_NOT_PDF]: 'The file is not a valid PDF.',
  [PDFErrorCode.PDF_ENCRYPTED]: 'This PDF is password protected. Please decrypt it first.',
  [PDFErrorCode.PDF_MALFORMED]: 'The PDF structure is invalid. Try the repair tool first.',
  [PDFErrorCode.PROCESSING_TIMEOUT]: 'Operation took too long. Try with a smaller file.',
  [PDFErrorCode.PROCESSING_CANCELLED]: 'Operation was cancelled.',
  [PDFErrorCode.PROCESSING_FAILED]: 'Processing failed. Please try again.',
  [PDFErrorCode.INVALID_PASSWORD]: 'The password you entered is incorrect. Please check and try again.',
  [PDFErrorCode.MEMORY_EXCEEDED]: 'Browser ran out of memory. Close other tabs and try again.',
  [PDFErrorCode.WORKER_FAILED]: 'Processing worker crashed. Please refresh and try again.',
  [PDFErrorCode.BROWSER_NOT_SUPPORTED]: 'Your browser does not support this feature.',
  [PDFErrorCode.INVALID_PAGE_RANGE]: 'Invalid page range specified.',
  [PDFErrorCode.INVALID_OPTIONS]: 'Invalid options provided.',
  [PDFErrorCode.UNKNOWN]: 'An unexpected error occurred. Please try again.',
};

/**
 * Suggested actions for each error code
 */
export const ERROR_SUGGESTED_ACTIONS: Record<PDFErrorCode, string> = {
  [PDFErrorCode.FILE_TOO_LARGE]: 'Try compressing or splitting the file first.',
  [PDFErrorCode.FILE_TYPE_INVALID]: 'Please upload a valid PDF file.',
  [PDFErrorCode.FILE_CORRUPTED]: 'The file may be damaged. Try a different file.',
  [PDFErrorCode.FILE_EMPTY]: 'Please select a file with content.',
  [PDFErrorCode.FILE_NOT_PDF]: 'Please upload a PDF file.',
  [PDFErrorCode.PDF_ENCRYPTED]: 'Use the Decrypt PDF tool first.',
  [PDFErrorCode.PDF_MALFORMED]: 'Try using the Repair PDF tool first.',
  [PDFErrorCode.PROCESSING_TIMEOUT]: 'Try with a smaller file or fewer pages.',
  [PDFErrorCode.PROCESSING_CANCELLED]: 'You can start the operation again.',
  [PDFErrorCode.PROCESSING_FAILED]: 'Check your file and try again.',
  [PDFErrorCode.INVALID_PASSWORD]: 'Double-check the password and try again.',
  [PDFErrorCode.MEMORY_EXCEEDED]: 'Close other browser tabs and try again.',
  [PDFErrorCode.WORKER_FAILED]: 'Refresh the page and try again.',
  [PDFErrorCode.BROWSER_NOT_SUPPORTED]: 'Try using a modern browser like Chrome or Firefox.',
  [PDFErrorCode.INVALID_PAGE_RANGE]: 'Check the page numbers and try again.',
  [PDFErrorCode.INVALID_OPTIONS]: 'Check your settings and try again.',
  [PDFErrorCode.UNKNOWN]: 'Please try again or contact support.',
};

/**
 * Create a PDFError from an error code
 */
export function createError(
  code: PDFErrorCode,
  details?: string,
  params?: Record<string, string | number>
): PDFError {
  let message = DEFAULT_ERROR_MESSAGES[code] || DEFAULT_ERROR_MESSAGES[PDFErrorCode.UNKNOWN];
  
  // Replace placeholders in message
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      message = message.replace(`{${key}}`, String(value));
    });
  }

  return {
    code,
    category: ERROR_CODE_CATEGORY[code] || ErrorCategory.PROCESSING_ERROR,
    message,
    details,
    recoverable: isRecoverable(code),
    suggestedAction: ERROR_SUGGESTED_ACTIONS[code],
  };
}

/**
 * Check if an error is recoverable
 */
export function isRecoverable(code: PDFErrorCode): boolean {
  const nonRecoverableErrors: PDFErrorCode[] = [
    PDFErrorCode.FILE_CORRUPTED,
    PDFErrorCode.PDF_MALFORMED,
    PDFErrorCode.BROWSER_NOT_SUPPORTED,
  ];
  return !nonRecoverableErrors.includes(code);
}

/**
 * Get error severity level
 */
export function getErrorSeverity(code: PDFErrorCode): 'error' | 'warning' | 'info' {
  const warnings: PDFErrorCode[] = [
    PDFErrorCode.PROCESSING_CANCELLED,
    PDFErrorCode.PROCESSING_TIMEOUT,
  ];
  
  if (warnings.includes(code)) {
    return 'warning';
  }
  
  return 'error';
}

/**
 * Convert unknown error to PDFError
 */
export function toPDFError(error: unknown): PDFError {
  if (isPDFError(error)) {
    return error;
  }

  if (error instanceof Error) {
    // Check for specific error types
    if (error.name === 'QuotaExceededError') {
      return createError(PDFErrorCode.MEMORY_EXCEEDED, error.message);
    }
    if (error.message.includes('encrypted') || error.message.includes('password')) {
      return createError(PDFErrorCode.PDF_ENCRYPTED, error.message);
    }
    if (error.message.includes('timeout')) {
      return createError(PDFErrorCode.PROCESSING_TIMEOUT, error.message);
    }
    
    return createError(PDFErrorCode.PROCESSING_FAILED, error.message);
  }

  return createError(PDFErrorCode.UNKNOWN, String(error));
}

/**
 * Type guard for PDFError
 */
export function isPDFError(error: unknown): error is PDFError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'category' in error &&
    'message' in error
  );
}

/**
 * Get all error codes
 */
export function getAllErrorCodes(): PDFErrorCode[] {
  return Object.values(PDFErrorCode);
}

/**
 * Check if error code exists
 */
export function isValidErrorCode(code: string): code is PDFErrorCode {
  return Object.values(PDFErrorCode).includes(code as PDFErrorCode);
}
