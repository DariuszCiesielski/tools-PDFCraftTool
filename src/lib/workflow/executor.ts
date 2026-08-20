/**
 * Workflow Node Executor
 * Executes individual workflow nodes by calling the appropriate PDF processors
 * 
 * This module provides type-safe execution of PDF processing workflows by:
 * 1. Using Processor classes directly for full type safety
 * 2. Converting workflow input files to proper File objects
 * 3. Mapping workflow settings to processor options
 */

import { WorkflowNode, WorkflowEdge, WorkflowOutputFile } from '@/types/workflow';
import type { ProcessOutput, ProgressCallback, ProcessInput } from '@/types/pdf';
import { PDFErrorCode, ErrorCategory } from '@/types/pdf';
import { logger } from '@/lib/utils/logger';

// Import Processor classes
import { MergePDFProcessor } from '@/lib/pdf/processors/merge';
import { SplitPDFProcessor } from '@/lib/pdf/processors/split';
import { RotatePDFProcessor } from '@/lib/pdf/processors/rotate';
import { CompressPDFProcessor } from '@/lib/pdf/processors/compress';
import { FlattenPDFProcessor } from '@/lib/pdf/processors/flatten';
import { ExtractPagesPDFProcessor } from '@/lib/pdf/processors/extract';
import { DeletePagesPDFProcessor } from '@/lib/pdf/processors/delete';
import { AlternateMergePDFProcessor } from '@/lib/pdf/processors/alternate-merge';
import { DividePagesPDFProcessor } from '@/lib/pdf/processors/divide';
import { AddBlankPagePDFProcessor } from '@/lib/pdf/processors/add-blank-page';
import { ReversePagesPDFProcessor } from '@/lib/pdf/processors/reverse';
import { NUpPDFProcessor } from '@/lib/pdf/processors/n-up';
import { CombineSinglePagePDFProcessor } from '@/lib/pdf/processors/combine-single-page';
import { PosterizePDFProcessor } from '@/lib/pdf/processors/posterize';
import { EditMetadataPDFProcessor } from '@/lib/pdf/processors/edit-metadata';
import { TableOfContentsProcessor } from '@/lib/pdf/processors/table-of-contents';
import { PageNumbersProcessor } from '@/lib/pdf/processors/page-numbers';
import { WatermarkProcessor } from '@/lib/pdf/processors/watermark';
import { HeaderFooterProcessor } from '@/lib/pdf/processors/header-footer';
import { InvertColorsProcessor } from '@/lib/pdf/processors/invert-colors';
import { BackgroundColorProcessor } from '@/lib/pdf/processors/background-color';
import { TextColorProcessor } from '@/lib/pdf/processors/text-color';
import { RemoveAnnotationsProcessor } from '@/lib/pdf/processors/remove-annotations';
import { RemoveBlankPagesProcessor } from '@/lib/pdf/processors/remove-blank-pages';
import { ImageToPDFProcessor } from '@/lib/pdf/processors/image-to-pdf';
import { TextToPDFProcessor } from '@/lib/pdf/processors/text-to-pdf';
import { JSONToPDFProcessor } from '@/lib/pdf/processors/json-to-pdf';
import { PDFToImageProcessor } from '@/lib/pdf/processors/pdf-to-image';
import { PDFToSVGProcessor } from '@/lib/pdf/processors/pdf-to-svg';
import { PDFToGreyscaleProcessor } from '@/lib/pdf/processors/pdf-to-greyscale';
import { PDFToJSONProcessor } from '@/lib/pdf/processors/pdf-to-json';
import { OCRProcessor } from '@/lib/pdf/processors/ocr';
import { FixPageSizeProcessor } from '@/lib/pdf/processors/fix-page-size';
import { LinearizePDFProcessor } from '@/lib/pdf/processors/linearize';
import { RemoveRestrictionsProcessor } from '@/lib/pdf/processors/remove-restrictions';
import { RepairPDFProcessor } from '@/lib/pdf/processors/repair';
import { EncryptPDFProcessor } from '@/lib/pdf/processors/encrypt';
import { DecryptPDFProcessor } from '@/lib/pdf/processors/decrypt';
import { SanitizePDFProcessor } from '@/lib/pdf/processors/sanitize';
import { RemoveMetadataProcessor } from '@/lib/pdf/processors/remove-metadata';
import { ChangePermissionsProcessor } from '@/lib/pdf/processors/change-permissions';
import { WordToPDFProcessor } from '@/lib/pdf/processors/word-to-pdf';
import { ExcelToPDFProcessor } from '@/lib/pdf/processors/excel-to-pdf';
import { PPTXToPDFProcessor } from '@/lib/pdf/processors/pptx-to-pdf';
import { EPUBToPDFProcessor } from '@/lib/pdf/processors/epub-to-pdf';
import { FB2ToPDFProcessor } from '@/lib/pdf/processors/fb2-to-pdf';
import { MOBIToPDFProcessor } from '@/lib/pdf/processors/mobi-to-pdf';
import { RTFToPDFProcessor } from '@/lib/pdf/processors/rtf-to-pdf';
import { XPSToPDFProcessor } from '@/lib/pdf/processors/xps-to-pdf';
import { GridCombineProcessor } from '@/lib/pdf/processors/grid-combine';
import { ExtractImagesPDFProcessor } from '@/lib/pdf/processors/extract-images';
import { PDFToZipProcessor } from '@/lib/pdf/processors/pdf-to-zip';
import { OrganizePDFProcessor } from '@/lib/pdf/processors/organize';
import { DeskewPDFProcessor } from '@/lib/pdf/processors/deskew';
import { EmailToPDFProcessor } from '@/lib/pdf/processors/email-to-pdf';
import { FontToOutlineProcessor } from '@/lib/pdf/processors/font-to-outline';
import { StampsProcessor } from '@/lib/pdf/processors/stamps';
import { DJVUToPDFProcessor } from '@/lib/pdf/processors/djvu-to-pdf';
import { CbzToPDFProcessor } from '@/lib/pdf/processors/cbz-to-pdf';
import { BookletPDFProcessor } from '@/lib/pdf/processors/booklet';
import { MarkdownToPDFProcessor } from '@/lib/pdf/processors/markdown-to-pdf';
import { ExtractTablesProcessor } from '@/lib/pdf/processors/extract-tables';
import { RasterizePDFProcessor } from '@/lib/pdf/processors/rasterize';
import { PdfToPdfAProcessor } from '@/lib/pdf/processors/pdf-to-pdfa';
import { PDFToDocxProcessor } from '@/lib/pdf/processors/pdf-to-docx';
import { PDFToPptxProcessor } from '@/lib/pdf/processors/pdf-to-pptx';
import { PDFToExcelProcessor } from '@/lib/pdf/processors/pdf-to-excel';

