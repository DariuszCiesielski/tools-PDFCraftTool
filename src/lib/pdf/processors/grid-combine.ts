/**
 * PDF Grid Combine Processor
 * 
 * Combines multiple PDF files into a grid layout on single pages.
 * Unlike N-Up which arranges pages from ONE PDF, this tool arranges
 * pages from MULTIPLE PDFs side by side.
 * 
 * Uses pdfjs to render each page as a high-resolution image, then
 * creates a new PDF with the images in a grid layout using pdf-lib.
 * This approach works reliably with ALL types of PDFs including those
 * with annotation-only content or missing Contents streams.
 */

import type {
    ProcessInput,
    ProcessOutput,
    ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import { loadPdfLib, loadPdfjs } from '../loader';
import type { PDFImage } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDFJS_CONFIG } from '../config';

/**
 * Grid Combine options
 */
export interface GridCombineOptions {
    /** Grid layout: columns x rows */
    gridLayout: '2x1' | '1x2' | '2x2' | '3x3' | '2x3' | '3x2' | '4x4';
    /** Output page size */
    pageSize: 'A4' | 'Letter' | 'Legal' | 'A3';
    /** Page orientation */
    orientation: 'portrait' | 'landscape';
    /** Add margins */
    useMargins: boolean;
    /** Add border around each PDF */
    addBorder: boolean;
    /** Border color (hex) */
    borderColor: string;
    /** Include spacing between items */
    spacing: number;
    /** Fill mode: how to handle empty cells when files < grid cells */
    fillMode: 'leave-empty' | 'repeat' | 'stretch-last';
    /** Page mode: use only first page or all pages from each PDF */
    pageMode: 'first-page-only' | 'all-pages';
    /** Auto trim visible area using each page's CropBox */
    autoTrimCropBox: boolean;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: GridCombineOptions = {
    gridLayout: '2x2',
    pageSize: 'A4',
    orientation: 'landscape',
    useMargins: true,
    addBorder: true,
    borderColor: '#CCCCCC',
    spacing: 10,
    fillMode: 'leave-empty',
    pageMode: 'first-page-only',
    autoTrimCropBox: true,
};

/**
 * Page sizes in points
 */
const PAGE_SIZES: Record<string, [number, number]> = {
    A4: [595.28, 841.89],
    Letter: [612, 792],
    Legal: [612, 1008],
    A3: [841.89, 1190.55],
};

/**
 * Parse grid layout string to [cols, rows]
 */
function parseGridLayout(layout: string): [number, number] {
    const match = layout.match(/(\d+)x(\d+)/);
    if (match) {
        return [parseInt(match[1], 10), parseInt(match[2], 10)];
    }
    return [2, 2]; // Default
}

/**
 * A rendered page ready to be placed in the grid
 */
interface RenderedCell {
    /** Embedded PNG image in the output PDF */
    image: PDFImage;
    /** Image width in pixels */
    width: number;
    /** Image height in pixels */
    height: number;
    /** Source file name */
    name: string;
    /** Page number in source file */
    pageNum: number;
}

/**
 * PDF Grid Combine Processor
 */
export class GridCombineProcessor extends BasePDFProcessor {
    /**
     * Process multiple PDF files and combine them in a grid layout
     */
    async process(
        input: ProcessInput,
        onProgress?: ProgressCallback
    ): Promise<ProcessOutput> {
        this.reset();
        this.onProgress = onProgress;

        const { files, options } = input;
        const combineOptions: GridCombineOptions = {
            ...DEFAULT_OPTIONS,
            ...(options as Partial<GridCombineOptions>),
        };

        // Validate we have at least 2 files
        if (files.length < 2) {
            return this.createErrorOutput(
                PDFErrorCode.INVALID_OPTIONS,
                'At least 2 PDF files are required for grid combine.',
                `Received ${files.length} file(s).`
            );
        }

        try {
            this.updateProgress(5, 'Loading libraries...');

            const [pdfLib, pdfjsLib] = await Promise.all([
                loadPdfLib(),
                loadPdfjs(),
            ]);

            if (this.checkCancelled()) {
                return this.createErrorOutput(
                    PDFErrorCode.PROCESSING_CANCELLED,
                    'Processing was cancelled.'
                );
            }

            // Get grid dimensions
            const [cols, rows] = parseGridLayout(combineOptions.gridLayout);
            const cellsPerPage = cols * rows;

            // Get page size
            let [pageWidth, pageHeight] = PAGE_SIZES[combineOptions.pageSize];

            // Apply orientation
            if (combineOptions.orientation === 'landscape' && pageWidth < pageHeight) {
                [pageWidth, pageHeight] = [pageHeight, pageWidth];
            } else if (combineOptions.orientation === 'portrait' && pageWidth > pageHeight) {
                [pageWidth, pageHeight] = [pageHeight, pageWidth];
            }

            // Calculate margins and spacing
            const margin = combineOptions.useMargins ? 36 : 0;
            const spacing = combineOptions.spacing;

            const usableWidth = pageWidth - margin * 2;
            const usableHeight = pageHeight - margin * 2;

            const cellWidth = (usableWidth - spacing * (cols - 1)) / cols;
            const cellHeight = (usableHeight - spacing * (rows - 1)) / rows;

            // Create new output PDF
            const newPdf = await pdfLib.PDFDocument.create();

            // Parse border color
            const borderRgb = hexToRgb(combineOptions.borderColor);

            // Render all source pages to images and embed them
            const cellItems: RenderedCell[] = [];
            const totalFiles = files.length;

            this.updateProgress(10, 'Rendering source pages...');

            for (let fileIdx = 0; fileIdx < totalFiles; fileIdx++) {
                if (this.checkCancelled()) {
                    return this.createErrorOutput(
                        PDFErrorCode.PROCESSING_CANCELLED,
                        'Processing was cancelled.'
                    );
                }

                const file = files[fileIdx];
                this.updateProgress(
                    10 + (fileIdx / totalFiles) * 50,
                    `Rendering ${file.name}...`
                );

                let arrayBuffer: ArrayBuffer;
                try {
                    arrayBuffer = await file.arrayBuffer();
                } catch (error) {
                    return this.createErrorOutput(
                        PDFErrorCode.PROCESSING_FAILED,
                        `Failed to read "${file.name}".`,
                        error instanceof Error ? error.message : 'Unknown error'
                    );
                }

                // Load PDF with pdfjs for rendering
                let pdf: PDFDocumentProxy;
                try {
                    pdf = await pdfjsLib.getDocument({
                        data: arrayBuffer,
                        cMapUrl: PDFJS_CONFIG.cMapUrl,
                        cMapPacked: PDFJS_CONFIG.cMapPacked,
                        standardFontDataUrl: PDFJS_CONFIG.standardFontDataUrl,
                    }).promise;
                } catch (error) {
                    return this.createErrorOutput(
                        PDFErrorCode.PROCESSING_FAILED,
                        `Failed to load "${file.name}".`,
                        error instanceof Error ? error.message : 'Unknown error'
                    );
                }

                const numPages = pdf.numPages;

                // Determine which pages to render
                const pageNumbers: number[] = [];
                if (combineOptions.pageMode === 'all-pages') {
                    for (let p = 1; p <= numPages; p++) {
                        pageNumbers.push(p);
                    }
                } else {
                    if (numPages > 0) {
                        pageNumbers.push(1);
                    }
                }

                // Render each page to PNG and embed into output PDF
                for (const pageNum of pageNumbers) {
                    if (this.checkCancelled()) {
                        pdf.destroy();
                        return this.createErrorOutput(
                            PDFErrorCode.PROCESSING_CANCELLED,
                            'Processing was cancelled.'
                        );
                    }

                    try {
                        const page = await pdf.getPage(pageNum);
                        // Use scale 4.0 for high quality rendering in the grid
                        const viewport = page.getViewport({ scale: 4.0 });

                        const canvas = document.createElement('canvas');
                        canvas.width = viewport.width;
                        canvas.height = viewport.height;
                        const ctx = canvas.getContext('2d')!;

                        await page.render({
                            canvasContext: ctx,
                            viewport,
                        }).promise;

                        // Convert to PNG bytes
                        const blob: Blob = await new Promise((resolve) => {
                            canvas.toBlob((b) => resolve(b!), 'image/png');
                        });
                        const pngBuffer = await blob.arrayBuffer();
                        const pngBytes = new Uint8Array(pngBuffer);

                        // Embed PNG into output PDF
                        const pngImage = await newPdf.embedPng(pngBytes);

                        cellItems.push({
                            image: pngImage,
                            width: pngImage.width,
                            height: pngImage.height,
                            name: file.name,
                            pageNum,
                        });

                        // Clean up canvas
                        canvas.width = 0;
                        canvas.height = 0;
                    } catch (renderErr) {
                        // If rendering fails for this page, skip it
                        console.warn(
                            `Failed to render page ${pageNum} of "${file.name}":`,
                            renderErr
                        );
                    }
                }

                pdf.destroy();
            }

            if (cellItems.length === 0) {
                return this.createErrorOutput(
                    PDFErrorCode.PROCESSING_FAILED,
                    'No pages could be rendered from the source PDFs.'
                );
            }

            this.updateProgress(65, 'Building grid layout...');

            // Apply fill mode if needed
            const allItems = [...cellItems];
            if (cellItems.length < cellsPerPage) {
                if (combineOptions.fillMode === 'repeat') {
                    while (allItems.length < cellsPerPage) {
                        const idx = allItems.length % cellItems.length;
                        allItems.push({ ...cellItems[idx] });
                    }
                } else if (combineOptions.fillMode === 'stretch-last') {
                    const lastItem = cellItems[cellItems.length - 1];
                    while (allItems.length < cellsPerPage) {
                        allItems.push({ ...lastItem });
                    }
                }
                // 'leave-empty' - do nothing
            }

            // Calculate how many output pages we need
            const totalOutputPages = Math.ceil(allItems.length / cellsPerPage);
            const progressPerPage = 20 / totalOutputPages;

            for (let outputPageNum = 0; outputPageNum < totalOutputPages; outputPageNum++) {
                if (this.checkCancelled()) {
                    return this.createErrorOutput(
                        PDFErrorCode.PROCESSING_CANCELLED,
                        'Processing was cancelled.'
                    );
                }

                this.updateProgress(
                    65 + outputPageNum * progressPerPage,
                    `Creating page ${outputPageNum + 1} of ${totalOutputPages}...`
                );

                const outputPage = newPdf.addPage([pageWidth, pageHeight]);

                // Get the subset of items for this output page
                const startIdx = outputPageNum * cellsPerPage;
                const endIdx = Math.min(startIdx + cellsPerPage, allItems.length);
                const pageSubset = allItems.slice(startIdx, endIdx);

                for (let cellIdx = 0; cellIdx < pageSubset.length; cellIdx++) {
                    const item = pageSubset[cellIdx];

                    // Calculate position in grid
                    // PDF坐标系原点在左下角，Y轴向上
                    const col = cellIdx % cols;
                    const row = Math.floor(cellIdx / cols);
                    const cellX = margin + col * (cellWidth + spacing);
                    // 从顶部开始排列，第一行在最上面
                    const cellY = pageHeight - margin - cellHeight - row * (cellHeight + spacing);

                    // Calculate scale to fit in cell
                    const scale = Math.min(
                        cellWidth / item.width,
                        cellHeight / item.height
                    );
                    const scaledWidth = item.width * scale;
                    const scaledHeight = item.height * scale;

                    // Center within cell
                    const x = cellX + (cellWidth - scaledWidth) / 2;
                    const y = cellY + (cellHeight - scaledHeight) / 2;

                    // Draw rendered image
                    outputPage.drawImage(item.image, {
                        x,
                        y,
                        width: scaledWidth,
                        height: scaledHeight,
                    });

                    // Draw border if enabled
                    if (combineOptions.addBorder) {
                        outputPage.drawRectangle({
                            x,
                            y,
                            width: scaledWidth,
                            height: scaledHeight,
                            borderColor: pdfLib.rgb(borderRgb.r, borderRgb.g, borderRgb.b),
                            borderWidth: 0.5,
                        });
                    }
                }
            }

            this.updateProgress(90, 'Saving PDF...');

            // Save the new PDF
            const pdfBytes = await newPdf.save({
                useObjectStreams: true,
            });
            const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });

