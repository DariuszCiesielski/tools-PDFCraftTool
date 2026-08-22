/**
 * PDF Extract Pages Processor
 * Requirements: 5.1
 * 
 * Implements PDF page extraction functionality using pdf-lib.
 * Supports extracting specific pages into a new PDF.
 */

import type {
  ProcessInput,
  ProcessOutput,
  ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import { loadPdfLib } from '../loader';

/**
 * Extract options for page extraction
 */
export interface ExtractOptions {
  /** Pages to extract (1-based page numbers) */
  pages: number[];
}

/**
 * Default extract options
 */
const DEFAULT_EXTRACT_OPTIONS: ExtractOptions = {
  pages: [],
};

/**
 * Extract Pages PDF Processor
 * Extracts specific pages from a PDF document into a new PDF.
 */
export class ExtractPagesPDFProcessor extends BasePDFProcessor {
  /**
   * Process a PDF file and extract specified pages
   */
  async process(
    input: ProcessInput,
    onProgress?: ProgressCallback
  ): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;
    const extractOptions: ExtractOptions = {
      ...DEFAULT_EXTRACT_OPTIONS,
      ...(options as Partial<ExtractOptions>),
    };

    // Validate we have exactly 1 file
    if (files.length !== 1) {
      return this.createErrorOutput(
        PDFErrorCode.INVALID_OPTIONS,
        'Exactly 1 PDF file is required for extraction.',
        `Received ${files.length} file(s).`
      );
    }

    // Validate pages are provided
    if (!extractOptions.pages || extractOptions.pages.length === 0) {
      return this.createErrorOutput(
        PDFErrorCode.INVALID_OPTIONS,
        'At least one page is required for extraction.',
        'Please specify pages to extract.'
      );
    }

    try {
      this.updateProgress(5, 'Loading PDF library...');

      const pdfLib = await loadPdfLib();

      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.'
        );
      }

      this.updateProgress(10, 'Loading source PDF...');

      const file = files[0];
      const arrayBuffer = await file.arrayBuffer();

      // Load the source PDF
      let sourcePdf;
      try {
        sourcePdf = await pdfLib.PDFDocument.load(arrayBuffer, {
          ignoreEncryption: false,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('encrypt')) {
          return this.createErrorOutput(
            PDFErrorCode.PDF_ENCRYPTED,
            'The PDF file is encrypted.',
            'Please decrypt the file before extracting pages.'
          );
        }
        throw error;
      }

      const totalPages = sourcePdf.getPageCount();
      this.updateProgress(20, `Source PDF has ${totalPages} pages.`);

      // Validate pages
      const validationError = validatePages(extractOptions.pages, totalPages);
      if (validationError) {
        return this.createErrorOutput(
          PDFErrorCode.INVALID_PAGE_RANGE,
          validationError,
          `The PDF has ${totalPages} pages.`
        );
      }

      // Remove duplicates and sort
      const uniquePages = [...new Set(extractOptions.pages)].sort((a, b) => a - b);

      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.'
        );
      }

      this.updateProgress(30, 'Creating new document...');

      // Create a new PDF document
      const newPdf = await pdfLib.PDFDocument.create();

      // Copy pages
      const progressPerPage = 60 / uniquePages.length;

      for (let i = 0; i < uniquePages.length; i++) {
        if (this.checkCancelled()) {
          return this.createErrorOutput(
            PDFErrorCode.PROCESSING_CANCELLED,
            'Processing was cancelled.'
          );
        }

        const pageNum = uniquePages[i];
        const pageIndex = pageNum - 1; // Convert to 0-based index

        this.updateProgress(
          30 + (i * progressPerPage),
          `Extracting page ${pageNum}...`
        );

        const [copiedPage] = await newPdf.copyPages(sourcePdf, [pageIndex]);
        newPdf.addPage(copiedPage);
      }

      this.updateProgress(90, 'Saving extracted pages...');

      // Save the new PDF
      const pdfBytes = await newPdf.save({ useObjectStreams: true });
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });

      this.updateProgress(100, 'Complete!');

      // Generate output filename
      const outputFilename = generateExtractedFilename(file.name, uniquePages);

      return this.createSuccessOutput(blob, outputFilename, {
        extractedPageCount: uniquePages.length,
        originalPageCount: totalPages,
        extractedPages: uniquePages,
      });

    } catch (error) {
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Failed to extract pages from PDF file.',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Get accepted file types for extract processor
   */
  protected getAcceptedTypes(): string[] {
    return ['application/pdf'];
  }
}

/**
 * Validate pages array
 */
function validatePages(pages: number[], totalPages: number): string | null {
  if (pages.length === 0) {
    return 'No pages specified for extraction.';
  }

  for (let i = 0; i < pages.length; i++) {
    const pageNum = pages[i];

    if (!Number.isInteger(pageNum)) {
      return `Invalid page number: ${pageNum}`;
    }

    if (pageNum < 1) {
      return `Page number must be at least 1. Found ${pageNum}.`;
    }

    if (pageNum > totalPages) {
      return `Page ${pageNum} exceeds total pages (${totalPages}).`;
    }
  }

  return null;
}

/**
 * Get filename without extension
 */
function getFileNameWithoutExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return filename;
  return filename.slice(0, lastDot);
}

/**
 * Generate a filename for the extracted PDF
 */
function generateExtractedFilename(originalName: string, pages: number[]): string {
  const baseName = getFileNameWithoutExtension(originalName);

  if (pages.length === 1) {
    return `${baseName}_page_${pages[0]}.pdf`;
  }

  if (pages.length <= 3) {
    return `${baseName}_pages_${pages.join('-')}.pdf`;
  }

  return `${baseName}_${pages.length}_pages_extracted.pdf`;
}

/**
 * Parse page selection string into array of page numbers
 * Supports formats like: "1,3,5", "1-5", "1-3,5,7-10"
 */
export function parsePageSelection(selectionString: string, totalPages: number): number[] {
  const pages: number[] = [];
  const parts = selectionString.split(',').map(s => s.trim()).filter(s => s.length > 0);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map(s => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = start; i <= Math.min(end, totalPages); i++) {
          if (i >= 1) pages.push(i);
        }
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        pages.push(pageNum);
      }
    }
  }

  // Remove duplicates and sort
  return [...new Set(pages)].sort((a, b) => a - b);
}

/**
 * Create a new instance of the extract processor
 */
export function createExtractProcessor(): ExtractPagesPDFProcessor {
  return new ExtractPagesPDFProcessor();
}

/**
 * Extract pages from a PDF file (convenience function)
 */
export async function extractPages(
  file: File,
  pages: number[],
  onProgress?: ProgressCallback
): Promise<ProcessOutput> {
  const processor = createExtractProcessor();
  return processor.process(
    {
      files: [file],
      options: { pages },
    },
    onProgress
  );
}
