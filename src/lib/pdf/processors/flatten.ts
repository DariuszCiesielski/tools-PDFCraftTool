/**
 * PDF Flatten Processor
 * Requirements: 5.1
 * 
 * Implements PDF flattening functionality using pdf-lib.
 * Flattens form fields into the page content, making them non-editable.
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
 * Flatten PDF options
 */
export interface FlattenPDFOptions {
  /** Flatten form fields */
  flattenForms: boolean;
  /** Flatten annotations */
  flattenAnnotations?: boolean;
  /** Flatten layers */
  flattenLayers?: boolean;
}

/**
 * Default flatten options
 */
const DEFAULT_FLATTEN_OPTIONS: FlattenPDFOptions = {
  flattenForms: true,
  flattenAnnotations: true,
  flattenLayers: true,
};

/**
 * Flatten PDF Processor
 * Flattens form fields into static page content.
 */
export class FlattenPDFProcessor extends BasePDFProcessor {
  /**
   * Process PDF file and flatten it
   */
  async process(
    input: ProcessInput,
    onProgress?: ProgressCallback
  ): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;
    const flattenOptions: FlattenPDFOptions = {
      ...DEFAULT_FLATTEN_OPTIONS,
      ...(options as Partial<FlattenPDFOptions>),
    };

    // Validate we have exactly 1 file
    if (files.length !== 1) {
      return this.createErrorOutput(
        PDFErrorCode.INVALID_OPTIONS,
        'Please provide exactly one PDF file to flatten.',
        `Received ${files.length} file(s).`
      );
    }

    const file = files[0];

    try {
      this.updateProgress(5, 'Loading PDF library...');

      // Load pdf-lib
      const pdfLib = await loadPdfLib();

      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.'
        );
      }

      this.updateProgress(10, 'Reading PDF file...');

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      const originalSize = arrayBuffer.byteLength;

      this.updateProgress(20, 'Loading PDF document...');

      // Load the source PDF
      let pdfDoc;
      try {
        pdfDoc = await pdfLib.PDFDocument.load(arrayBuffer, {
          ignoreEncryption: true,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('encrypt')) {
          return this.createErrorOutput(
            PDFErrorCode.PDF_ENCRYPTED,
            'The PDF file is encrypted.',
            'Please decrypt the file before flattening.'
          );
        }
        throw error;
      }

      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.'
        );
      }

      this.updateProgress(30, 'Analyzing PDF structure...');

      const pageCount = pdfDoc.getPageCount();

      if (pageCount === 0) {
        return this.createErrorOutput(
          PDFErrorCode.PDF_MALFORMED,
          'The PDF file contains no pages.',
          'Cannot flatten an empty PDF.'
        );
      }

      // Track what was flattened
      const flattenedItems: string[] = [];
      let hasFormFields = false;

      this.updateProgress(50, 'Flattening form fields...');

      // Flatten form fields using pdf-lib's form.flatten() method
      if (flattenOptions.flattenForms) {
        try {
          const form = pdfDoc.getForm();
          const fields = form.getFields();

          if (fields.length > 0) {
            hasFormFields = true;
            form.flatten();
            flattenedItems.push(`${fields.length} form field(s)`);
          }
        } catch (e) {
          // PDF might not have a form or form might be malformed
          const err = e as Error;
          if (!err.message?.includes('getForm')) {
            console.warn('Could not flatten forms:', err.message);
          }
        }
      }

      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.'
        );
      }

      this.updateProgress(80, 'Saving flattened PDF...');

      // Save the flattened PDF
      const flattenedPdfBytes = await pdfDoc.save({ useObjectStreams: true });

      // Create blob from the Uint8Array
      const blob = new Blob([new Uint8Array(flattenedPdfBytes)], { type: 'application/pdf' });
      const newSize = flattenedPdfBytes.length;

      this.updateProgress(100, 'Complete!');

      // Generate output filename
      const outputFilename = generateFlattenedFilename(file.name);

      return this.createSuccessOutput(blob, outputFilename, {
        pageCount,
        originalSize,
        newSize,
        flattenedItems,
        hasFormFields,
        flattened: true,
      });

    } catch (error) {
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Failed to flatten PDF file.',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Get accepted file types for flatten processor
   */
  protected getAcceptedTypes(): string[] {
    return ['application/pdf'];
  }
}

/**
 * Generate a filename for the flattened PDF
 */
function generateFlattenedFilename(originalName: string): string {
  const lastDot = originalName.lastIndexOf('.');
  const baseName = lastDot === -1 ? originalName : originalName.slice(0, lastDot);
  return `${baseName}_flattened.pdf`;
}

/**
 * Create a new instance of the flatten processor
 */
export function createFlattenProcessor(): FlattenPDFProcessor {
  return new FlattenPDFProcessor();
}

/**
 * Flatten a PDF file (convenience function)
 */
export async function flattenPDF(
  file: File,
  options?: Partial<FlattenPDFOptions>,
  onProgress?: ProgressCallback
): Promise<ProcessOutput> {
  const processor = createFlattenProcessor();
  return processor.process(
    {
      files: [file],
      options: options || {},
    },
    onProgress
  );
}
