/**
 * Image to PDF Processor
 * Requirements: 5.1
 * 
 * Converts images (JPG, PNG, WebP, BMP, TIFF, SVG, HEIC) to PDF.
 * Supports multiple images combined into a single PDF.
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
 * Page size presets in points (72 points = 1 inch)
 */
export const PAGE_SIZES = {
  A4: { width: 595.28, height: 841.89 },
  LETTER: { width: 612, height: 792 },
  LEGAL: { width: 612, height: 1008 },
  A3: { width: 841.89, height: 1190.55 },
  A5: { width: 419.53, height: 595.28 },
  FIT: { width: 0, height: 0 }, // Fit to image size
} as const;

export type PageSizeType = keyof typeof PAGE_SIZES;

/**
 * Image to PDF options
 */
export interface ImageToPDFOptions {
  /** Page size preset or custom dimensions */
  pageSize: PageSizeType | { width: number; height: number };
  /** Page orientation */
  orientation: 'portrait' | 'landscape' | 'auto';
  /** Margin in points */
  margin: number;
  /** Image quality (0-1) for JPEG compression */
  quality: number;
  /** Whether to center images on the page */
  centerImage: boolean;
  /** Whether to scale images to fit the page */
  scaleToFit: boolean;
  /** SVG render scale for quality (1-4) */
  svgScale: number;
  /** Whether to enable batch mode (split into multiple PDFs) */
  batchMode?: boolean;
  /** Number of images per PDF file in batch mode */
  imagesPerPdf?: number;
}

/**
 * Batch export result
 */
export interface BatchExportResult {
  /** The ZIP file containing all PDFs */
  zipBlob: Blob;
  /** Number of PDF files created */
  pdfCount: number;
  /** Total number of images processed */
  imageCount: number;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: ImageToPDFOptions = {
  pageSize: 'A4',
  orientation: 'auto',
  margin: 36, // 0.5 inch
  quality: 0.92,
  centerImage: true,
  scaleToFit: true,
  svgScale: 2,
  batchMode: false,
  imagesPerPdf: 10,
};

/**
 * Supported image MIME types
 */
const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'image/svg+xml',
  'image/heic',
  'image/heif',
];

/**
 * Supported file extensions
 */
const SUPPORTED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp', '.bmp',
  '.tiff', '.tif', '.svg', '.heic', '.heif'
];


/**
 * Image to PDF Processor
 * Converts multiple images to a single PDF document.
 */
export class ImageToPDFProcessor extends BasePDFProcessor {
  /**
   * Process images and convert to PDF
   */
  async process(
    input: ProcessInput,
    onProgress?: ProgressCallback
  ): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;
    const pdfOptions: ImageToPDFOptions = {
      ...DEFAULT_OPTIONS,
      ...(options as Partial<ImageToPDFOptions>),
    };

    // Validate we have at least 1 file
    if (files.length < 1) {
      return this.createErrorOutput(
        PDFErrorCode.INVALID_OPTIONS,
        'At least 1 image file is required.',
        `Received ${files.length} file(s).`
      );
    }