            this.updateProgress(100, 'Complete!');

            // Generate output filename
            const outputFilename = `combined_${cols}x${rows}_grid.pdf`;

            return this.createSuccessOutput(blob, outputFilename, {
                sourceFileCount: files.length,
                totalSourcePages: allItems.length,
                gridLayout: combineOptions.gridLayout,
                outputPageCount: totalOutputPages,
                pageMode: combineOptions.pageMode,
                fillMode: combineOptions.fillMode,
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorStack = error instanceof Error ? error.stack : undefined;
            return this.createErrorOutput(
                PDFErrorCode.PROCESSING_FAILED,
                `Failed to create grid combined PDF: ${errorMessage}`,
                errorStack || errorMessage
            );
        }
    }

    /**
     * Get accepted file types
     */
    protected getAcceptedTypes(): string[] {
        return ['application/pdf'];
    }
}

/**
 * Convert hex color to RGB (0-1 range)
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
        return {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255,
        };
    }
    return { r: 0.8, g: 0.8, b: 0.8 }; // Default light gray
}

/**
 * Create a new instance of the processor
 */
export function createGridCombineProcessor(): GridCombineProcessor {
    return new GridCombineProcessor();
}

/**
 * Combine multiple PDFs in a grid layout (convenience function)
 */
export async function createGridCombinePDF(
    files: File[],
    options: Partial<GridCombineOptions>,
    onProgress?: ProgressCallback
): Promise<ProcessOutput> {
    const processor = createGridCombineProcessor();
    return processor.process(
        {
            files,
            options: options as Record<string, unknown>,
        },
        onProgress
    );
}
