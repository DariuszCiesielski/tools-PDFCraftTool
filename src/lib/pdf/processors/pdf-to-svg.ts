/**
 * PDF to SVG Processor
 * 
 * Converts PDF pages to SVG (Scalable Vector Graphics) format.
 * Uses pdfjs-dist for rendering PDF pages to canvas, then converts to SVG.
 */

import type {
    ProcessInput,
    ProcessOutput,
    ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import type { SVGGraphicsConstructor } from '../loader-legacy';

// Dynamic imports to avoid SSR issues with pdfjs-dist-legacy (which requires 'canvas' module)
async function loadPdfjsLegacy() {
    const legacy = await import('../loader-legacy');
    return legacy.loadPdfjsLegacy();
}

async function loadSVGGraphics(): Promise<SVGGraphicsConstructor> {
    const legacy = await import('../loader-legacy');
    return legacy.loadSVGGraphics();
}

/**
 * PDF to SVG options
 */
export interface PDFToSVGOptions {
    /** Scale factor for rendering (1 = 72 DPI, 2 = 144 DPI, etc.) */
    scale: number;
    /** Specific pages to convert (empty = all pages) */
    pages: number[];
    /** Background color for transparent PDFs (hex color) */
    backgroundColor: string;
    /** Whether to embed fonts in SVG */
    embedFonts: boolean;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: PDFToSVGOptions = {
    scale: 2, // 144 DPI
    pages: [], // All pages
    backgroundColor: '#ffffff',
    embedFonts: true,
};

/**
 * SVG output result
 */
export interface SVGResult {
    svg: string;
    blob: Blob;
    pageNumber: number;
    width: number;
    height: number;
}

/**
 * PDF to SVG Processor
 * Converts PDF pages to SVG using pdfjs-dist for rendering.
 */
export class PDFToSVGProcessor extends BasePDFProcessor {
    /**
     * Process PDF and convert to SVG
     */
    async process(
        input: ProcessInput,
        onProgress?: ProgressCallback
    ): Promise<ProcessOutput> {
        this.reset();
        this.onProgress = onProgress;

        const { files, options } = input;
        const svgOptions: PDFToSVGOptions = {
            ...DEFAULT_OPTIONS,
            ...(options as Partial<PDFToSVGOptions>),
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

            // Use legacy pdfjs-dist (v2.16.105) for SVGGraphics support
            const pdfjs = await loadPdfjsLegacy();

            if (this.checkCancelled()) {
                return this.createErrorOutput(
                    PDFErrorCode.PROCESSING_CANCELLED,
                    'Processing was cancelled.'
                );
            }

            this.updateProgress(10, 'Loading PDF document...');

            // Load the PDF document using legacy pdfjs
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
            const totalPages = pdf.numPages;

            // Determine which pages to convert
            const pagesToConvert = svgOptions.pages.length > 0
                ? svgOptions.pages.filter(p => p >= 1 && p <= totalPages)
                : Array.from({ length: totalPages }, (_, i) => i + 1);

            if (pagesToConvert.length === 0) {
                return this.createErrorOutput(
                    PDFErrorCode.INVALID_PAGE_RANGE,
                    'No valid pages to convert.',
                    `PDF has ${totalPages} pages.`
                );
            }

            this.updateProgress(15, `Converting ${pagesToConvert.length} page(s) to SVG...`);

            const svgResults: SVGResult[] = [];
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
                    const svgResult = await this.renderPageToSVG(
                        pdf,
                        pageNum,
                        svgOptions
                    );
                    svgResults.push(svgResult);
                } catch (error) {
                    return this.createErrorOutput(
                        PDFErrorCode.PROCESSING_FAILED,
                        `Failed to convert page ${pageNum}.`,
                        error instanceof Error ? error.message : 'Unknown error'
                    );
                }
            }

            this.updateProgress(95, 'Finalizing...');

            // Generate output
            const baseName = file.name.replace(/\.pdf$/i, '');
            const blobs = svgResults.map(r => r.blob);

            if (blobs.length === 1) {
                // Single SVG output
                this.updateProgress(100, 'Complete!');
                return this.createSuccessOutput(
                    blobs[0],
                    `${baseName}.svg`,
                    {
                        pageCount: 1,
                        format: 'svg',
                        svgResults: svgResults
                    }
                );
            } else {
                // Multiple SVGs output
                this.updateProgress(100, 'Complete!');
                return this.createSuccessOutput(
                    blobs,
                    `${baseName}_pages.svg`,
                    {
                        pageCount: blobs.length,
                        format: 'svg',
                        svgResults: svgResults
                    }
                );
            }

        } catch (error) {
            return this.createErrorOutput(
                PDFErrorCode.PROCESSING_FAILED,
                'Failed to convert PDF to SVG.',
                error instanceof Error ? error.message : 'Unknown error'
            );
        }
    }

    /**
     * Render a single PDF page to SVG using true vector rendering
     */
    private async renderPageToSVG(
        pdf: any, // PDF document from legacy pdfjs-dist
        pageNum: number,
        options: PDFToSVGOptions
    ): Promise<SVGResult> {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: options.scale });

        // Try to use SVGGraphics for true vector rendering
        try {
            const svgString = await this.renderPageToVectorSVG(page, viewport, options);
            const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });

            return {
                svg: svgString,
                blob: svgBlob,
                pageNumber: pageNum,
                width: viewport.width,
                height: viewport.height,
            };
        } catch (vectorError) {
            console.warn('Vector SVG rendering failed, falling back to canvas:', vectorError);
            // Fallback to canvas-based rendering
            return this.renderPageToRasterSVG(page, viewport, options, pageNum);
        }
    }

    /**
     * Render page to true vector SVG using legacy PDF.js SVGGraphics
     * Uses pdfjs-dist v2.16.105 which includes the SVGGraphics module
     */
    private async renderPageToVectorSVG(
        page: any,
        viewport: any,
        options: PDFToSVGOptions
    ): Promise<string> {
        // Load SVGGraphics from legacy pdfjs-dist
        const SVGGraphics = await loadSVGGraphics();

        // Get operator list for vector rendering
        const operatorList = await page.getOperatorList();

        // Create SVGGraphics instance
        const svgGfx = new SVGGraphics(page.commonObjs, page.objs);

        // Enable embedding fonts if requested
        if (options.embedFonts) {
            svgGfx.embedFonts = true;
        }

        // Generate SVG element
        const svgElement = await svgGfx.getSVG(operatorList, viewport);

        // Add background if not white/transparent
        if (options.backgroundColor && options.backgroundColor !== '#ffffff') {
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('width', '100%');
            rect.setAttribute('height', '100%');
            rect.setAttribute('fill', options.backgroundColor);
            svgElement.insertBefore(rect, svgElement.firstChild);
        }

        // Add XML declaration and serialize
        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(svgElement);

        // Add XML declaration if not present
        if (!svgString.startsWith('<?xml')) {
            svgString = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgString;
        }

        return svgString;
    }

    /**
     * Fallback: Render page to SVG with embedded raster image and vector text layer
     */
    private async renderPageToRasterSVG(
        page: any,
        viewport: any,
        options: PDFToSVGOptions,
        pageNum: number
    ): Promise<SVGResult> {
        // Create canvas with higher resolution for better quality
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

        // Get text content for vector text layer
        const textContent = await page.getTextContent();

        // Build text layer SVG elements
        let textLayerSVG = '';
        if (textContent && textContent.items && textContent.items.length > 0) {
            for (const item of textContent.items) {
                if (!item.str || item.str.trim() === '') continue;

                const tx = viewport.transform;
                // Apply viewport transform to get screen coordinates
                const x = tx[0] * item.transform[4] + tx[2] * item.transform[5] + tx[4];
                const y = tx[1] * item.transform[4] + tx[3] * item.transform[5] + tx[5];

                // Calculate font size based on transform
                const fontSize = Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1]) * options.scale;

                // Escape special XML characters
                const escapedText = item.str
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&apos;');

                // Add text element (invisible by default, but selectable and searchable)
                textLayerSVG += `
    <text x="${x.toFixed(2)}" y="${y.toFixed(2)}" 
          font-size="${fontSize.toFixed(1)}" 
          font-family="${item.fontName || 'sans-serif'}"
          fill="transparent" fill-opacity="0">${escapedText}</text>`;
            }
        }

        // Convert canvas to data URL
        const dataUrl = canvas.toDataURL('image/png');

        // Create SVG with image and text layer
        const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${viewport.width} ${viewport.height}">
  <title>PDF Page ${pageNum}</title>
  <defs>
    <style>
      .text-layer text {
        fill: transparent;
        fill-opacity: 0;
        pointer-events: all;
        user-select: text;
        -webkit-user-select: text;
      }
      .text-layer text::selection {
        background: #0078d4;
        fill: #fff;
      }
    </style>
  </defs>
  <!-- Raster layer -->
  <image width="${viewport.width}" height="${viewport.height}" xlink:href="${dataUrl}" />
  <!-- Vector text layer (selectable) -->
  <g class="text-layer">${textLayerSVG}
  </g>
</svg>`;

        const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });

        return {
            svg: svgString,
            blob: svgBlob,
            pageNumber: pageNum,
            width: viewport.width,
            height: viewport.height,
        };
    }
}

/**
 * Create a new instance of the PDF to SVG processor
 */
export function createPDFToSVGProcessor(): PDFToSVGProcessor {
    return new PDFToSVGProcessor();
}

/**
 * Convert PDF to SVG (convenience function)
 */
export async function pdfToSVG(
    file: File,
    options?: Partial<PDFToSVGOptions>,
    onProgress?: ProgressCallback
): Promise<ProcessOutput> {
    const processor = createPDFToSVGProcessor();
    return processor.process(
        {
            files: [file],
            options: options || {},
        },
        onProgress
    );
}