    // Validate file types
    for (const file of files) {
      if (!this.isValidImageFile(file)) {
        return this.createErrorOutput(
          PDFErrorCode.FILE_TYPE_INVALID,
          `Invalid file type: ${file.name}`,
          'Supported formats: JPG, PNG, WebP, BMP, TIFF, SVG, HEIC'
        );
      }
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

      this.updateProgress(10, 'Creating PDF document...');

      // Create a new PDF document
      const pdfDoc = await pdfLib.PDFDocument.create();

      // Process each image
      const progressPerFile = 80 / files.length;

      for (let i = 0; i < files.length; i++) {
        if (this.checkCancelled()) {
          return this.createErrorOutput(
            PDFErrorCode.PROCESSING_CANCELLED,
            'Processing was cancelled.'
          );
        }

        const file = files[i];
        const fileProgress = 10 + (i * progressPerFile);

        this.updateProgress(
          fileProgress,
          `Processing image ${i + 1} of ${files.length}: ${file.name}`
        );

        try {
          await this.addImageToDocument(pdfDoc, file, pdfOptions, pdfLib);
        } catch (error) {
          return this.createErrorOutput(
            PDFErrorCode.PROCESSING_FAILED,
            `Failed to process image "${file.name}".`,
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
      }

      this.updateProgress(95, 'Saving PDF...');

      // Save the PDF
      const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });

      this.updateProgress(100, 'Complete!');

      // Generate output filename
      const outputFilename = this.generateOutputFilename(files);

      return this.createSuccessOutput(blob, outputFilename, {
        pageCount: files.length,
        imageCount: files.length,
      });

    } catch (error) {
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Failed to convert images to PDF.',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Check if file is a valid image
   */
  private isValidImageFile(file: File): boolean {
    // Check MIME type
    if (SUPPORTED_MIME_TYPES.includes(file.type)) {
      return true;
    }

    // Check extension as fallback
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
  }

  /**
   * Add an image to the PDF document
   */
  private async addImageToDocument(
    pdfDoc: Awaited<ReturnType<typeof loadPdfLib>>['PDFDocument'] extends { create(): Promise<infer T> } ? T : never,
    file: File,
    options: ImageToPDFOptions,
    pdfLib: Awaited<ReturnType<typeof loadPdfLib>>
  ): Promise<void> {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Determine image type and embed
    let image: Awaited<ReturnType<typeof pdfDoc.embedJpg>>;
    const fileType = file.type.toLowerCase();
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    try {
      if (fileType === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg') {
        image = await pdfDoc.embedJpg(uint8Array);
      } else if (fileType === 'image/png' || ext === 'png') {
        image = await pdfDoc.embedPng(uint8Array);
      } else {
        throw new Error('Format requires conversion');
      }
    } catch {
      // Fallback: convert to PNG via canvas
      // This handles cases where extension doesn't match content (e.g. jpg renamed to png)
      // or formats not natively supported by pdf-lib
      const isSvg = fileType === 'image/svg+xml' || ext === 'svg';
      image = await this.convertAndEmbedImage(pdfDoc, file, pdfLib, isSvg ? options.svgScale : 1);
    }

    // Calculate page dimensions
    const { pageWidth, pageHeight } = this.calculatePageDimensions(
      image.width,
      image.height,
      options
    );

    // Add page
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Calculate image position and size
    const { x, y, width, height } = this.calculateImagePlacement(
      image.width,
      image.height,
      pageWidth,
      pageHeight,
      options
    );

    // Draw image
    page.drawImage(image, {
      x,
      y,
      width,
      height,
    });
  }

  /**
   * Convert image to PNG and embed (for formats not natively supported by pdf-lib)
   */
  private async convertAndEmbedImage(
    pdfDoc: Awaited<ReturnType<typeof loadPdfLib>>['PDFDocument'] extends { create(): Promise<infer T> } ? T : never,
    file: File,
    _pdfLib: Awaited<ReturnType<typeof loadPdfLib>>,
    scale: number = 1
  ): Promise<Awaited<ReturnType<typeof pdfDoc.embedPng>>> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = async () => {
        try {
          // Create canvas with scale for higher quality (especially for SVG)
          const canvas = document.createElement('canvas');
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Failed to get canvas context');
          }

          // Scale the context for higher quality rendering
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0);

          // Convert to PNG blob
          const pngBlob = await new Promise<Blob>((res, rej) => {
            canvas.toBlob(
              (blob) => blob ? res(blob) : rej(new Error('Failed to convert to PNG')),
              'image/png'
            );
          });

          // Embed PNG
          const pngArrayBuffer = await pngBlob.arrayBuffer();
          const pngImage = await pdfDoc.embedPng(new Uint8Array(pngArrayBuffer));

          URL.revokeObjectURL(url);
          resolve(pngImage);
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to load image: ${file.name}`));
      };

      img.src = url;
    });
  }

  /**
   * Calculate page dimensions based on options
   */
  private calculatePageDimensions(
    imageWidth: number,
    imageHeight: number,
    options: ImageToPDFOptions
  ): { pageWidth: number; pageHeight: number } {
    let pageWidth: number;
    let pageHeight: number;

    // Get base page size
    if (typeof options.pageSize === 'string') {
      const preset = PAGE_SIZES[options.pageSize];
      if (options.pageSize === 'FIT') {
        // Fit to image size plus margins
        pageWidth = imageWidth + (options.margin * 2);
        pageHeight = imageHeight + (options.margin * 2);
      } else {
        pageWidth = preset.width;
        pageHeight = preset.height;
      }
    } else {
      pageWidth = options.pageSize.width;
      pageHeight = options.pageSize.height;
    }

    // Handle orientation
    if (options.orientation === 'landscape') {
      if (pageWidth < pageHeight) {
        [pageWidth, pageHeight] = [pageHeight, pageWidth];
      }
    } else if (options.orientation === 'portrait') {
      if (pageWidth > pageHeight) {
        [pageWidth, pageHeight] = [pageHeight, pageWidth];
      }
    } else if (options.orientation === 'auto') {
      // Match page orientation to image orientation
      const imageIsLandscape = imageWidth > imageHeight;
      const pageIsLandscape = pageWidth > pageHeight;

      if (imageIsLandscape !== pageIsLandscape && typeof options.pageSize === 'string' && options.pageSize !== 'FIT') {
        [pageWidth, pageHeight] = [pageHeight, pageWidth];
      }
    }

    return { pageWidth, pageHeight };
  }

  /**
   * Calculate image placement on the page
   */
  private calculateImagePlacement(
    imageWidth: number,
    imageHeight: number,
    pageWidth: number,
    pageHeight: number,
    options: ImageToPDFOptions
  ): { x: number; y: number; width: number; height: number } {
    const availableWidth = pageWidth - (options.margin * 2);
    const availableHeight = pageHeight - (options.margin * 2);

    let width = imageWidth;
    let height = imageHeight;

    // Scale to fit if needed
    if (options.scaleToFit) {
      const scaleX = availableWidth / imageWidth;
      const scaleY = availableHeight / imageHeight;
      const scale = Math.min(scaleX, scaleY, 1); // Don't upscale

      width = imageWidth * scale;
      height = imageHeight * scale;
    }

    // Calculate position
    let x = options.margin;
    let y = options.margin;

    if (options.centerImage) {
      x = (pageWidth - width) / 2;
      y = (pageHeight - height) / 2;
    }

    return { x, y, width, height };
  }

  /**
   * Generate output filename
   */
  private generateOutputFilename(files: File[]): string {
    if (files.length === 1) {
      const baseName = files[0].name.replace(/\.[^/.]+$/, '');
      return `${baseName}.pdf`;
    }
    return `images_${files.length}_pages.pdf`;
  }

  /**
   * Get accepted file types
   */
  protected getAcceptedTypes(): string[] {
    return SUPPORTED_MIME_TYPES;
  }
}

/**
 * Create a new instance of the image to PDF processor
 */
export function createImageToPDFProcessor(): ImageToPDFProcessor {
  return new ImageToPDFProcessor();
}

/**
 * Convert images to PDF (convenience function)
 */
export async function imagesToPDF(
  files: File[],
  options?: Partial<ImageToPDFOptions>,
  onProgress?: ProgressCallback
): Promise<ProcessOutput> {
  const processor = createImageToPDFProcessor();
  return processor.process(
    {
      files,
      options: options || {},
    },
    onProgress
  );
}

/**
 * Convert images to multiple PDFs based on batch size and package as ZIP
 */
export async function imagesToPDFBatch(
  files: File[],
  imagesPerPdf: number,
  options?: Partial<ImageToPDFOptions>,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; result?: BatchExportResult; error?: { message: string } }> {
  try {
    // Dynamically import JSZip
    const JSZip = (await import('jszip')).default;

    const totalImages = files.length;
    const batchCount = Math.ceil(totalImages / imagesPerPdf);
    const zip = new JSZip();

    onProgress?.(5, 'Creating batch PDFs...');

    const processor = createImageToPDFProcessor();

    for (let i = 0; i < batchCount; i++) {
      const startIndex = i * imagesPerPdf;
      const endIndex = Math.min(startIndex + imagesPerPdf, totalImages);
      const batchFiles = files.slice(startIndex, endIndex);

      const progressStart = 5 + (i / batchCount) * 85;
      const progressEnd = 5 + ((i + 1) / batchCount) * 85;

      onProgress?.(
        progressStart,
        `Processing batch ${i + 1} of ${batchCount} (images ${startIndex + 1}-${endIndex})...`
      );

      const result = await processor.process(
        {
          files: batchFiles,
          options: options || {},
        },
        (prog, message) => {
          // Map the individual progress to the batch range
          const mappedProgress = progressStart + (prog / 100) * (progressEnd - progressStart);
          onProgress?.(mappedProgress, message);
        }
      );

      if (!result.success || !result.result) {
        return {
          success: false,
          error: { message: result.error?.message || `Failed to create PDF for batch ${i + 1}` },
        };
      }

      // Add PDF to ZIP
      const pdfBlob = result.result as Blob;
      const pdfArrayBuffer = await pdfBlob.arrayBuffer();
      const paddedIndex = String(i + 1).padStart(String(batchCount).length, '0');
      zip.file(`images_part_${paddedIndex}.pdf`, pdfArrayBuffer);
    }

    onProgress?.(92, 'Creating ZIP archive...');

    // Generate ZIP file
    const zipBlob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      (metadata) => {
        const zipProgress = 92 + (metadata.percent / 100) * 8;
        onProgress?.(zipProgress, `Compressing: ${Math.round(metadata.percent)}%`);
      }
    );

    onProgress?.(100, 'Complete!');

    return {
      success: true,
      result: {
        zipBlob,
        pdfCount: batchCount,
        imageCount: totalImages,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: { message: error instanceof Error ? error.message : 'Failed to create batch PDFs' },
    };
  }
}
