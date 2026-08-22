/**
 * PDF to Image Processor
 * Requirements: 5.1
 * 
 * Converts PDF pages to images (JPG, PNG, WebP, BMP, TIFF).
 * Uses pdfjs-dist for rendering PDF pages to canvas.
 */

import type {
  ProcessInput,
  ProcessOutput,
  ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import { loadPdfjs } from '../loader';

/**
 * Supported output image formats
 */
export type ImageFormat = 'png' | 'jpg' | 'jpeg' | 'webp' | 'bmp' | 'tiff';

/**
 * Page layout preset types
 */
export type PageLayoutPreset = '1x1' | '2x1' | '1x2' | '2x2' | '3x3' | 'custom';

/**
 * Page layout options for combining multiple pages into one image
 */
export interface PageLayoutOptions {
  /** Layout preset or 'custom' for manual configuration */
  preset: PageLayoutPreset;
  /** Number of columns (pages per row) */
  columns: number;
  /** Number of rows (pages per column) */
  rows: number;
  /** Skip first page (treat as cover) - renders first page alone */
  skipFirstPage: boolean;
}

/**
 * PDF to Image options
 */
export interface PDFToImageOptions {
  /** Output image format */
  format: ImageFormat;
  /** Image quality (0-1) for lossy formats like JPEG/WebP */
  quality: number;
  /** Scale factor for rendering (1 = 72 DPI, 2 = 144 DPI, etc.) */
  scale: number;
  /** Specific pages to convert (empty = all pages) */
  pages: number[];
  /** Background color for transparent PDFs (hex color) */
  backgroundColor: string;
  /** Page layout options for combining pages */
  pageLayout: PageLayoutOptions;
}

/**
 * Default page layout options
 */
const DEFAULT_PAGE_LAYOUT: PageLayoutOptions = {
  preset: '1x1',
  columns: 1,
  rows: 1,
  skipFirstPage: false,
};

/**
 * Default options
 */
const DEFAULT_OPTIONS: PDFToImageOptions = {
  format: 'png',
  quality: 0.92,
  scale: 2, // 144 DPI
  pages: [], // All pages
  backgroundColor: '#ffffff',
  pageLayout: DEFAULT_PAGE_LAYOUT,
};

/**
 * MIME types for each format
 */
const FORMAT_MIME_TYPES: Record<ImageFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
};

/**
 * File extensions for each format
 */
const FORMAT_EXTENSIONS: Record<ImageFormat, string> = {
  png: '.png',
  jpg: '.jpg',
  jpeg: '.jpg',
  webp: '.webp',
  bmp: '.bmp',
  tiff: '.tiff',
};


/**
 * PDF to Image Processor
 * Converts PDF pages to images using pdfjs-dist for rendering.
 */
