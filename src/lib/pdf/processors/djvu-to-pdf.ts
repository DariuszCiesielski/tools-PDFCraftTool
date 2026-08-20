/**
 * DJVU to PDF Processor
 * 
 * Converts DJVU document files to PDF documents.
 * Uses djvu.js library for parsing and rendering DJVU pages,
 * then converts rendered images to PDF using jsPDF.
 */

import type {
    ProcessInput,
    ProcessOutput,
    ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';

// Minimal typing for the DjVu.js library (loaded from CDN, ships no TS types)
interface DjVuPage {
    getImageData(): ImageData | null;
}
interface DjVuDocumentInstance {
    getPagesQuantity(): number;
    getPage(pageNum: number): Promise<DjVuPage>;
}
interface DjVuLibrary {
    Document: new (buffer: ArrayBuffer) => DjVuDocumentInstance;
}
type DjVuWindow = Window & { DjVu?: DjVuLibrary };


/**
 * DJVU to PDF options
 */
export interface DJVUToPDFOptions {
    /** DPI for rendering (default: 150) */
    dpi?: number;
    /** JPEG quality for images (0-1, default: 0.92) */
    quality?: number;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<DJVUToPDFOptions> = {
    dpi: 150,
    quality: 0.92,
};

/**
 * DJVU to PDF Processor
 * Converts DJVU files to PDF by rendering each page to canvas and combining into PDF.
 */
export class DJVUToPDFProcessor extends BasePDFProcessor {
    /**
     * Reset processor state
     */
    protected reset(): void {
        super.reset();
    }

    /**
     * Process DJVU and convert to PDF
     */
    async process(
        input: ProcessInput,
        onProgress?: ProgressCallback
    ): Promise<ProcessOutput> {
        this.reset();
        this.onProgress = onProgress;

        const { files, options } = input;
        const djvuOptions: Required<DJVUToPDFOptions> = {
            ...DEFAULT_OPTIONS,
            ...(options as Partial<DJVUToPDFOptions>),
        };

        // Validate we have exactly 1 DJVU file
        if (files.length !== 1) {
            return this.createErrorOutput(
                PDFErrorCode.INVALID_OPTIONS,
                'Please provide exactly one DJVU file.',
                `Received ${files.length} file(s).`
            );
        }

        const file = files[0];

        // Validate file type
        if (!file.name.toLowerCase().endsWith('.djvu') && !file.name.toLowerCase().endsWith('.djv')) {
            return this.createErrorOutput(
                PDFErrorCode.FILE_TYPE_INVALID,
                'Invalid file type. Please upload a DJVU file (.djvu or .djv).',
                `Received: ${file.type || file.name}`
            );
        }

        try {
            this.updateProgress(5, 'Reading DJVU file...');

            // Read file as ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();

            if (this.checkCancelled()) {
                return this.createErrorOutput(
                    PDFErrorCode.PROCESSING_CANCELLED,
                    'Processing was cancelled.'
                );
            }

            this.updateProgress(10, 'Loading DJVU library...');

            // Dynamically import djvu.js
            const DjVu = await this.loadDjVuLibrary();

            this.updateProgress(20, 'Parsing DJVU document...');

            // Parse the DJVU document
            const djvuDocument = new DjVu.Document(arrayBuffer);
            const pageCount = djvuDocument.getPagesQuantity();

            if (pageCount === 0) {
                return this.createErrorOutput(
                    PDFErrorCode.PROCESSING_FAILED,
                    'DJVU file contains no pages.'
                );
            }

            this.updateProgress(25, `Found ${pageCount} pages. Loading jsPDF...`);

            // Dynamically import jsPDF
            const { jsPDF } = await import('jspdf');

            // Create PDF document (will set size based on first page)
            let pdf: InstanceType<typeof jsPDF> | null = null;

            // Process each page
            for (let i = 1; i <= pageCount; i++) {
                if (this.checkCancelled()) {
                    return this.createErrorOutput(
                        PDFErrorCode.PROCESSING_CANCELLED,
                        'Processing was cancelled.'
                    );
                }

                const progressPercent = 25 + Math.round((i / pageCount) * 70);
                this.updateProgress(progressPercent, `Rendering page ${i} of ${pageCount}...`);

                try {
                    // Get page and render to ImageData (async in v0.5.4+)
                    const page = await djvuDocument.getPage(i);
                    const imageData = page.getImageData();

                    if (!imageData) {
                        console.warn(`Page ${i} returned no image data, skipping...`);
                        continue;
                    }

                    // Create canvas and draw image data
                    const canvas = document.createElement('canvas');
                    canvas.width = imageData.width;
                    canvas.height = imageData.height;
                    const ctx = canvas.getContext('2d');

                    if (!ctx) {
                        throw new Error('Failed to get canvas context');
                    }

                    ctx.putImageData(imageData, 0, 0);

                    // Convert to JPEG data URL
                    const imgData = canvas.toDataURL('image/jpeg', djvuOptions.quality);

                    // Calculate page dimensions (convert pixels to mm at specified DPI)
                    const pxToMm = 25.4 / djvuOptions.dpi;
                    const pageWidth = imageData.width * pxToMm;
                    const pageHeight = imageData.height * pxToMm;

                    if (i === 1) {
                        // Create PDF with first page dimensions
                        pdf = new jsPDF({
                            orientation: pageWidth > pageHeight ? 'landscape' : 'portrait',
                            unit: 'mm',
                            format: [pageWidth, pageHeight],
                        });
                    } else if (pdf) {
                        // Add new page with appropriate dimensions
                        pdf.addPage([pageWidth, pageHeight], pageWidth > pageHeight ? 'landscape' : 'portrait');
                    }

                    if (pdf) {
                        // Add image to current page
                        pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
                    }

                    // Clean up canvas
                    canvas.width = 0;
                    canvas.height = 0;
                } catch (pageError) {
                    console.error(`Error processing page ${i}:`, pageError);
                    // Continue with other pages
                }
            }

            if (!pdf) {
                return this.createErrorOutput(
                    PDFErrorCode.PROCESSING_FAILED,
                    'Failed to render any pages from the DJVU file.'
                );
            }

            this.updateProgress(98, 'Generating PDF...');

            // Get PDF as blob
            const pdfBlob = pdf.output('blob');

            this.updateProgress(100, 'Conversion complete!');

            const baseName = file.name.replace(/\.(djvu|djv)$/i, '');
            const outputName = `${baseName}.pdf`;

            return this.createSuccessOutput(
                pdfBlob,
                outputName,
                {
                    pageCount,
                    dpi: djvuOptions.dpi,
                }
            );

        } catch (error) {
            console.error('DJVU conversion error:', error);

            return this.createErrorOutput(
                PDFErrorCode.PROCESSING_FAILED,
                'Failed to convert DJVU to PDF.',
                error instanceof Error ? error.message : 'Unknown error'
            );
        }
    }

    /**
     * Load djvu.js library dynamically
     */
    private async loadDjVuLibrary(): Promise<DjVuLibrary> {
        // Try to load from CDN or local bundle
        return new Promise((resolve, reject) => {
            // Check if already loaded
            const djvuWindow = window as DjVuWindow;
            if (djvuWindow.DjVu) {
                resolve(djvuWindow.DjVu);
                return;
            }

            // Load script
            const script = document.createElement('script');
            // Official DjVu.js library from djvu.js.org (v0.5.4)
            script.src = 'https://djvu.js.org/assets/dist/djvu.js';
            script.async = true;

            script.onload = () => {
                if (djvuWindow.DjVu) {
                    resolve(djvuWindow.DjVu);
                } else {
                    reject(new Error('DjVu library loaded but not available'));
                }
            };

            script.onerror = () => {
                reject(new Error('Failed to load DjVu library'));
            };

            document.head.appendChild(script);
        });
    }

    /**
     * Get accepted file types
     */
    protected getAcceptedTypes(): string[] {
        return ['image/x-djvu', 'image/vnd.djvu', 'application/x-djvu'];
    }
}

/**
 * Create a new instance of the DJVU to PDF processor
 */
export function createDJVUToPDFProcessor(): DJVUToPDFProcessor {
    return new DJVUToPDFProcessor();
}

/**
 * Convert DJVU to PDF (convenience function)
 */
export async function djvuToPDF(
    file: File,
    options?: Partial<DJVUToPDFOptions>,
    onProgress?: ProgressCallback
): Promise<ProcessOutput> {
    const processor = createDJVUToPDFProcessor();
    return processor.process(
        {
            files: [file],
            options: options || {},
        },
        onProgress
    );
}
