/**
 * PDF to Greyscale Processor
 * Requirements: 5.1
 * 
 * Converts PDF pages to greyscale by rendering each page
 * and re-embedding as greyscale images.
 */

import type {
  ProcessInput,
  ProcessOutput,
  ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import { loadPdfLib, loadPdfjs } from '../loader';

/**
 * PDF to Greyscale options
 */
export interface PDFToGreyscaleOptions {
  /** Scale factor for rendering (affects quality) */
  scale: number;
  /** Specific pages to convert (empty = all pages) */
  pages: number[];
  /** Greyscale method */
  method: 'luminosity' | 'average' | 'lightness';
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: PDFToGreyscaleOptions = {
  scale: 2, // 144 DPI
  pages: [], // All pages
  method: 'luminosity',
};

/**
 * PDF to Greyscale Processor
 * Converts PDF pages to greyscale.
 */
export class PDFToGreyscaleProcessor extends BasePDFProcessor {
  /**
   * Process PDF and convert to greyscale
   */
  async process(
    input: ProcessInput,
    onProgress?: ProgressCallback
  ): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;
    const greyscaleOptions: PDFToGreyscaleOptions = {
      ...DEFAULT_OPTIONS,
      ...(options as Partial<PDFToGreyscaleOptions>),
    };

    // Validate we have exactly 1 PDF file
    if (files.length !== 1) {
      return this.createErrorOutput(
        PDFErrorCode.INVALID_OPTIONS,
        'Please provide exactly one PDF file.',
        `Received ${files.length} file(s).`
      );
    }

    const file = files[0];

    // Validate file type
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      return this.createErrorOutput(
        PDFErrorCode.FILE_TYPE_INVALID,
        'Invalid file type. Please upload a PDF file.',
        `Received: ${file.type || 'unknown'}`
      );
    }

    try {
      this.updateProgress(5, 'Loading PDF libraries...');

      const [pdfLib, pdfjs] = await Promise.all([loadPdfLib(), loadPdfjs()]);

      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.'
        );
      }

      this.updateProgress(10, 'Loading PDF document...');

      // Load the source PDF
      const arrayBuffer = await file.arrayBuffer();
      const sourcePdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const totalPages = sourcePdf.numPages;

      // Create new PDF document
      const newPdfDoc = await pdfLib.PDFDocument.create();

      // Determine which pages to convert
      const pagesToConvert = greyscaleOptions.pages.length > 0
        ? greyscaleOptions.pages.filter(p => p >= 1 && p <= totalPages)
        : Array.from({ length: totalPages }, (_, i) => i + 1);

      if (pagesToConvert.length === 0) {
        return this.createErrorOutput(
          PDFErrorCode.INVALID_PAGE_RANGE,
          'No valid pages to convert.',
          `PDF has ${totalPages} pages.`
        );
      }

      this.updateProgress(15, `Converting ${pagesToConvert.length} page(s) to greyscale...`);

      const progressPerPage = 80 / pagesToConvert.length;

      for (let i = 0; i < pagesToConvert.length; i++) {
        if (this.checkCancelled()) {
          return this.createErrorOutput(
            PDFErrorCode.PROCESSING_CANCELLED,
            'Processing was cancelled.'
          );
        }

        const pageNum = pagesToConvert[i];
        const pageProgress = 15 + (i * progressPerPage);

        this.updateProgress(
          pageProgress,
          `Converting page ${pageNum} of ${totalPages} to greyscale...`
        );

        try {
          await this.convertPageToGreyscale(
            sourcePdf,
            newPdfDoc,
            pageNum,
            greyscaleOptions,
            pdfLib
          );
        } catch (error) {
          return this.createErrorOutput(
            PDFErrorCode.PROCESSING_FAILED,
            `Failed to convert page ${pageNum} to greyscale.`,
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
      }

      this.updateProgress(95, 'Saving PDF...');

      // Save the new PDF
      const pdfBytes = await newPdfDoc.save({ useObjectStreams: true });
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });

      this.updateProgress(100, 'Complete!');

      // Generate output filename
      const baseName = file.name.replace(/\.pdf$/i, '');
      const outputFilename = `${baseName}_greyscale.pdf`;

      return this.createSuccessOutput(blob, outputFilename, {
        pageCount: pagesToConvert.length,
        method: greyscaleOptions.method,
      });

    } catch (error) {
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Failed to convert PDF to greyscale.',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }


  /**
   * Convert a single page to greyscale and add to new PDF
   */
  private async convertPageToGreyscale(
    sourcePdf: Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfjs>>['getDocument']>['promise']>,
    newPdfDoc: Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfLib>>['PDFDocument']['create']>>,
    pageNum: number,
    options: PDFToGreyscaleOptions,
    _pdfLib: Awaited<ReturnType<typeof loadPdfLib>>
  ): Promise<void> {
    const page = await sourcePdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: options.scale });

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render PDF page to canvas
    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    // Convert to greyscale
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    this.applyGreyscale(imageData, options.method);
    ctx.putImageData(imageData, 0, 0);

    // Convert canvas to PNG blob
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Failed to create image')),
        'image/png'
      );
    });

    // Embed image in new PDF
    const pngArrayBuffer = await pngBlob.arrayBuffer();
    const pngImage = await newPdfDoc.embedPng(new Uint8Array(pngArrayBuffer));

    // Calculate page dimensions (convert back to PDF points)
    const pageWidth = viewport.width / options.scale;
    const pageHeight = viewport.height / options.scale;

    // Add page with the greyscale image
    const newPage = newPdfDoc.addPage([pageWidth, pageHeight]);
    newPage.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });
  }

  /**
   * Apply greyscale conversion to image data
   */
  private applyGreyscale(imageData: ImageData, method: PDFToGreyscaleOptions['method']): void {
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      let grey: number;

      switch (method) {
        case 'luminosity':
          // ITU-R BT.709 formula (most accurate for human perception)
          grey = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
          break;
        case 'average':
          // Simple average
          grey = Math.round((r + g + b) / 3);
          break;
        case 'lightness':
          // HSL lightness
          grey = Math.round((Math.max(r, g, b) + Math.min(r, g, b)) / 2);
          break;
        default:
          grey = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      }

      data[i] = grey;     // R
      data[i + 1] = grey; // G
      data[i + 2] = grey; // B
      // Alpha (data[i + 3]) remains unchanged
    }
  }
}

/**
 * Create a new instance of the PDF to greyscale processor
 */
export function createPDFToGreyscaleProcessor(): PDFToGreyscaleProcessor {
  return new PDFToGreyscaleProcessor();
}

/**
 * Convert PDF to greyscale (convenience function)
 */
export async function pdfToGreyscale(
  file: File,
  options?: Partial<PDFToGreyscaleOptions>,
  onProgress?: ProgressCallback
): Promise<ProcessOutput> {
  const processor = createPDFToGreyscaleProcessor();
  return processor.process(
    {
      files: [file],
      options: options || {},
    },
    onProgress
  );
}