export class PDFToImageProcessor extends BasePDFProcessor {
  /**
   * Process PDF and convert to images
   */
  async process(
    input: ProcessInput,
    onProgress?: ProgressCallback
  ): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;
    const imageOptions: PDFToImageOptions = {
      ...DEFAULT_OPTIONS,
      ...(options as Partial<PDFToImageOptions>),
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
      this.updateProgress(5, 'Loading PDF library...');

      const pdfjs = await loadPdfjs();

      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.'
        );
      }

      this.updateProgress(10, 'Loading PDF document...');

      // Load the PDF document
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;

      // Determine which pages to convert
      const requestedPages = imageOptions.pages ?? [];
      const pagesToConvert = requestedPages.length > 0
        ? requestedPages.filter(p => p >= 1 && p <= totalPages)
        : Array.from({ length: totalPages }, (_, i) => i + 1);

      if (pagesToConvert.length === 0) {
        return this.createErrorOutput(
          PDFErrorCode.INVALID_PAGE_RANGE,
          'No valid pages to convert.',
          `PDF has ${totalPages} pages.`
        );
      }

      this.updateProgress(15, `Converting ${pagesToConvert.length} page(s)...`);

      const images: Blob[] = [];
      const layout = imageOptions.pageLayout;
      const pagesPerImage = layout.columns * layout.rows;
      const isSinglePage = pagesPerImage === 1;

      if (isSinglePage) {
        // Single page mode (original behavior)
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
            `Converting page ${pageNum} of ${totalPages}...`
          );

          try {
            const imageBlob = await this.renderPageToImage(
              pdf,
              pageNum,
              imageOptions
            );
            images.push(imageBlob);
          } catch (error) {
            return this.createErrorOutput(
              PDFErrorCode.PROCESSING_FAILED,
              `Failed to convert page ${pageNum}.`,
              error instanceof Error ? error.message : 'Unknown error'
            );
          }
        }
      } else {
        // Grid layout mode - combine multiple pages into one image
        const skipFirst = layout.skipFirstPage;
        const pageGroups: number[][] = [];

        let startIndex = 0;
        if (skipFirst && pagesToConvert.length > 0) {
          // First page is rendered alone (cover page)
          pageGroups.push([pagesToConvert[0]]);
          startIndex = 1;
        }

        // Group remaining pages according to grid layout
        for (let i = startIndex; i < pagesToConvert.length; i += pagesPerImage) {
          const group: number[] = [];
          for (let j = 0; j < pagesPerImage && (i + j) < pagesToConvert.length; j++) {
            group.push(pagesToConvert[i + j]);
          }
          pageGroups.push(group);
        }

        const progressPerGroup = 80 / pageGroups.length;

        for (let i = 0; i < pageGroups.length; i++) {
          if (this.checkCancelled()) {
            return this.createErrorOutput(
              PDFErrorCode.PROCESSING_CANCELLED,
              'Processing was cancelled.'
            );
          }

          const group = pageGroups[i];
          const groupProgress = 15 + (i * progressPerGroup);

          // Check if this is a single page group (cover or last incomplete group)

          if (group.length === 1) {
            // Single page - use standard rendering
            this.updateProgress(
              groupProgress,
              `Converting page ${group[0]}...`
            );
            try {
              const imageBlob = await this.renderPageToImage(
                pdf,
                group[0],
                imageOptions
              );
              images.push(imageBlob);
            } catch (error) {
              return this.createErrorOutput(
                PDFErrorCode.PROCESSING_FAILED,
                `Failed to convert page ${group[0]}.`,
                error instanceof Error ? error.message : 'Unknown error'
              );
            }
          } else {
            // Multiple pages - use grid rendering
            const pageRange = `${group[0]}-${group[group.length - 1]}`;
            this.updateProgress(
              groupProgress,
              `Converting pages ${pageRange}...`
            );
            try {
              const imageBlob = await this.renderGridPagesToImage(
                pdf,
                group,
                layout.columns,
                layout.rows,
                imageOptions
              );
              images.push(imageBlob);
            } catch (error) {
              return this.createErrorOutput(
                PDFErrorCode.PROCESSING_FAILED,
                `Failed to convert pages ${pageRange}.`,
                error instanceof Error ? error.message : 'Unknown error'
              );
            }
          }
        }
      }

      this.updateProgress(95, 'Finalizing...');

      // Generate output
      const baseName = file.name.replace(/\.pdf$/i, '');
      const ext = FORMAT_EXTENSIONS[imageOptions.format];
      const layoutSuffix = !isSinglePage ? `_${layout.columns}x${layout.rows}` : '';

      if (images.length === 1) {
        // Single image output
        this.updateProgress(100, 'Complete!');
        return this.createSuccessOutput(
          images[0],
          `${baseName}${layoutSuffix}${ext}`,
          { pageCount: 1, format: imageOptions.format, layout }
        );
      } else {
        // Multiple images output
        this.updateProgress(100, 'Complete!');
        return this.createSuccessOutput(
          images,
          `${baseName}${layoutSuffix}_pages${ext}`,
          { pageCount: images.length, format: imageOptions.format, layout }
        );
      }

    } catch (error) {
      console.error('[PDFToImage] Failed to convert PDF to images:', error);
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Failed to convert PDF to images.',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Render a single PDF page to an image blob
   */
  private async renderPageToImage(
    pdf: Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfjs>>['getDocument']>['promise']>,
    pageNum: number,
    options: PDFToImageOptions
  ): Promise<Blob> {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: options.scale });

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Fill background
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render PDF page to canvas
    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    // Convert canvas to blob
    const mimeType = FORMAT_MIME_TYPES[options.format];
    const quality = ['jpg', 'jpeg', 'webp'].includes(options.format)
      ? options.quality
      : undefined;

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create image blob'));
          }
        },
        mimeType,
        quality
      );
    });
  }

  /**
   * Render multiple PDF pages in a grid layout to a single image blob
   */
  private async renderGridPagesToImage(
    pdf: Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfjs>>['getDocument']>['promise']>,
    pageNums: number[],
    columns: number,
    rows: number,
    options: PDFToImageOptions
  ): Promise<Blob> {
    // Get all pages and their viewports
    const pages: Array<{ page: Awaited<ReturnType<typeof pdf.getPage>>; viewport: { width: number; height: number }; }> = [];

    for (const pageNum of pageNums) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: options.scale });
      pages.push({ page, viewport });
    }

    // Calculate cell dimensions (use the largest page dimensions)
    let maxCellWidth = 0;
    let maxCellHeight = 0;
    for (const { viewport } of pages) {
      maxCellWidth = Math.max(maxCellWidth, viewport.width);
      maxCellHeight = Math.max(maxCellHeight, viewport.height);
    }

    // Calculate total canvas dimensions
    const canvasWidth = maxCellWidth * columns;
    const canvasHeight = maxCellHeight * rows;

    // Create combined canvas
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Fill background
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render each page in its grid position
    for (let i = 0; i < pages.length; i++) {
      const { page, viewport } = pages[i];

      // Calculate grid position
      const col = i % columns;
      const row = Math.floor(i / columns);

      // Calculate offset within the cell (center the page)
      const cellX = col * maxCellWidth;
      const cellY = row * maxCellHeight;
      const xOffset = cellX + (maxCellWidth - viewport.width) / 2;
      const yOffset = cellY + (maxCellHeight - viewport.height) / 2;

      ctx.save();
      ctx.translate(xOffset, yOffset);
      await page.render({
        canvasContext: ctx,
        viewport: page.getViewport({ scale: options.scale }),
      }).promise;
      ctx.restore();
    }

    // Convert canvas to blob
    const mimeType = FORMAT_MIME_TYPES[options.format];
    const quality = ['jpg', 'jpeg', 'webp'].includes(options.format)
      ? options.quality
      : undefined;

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create image blob'));
          }
        },
        mimeType,
        quality
      );
    });
  }
}

/**
 * Create a new instance of the PDF to image processor
 */
export function createPDFToImageProcessor(): PDFToImageProcessor {
  return new PDFToImageProcessor();
}

/**
 * Convert PDF to images (convenience function)
 */
export async function pdfToImages(
  file: File,
  options?: Partial<PDFToImageOptions>,
  onProgress?: ProgressCallback
): Promise<ProcessOutput> {
  const processor = createPDFToImageProcessor();
  return processor.process(
    {
      files: [file],
      options: options || {},
    },
    onProgress
  );
}