/**
 * Convert WorkflowOutputFile or Blob to File with proper metadata
 */
function convertToFile(input: File | Blob | WorkflowOutputFile, index: number, defaultName: string = 'input'): File {
    if (input instanceof File) return input;
    
    if ('blob' in input && 'filename' in input) {
        // WorkflowOutputFile with metadata
        const filename = input.filename || `${defaultName}_${index}.pdf`;
        let type = 'application/pdf';
        
        // Detect MIME type from extension
        if (filename.endsWith('.zip')) type = 'application/zip';
        else if (filename.endsWith('.png')) type = 'image/png';
        else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) type = 'image/jpeg';
        else if (filename.endsWith('.webp')) type = 'image/webp';
        else if (filename.endsWith('.svg')) type = 'image/svg+xml';
        else if (filename.endsWith('.txt')) type = 'text/plain';
        else if (filename.endsWith('.json')) type = 'application/json';
        
        return new File([input.blob], filename, { type });
    }
    
    // Plain Blob without metadata - TypeScript now knows input is Blob here
    return new File([input as Blob], `${defaultName}_${index}.pdf`, { type: 'application/pdf' });
}

/**
 * Create ProcessInput from files and settings
 */
function createProcessInput(files: File[], settings: Record<string, unknown>): ProcessInput {
    return {
        files,
        options: settings,
    };
}

/**
 * Execute a single workflow node with type-safe processor classes
 */
export async function executeNode(
    node: WorkflowNode,
    inputFiles: (File | Blob | WorkflowOutputFile)[],
    onProgress?: ProgressCallback
): Promise<ProcessOutput> {
    const toolId = node.data.toolId;
    const settings = node.data.settings || {};

    // Convert all inputs to File objects with proper metadata
    const files: File[] = inputFiles.map((f, i) => 
        convertToFile(f, i, `workflow_${toolId}`)
    );

    try {
        switch (toolId) {
            // ==================== Organize & Manage ====================
            case 'merge-pdf': {
                const processor = new MergePDFProcessor();
                const options = {
                    preserveBookmarks: settings.preserveBookmarks !== undefined 
                        ? Boolean(settings.preserveBookmarks) 
                        : true,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'split-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const mode = String(settings.splitMode || 'every');
                const pagesPerSplit = Number(settings.pagesPerSplit) || 1;

                // Calculate ranges based on mode
                const pdfjs = await import('pdfjs-dist');
                const arrayBuffer = await files[0].arrayBuffer();
                const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
                const totalPages = pdf.numPages;

                let ranges: { start: number; end: number }[] = [];
                if (mode === 'every') {
                    for (let i = 0; i < totalPages; i += pagesPerSplit) {
                        ranges.push({ start: i + 1, end: Math.min(i + pagesPerSplit, totalPages) });
                    }
                } else if (mode === 'ranges' && settings.pageRanges) {
                    // Parse page ranges like "1-3,5,7-9"
                    const { parsePageRanges } = await import('@/lib/pdf/processors/split');
                    ranges = parsePageRanges(String(settings.pageRanges), totalPages);
                } else {
                    // Split every page
                    for (let i = 1; i <= totalPages; i++) {
                        ranges.push({ start: i, end: i });
                    }
                }

                const processor = new SplitPDFProcessor();
                return await processor.process(createProcessInput(files, { ranges }), onProgress);
            }

            case 'extract-pages': {
                if (files.length === 0) throw new Error('No input file');
                const pageRange = String(settings.pageRange || '1');
                const processor = new ExtractPagesPDFProcessor();
                return await processor.process(createProcessInput(files, { pageRange }), onProgress);
            }

            case 'delete-pages': {
                if (files.length === 0) throw new Error('No input file');
                const pageRange = String(settings.pageRange || '1');
                const processor = new DeletePagesPDFProcessor();
                return await processor.process(createProcessInput(files, { pageRange }), onProgress);
            }

            case 'rotate-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const angle = Number(settings.angle) || 90;
                const processor = new RotatePDFProcessor();
                return await processor.process(createProcessInput(files, { angle }), onProgress);
            }

            case 'alternate-merge': {
                if (files.length < 2) throw new Error('At least 2 files required');
                const processor = new AlternateMergePDFProcessor();
                const options = {
                    reverseSecond: settings.reverseSecond !== undefined 
                        ? Boolean(settings.reverseSecond) 
                        : false,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'divide-pages': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new DividePagesPDFProcessor();
                const divisionType = String(settings.divisionType || 'vertical') as 'vertical' | 'horizontal' | 'grid-2x2' | 'grid-3x3';
                return await processor.process(createProcessInput(files, { divisionType }), onProgress);
            }

            case 'add-blank-page': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new AddBlankPagePDFProcessor();
                const positionStr = String(settings.position || 'end');
                const count = Number(settings.count) || 1;
                
                // Convert position string to options
                const options: Record<string, unknown> = { count };
                if (positionStr === 'end') {
                    options.position = 'end';
                } else if (positionStr === 'beginning') {
                    options.position = 'beginning';
                } else if (!isNaN(Number(positionStr))) {
                    options.position = Number(positionStr);
                }
                
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'reverse-pages': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new ReversePagesPDFProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            case 'n-up-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const pps = Number(settings.pagesPerSheet) || 4;
                const validPps = [2, 4, 9, 16].includes(pps) ? pps as 2 | 4 | 9 | 16 : 4;
                
                const processor = new NUpPDFProcessor();
                const options = {
                    pagesPerSheet: validPps,
                    pageSize: String(settings.pageSize || 'A4') as 'A4' | 'Letter' | 'Legal' | 'A3',
                    orientation: String(settings.orientation || 'auto') as 'auto' | 'portrait' | 'landscape',
                    useMargins: settings.useMargins !== undefined ? Boolean(settings.useMargins) : true,
                    addBorder: settings.addBorder !== undefined ? Boolean(settings.addBorder) : false,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'combine-single-page': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new CombineSinglePagePDFProcessor();
                const options = {
                    orientation: String(settings.orientation || 'vertical') as 'vertical' | 'horizontal',
                    spacing: Number(settings.spacing) || 0,
                    backgroundColor: String(settings.backgroundColor || '#FFFFFF'),
                    addSeparator: settings.addSeparator !== undefined ? Boolean(settings.addSeparator) : false,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'posterize-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new PosterizePDFProcessor();
                const options = {
                    cols: Number(settings.columns) || 2,
                    rows: Number(settings.rows) || 2,
                    overlap: Number(settings.overlap) || 10,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'grid-combine': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new GridCombineProcessor();
                const options = {
                    gridLayout: String(settings.gridLayout || '2x2'),
                    spacing: Number(settings.spacing) || 10,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'edit-metadata': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new EditMetadataPDFProcessor();
                const options: Record<string, unknown> = {};
                if (settings.title) options.title = String(settings.title);
                if (settings.author) options.author = String(settings.author);
                if (settings.subject) options.subject = String(settings.subject);
                if (settings.keywords) options.keywords = [String(settings.keywords)];
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            // ==================== Edit & Annotate ====================
            case 'table-of-contents': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new TableOfContentsProcessor();
                const options = {
                    title: String(settings.title || 'Table of Contents'),
                    fontSize: Number(settings.fontSize) || 12,
                    fontFamily: String(settings.fontFamily || 'helv'),
                    addBookmark: settings.addBookmark !== undefined ? Boolean(settings.addBookmark) : true,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'page-numbers': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new PageNumbersProcessor();
                const options = {
                    position: String(settings.position || 'bottom-center') as 'bottom-center' | 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-right',
                    format: String(settings.format || 'number') as 'number' | 'roman' | 'page-of-total' | 'custom',
                    startNumber: Number(settings.startNumber) || 1,
                    fontSize: Number(settings.fontSize) || 12,
                    fontColor: String(settings.fontColor || '#000000'),
                    margin: Number(settings.margin) || 30,
                    skipFirstPage: settings.skipFirstPage !== undefined ? Boolean(settings.skipFirstPage) : false,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'add-watermark': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new WatermarkProcessor();
                // Parse hex color to RGB object (values 0-1)
                const hexColor = String(settings.color || '#888888');
                const hexMatch = hexColor.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
                const color = hexMatch 
                    ? { r: parseInt(hexMatch[1], 16) / 255, g: parseInt(hexMatch[2], 16) / 255, b: parseInt(hexMatch[3], 16) / 255 }
                    : { r: 0.5, g: 0.5, b: 0.5 };
                const options = {
                    type: String(settings.watermarkType || 'text') as 'text' | 'image',
                    text: String(settings.text || 'WATERMARK'),
                    fontSize: Number(settings.fontSize) || 48,
                    opacity: Number(settings.opacity) || 0.3,
                    rotation: Number(settings.rotation) || -45,
                    color,
                    position: String(settings.position || 'center') as 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'diagonal',
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'header-footer': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new HeaderFooterProcessor();
                const options = {
                    headerText: String(settings.headerText || ''),
                    footerText: String(settings.footerText || ''),
                    fontSize: Number(settings.fontSize) || 12,
                    fontColor: String(settings.fontColor || '#000000'),
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'invert-colors': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new InvertColorsProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            case 'background-color': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new BackgroundColorProcessor();
                const options = {
                    color: String(settings.color || '#FFFFFF'),
                    applyTo: String(settings.applyTo || 'all'),
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'text-color': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new TextColorProcessor();
                const options = {
                    color: String(settings.color || '#000000'),
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'remove-annotations': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new RemoveAnnotationsProcessor();
                const options = {
                    removeComments: settings.removeComments !== undefined ? Boolean(settings.removeComments) : true,
                    removeHighlights: settings.removeHighlights !== undefined ? Boolean(settings.removeHighlights) : true,
                    removeLinks: settings.removeLinks !== undefined ? Boolean(settings.removeLinks) : false,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'remove-blank-pages': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new RemoveBlankPagesProcessor();
                const options = {
                    threshold: Number(settings.threshold) || 0.99,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            // ==================== Convert to PDF ====================
            case 'jpg-to-pdf':
            case 'png-to-pdf':
            case 'webp-to-pdf':
            case 'bmp-to-pdf':
            case 'heic-to-pdf':
            case 'tiff-to-pdf':
            case 'psd-to-pdf':
            case 'svg-to-pdf':
            case 'image-to-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new ImageToPDFProcessor();
                const options = {
                    pageSize: String(settings.pageSize || 'A4') as 'A4' | 'LETTER' | 'LEGAL' | 'A3' | 'A5' | 'FIT',
                    orientation: String(settings.orientation || 'auto'),
                    margin: Number(settings.margin) || 36,
                    centerImage: settings.centerImage !== undefined ? Boolean(settings.centerImage) : true,
                    scaleToFit: settings.scaleToFit !== undefined ? Boolean(settings.scaleToFit) : true,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'txt-to-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new TextToPDFProcessor();
                const options = {
                    fontSize: Number(settings.fontSize) || 12,
                    fontFamily: String(settings.fontFamily || 'Courier'),
                    pageSize: String(settings.pageSize || 'A4'),
                    margin: Number(settings.margin) || 50,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'json-to-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new JSONToPDFProcessor();
                const options = {
                    fontSize: Number(settings.fontSize) || 10,
                    pageSize: String(settings.pageSize || 'A4'),
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'word-to-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new WordToPDFProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            case 'excel-to-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new ExcelToPDFProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            case 'ppt-to-pdf':
            case 'pptx-to-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new PPTXToPDFProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            case 'epub-to-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new EPUBToPDFProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            case 'fb2-to-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new FB2ToPDFProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            case 'mobi-to-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new MOBIToPDFProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            case 'rtf-to-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new RTFToPDFProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            case 'xps-to-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new XPSToPDFProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            // ==================== Convert from PDF ====================
            case 'pdf-to-jpg':
            case 'pdf-to-png':
            case 'pdf-to-webp':
            case 'pdf-to-bmp':
            case 'pdf-to-tiff': {
                if (files.length === 0) throw new Error('No input file');
                const format = toolId.replace('pdf-to-', '') as 'jpg' | 'png' | 'webp' | 'bmp' | 'tiff';

                // Parse page range if provided (e.g., "1-5, 8, 10-12")
                const pages: number[] = [];
                if (settings.pageRange && typeof settings.pageRange === 'string') {
                    const pageRangeStr = String(settings.pageRange).trim();
                    if (pageRangeStr) {
                        const parts = pageRangeStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
                        for (const part of parts) {
                            if (part.includes('-')) {
                                const [startStr, endStr] = part.split('-').map(s => s.trim());
                                const start = parseInt(startStr, 10);
                                const end = parseInt(endStr, 10);
                                if (!isNaN(start) && !isNaN(end) && start <= end) {
                                    for (let i = start; i <= end; i++) {
                                        pages.push(i);
                                    }
                                }
                            } else {
                                const pageNum = parseInt(part, 10);
                                if (!isNaN(pageNum)) {
                                    pages.push(pageNum);
                                }
                            }
                        }
                    }
                }

                const processor = new PDFToImageProcessor();
                const options = {
                    format: format === 'jpg' ? 'jpeg' : format,
                    quality: Number(settings.quality) || 0.92,
                    scale: Number(settings.scale) || 2,
                    pages: pages.length > 0 ? pages : [],
                };

                const imageResult = await processor.process(createProcessInput(files, options), onProgress);

                // If multiple images, package them into a ZIP
                if (imageResult.success && Array.isArray(imageResult.result) && imageResult.result.length > 1) {
                    const JSZip = (await import('jszip')).default;
                    const zip = new JSZip();
                    const baseName = files[0].name.replace(/\.pdf$/i, '');
                    const ext = format === 'jpg' ? 'jpg' : format;

                    (imageResult.result as Blob[]).forEach((blob, i) => {
                        zip.file(`${baseName}_page_${i + 1}.${ext}`, blob);
                    });

                    const zipBlob = await zip.generateAsync({ type: 'blob' });
                    return {
                        success: true,
                        result: zipBlob,
                        filename: `${baseName}_images.zip`,
                        metadata: { pageCount: (imageResult.result as Blob[]).length, format },
                    };
                }

                return imageResult;
            }

            case 'pdf-to-svg': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new PDFToSVGProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            case 'pdf-to-greyscale': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new PDFToGreyscaleProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            case 'pdf-to-json': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new PDFToJSONProcessor();
                const options = {
                    extractText: settings.extractText !== undefined ? Boolean(settings.extractText) : true,
                    extractMetadata: settings.extractMetadata !== undefined ? Boolean(settings.extractMetadata) : true,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'extract-images': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new ExtractImagesPDFProcessor();
                const options = {
                    format: String(settings.format || 'png'),
                    minSize: Number(settings.minSize) || 100,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            // ==================== Optimize & Repair ====================
            case 'compress-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new CompressPDFProcessor();
                const quality = String(settings.quality || 'medium') as 'low' | 'medium' | 'high' | 'maximum';
                const algorithm = String(settings.algorithm || 'standard') as 'standard' | 'condense' | 'photon';
                const optimizeImages = settings.optimizeImages !== undefined ? Boolean(settings.optimizeImages) : false;
                const removeMetadata = settings.removeMetadata !== undefined ? Boolean(settings.removeMetadata) : false;
                const photonDpi = Number(settings.photonDpi) || 150;
                return await processor.process(createProcessInput(files, { 
                    quality,
                    algorithm,
                    optimizeImages,
                    removeMetadata,
                    photonDpi,
                }), onProgress);
            }

            case 'flatten-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new FlattenPDFProcessor();
                const options = {
                    flattenForms: settings.flattenForms !== undefined ? Boolean(settings.flattenForms) : true,
                    flattenAnnotations: settings.flattenAnnotations !== undefined ? Boolean(settings.flattenAnnotations) : true,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'fix-page-size': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new FixPageSizeProcessor();
                const options = {
                    targetSize: String(settings.targetSize || 'A4'),
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'linearize-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new LinearizePDFProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            case 'repair-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new RepairPDFProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            case 'remove-restrictions': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new RemoveRestrictionsProcessor();
                const options = {
                    password: String(settings.password || ''),
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'ocr-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new OCRProcessor();
                const options = {
                    language: String(settings.language || 'eng'),
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            // ==================== Security ====================
            case 'encrypt-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new EncryptPDFProcessor();
                const options = {
                    userPassword: String(settings.userPassword || ''),
                    ownerPassword: String(settings.ownerPassword || ''),
                    permissions: {
                        printing: settings.allowPrinting !== undefined ? Boolean(settings.allowPrinting) : true,
                        copying: settings.allowCopying !== undefined ? Boolean(settings.allowCopying) : false,
                        modifying: settings.allowModifying !== undefined ? Boolean(settings.allowModifying) : false,
                        annotating: settings.allowAnnotating !== undefined ? Boolean(settings.allowAnnotating) : true,
                    },
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'decrypt-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new DecryptPDFProcessor();
                const options = {
                    password: String(settings.password || ''),
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'sanitize-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new SanitizePDFProcessor();
                const options = {
                    removeJavaScript: settings.removeJavaScript !== undefined ? Boolean(settings.removeJavaScript) : true,
                    removeAttachments: settings.removeAttachments !== undefined ? Boolean(settings.removeAttachments) : true,
                    removeLinks: settings.removeLinks !== undefined ? Boolean(settings.removeLinks) : true,
                    flattenForms: settings.flattenForms !== undefined ? Boolean(settings.flattenForms) : true,
                    removeMetadata: settings.removeMetadata !== undefined ? Boolean(settings.removeMetadata) : true,
                    removeAnnotations: settings.removeAnnotations !== undefined ? Boolean(settings.removeAnnotations) : false,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'remove-metadata': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new RemoveMetadataProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            case 'change-permissions': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new ChangePermissionsProcessor();
                const options = {
                    permissions: {
                        printing: settings.allowPrinting !== undefined ? Boolean(settings.allowPrinting) : true,
                        copying: settings.allowCopying !== undefined ? Boolean(settings.allowCopying) : false,
                        modifying: settings.allowModifying !== undefined ? Boolean(settings.allowModifying) : false,
                        annotating: settings.allowAnnotating !== undefined ? Boolean(settings.allowAnnotating) : true,
                    },
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'digital-sign-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const certFile = settings.certFile as File | undefined;
                if (!certFile) {
                    return {
                        success: false,
                        error: {
                            code: PDFErrorCode.INVALID_OPTIONS,
                            category: ErrorCategory.VALIDATION_ERROR,
                            message: 'Certificate file is required. Please configure the node settings.',
                            recoverable: true,
                            suggestedAction: 'Click the node to upload a PFX/P12/PEM certificate file.',
                        },
                    };
                }
                const certPassword = String(settings.certPassword || '');
                const { parsePfxFile, parseCombinedPem, signPdf } = await import('@/lib/pdf/processors/digital-sign');

                // Parse certificate
                const isPem = certFile.name.toLowerCase().endsWith('.pem');
                let certData;
                try {
                    if (isPem) {
                        const content = await certFile.text();
                        certData = parseCombinedPem(content, certPassword || undefined);
                    } else {
                        const bytes = await certFile.arrayBuffer();
                        certData = parsePfxFile(bytes, certPassword);
                    }
                } catch (certErr) {
                    const msg = certErr instanceof Error ? certErr.message : 'Failed to parse certificate';
                    return {
                        success: false,
                        error: {
                            code: PDFErrorCode.INVALID_OPTIONS,
                            category: ErrorCategory.VALIDATION_ERROR,
                            message: msg.includes('password') ? 'Incorrect certificate password.' : msg,
                            recoverable: true,
                            suggestedAction: 'Check the certificate file and password.',
                        },
                    };
                }

                // Sign each PDF file
                const results: Blob[] = [];
                const filenames: string[] = [];
                for (const file of files) {
                    const pdfBytes = new Uint8Array(await file.arrayBuffer());
                    onProgress?.(Math.round((results.length / files.length) * 80 + 10));
                    const signedBytes = await signPdf(pdfBytes, certData, {
                        signatureInfo: {
                            reason: String(settings.reason || '') || undefined,
                            location: String(settings.location || '') || undefined,
                            contactInfo: String(settings.contactInfo || '') || undefined,
                        },
                    });
                    results.push(new Blob([new Uint8Array(signedBytes)], { type: 'application/pdf' }));
                    filenames.push(file.name.replace(/\.pdf$/i, '_signed.pdf'));
                }

                if (results.length === 1) {
                    return { success: true, result: results[0], filename: filenames[0] };
                }
                return { success: true, result: results, filename: filenames[0] };
            }

            // ==================== Additional Tools ====================
            case 'pdf-to-zip': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new PDFToZipProcessor();
                const options = {
                    outputFilename: String(settings.filename || 'pdfs.zip'),
                    compressionLevel: Number(settings.compressionLevel) || 6,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'extract-attachments': {
                if (files.length === 0) throw new Error('No input file');
                const { ExtractAttachmentsPDFProcessor } = await import('@/lib/pdf/processors/attachments');
                const processor = new ExtractAttachmentsPDFProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            case 'organize-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new OrganizePDFProcessor();
                const pageOrder = settings.pageOrder as number[] || [];
                return await processor.process(createProcessInput(files, { pageOrder }), onProgress);
            }

            case 'deskew-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new DeskewPDFProcessor();
                const options = {
                    threshold: Number(settings.threshold) || 10,
                    dpi: Number(settings.dpi) || 150,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'email-to-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new EmailToPDFProcessor();
                const options = {
                    pageSize: String(settings.pageSize || 'a4') as 'a4' | 'letter' | 'legal',
                    includeCcBcc: settings.includeCcBcc !== undefined ? Boolean(settings.includeCcBcc) : true,
                    embedAttachments: settings.embedAttachments !== undefined ? Boolean(settings.embedAttachments) : true,
                    includeAttachmentsList: settings.includeAttachmentsList !== undefined ? Boolean(settings.includeAttachmentsList) : true,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'font-to-outline': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new FontToOutlineProcessor();
                const options = {
                    dpi: Number(settings.dpi) || 300,
                    preserveSelectableText: settings.preserveSelectableText !== undefined ? Boolean(settings.preserveSelectableText) : false,
                    pageRange: settings.pageRange ? String(settings.pageRange) : undefined,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'add-stamps': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new StampsProcessor();
                const options = {
                    stamps: (settings.stamps as Array<{
                        type: 'preset' | 'image';
                        preset?: string;
                        pageNumber: number;
                        x: number;
                        y: number;
                        width?: number;
                        height?: number;
                    }>) || [],
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'djvu-to-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new DJVUToPDFProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            case 'cbz-to-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new CbzToPDFProcessor();
                const options = {
                    pageSize: String(settings.pageSize || 'A4') as 'A4' | 'LETTER' | 'LEGAL',
                    fitToPage: settings.fitToPage !== undefined ? Boolean(settings.fitToPage) : true,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'pdf-booklet': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new BookletPDFProcessor();
                const options = {
                    pageSize: String(settings.pageSize || 'A4') as 'A4' | 'LETTER' | 'LEGAL',
                    bindingEdge: String(settings.bindingEdge || 'left') as 'left' | 'right',
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'rasterize-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new RasterizePDFProcessor();
                const options = {
                    dpi: Number(settings.dpi) || 150,
                    imageFormat: String(settings.imageFormat || 'jpeg') as 'jpeg' | 'png',
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'markdown-to-pdf': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new MarkdownToPDFProcessor();
                const options = {
                    fontSize: Number(settings.fontSize) || 12,
                    pageSize: String(settings.pageSize || 'A4'),
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'extract-tables': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new ExtractTablesProcessor();
                const options = {
                    outputFormat: String(settings.outputFormat || 'csv') as 'csv' | 'json' | 'excel',
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'pdf-to-pdfa': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new PdfToPdfAProcessor();
                const options = {
                    conformanceLevel: String(settings.conformanceLevel || 'A-2b') as 'A-1b' | 'A-2b' | 'A-3b',
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'pdf-to-docx': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new PDFToDocxProcessor();
                const options = {
                    preserveFormatting: settings.preserveFormatting !== undefined ? Boolean(settings.preserveFormatting) : true,
                    extractImages: settings.extractImages !== undefined ? Boolean(settings.extractImages) : true,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            case 'pdf-to-pptx': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new PDFToPptxProcessor();
                return await processor.process(createProcessInput(files, {}), onProgress);
            }

            case 'pdf-to-excel': {
                if (files.length === 0) throw new Error('No input file');
                const processor = new PDFToExcelProcessor();
                const options = {
                    detectTables: settings.detectTables !== undefined ? Boolean(settings.detectTables) : true,
                };
                return await processor.process(createProcessInput(files, options), onProgress);
            }

            // ==================== Passthrough (tools without processors or interactive tools) ====================
            default: {
                logger.warn(`[Workflow Executor] Tool "${toolId}" does not have a workflow processor implementation.`);
                
                // Return error instead of passing through - safer approach
                return {
                    success: false,
                    error: {
                        code: PDFErrorCode.PROCESSING_FAILED,
                        category: ErrorCategory.PROCESSING_ERROR,
                        message: `Tool "${toolId}" is not supported in workflows yet.`,
                        details: 'This tool may require user interaction or is not yet implemented for workflow execution.',
                        recoverable: false,
                        suggestedAction: 'Use this tool directly instead of in a workflow.',
                    },
                };
            }
        }
    } catch (error) {
        logger.error('[Workflow Executor] Error executing node:', error);
        
        return {
            success: false,
            error: {
                code: PDFErrorCode.PROCESSING_FAILED,
                category: ErrorCategory.PROCESSING_ERROR,
                message: error instanceof Error ? error.message : 'Unknown error occurred during workflow execution',
                details: error instanceof Error ? error.stack : undefined,
                recoverable: true,
                suggestedAction: 'Check the input files and settings, then try again.',
            },
        };
    }
}

/**
 * Get input files for a node from parent nodes
 */
export function collectInputFiles(
    nodeId: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    nodeOutputs: Map<string, (Blob | WorkflowOutputFile)[]>
): (Blob | WorkflowOutputFile)[] {
    const parentEdges = edges.filter(e => e.target === nodeId);

    if (parentEdges.length === 0) {
        const node = nodes.find(n => n.id === nodeId);
        if (node?.data.inputFiles) {
            return node.data.inputFiles;
        }
        return [];
    }

    const inputFiles: (Blob | WorkflowOutputFile)[] = [];
    for (const edge of parentEdges) {
        const parentOutputs = nodeOutputs.get(edge.source);
        if (parentOutputs) {
            inputFiles.push(...parentOutputs);
        }
    }

    return inputFiles;
}
